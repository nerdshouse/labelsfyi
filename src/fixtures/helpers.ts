/**
 * Helpers for authoring Sanity-shaped fixture documents by hand.
 *
 * This file must stay runnable by plain Node (type stripping), so: relative
 * imports with extensions only, `import type` only, no enums.
 */

export type RawDoc = { _id: string; _type: string } & Record<string, unknown>;

let keySeq = 0;
/** Deterministic array keys so exports are stable between runs. */
export const key = (): string => `k${(keySeq++).toString(36).padStart(4, '0')}`;

export const ref = (id: string) => ({ _type: 'reference', _ref: id });
export const keyedRef = (id: string) => ({ _key: key(), _type: 'reference', _ref: id });
export const weakRef = (id: string) => ({ _type: 'reference', _ref: id, _weak: true });
export const slug = (current: string) => ({ _type: 'slug', current });
export const qty = (amount: number, unit: string) => ({ _type: 'quantity', amount, unit });

/** Fields shared by every published demo editorial document. */
export const published = (createdAt: string, updatedAt = createdAt) => ({
  workflowStatus: 'PUBLISHED',
  isDemo: true,
  _createdAt: `${createdAt}T09:00:00Z`,
  _updatedAt: `${updatedAt}T09:00:00Z`,
});

/**
 * Minimal Markdown-ish → Portable Text converter for fixtures.
 * Supports: "## h2", "### h3", "- bullet", "1. number", **bold**, [text](href).
 */
export function pt(...paragraphs: string[]) {
  return paragraphs.map((raw) => {
    let style = 'normal';
    let listItem: string | undefined;
    let text = raw;
    if (text.startsWith('### ')) {
      style = 'h3';
      text = text.slice(4);
    } else if (text.startsWith('## ')) {
      style = 'h2';
      text = text.slice(3);
    } else if (text.startsWith('- ')) {
      listItem = 'bullet';
      text = text.slice(2);
    } else if (/^\d+\. /.test(text)) {
      listItem = 'number';
      text = text.replace(/^\d+\. /, '');
    }

    const markDefs: Array<Record<string, unknown>> = [];
    const children: Array<Record<string, unknown>> = [];
    const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
    for (const part of text.split(pattern)) {
      if (!part) continue;
      const bold = /^\*\*(.+)\*\*$/.exec(part);
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (bold) {
        children.push({ _type: 'span', _key: key(), text: bold[1], marks: ['strong'] });
      } else if (link) {
        const markKey = key();
        markDefs.push({ _type: 'link', _key: markKey, href: link[2] });
        children.push({ _type: 'span', _key: key(), text: link[1], marks: [markKey] });
      } else {
        children.push({ _type: 'span', _key: key(), text: part, marks: [] });
      }
    }

    return {
      _type: 'block',
      _key: key(),
      style,
      markDefs,
      children,
      ...(listItem ? { listItem, level: 1 } : {}),
    };
  });
}
