import { escapeHTML, toHTML, uriLooksSafe, type PortableTextOptions } from '@portabletext/to-html';
import type { PortableTextBlocks } from './types';

const components: NonNullable<PortableTextOptions['components']> = {
  marks: {
    link: ({ children, value }) => {
      const href = typeof value?.href === 'string' ? value.href : '';
      if (!uriLooksSafe(href)) return children;
      const external = /^https?:\/\//.test(href);
      const rel = external ? ' rel="noopener" target="_blank"' : '';
      return `<a href="${escapeHTML(href)}"${rel}>${children}</a>`;
    },
  },
  unknownType: () => '',
};

/** Render Portable Text to HTML. Output is escaped by the library. */
export function renderPortableText(blocks: PortableTextBlocks | null | undefined): string {
  if (!blocks?.length) return '';
  return toHTML(blocks as unknown as Parameters<typeof toHTML>[0], { components });
}

/** Plain text for meta descriptions and reading time. */
export function portableTextToPlain(blocks: PortableTextBlocks | null | undefined): string {
  if (!blocks) return '';
  return blocks
    .map((b) =>
      Array.isArray(b.children)
        ? (b.children as Array<{ text?: string }>).map((c) => c.text ?? '').join('')
        : '',
    )
    .join('\n\n');
}

export function readingMinutes(blocks: PortableTextBlocks | null | undefined): number {
  const words = portableTextToPlain(blocks).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
