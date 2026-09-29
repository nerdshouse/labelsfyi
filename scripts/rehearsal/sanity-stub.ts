/**
 * LOCAL PRODUCTION REHEARSAL ONLY (docs/production.md). Not production.
 *
 * A tiny stand-in for the Sanity query API so the production build path
 * (DEPLOY_ENV=production, CONTENT_SOURCE=sanity) can be exercised end-to-end
 * without real Sanity credentials:
 *
 *   node scripts/rehearsal/sanity-stub.ts [dataset.ndjson] [port]
 *
 * It behaves like a PRIVATE dataset: anonymous requests see nothing,
 * requests with `Authorization: Bearer rehearsal-read-token` see the NDJSON
 * documents (none by default). A rehearsal build is marked in build-meta.json
 * and can never be deployed (scripts/deploy-guard.ts).
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { evaluate, parse } from 'groq-js';

const [file, portArg] = process.argv.slice(2);
const port = Number(portArg ?? 4999);
const TOKEN = 'rehearsal-read-token';
const docs: unknown[] =
  file && file !== 'empty'
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown)
    : [];

async function run(query: string, params: Record<string, unknown>, authed: boolean) {
  const tree = parse(query, { params });
  // STUB_PUBLIC=1 simulates the misconfiguration of a PUBLIC dataset.
  const visible = authed || process.env.STUB_PUBLIC === '1' ? docs : [];
  const value = await evaluate(tree, { dataset: visible, params });
  return value.get();
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const authed = req.headers.authorization === `Bearer ${TOKEN}`;
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (!/^\/v[\d-]+\/data\/query\/[a-z0-9_-]+$/.test(url.pathname))
    return send(404, { error: 'not found' });
  const params: Record<string, unknown> = {};
  for (const [k, v] of url.searchParams)
    if (k.startsWith('$')) params[k.slice(1)] = JSON.parse(v) as unknown;
  const answer = (query: string, p: Record<string, unknown>) =>
    run(query, p, authed)
      .then((result) => send(200, { query, result, ms: 1 }))
      .catch((e: Error) => send(400, { error: { description: e.message } }));
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const b = JSON.parse(body || '{}') as { query: string; params?: Record<string, unknown> };
      void answer(b.query, b.params ?? {});
    });
    return;
  }
  void answer(url.searchParams.get('query') ?? '', params);
}).listen(port, '127.0.0.1', () =>
  console.log(
    `REHEARSAL Sanity stub on http://127.0.0.1:${port} (${docs.length} docs, private; token ${TOKEN})`,
  ),
);
