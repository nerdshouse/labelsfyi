import { decide, type SourcePolicy } from '@/lib/sources/policy';
import { dohResolver, type HostResolver } from './dns-guard';
import { checkUrl } from './safe-url';

/**
 * Controlled fetch for the URL analyser. No third-party JavaScript is ever
 * executed: we read static HTML/text only.
 *
 *   - manual redirects, at most MAX_REDIRECTS; EVERY hop is re-validated
 *     (URL rules + must stay on a host of the same permitted source)
 *   - timeout (AbortController) and a hard byte cap on the *decoded* body,
 *     read incrementally → oversized and decompression-bomb responses abort
 *   - content-type allowlist; no cookies/credentials sent
 *   - before EVERY hop the host must resolve only to public addresses
 *     (dns-guard.ts: DNS-rebinding mitigation, fails closed)
 */

export const LIMITS: { timeoutMs: number; maxBytes: number; maxRedirects: number } = {
  timeoutMs: 8000,
  maxBytes: 1_500_000,
  maxRedirects: 3,
};
export const USER_AGENT = 'labels-fyi-analyser/1.0 (+https://labels.fyi/analyse)';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type SafeFetchResult =
  | { ok: true; url: URL; status: number; contentType: string; body: string }
  | {
      ok: false;
      code: 'BLOCKED' | 'REDIRECT' | 'HTTP' | 'TYPE' | 'TOO_LARGE' | 'TIMEOUT' | 'NETWORK';
      detail: string;
    };

async function readCapped(
  res: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string | null> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return null;
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    if (signal.aborted) throw new DOMException('timeout', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

export async function safeFetch(
  start: URL,
  policy: SourcePolicy,
  opts: {
    fetchImpl?: FetchLike | undefined;
    accept: string[];
    /** For robots.txt: the path rule does not apply, only the host rule. */
    requireProductPath?: boolean;
    limits?: Partial<typeof LIMITS>;
    /** Defaults to the DNS-over-HTTPS public-address check. */
    resolveHost?: HostResolver | undefined;
  },
): Promise<SafeFetchResult> {
  const lim = { ...LIMITS, ...opts.limits };
  const doFetch = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const resolveHost = opts.resolveHost ?? dohResolver();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), lim.timeoutMs);
  let url = start;
  try {
    for (let hop = 0; ; hop++) {
      const check = checkUrl(url.toString());
      if (!check.ok) return { ok: false, code: 'BLOCKED', detail: check.reason };
      const same = policy.hosts.includes(check.url.hostname);
      const permitted =
        opts.requireProductPath === false ? same : same && decide(check.url, [policy]).allowed;
      if (!permitted)
        return { ok: false, code: 'BLOCKED', detail: 'Destination is not a permitted page.' };
      const dns = await resolveHost(check.url.hostname);
      if (!dns.ok)
        return { ok: false, code: 'BLOCKED', detail: 'Destination is not a public website.' };
      let res: Response;
      try {
        res = await doFetch(check.url.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: ctl.signal,
          credentials: 'omit',
          headers: { 'User-Agent': USER_AGENT, Accept: opts.accept.join(', ') },
        });
      } catch (e) {
        return (e as Error)?.name === 'AbortError'
          ? { ok: false, code: 'TIMEOUT', detail: 'The page took too long to respond.' }
          : { ok: false, code: 'NETWORK', detail: 'The page could not be reached.' };
      }
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => {});
        if (hop >= lim.maxRedirects)
          return { ok: false, code: 'REDIRECT', detail: 'Too many redirects.' };
        const loc = res.headers.get('location');
        if (!loc) return { ok: false, code: 'REDIRECT', detail: 'Redirect without a destination.' };
        try {
          url = new URL(loc, check.url);
        } catch {
          return { ok: false, code: 'REDIRECT', detail: 'Invalid redirect.' };
        }
        continue;
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, code: 'HTTP', detail: `The page returned HTTP ${res.status}.` };
      }
      if (!opts.accept.includes(type)) {
        await res.body?.cancel().catch(() => {});
        return { ok: false, code: 'TYPE', detail: `Unsupported content type (${type || 'none'}).` };
      }
      let body: string | null;
      try {
        body = await readCapped(res, lim.maxBytes, ctl.signal);
      } catch {
        return { ok: false, code: 'TIMEOUT', detail: 'The page took too long to respond.' };
      }
      if (body === null)
        return { ok: false, code: 'TOO_LARGE', detail: 'The page is too large to analyse.' };
      return { ok: true, url: check.url, status: res.status, contentType: type, body };
    }
  } finally {
    clearTimeout(timer);
  }
}
