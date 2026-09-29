/**
 * Post-build checks on the rendered HTML (the output users actually see).
 * Run after `astro build`: `pnpm test:dist`. Exits non-zero on any failure.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Static output. The Worker (dist/server) only serves /api/* and /internal/*.
const DIST = new URL('../dist/client/', import.meta.url).pathname;
const failures: string[] = [];
const read = (p: string) => readFileSync(join(DIST, p), 'utf8');
const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, ' ');
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// ── Secrets never reach any built file (both modes) ─────────────────────
const SERVER = new URL('../dist/server/', import.meta.url).pathname;
const builtFiles = [DIST, SERVER]
  .filter((d) => existsSync(d))
  .flatMap((d) => walk(d))
  .filter((f) => /\.(html|json|xml|txt|js|mjs|css|map)$/.test(f));
const secretValues = ['SANITY_READ_TOKEN', 'SANITY_WRITE_TOKEN', 'REVIEW_PASSWORD']
  .map((k) => process.env[k])
  .filter((v): v is string => typeof v === 'string' && v.length >= 8);
check(
  'no secret value (read/write token, review password) in any built file',
  secretValues.length === 0 ||
    builtFiles.every((f) => {
      const body = readFileSync(f, 'utf8');
      return secretValues.every((v) => !body.includes(v));
    }),
);
check(
  'no Sanity token-shaped strings in public files',
  walk(DIST)
    .filter((f) => /\.(html|json|xml|txt|js|css)$/.test(f))
    .every((f) => !/\bsk[A-Za-z0-9]{60,}\b/.test(readFileSync(f, 'utf8'))),
);

// ── PRODUCTION mode: generic checks only (no fixture expectations) ──────
if (process.env.DIST_MODE === 'production') {
  const meta = JSON.parse(read('build-meta.json')) as {
    deployEnv: string;
    contentSource: string;
    rehearsal: boolean;
  };
  check(
    `production: build-meta says production + sanity (got ${meta.deployEnv}/${meta.contentSource}${meta.rehearsal ? ', REHEARSAL' : ''})`,
    meta.deployEnv === 'production' && meta.contentSource === 'sanity',
  );
  const htmlFiles = walk(DIST).filter((f) => f.endsWith('.html'));
  const publicAll = walk(DIST)
    .filter((f) => /\.(html|json|xml|txt)$/.test(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  const visible = htmlFiles.map((f) => text(readFileSync(f, 'utf8'))).join('\n');
  check(
    'production: no "Demo data" markers',
    !/Demo data|data-demo-flag|tag-marker">Demo/.test(publicAll),
  );
  check(
    'production: no fixture brands or demo assets',
    !/\b(Testbed Sports|Sampleworks|Specimen Nutrition|Northwind)\b|\/demo\/|example\.com\/demo/.test(
      publicAll,
    ),
  );
  check('production: no placeholder reviewer', !/placeholder reviewer|Placeholder/i.test(visible));
  const robotsTxt = read('robots.txt');
  check(
    'production: robots.txt blocks private paths and names the https sitemap',
    ['/internal/', '/api/', '/partials/', '/compare-data/', '/catalogue-index.json'].every((p) =>
      robotsTxt.includes(`Disallow: ${p}`),
    ) && robotsTxt.includes('Sitemap: https://labels.fyi/sitemap.xml'),
  );
  const sitemapXml = read('sitemap.xml');
  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  check(
    `production: sitemap (${locs.length} URLs) is https://labels.fyi only, no private paths`,
    locs.length > 0 &&
      locs.every(
        (u) =>
          u.startsWith('https://labels.fyi/') &&
          !/\/(internal|api|partials|compare-data)\//.test(u),
      ),
  );
  check(
    'production: every canonical is https://labels.fyi, never an affiliate URL',
    htmlFiles.every((f) => {
      const canon = /<link rel="canonical" href="([^"]+)"/.exec(readFileSync(f, 'utf8'))?.[1];
      return (
        !canon || (canon.startsWith('https://labels.fyi') && !/[?&](tag|aff|utm_)/i.test(canon))
      );
    }),
  );
  check(
    'production: trust pages built (privacy, terms, contact)',
    ['privacy.html', 'terms.html', 'contact.html'].every((f) => existsSync(join(DIST, f))),
  );
  check(
    'production: internal and analyser routes are not prerendered',
    !existsSync(join(DIST, 'internal')) && !existsSync(join(DIST, 'analyse.html')),
  );
  check(
    'production: no research/candidate data, submitter details or storage keys',
    !/briyosupplements|research\/catalogue|ingestionCandidate|submitterName|submitterContact|storageKey|r2\.dev/.test(
      publicAll.replace(readFileSync(join(DIST, 'submit.html'), 'utf8'), ''),
    ),
  );
  check(
    'production: no fake ratings, no third-party CDN images',
    !/aggregateRating|ratingValue|reviewCount/.test(publicAll) &&
      !/cdn\.shopify\.com/.test(publicAll),
  );
  const mails = new Set(publicAll.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []);
  check(
    'production: only labels.fyi emails',
    [...mails].every((e) => /@labels\.fyi$/i.test(e)),
  );
  if (failures.length) {
    console.error(`\n${failures.length} production dist check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nProduction checks passed on ${htmlFiles.length} HTML files.`);
  process.exit(0);
}

// ── Magnesium comparison partial (what /search?q=magnesium shows) ─────────
const mg = text(read('partials/compare/magnesium.html'));
check(
  'comparison: compound and elemental columns are separate',
  mg.includes('Compound / serving') && mg.includes('Elemental / serving'),
);
check(
  'comparison: bisglycinate elemental 140 mg shown',
  /Magnesium bisglycinate 1,000 mg 140 mg/.test(mg),
);
check(
  'comparison: oxide elemental is "Not disclosed"',
  /Magnesium oxide 400 mg Not disclosed/.test(mg),
);
check(
  'comparison: ₹/100 mg elemental explains unknown elemental',
  mg.includes('Elemental amount not disclosed'),
);
check('comparison: ₹/100 mg elemental computed when declared', mg.includes('₹21.40'));
check('comparison: states it is not ranked', mg.includes('Not ranked'));
check(
  'comparison: no filters for "best"/score',
  !/\b(best|winner|score|scores|top pick|rating)\b/i.test(mg),
);
check(
  'comparison: partial is a fragment (no <html>)',
  !read('partials/compare/magnesium.html').includes('<html'),
);

// ── Product decoder pages ────────────────────────────────────────────────
const bis = text(read('products/testbed-sports-magnesium-bisglycinate-capsules.html'));
check(
  'decoder: at-a-glance names elemental explicitly',
  bis.includes('140 mg elemental magnesium (from 1,000 mg magnesium bisglycinate)'),
);
check(
  'decoder: compound never labelled as plain magnesium',
  !/1,000 mg magnesium(?! bisglycinate)/.test(bis),
);
check("decoder: what's inside present", bis.includes('What’s inside, per serving'));
check('decoder: label verification shown', bis.includes('Label verified'));

const oxide = text(read('products/sampleworks-magnesium-oxide-400mg-tablets.html'));
// Only the oxide's own sections (related-product rows for other products may legitimately show theirs).
const oxideOwn = oxide.slice(0, oxide.indexOf('How it compares'));
check(
  'decoder: oxide never shows an elemental figure for itself',
  !/\d[\d,.]* mg elemental/.test(oxideOwn),
);
check(
  'decoder: oxide elemental reads "Not disclosed"',
  /Elemental magnesium Not disclosed/.test(oxideOwn),
);
check(
  'decoder: oxide marked artwork only',
  oxide.includes('Artwork only') && oxide.includes('From label artwork (provisional)'),
);

const whey = text(read('products/specimen-nutrition-whey-protein-concentrate-rich-chocolate.html'));
check(
  'decoder: discrepancy section with both source values',
  whey.includes('Where the sources disagree') &&
    whey.includes('1 scoop (30 g)') &&
    whey.includes('1 scoop (33 g)'),
);
check(
  'decoder: pack vs website vs marketplace groups',
  whey.includes('On the pack') && whey.includes('Brand website') && whey.includes('Marketplaces'),
);
check(
  'decoder: no differences section when none exist',
  !bis.includes('Where the sources disagree'),
);

// ── Supplement Receipt pages ─────────────────────────────────────────────
const receiptHtml = read('receipt/testbed-sports-magnesium-bisglycinate-capsules.html');
const rBis = text(receiptHtml);
for (const heading of [
  'Front of pack',
  'Label panel',
  'The label declares',
  'What this number means',
  'Label check',
]) {
  check(`receipt: "${heading}" section`, rBis.toLowerCase().includes(heading.toLowerCase()));
}
check('receipt: compound named with its form', rBis.includes('1,000 mg magnesium bisglycinate'));
check('receipt: elemental shown separately', rBis.includes('140 mg magnesium'));
check(
  'receipt: compound never shown as plain magnesium',
  !/1,000 mg magnesium(?! bisglycinate)/.test(rBis),
);
check(
  'receipt: 1080×1080 design + PNG export control',
  receiptHtml.includes('data-receipt=') && rBis.includes('Download PNG (1080×1080)'),
);
check('receipt: copy link control', rBis.includes('Copy link'));
check(
  'receipt: links to decoder and submit',
  receiptHtml.includes('href="/products/testbed-sports-magnesium-bisglycinate-capsules"') &&
    receiptHtml.includes('href="/submit"'),
);
check(
  'receipt: demo data is labelled on the receipt',
  rBis.includes('Demo data · fictional product · not a real SKU'),
);
check(
  'receipt: no front-of-pack figure invented',
  rBis.includes('No front-of-pack figure recorded'),
);
// The receipt artwork itself (the page disclaimer legitimately says "not a score or ranking").
const receiptArticle = text(
  receiptHtml.slice(receiptHtml.indexOf('<article'), receiptHtml.indexOf('</article>')),
);
check(
  'receipt: no ranking/score/"you think" language',
  !/\b(best|winner|score|ranking|top pick)\b|you think you/i.test(receiptArticle),
);

const rOxide = text(read('receipt/sampleworks-magnesium-oxide-400mg-tablets.html'));
check('receipt: oxide elemental "Not disclosed"', /Elemental Not disclosed/.test(rOxide));
check(
  'receipt: oxide never shows an elemental figure',
  !/\d[\d,.]* mg magnesium(?! oxide)/.test(rOxide),
);

const rCreatine = text(read('receipt/specimen-nutrition-creatine-monohydrate-unflavoured.html'));
check(
  'receipt: front of pack quoted from a verified observation',
  rCreatine.includes('“5g creatine per serving”'),
);
const rNoPrice = text(read('receipt/sampleworks-whey-blend-french-vanilla.html'));
check(
  'receipt: no price shown when none observed',
  !/Observed ₹/.test(rNoPrice) && rNoPrice.includes('No price observed'),
);

// ── Submit page ──────────────────────────────────────────────────────────
const submitHtml = read('submit.html');
const submit = text(submitHtml);
check(
  'submit: states the required principle copy',
  submit.includes(
    'Submit a supplement label for decoding. We only record what the submitted label shows. Missing information stays missing.',
  ),
);
for (const field of [
  'name="front"',
  'name="facts"',
  'name="additional"',
  'name="brand"',
  'name="productName"',
  'name="variant"',
  'name="productUrl"',
  'name="submitterName"',
  'name="submitterContact"',
  'name="updateOfProduct"',
  'name="website"',
  'name="rights"',
]) {
  check(`submit: field ${field}`, submitHtml.includes(field));
}
const submitForm = submitHtml.match(/<form[^>]*data-submit-form[^>]*>/)?.[0] ?? '';
check(
  'submit: form posts multipart to /api/submissions',
  /method="post"/.test(submitForm) &&
    /action="\/api\/submissions"/.test(submitForm) &&
    /enctype="multipart\/form-data"/.test(submitForm),
);
check(
  'submit: accepts only JPEG/PNG/WebP',
  (submitHtml.match(/accept="image\/jpeg,image\/png,image\/webp"/g) ?? []).length === 3,
);
const SUCCESS =
  'Label received. It hasn’t been published yet. Our team will review the submitted label before anything appears on labels.fyi.';
check('submit: required success copy present', submit.includes(SUCCESS));
const received = read('submit/received.html');
check('submit/received: success copy', text(received).includes(SUCCESS));
check('submit/received: noindex', /<meta name="robots" content="noindex/.test(received));
const promises =
  /\b(within \d+|\d+\s*(hours?|days?|business days)|we will (reply|respond|email))\b/i;
check(
  'submit: no response-time promise',
  !promises.test(submit.slice(submit.indexOf('Send us the label'))) &&
    !promises.test(text(received)),
);

// ── Submission pipeline: private surfaces stay private ───────────────────
check('internal routes are not prerendered', !existsSync(join(DIST, 'internal')));
check('API routes are not prerendered', !existsSync(join(DIST, 'api')));
check(
  'worker bundle exists for on-demand routes',
  existsSync(new URL('../dist/server/entry.mjs', import.meta.url)),
);
const robots = read('robots.txt');
check(
  'robots disallows /internal/ and /api/',
  robots.includes('Disallow: /internal/') && robots.includes('Disallow: /api/'),
);
const sitemap = read('sitemap.xml');
check(
  'sitemap excludes internal, API, received and submission ids',
  !/\/internal|\/api\/|\/submit\/received|sub-[0-9a-f]{20}|candidate\./.test(sitemap),
);
const sitemapProducts = [...sitemap.matchAll(/\/products\/([a-z0-9-]+)</g)].map((m) => m[1]!);
check(
  'sitemap products all have built pages (no unpublished entries)',
  // Demo builds publish an empty sitemap (never indexed).
  sitemapProducts.every((slug) => existsSync(join(DIST, 'products', `${slug}.html`))),
);

// ── Receipts: demo vs real ───────────────────────────────────────────────
const DEMO_BAND = 'Demo data · fictional product · not a real SKU';
const receipts = readdirSync(join(DIST, 'receipt')).filter((f) => f.endsWith('.html'));
const realReceipts = receipts.filter((f) => !text(read(`receipt/${f}`)).includes(DEMO_BAND));
check(
  'receipt: demo receipts are marked demo',
  text(read('receipt/testbed-sports-magnesium-bisglycinate-capsules.html')).includes(DEMO_BAND),
);
for (const f of receipts) {
  const h = read(`receipt/${f}`);
  const article = text(h.slice(h.indexOf('<article'), h.indexOf('</article>')));
  check(
    `receipt ${f}: no banned words`,
    !/\b(best|winner|score|ranking|top pick|scam|fake|toxic|dangerous|misleading)\b/i.test(article),
  );
}
for (const f of realReceipts) {
  const h = read(`receipt/${f}`);
  check(`real receipt ${f}: no demo band`, !h.includes(DEMO_BAND));
  check(`real receipt ${f}: product page built`, existsSync(join(DIST, 'products', f)));
}
console.log(`(${realReceipts.length} real receipt(s) in this build)`);

// ── Compare Two Labels ───────────────────────────────────────────────────
// Pair pages are on-demand (no O(n²) catalogue); the build ships one facts
// file per published product, which the Worker reads through ASSETS.
const productPages = readdirSync(join(DIST, 'products')).filter((f) => f.endsWith('.html'));
const factsFiles = existsSync(join(DIST, 'compare-data'))
  ? readdirSync(join(DIST, 'compare-data')).filter((f) => f.endsWith('.json'))
  : [];
check(
  'compare: one facts file per published product, and only those',
  factsFiles.length === productPages.length &&
    factsFiles.every((f) => productPages.includes(f.replace(/\.json$/, '.html'))),
);
const factsOk = factsFiles.every((f) => {
  const j = JSON.parse(read(`compare-data/${f}`)) as { v?: number; slug?: string };
  return j.v === 1 && j.slug === f.replace(/\.json$/, '');
});
check('compare: facts files are versioned and match their slug', factsOk);
const allFacts = factsFiles.map((f) => read(`compare-data/${f}`)).join('\n');
check(
  'compare: facts files hold no private or internal fields',
  !/submitter|storageKey|contactAddress|respondentName|workflowStatus|reviewedBy/.test(allFacts),
);
check(
  'compare: no pair pages are prerendered',
  !walk(join(DIST, 'compare')).some((f) => /-vs-/.test(f)),
);
check('compare: robots disallows /compare-data/', robots.includes('Disallow: /compare-data/'));
const sitemapPairs = [...sitemap.matchAll(/\/compare\/([a-z0-9-]+)-vs-([a-z0-9-]+)</g)];
check(
  'compare: sitemap pairs (if any) are canonical and between built products',
  sitemapPairs.every(
    ([, x, y]) =>
      x! < y! && productPages.includes(`${x}.html`) && productPages.includes(`${y}.html`),
  ),
);
const bisPage = read('products/testbed-sports-magnesium-bisglycinate-capsules.html');
check(
  'compare: product page has a no-login compare form (GET /api/compare)',
  /<form[^>]*method="get"[^>]*action="\/api\/compare"/.test(bisPage) &&
    bisPage.includes('name="a" value="testbed-sports-magnesium-bisglycinate-capsules"') &&
    bisPage.includes('name="b"'),
);
const compareLinks = [...bisPage.matchAll(/href="(\/compare\/[a-z0-9-]+-vs-[a-z0-9-]+)"/g)].map(
  (m) => m[1]!,
);
check(
  'compare: product page links canonical comparisons with itself',
  compareLinks.length > 0 &&
    compareLinks.every((h) => {
      const [x, y] = h.replace('/compare/', '').split('-vs-');
      return (
        x! < y! &&
        (x === 'testbed-sports-magnesium-bisglycinate-capsules' ||
          y === 'testbed-sports-magnesium-bisglycinate-capsules')
      );
    }),
);
check(
  'compare: editorial comparison pages still build',
  existsSync(join(DIST, 'compare/creatine-cost-per-5g.html')),
);

// ── Goal discovery (Sprint 6) ────────────────────────────────────────────
const PUBLISHED_GOALS = [
  'sleep',
  'stress',
  'immunity',
  'hydration',
  'energy',
  'gut-health',
  'joint-health',
  'hair-skin',
  'heart-health',
];
const goalFile = (slug: string) => `${slug}.html`;
check(
  'goals: a page for every published goal',
  PUBLISHED_GOALS.every((g) => existsSync(join(DIST, goalFile(g)))),
);
check('goals: no page for the draft goal', !existsSync(join(DIST, 'focus.html')));
const goalHtml = Object.fromEntries(PUBLISHED_GOALS.map((g) => [g, read(goalFile(g))]));
check(
  'goals: canonical metadata on every goal page',
  PUBLISHED_GOALS.every((g) =>
    new RegExp(`<link rel="canonical" href="[^"]*/${g}"`).test(goalHtml[g]!),
  ),
);
check(
  'goals: empty goal is noindex and says so',
  /<meta name="robots" content="noindex/.test(goalHtml['energy']!) &&
    goalHtml['energy']!.includes('data-empty-goal'),
);
const cardCount = (h: string) => (h.match(/data-goal-card(?=[\s>])/g) ?? []).length;
check('goals: stress lists its approved products', cardCount(goalHtml['stress']!) === 2);
const goalMain = (h: string) => {
  const main = h.slice(h.indexOf('<main'), h.indexOf('</main>'));
  // The methodology note legitimately says "no ranking, score or “best” pick".
  return text(main.replace(/<section[^>]*aria-labelledby="how-h"[\s\S]*?<\/section>/, ''));
};
check(
  'goals: no ranking/best/score language on goal pages',
  PUBLISHED_GOALS.every(
    (g) =>
      !/\b(best|#1|winner|top pick|highest quality|recommended|score|ranking|better|worse)\b/i.test(
        goalMain(goalHtml[g]!),
      ),
  ),
);
check(
  'goals: no treat/cure/prevent/diagnose claims on goal pages',
  PUBLISHED_GOALS.every(
    (g) => !/\b(treats?|cures?|prevents?|diagnos\w*)\b/i.test(goalMain(goalHtml[g]!)),
  ),
);
check(
  'goals: missing elemental never becomes a number (magnesium cards)',
  !/Elemental magnesium\s+0\b/.test(text(goalHtml['sleep']!)),
);
check(
  'goals: authorized image rendered; unauthorized image never shipped',
  goalHtml['hydration']!.includes('/demo/specimen-electrolyte-pack.svg') &&
    !walk(DIST)
      .filter((f) => /\.(html|json|xml)$/.test(f))
      .some((f) => readFileSync(f, 'utf8').includes('unauthorized-marketing-shot')),
);
check(
  'goals: products without an authorized image get the neutral tile',
  goalHtml['stress']!.includes('data-neutral-tile') &&
    !goalHtml['stress']!.includes('data-product-image'),
);
check(
  'goals: buy links are outbound, affiliate links marked sponsored',
  /data-buy-link="official"/.test(goalHtml['hydration']!) &&
    /<a[^>]*href="https:\/\/example\.com\/demo\/amazon\/specimen-electrolyte\?tag=labelsfyi-demo"[^>]*rel="sponsored nofollow noopener"|rel="sponsored nofollow noopener"[^>]*href="https:\/\/example\.com\/demo\/amazon/.test(
      goalHtml['hydration']!,
    ),
);
const htmlFiles = walk(DIST).filter((f) => f.endsWith('.html'));
check(
  'no affiliate URL is ever canonical',
  htmlFiles.every((f) => {
    const canon = /<link rel="canonical" href="([^"]+)"/.exec(readFileSync(f, 'utf8'))?.[1] ?? '';
    return !/[?&](tag|aff|affiliate|utm_[a-z]+)=/i.test(canon) && !canon.includes('example.com');
  }),
);
const everything = walk(DIST)
  .filter((f) => /\.(html|json|xml|txt)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
check(
  'no draft product or its goal link appears anywhere',
  !/Unpublished Sleep Gummies|draft-sleep-gummies/.test(everything),
);
check(
  'research catalogue data is not in the public build',
  !/briyosupplements|research\/catalogue|ingestionCandidate/.test(everything),
);
check(
  'internal asset-permission details are not public',
  !/demo-contact@specimen|Demo authorization record|assetPermission/.test(everything),
);
const home = read('index.html');
check(
  'homepage lists every published goal (and not the draft)',
  PUBLISHED_GOALS.every((g) => home.includes(`data-goal-tile="/${g}"`)) &&
    !home.includes('data-goal-tile="/focus"'),
);
const sitemapGoals = PUBLISHED_GOALS.filter((g) => new RegExp(`/${g}<`).test(sitemap));
check(
  'sitemap goals (if any) are published and non-empty',
  sitemapGoals.every((g) => !goalHtml[g]!.includes('data-empty-goal')) && !/\/focus</.test(sitemap),
);

// ── Sprint 7: consumer comparison, analyser, provenance ─────────────────
const listingDir = join(DIST, 'supplements');
const listings = existsSync(listingDir)
  ? readdirSync(listingDir).filter((f) => f.endsWith('.html'))
  : [];
check(
  'listing: an ingredient comparison page exists (magnesium)',
  listings.includes('magnesium.html'),
);
const mgList = read('supplements/magnesium.html');
check(
  'listing: canonical, cards, data-driven filters and transparent sorts',
  /<link rel="canonical" href="[^"]*\/supplements\/magnesium"/.test(mgList) &&
    (mgList.match(/data-consumer-card(?=[\s>])/g) ?? []).length >= 3 &&
    mgList.includes('name="form"') &&
    mgList.includes('Elemental amount (highest first)') &&
    !mgList.includes('value="compound"') && // mixed forms → no compound sort
    mgList.includes('data-compound-note') &&
    !/value="best"|Best match|quality score/i.test(mgList),
);
check(
  'listing: match labels always come with their factors',
  (mgList.match(/data-match(?=[\s>])/g) ?? []).length ===
    (mgList.match(/data-consumer-card(?=[\s>])/g) ?? []).length,
);
check(
  'listing: affiliate disclosure exactly when an affiliate link is rendered',
  mgList.includes('rel="sponsored nofollow noopener"') ===
    mgList.includes('data-affiliate-disclosure'),
);
check('analyser: /analyse is on-demand (not prerendered)', !existsSync(join(DIST, 'analyse.html')));
check('robots disallows /catalogue-index.json', robots.includes('Disallow: /catalogue-index.json'));
const idx = JSON.parse(read('catalogue-index.json')) as {
  v: number;
  products: Array<Record<string, unknown>>;
};
check(
  'catalogue index: identity fields only (no descriptions, images, prices)',
  idx.v === 1 &&
    idx.products.every(
      (p) => Object.keys(p).sort().join() === 'brand,id,ingredients,name,slug,variant',
    ),
);
const publicText = walk(DIST)
  .filter((f) => /\.(html|json|xml|txt)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
check(
  'no third-party brand image URLs in any public file',
  !/cdn\.shopify\.com|briyosupplements\.com\/cdn|wellbeingnutrition\.com\/cdn|mycf\.in\/cdn|rasayanam\.in\/cdn/.test(
    publicText,
  ),
);
check(
  'no copied brand marketing descriptions (research excerpts) in public files',
  !/are a dietary supplement containing|hydration and energy drink mix designed to support/i.test(
    publicText,
  ),
);
check(
  'no fake ratings or review counts anywhere',
  !/aggregateRating|ratingValue|reviewCount|"@type":"Review"/.test(publicText),
);
const bisProduct = read('products/testbed-sports-magnesium-bisglycinate-capsules.html');
check(
  'product page: decomposed dimensions table, no overall score',
  bisProduct.includes('data-dimensions') &&
    (bisProduct.match(/data-dimension="/g) ?? []).length === 8 &&
    !/(?<!no )overall score|quality score|\d(\.\d)?\s*\/\s*10\b/i.test(text(bisProduct)),
);
check(
  'product page: where to buy and compare-with reachable from the top',
  bisProduct.includes('href="#buy"') && bisProduct.includes('href="#compare"'),
);
const homeHtml = read('index.html');
check(
  'homepage: search first, URL analyser second, popular searches, how it works',
  homeHtml.includes('data-home-analyse') &&
    /action="\/analyse"/.test(homeHtml) &&
    homeHtml.includes('Popular searches') &&
    homeHtml.includes('data-how-it-works'),
);
check(
  'sitemap: listing entries (if any) are built pages',
  [...sitemap.matchAll(/\/supplements\/([a-z0-9-]+)</g)].every((m) =>
    listings.includes(`${m[1]}.html`),
  ),
);

// ── Site-wide safety ─────────────────────────────────────────────────────
const html = walk(DIST).filter((f) => f.endsWith('.html'));
const all = html.map((f) => readFileSync(f, 'utf8')).join('\n');
check(
  'no internal brand-response contact fields in output',
  !/contactAddress|respondentName/.test(all),
);
// The submit form itself legitimately names its (empty) input fields.
const publicFiles = walk(DIST)
  .filter((f) => /\.(html|json|xml|txt)$/.test(f) && !f.endsWith('/submit.html'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
check(
  'no submitter details, storage keys or R2 paths in any public file',
  !/submitterName|submitterContact|storageKey|submissions\/\d{4}\/|r2\.dev|r2\.cloudflarestorage/.test(
    publicFiles,
  ),
);
const emails = new Set(all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []);
check(
  'only labels.fyi emails appear',
  [...emails].every((e) => /@labels\.fyi$/i.test(e)),
);
check(
  'trust pages: privacy, terms and contact built and linked from the footer',
  ['privacy', 'terms', 'contact'].every(
    (p) => existsSync(join(DIST, `${p}.html`)) && home.includes(`href="/${p}"`),
  ),
);
check(
  'submit: consent links to terms and privacy',
  /name="rights"[\s\S]{0,600}href="\/terms"[\s\S]{0,300}href="\/privacy"/.test(submitHtml),
);
check(
  'listing cards: explicit elemental / compound amount labels',
  mgList.includes('Elemental amount') && mgList.includes('Compound amount'),
);
check('robots disallows partials', robots.includes('Disallow: /partials/'));
check('sitemap excludes partials', !read('sitemap.xml').includes('/partials/'));

if (failures.length) {
  console.error(`\n${failures.length} dist check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${html.length} HTML files checked.`);
