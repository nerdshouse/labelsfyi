/**
 * DNS-rebinding mitigation for the URL analyser (docs/security.md).
 *
 * Before every fetch (each redirect hop and robots.txt too) the hostname is
 * resolved over DNS-over-HTTPS and the request is refused unless EVERY A/AAAA
 * record is a public unicast address. Fails closed: resolver errors, SERVFAIL,
 * NXDOMAIN, timeouts or an empty answer all refuse the fetch.
 *
 * Residual risk (not eliminated, documented): Workers' fetch() resolves the
 * name again on its own, and a Worker cannot pin the connection to the address
 * we checked. An attacker who controls a permitted domain's DNS could answer
 * our check with a public address and the real fetch with a private one
 * (time-of-check/time-of-use). This is bounded by: only allow-listed brand
 * domains are fetched at all (policy.ts), Workers subrequests leave through
 * Cloudflare's network (no host loopback or cloud metadata service to reach),
 * GET-only with no credentials, and responses are parsed as text, never run.
 */

export type HostResolver = (host: string) => Promise<{ ok: true } | { ok: false; reason: string }>;

// ─── Address classification ──────────────────────────────────────────────

function v4Bytes(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const out = parts.map((p) => (/^(0|[1-9]\d{0,2})$/.test(p) ? Number(p) : NaN));
  return out.every((n) => n >= 0 && n <= 255) ? out : null;
}

function v4Public(b: number[]): boolean {
  const [a, c, d] = [b[0]!, b[1]!, b[2]!];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-net, private, loopback, multicast, reserved, broadcast
  if (a === 100 && c >= 64 && c <= 127) return false; // CGNAT 100.64/10
  if (a === 169 && c === 254) return false; // link-local (cloud metadata)
  if (a === 172 && c >= 16 && c <= 31) return false; // private
  if (a === 192 && c === 168) return false; // private
  if (a === 192 && c === 0 && (d === 0 || d === 2)) return false; // IETF 192.0.0/24, TEST-NET-1
  if (a === 192 && c === 88 && d === 99) return false; // 6to4 relay anycast
  if (a === 198 && (c === 18 || c === 19)) return false; // benchmarking 198.18/15
  if (a === 198 && c === 51 && d === 100) return false; // TEST-NET-2
  if (a === 203 && c === 0 && d === 113) return false; // TEST-NET-3
  return true;
}

/** 16 bytes, or null. Handles "::" and an embedded dotted IPv4 tail. */
export function v6Bytes(input: string): number[] | null {
  let ip = input.toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.includes('%')) return null; // zone ids are never public
  let tail: number[] = [];
  const lastColon = ip.lastIndexOf(':');
  if (ip.slice(lastColon + 1).includes('.')) {
    const v4 = v4Bytes(ip.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    ip = `${ip.slice(0, lastColon + 1)}0:0`;
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const parse = (s: string) => (s ? s.split(':') : []);
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const bytes = groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 0xff];
  });
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function v6Public(b: number[]): boolean {
  const zeros = (n: number) => b.slice(0, n).every((x) => x === 0);
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible): judge the IPv4 part,
  // but compatible addresses are deprecated → never public.
  if (zeros(10) && b[10] === 0xff && b[11] === 0xff) return v4Public(b.slice(12));
  if (zeros(12)) return false; // ::, ::1, ::a.b.c.d
  // Only global unicast 2000::/3 can be public.
  if ((b[0]! & 0xe0) !== 0x20) return false; // excludes fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96, 100::/64 …
  const w0 = (b[0]! << 8) | b[1]!;
  const w1 = (b[2]! << 8) | b[3]!;
  if (w0 === 0x2001 && w1 < 0x0200) return false; // 2001::/23 IETF (Teredo 2001::/32, ORCHID, …)
  if (w0 === 0x2001 && w1 === 0x0db8) return false; // documentation
  if (w0 === 0x2002) return false; // 6to4 (embeds arbitrary IPv4)
  if (w0 === 0x3fff && w1 < 0x1000) return false; // documentation 3fff::/20
  return true;
}

/** True only for a public unicast IPv4/IPv6 address. Anything unparsable is not public. */
export function isPublicIp(ip: string): boolean {
  const v4 = v4Bytes(ip);
  if (v4) return v4Public(v4);
  const v6 = v6Bytes(ip);
  return v6 ? v6Public(v6) : false;
}

// ─── DNS-over-HTTPS resolver ─────────────────────────────────────────────

const DOH = 'https://cloudflare-dns.com/dns-query';
const DOH_TIMEOUT_MS = 3000;

interface DohAnswer {
  Status?: number;
  Answer?: Array<{ type?: number; data?: string }>;
}

export function dohResolver(fetchImpl: typeof fetch = fetch): HostResolver {
  const query = async (host: string, type: 'A' | 'AAAA'): Promise<DohAnswer> => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), DOH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${DOH}?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { Accept: 'application/dns-json' },
        // 'manual', never 'error' (the Workers runtime throws on it): a redirect
        // comes back unfollowed (3xx, ok === false) and is rejected below.
        redirect: 'manual',
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
      return (await res.json()) as DohAnswer;
    } finally {
      clearTimeout(t);
    }
  };
  return async (host) => {
    let answers: DohAnswer[];
    try {
      answers = await Promise.all([query(host, 'A'), query(host, 'AAAA')]);
    } catch {
      return { ok: false, reason: 'DNS lookup failed' };
    }
    // NOERROR only (NXDOMAIN, SERVFAIL, REFUSED … all refuse).
    if (answers.some((a) => a.Status !== 0)) return { ok: false, reason: 'DNS lookup failed' };
    const addrs = answers.flatMap((a) =>
      (a.Answer ?? [])
        .filter((r) => r.type === 1 || r.type === 28)
        .map((r) => String(r.data ?? '')),
    );
    if (!addrs.length) return { ok: false, reason: 'no address' };
    const bad = addrs.find((a) => !isPublicIp(a));
    return bad ? { ok: false, reason: 'resolves to a non-public address' } : { ok: true };
  };
}
