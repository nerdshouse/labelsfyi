/**
 * URL validation for the product URL analyser (docs/security.md).
 *
 * The analyser fetches pages on a visitor's request, so every URL (the
 * submitted one and every redirect hop) is treated as hostile. Rules:
 *   - https only (http is upgraded), default port only, no credentials
 *   - hostname must be a DNS name: no IP literals (v4, v6, decimal/hex/octal
 *     forms), no localhost / single-label / internal / link-local names
 *   - length-limited, no control characters
 * Host allowlisting against the source register happens after this (policy.ts):
 * only registered public brand domains are ever fetched, which is the primary
 * SSRF defence; these checks are the second layer.
 */

export const MAX_URL_LENGTH = 2048;

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.test',
  '.invalid',
  '.example',
  '.onion',
  '.arpa',
];
const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

/** Any numeric-looking host (dotted, decimal, hex, octal) or IPv6 literal. */
export function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  if (h.includes(':')) return true; // IPv6
  if (/^[0-9.]+$/.test(h)) return true; // 127.0.0.1, 2130706433
  if (/^(0x[0-9a-f]+\.?)+$/i.test(h)) return true; // 0x7f000001
  return h.split('.').every((p) => /^(0x[0-9a-f]+|0[0-7]*|\d+)$/i.test(p));
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkUrl(input: string): UrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'Enter a product URL.' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'That URL is too long.' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(raw))
    return { ok: false, reason: 'That URL contains invalid characters.' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:')
    return { ok: false, reason: 'Only web (https) product URLs can be analysed.' };
  if (url.username || url.password)
    return { ok: false, reason: 'URLs with credentials are not accepted.' };
  if (url.port && url.port !== '443')
    return { ok: false, reason: 'URLs with a custom port are not accepted.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || isIpLiteral(host))
    return { ok: false, reason: 'Enter a website address, not an IP address.' };
  if (
    !host.includes('.') ||
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s))
  )
    return { ok: false, reason: 'That address is not a public website.' };
  url.hash = '';
  return { ok: true, url };
}
