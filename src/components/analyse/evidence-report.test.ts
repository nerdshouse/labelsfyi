import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * /analyse UI: an evidence reader, never a judge. Checks the rendered source
 * of the report components and the page (the report logic is tested in
 * lib/analyse/report.test.ts).
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const report = read('./EvidenceReport.astro');
const tag = read('./StatusTag.astro');
const page = read('../../pages/analyse.astro');
const visible = (src: string) =>
  src
    .replace(/<script>[\s\S]*?<\/script>/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '');

describe('evidence report UI', () => {
  it('has no score, rating, ranking or verdict language', () => {
    for (const src of [report, tag, page])
      expect(visible(src)).not.toMatch(
        /\bscore\b|\brating\b|top[- ]rated|\bbest\b|\bwinner\b|good transparency|poor transparency|high quality|low quality|✓/i,
      );
  });

  it('says what "not found" means and that nothing is label-verified', () => {
    expect(report).toMatch(/not that the product lacks it/);
    expect(report).toMatch(/Nothing here is checked against the\s+physical label/);
    expect(report).toMatch(/labels\.fyi does not rate or rank products/);
  });

  it('every status is shown in words (never colour alone), with a description', () => {
    expect(tag).toMatch(/\{meta\.label\}/);
    expect(tag).toMatch(/title=\{meta\.description\}/);
  });

  it('is navigable: labelled sections, table captions, polite copy status', () => {
    const sections = report.match(/<section id="r-[a-z]+"[^>]*aria-labelledby="r-[a-z]+-h"/g) ?? [];
    expect(sections.length).toBe(9);
    expect(report.match(/<caption class="sr-only">/g)?.length).toBe(2);
    expect(report).toMatch(/role="status" aria-live="polite"/);
  });

  it('only offers actions the app supports: copy (progressively enhanced), no messaging', () => {
    expect(report).toMatch(/class="btn btn-quiet hidden[^"]*"\s+data-copy-questions/);
    expect(report).not.toMatch(/wa\.me|whatsapp:|mailto:/i);
  });

  it('external links never pass referrer or rank', () => {
    for (const m of report.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g))
      expect(m[0]).toMatch(/rel="nofollow noopener noreferrer"/);
  });
});

describe('/analyse page', () => {
  it('keeps the blocked-source path: no fetch, explain, offer upload/manual submission', () => {
    expect(page).toMatch(/state === 'SOURCE_NOT_ALLOWED'/);
    expect(page).toMatch(/Upload the label/);
    expect(page).toMatch(/Submit the product manually/);
  });
  it('renders the evidence report for a successful analysis', () => {
    expect(page).toMatch(
      /<EvidenceReport report=\{result\.report\} provenance=\{result\.provenance\} \/>/,
    );
  });
});
