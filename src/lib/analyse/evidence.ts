/**
 * Evidence statements on a permitted product page (docs/ingestion.md), for the
 * analyser's evidence report. Reads only what the page itself states; nothing
 * is inferred, calculated or fetched (linked documents are recorded as links,
 * never opened).
 *
 * Bounded by design: every string is tag-stripped and length-capped, lists are
 * capped, and brand claims are kept as SHORT phrases (the claim itself, never
 * the surrounding description). Nothing here is written to a candidate.
 */
import { clean, thisProductOnly } from './extract';

const MAX_HTML = 1_000_000;
const MAX_BLOCKS = 3000;

export type EvidenceLink = { href: string; host: string; text: string };
export type Located = { value: string; locator: string };

export type DocumentKind =
  | 'product_coa'
  | 'batch_coa'
  | 'raw_material_coa'
  | 'lab_report'
  | 'gmp_certificate'
  | 'iso_certificate'
  | 'fssai_document'
  | 'other_certificate';

export type StatementKind =
  | 'third_party_tested'
  | 'lab_tested'
  | 'heavy_metals'
  | 'microbiological'
  | 'gmp'
  | 'iso'
  | 'haccp'
  | 'fssai'
  | 'third_party_certification';

export interface PageEvidence {
  /** Identity statements exactly as written after their label ("Manufactured by: …"). */
  manufacturer: Located | null;
  marketer: Located | null;
  countryOfOrigin: Located | null;
  fssaiLicence: Located | null;
  shelfLife: Located | null;
  mrp: Located | null;
  netQuantity: Located | null;
  documents: Array<EvidenceLink & { kind: DocumentKind }>;
  statements: Array<{ kind: StatementKind; phrase: string }>;
  claims: Array<{ phrase: string; link: EvidenceLink | null }>;
  preparation: Located[];
  servingMentions: Located[];
  servingsMentions: Located[];
}

type Block = { text: string; links: EvidenceLink[] };

/** Page → text blocks (paragraph, list item, cell…), each with its own links. */
export function blocks(html: string, pageUrl: URL | null): Block[] {
  const body = thisProductOnly(html.slice(0, MAX_HTML), pageUrl).replace(
    /<(script|style|noscript|svg|template|iframe|object|head)\b[\s\S]*?<\/\1>/gi,
    ' ',
  );
  const out: Block[] = [];
  for (const chunk of body.split(
    /<\/(?:p|li|div|section|article|tr|td|th|h[1-6]|dd|dt|summary|details|span)>|<br\s*\/?>/i,
  )) {
    if (out.length >= MAX_BLOCKS) break;
    const text = clean(chunk, 600);
    if (!text) continue;
    const links: EvidenceLink[] = [];
    for (const a of chunk.matchAll(
      /<a\b[^>]*\bhref\s*=\s*["']([^"']{1,2000})["'][^>]*>([\s\S]*?)<\/a>/gi,
    )) {
      const link = safeLink(a[1]!, clean(a[2], 120) ?? '', pageUrl);
      if (link) links.push(link);
    }
    out.push({ text, links });
  }
  return out;
}

function safeLink(raw: string, text: string, base: URL | null): EvidenceLink | null {
  try {
    const u = base ? new URL(raw.trim(), base) : new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return { href: u.toString().slice(0, 500), host: u.hostname, text };
  } catch {
    return null;
  }
}

// ─── Labelled identity statements ────────────────────────────────────────

const stop = (s: string) =>
  s
    .split(
      /\s(?:marketed by|mkt\.? by|manufactured by|mfd\.? by|country of origin|fssai|best before|shelf life|net (?:qty|quantity|wt|weight)|mrp)\b/i,
    )[0]!
    .replace(/[.;,\s]+$/, '')
    .trim();

function labelled(bs: Block[], re: RegExp, max = 120, locator = 'Page text'): Located | null {
  for (const b of bs) {
    const m = re.exec(b.text);
    const v = m?.[1] ? clean(stop(m[1]), max) : null;
    if (v && /[a-z0-9]/i.test(v)) return { value: v, locator };
  }
  return null;
}

// ─── Documents, statements and claims ────────────────────────────────────

const DOC_RULES: Array<[DocumentKind, RegExp]> = [
  [
    'raw_material_coa',
    /raw[- ]?material.*(coa|certificate of analysis)|(coa|certificate of analysis).*raw[- ]?material/i,
  ],
  [
    'batch_coa',
    /batch.*(coa|certificate of analysis|report)|(coa|certificate of analysis|report).*batch/i,
  ],
  ['product_coa', /\bcoa\b|certificate of analysis/i],
  ['lab_report', /\b(lab(oratory)?|test(ing)?|analysis)\s+report\b/i],
  ['gmp_certificate', /\bgmp\b.*certificat|certificat.*\bgmp\b/i],
  ['iso_certificate', /\biso\b.*certificat|certificat.*\biso\b/i],
  ['fssai_document', /\bfssai\b.*(licen[cs]e|certificat)/i],
  ['other_certificate', /\bcertificate\b/i],
];

const STATEMENT_RULES: Array<[StatementKind, RegExp]> = [
  ['third_party_tested', /\b(third|3rd)[- ]party[- ](lab[- ])?(tested|testing|verified)\b/i],
  ['lab_tested', /\b(lab|laboratory)[- ]tested\b/i],
  [
    'heavy_metals',
    /\bheavy[- ]metals?\b[^.]{0,40}\b(tested|free|testing|checked)\b|\b(tested|free)\b[^.]{0,20}\bheavy[- ]metals?\b/i,
  ],
  ['microbiological', /\bmicrob(ial|iological)\b[^.]{0,40}\b(tested|testing|free|limits?)\b/i],
  ['gmp', /\bgmp\b[- ]?(certified|compliant|approved|facility|standards?)?/i],
  ['iso', /\biso\s?\d{3,5}\b|\biso[- ]certified\b/i],
  ['haccp', /\bhaccp\b/i],
  ['fssai', /\bfssai\b[- ](approved|certified|compliant|registered)\b/i],
  [
    'third_party_certification',
    /\b(informed[- ](sport|choice)|nsf[- ]certified|trustified|labdoor|bscg)\b/i,
  ],
];

/** Claim triggers: the phrase starts at the trigger and stops at the sentence end. */
const CLAIM =
  /\b((?:clinically|scientifically)\s+(?:proven|tested|researched|studied|backed|dosed|formulated)|(?:research|science|evidence)[- ]backed|doctor[- ]recommended|(?:supports?|helps?|boosts?|improves?|promotes?|enhances?|reduces?|aids?|relieves?|strengthens?|increases?|restores?|replenish(?:es)?|maintains?)\s+(?:your\s+|healthy\s+|natural\s+|faster\s+|better\s+)?[a-z]|(?:third|3rd)[- ]party[- ]tested|lab[- ]tested|heavy[- ]metal[- ]free|(?:sugar|gluten|soy|dairy|gmo)[- ]free|no\s+(?:added\s+sugar|artificial\s+\w+)|100%\s+(?:pure|natural))/i;

const EVIDENCE_LINK =
  /study|studies|research|pubmed|doi\.org|clinical|trial|coa|report|certificate/i;

/** A verb claim ("supports …") counts only when it names a health/performance topic. */
const VERB_CLAIM =
  /^(?:supports?|helps?|boosts?|improves?|promotes?|enhances?|reduces?|aids?|relieves?|strengthens?|increases?|restores?|replenish(?:es)?|maintains?)\b/i;
const TOPIC =
  /energy|strength|recovery|endurance|muscle|stamina|performance|workout|pump|focus|hydrat|electrolyte|sleep|immun|digest|gut|heart|joint|bone|skin|hair|stress|mood|brain|cogniti|metabol|weight|fat\b|absorption|growth|health|wellness|vitality|blood|cholesterol|fatigue|inflammation/i;

function claimPhrase(text: string): string | null {
  for (const sentence of text.split(/(?<=[.!?])\s+|\s[•|·–—]\s|\n/)) {
    const m = CLAIM.exec(sentence);
    if (!m) continue;
    if (VERB_CLAIM.test(m[0]) && !TOPIC.test(sentence.slice(m.index, m.index + 100))) continue;
    const words = sentence
      .slice(m.index)
      .replace(/[.!?]+$/, '')
      .split(/\s+/)
      .slice(0, 12)
      .join(' ');
    const phrase = clean(words, 100);
    if (phrase && phrase.split(' ').length >= 2) return phrase;
  }
  return null;
}

// ─── Preparation and repeated facts ──────────────────────────────────────

const PREP =
  /\b(?:mix|dissolve|add|stir|shake)\b[^.!?]{0,80}?\b(\d{2,4}(?:\s*(?:–|-|to)\s*\d{2,4})?)\s?ml\b/i;
const SERVING =
  /serving size\s*[:\-–]?\s*(\d+(?:\.\d+)?\s*(?:capsules?|tablets?|softgels?|scoops?|sachets?|gumm(?:y|ies)|strips?|g|ml|caplets?))/gi;
const SERVINGS = /servings?\s*per\s*(?:container|pack|bottle|box|jar)\s*[:\-–]?\s*(\d{1,4})/gi;

const normRange = (s: string) =>
  s
    .replace(/\s*(?:–|-|to)\s*/g, '–')
    .replace(/\s+/g, ' ')
    .trim();

export function extractEvidence(html: string, pageUrl: URL | null = null): PageEvidence {
  const bs = blocks(html, pageUrl);

  const documents: PageEvidence['documents'] = [];
  const seenDocs = new Set<string>();
  for (const b of bs)
    for (const l of b.links) {
      const probe = `${l.text} ${decodeURIComponent(l.href.split('/').pop() ?? '')}`;
      const rule = DOC_RULES.find(([, re]) => re.test(probe));
      if (!rule || seenDocs.has(l.href)) continue;
      seenDocs.add(l.href);
      documents.push({ ...l, kind: rule[0] });
      if (documents.length >= 20) break;
    }

  const statements: PageEvidence['statements'] = [];
  const claims: PageEvidence['claims'] = [];
  const seenClaims = new Set<string>();
  const preparation: Located[] = [];
  const servingMentions: Located[] = [];
  const servingsMentions: Located[] = [];
  for (const b of bs) {
    for (const [kind, re] of STATEMENT_RULES) {
      const m = re.exec(b.text);
      if (m && !statements.some((s) => s.kind === kind))
        statements.push({ kind, phrase: clean(m[0], 80)! });
    }
    const phrase = claimPhrase(b.text);
    if (phrase && !seenClaims.has(phrase.toLowerCase()) && claims.length < 12) {
      seenClaims.add(phrase.toLowerCase());
      claims.push({
        phrase,
        link: b.links.find((l) => EVIDENCE_LINK.test(`${l.text} ${l.href}`)) ?? null,
      });
    }
    const p = PREP.exec(b.text);
    if (p && preparation.length < 10)
      preparation.push({ value: `${normRange(p[1]!)} ml`, locator: `“${clean(p[0], 90)}”` });
    for (const m of b.text.matchAll(SERVING))
      if (servingMentions.length < 10)
        servingMentions.push({
          value: clean(m[1], 40)!.toLowerCase(),
          locator: `“${clean(m[0], 60)}”`,
        });
    for (const m of b.text.matchAll(SERVINGS))
      if (servingsMentions.length < 10)
        servingsMentions.push({ value: m[1]!, locator: `“${clean(m[0], 60)}”` });
  }

  const fssai = (() => {
    for (const b of bs) {
      const m = /\bfssai\b[^0-9\n]{0,40}(\d{14})\b/i.exec(b.text);
      if (m) return { value: m[1]!, locator: 'Page text' };
    }
    return null;
  })();
  const mrp = (() => {
    for (const b of bs) {
      const m =
        /\bM\.?R\.?P\.?\b[^0-9₹\n]{0,25}(?:₹|Rs\.?|INR)?\s*([\d,]{1,9}(?:\.\d{1,2})?)/i.exec(
          b.text,
        );
      if (m && Number(m[1]!.replace(/,/g, '')) > 0)
        return { value: `₹${m[1]}`, locator: 'Page text' };
    }
    return null;
  })();

  return {
    // "Manufactured by …" / "Mfd. by …", or the noun as a label ("Manufacturer: …");
    // a bare noun in prose ("original manufacturer packaging") is not a statement.
    manufacturer: labelled(
      bs,
      /\b(?:(?:manufactured|mfd\.?)\s+by\s*[:\-–]?|manufacturer\s*(?::|\s[-–]\s))\s*(.{3,160})/i,
    ),
    marketer: labelled(
      bs,
      /\b(?:(?:marketed|mkt\.?)\s+by\s*[:\-–]?|marketer\s*(?::|\s[-–]\s))\s*(.{3,160})/i,
    ),
    countryOfOrigin: labelled(
      bs,
      /\bcountry of origin\s*[:\-–]?\s*([A-Za-z][A-Za-z .]{1,40})/i,
      40,
    ),
    fssaiLicence: fssai,
    shelfLife: labelled(
      bs,
      /\b(?:shelf life\s*(?::|\s[-–]\s)|best before\s*[:\-–]?)\s*(.{2,60})/i,
      60,
    ),
    mrp,
    netQuantity: labelled(
      bs,
      /\b(?:net (?:qty|quantity|wt|weight|content)|pack size)\.?\s*[:\-–]?\s*(\d[\d.,]*\s*(?:g|gm|grams?|kg|ml|l|capsules?|tablets?|sachets?|softgels?|gummies|servings?)\b)/i,
      40,
    ),
    documents,
    statements,
    claims,
    preparation,
    servingMentions,
    servingsMentions,
  };
}
