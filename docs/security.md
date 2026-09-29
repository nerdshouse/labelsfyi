# Security

## URL analyser (untrusted URL ingestion)

`/analyse` fetches pages on a visitor's request, so it is treated as an SSRF surface. Layers,
outermost first:

1. **Host allowlist (primary).** Only hostnames in the source register with an automated access
   mode, on paths matching the source's `productPath`. Unknown hosts are refused before any
   request is made. Every redirect hop must stay on the same permitted source and product paths.
2. **URL validation** (`src/lib/analyse/safe-url.ts`):
   - https only (http is upgraded); no credentials; default port only; length ≤ 2048; no
     control characters or whitespace
   - no IP literals in any notation (dotted, decimal, hex, octal, IPv6, v4-mapped)
   - no `localhost`, single-label, `.local`/`.internal`/`.lan`/`.home`/`.corp`/`.test`/`.arpa` or
     metadata hostnames
3. **Controlled fetch** (`src/lib/analyse/fetch.ts`):
   - manual redirects, at most 3, each re-validated
   - an 8 s timeout
   - a 1.5 MB cap on the **decoded** body, read incrementally, so decompression bombs abort
   - a content-type allowlist (HTML; robots.txt is text/plain)
   - `credentials: 'omit'` and an identifying user agent
4. **No execution.** Static HTML/JSON only; third-party JavaScript never runs. JSON-LD is parsed
   with `JSON.parse` in a try block, with block count, size and depth limits. Every extracted
   string is tag-stripped, control- and bidi-character-free, and length-capped. Prices, GTINs
   (check digit) and currencies are validated.
5. **Abuse.** POST-only actions (crawlers can't trigger fetches), a per-IP Workers rate limit
   (`ANALYSE_RATE_LIMITER`, 10/min), Astro origin checking, and `noindex` / `no-store` results.
6. **Trust boundary.** "Submit for verification" **re-analyses on the server** and never trusts
   facts posted by the browser. Output is only ever an unverified `ingestionCandidate` in the
   private dataset. There is no AI in the path. If AI extraction is added later, its output is
   candidate facts only, behind the same boundary, never publication.

7. **Public-DNS check before every hop** (`src/lib/analyse/dns-guard.ts`). The host is resolved
   over DNS-over-HTTPS (Cloudflare, A + AAAA), and the request is refused unless **every** address
   is public unicast. Refused ranges:
   - IPv4: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24,
     192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4
   - IPv6: loopback and unspecified, v4-mapped (judged on the IPv4), v4-compatible, anything
     outside 2000::/3 (ULA, link-local, multicast, NAT64 64:ff9b::/96), 2001::/23 (Teredo),
     2001:db8::/32, 2002::/16 (6to4) and 3fff::/20

   It fails closed on resolver errors, NXDOMAIN, SERVFAIL, timeouts or empty answers.

8. **Source permission.** An automated access mode is not enough. The source also needs
   `permissionVerified: true` and a `permissionRecord` (an AUTHORIZED `assetPermission`), otherwise
   `PERMISSION_UNVERIFIED`. Briyo is refused until its written permission is filed.

**Residual risk (NOT eliminated): DNS rebinding.** Workers' `fetch()` resolves the name again on
its own, and a Worker cannot pin the connection to the address we checked. An attacker who controls
a permitted brand domain's DNS could return a public address to our check and a private one to the
fetch (time-of-check/time-of-use). This is bounded by:

- only allow-listed, permission-verified brand domains are fetched at all
- Workers subrequests leave through Cloudflare's network, with no host loopback or cloud metadata
  service to reach
- GET-only, no credentials, text parsing only, strict size and time limits

Remove any source whose DNS looks suspicious.

## Other controls (earlier sprints)

- `/internal/*`: Cloudflare Access, **verified in the Worker**:
  - `Cf-Access-Jwt-Assertion` checked as RS256 against the team JWKS, with issuer, audience,
    exp/nbf and 60 s skew; `none` and HMAC are refused
  - required in production (503 without configuration, 403 without a valid token)
  - then Basic auth, and cross-origin POSTs are blocked

  Paths are matched case-insensitively and after decoding (`/%69nternal`, `//internal`).

- Secrets: the read token is used only in the build; the write token and the review credentials are
  Worker secrets. Neither is ever in client code, HTML or public JSON. `check-dist` fails if a
  token-shaped string, or the actual token value, appears in any built file (client **and** server
  bundles).
- Analytics: allowlisted parameters only (see deployment.md). No personal data, free text or ids.
- Images: third-party images are shown only under an AUTHORIZED, verified permission whose scope
  includes IMAGES.
- Submissions: magic-byte image validation, size and count limits, opaque R2 keys, private dataset.
- **Production cannot show demo data**: `DEPLOY_ENV=production` refuses a demo content source and
  strips every `isDemo` document, plus reviews by placeholder reviewers (`forProduction`), before
  anything renders. `pnpm deploy:cf` always builds in production mode.
- The build checks (`pnpm test:dist`) fail on:
  - submitter data or storage keys in public files
  - third-party brand image URLs or copied marketing text
  - ratings or review counts
  - affiliate URLs used as canonicals
