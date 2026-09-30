import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The homepage "label being read" illustration: honest (labelled as an
 * example, hidden from assistive tech, no ranking claims), motion-safe, and
 * only shown when there is no real product panel to show.
 */
const src = readFileSync(new URL('./LabelInspection.astro', import.meta.url), 'utf8');
const home = readFileSync(new URL('../../pages/index.astro', import.meta.url), 'utf8');

describe('LabelInspection', () => {
  it('is labelled as an example and hides its illustrative values from assistive tech', () => {
    expect(src).toMatch(/aria-labelledby="inspect-caption"/);
    expect(src).toMatch(/class="inspect-stage" aria-hidden="true"/);
    expect(src).toMatch(/<figcaption id="inspect-caption"[^>]*>\s*Example ·/);
  });

  it('makes no ranking or recommendation claims', () => {
    expect(src).not.toMatch(/best|top.rated|cleanest|recommended|\bAI\b|value for money/i);
  });

  it('animates only inside prefers-reduced-motion: no-preference, with transform/opacity', () => {
    const motion = src.slice(src.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(motion.length).toBeLessThan(src.length);
    const before = src.slice(0, src.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(before).not.toMatch(/animation(-name)?:/);
    for (const [, body] of src.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n {2}\}/g))
      for (const [, prop] of body!.matchAll(/^\s+([a-z-]+):/gm))
        expect(['opacity', 'transform', 'z-index']).toContain(prop);
  });

  it('is the fallback only: a real product panel wins', () => {
    expect(home).toMatch(
      /hero \? \([\s\S]*<DecodedLabel product=\{hero\} \/>[\s\S]*\) : \([\s\S]*<LabelInspection \/>/,
    );
  });
});
