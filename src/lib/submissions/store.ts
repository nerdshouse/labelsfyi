/**
 * Minimal document store for the submission/review pipeline.
 *
 *   SanityDocStore   production: writes the existing Sanity types with a
 *                    server-only write token (private dataset required).
 *   R2DocStore       local development only: JSON documents in the local R2
 *                    emulation, read together with the demo fixtures, queried
 *                    with the same GROQ (groq-js).
 *
 * Nothing else in the pipeline knows which one is in use.
 */

export type Doc = { _id: string; _type: string } & Record<string, unknown>;
export type WriteOp = { create: Doc } | { patch: { id: string; set: Record<string, unknown> } };

export interface DocStore {
  kind: 'sanity' | 'local-r2';
  query<T>(groq: string, params?: Record<string, unknown>): Promise<T>;
  get<T extends Doc>(id: string): Promise<T | null>;
  commit(ops: WriteOp[]): Promise<void>;
}

// ─── Sanity (production) ──────────────────────────────────────────────────

export interface SanityLike {
  fetch<T>(q: string, p?: Record<string, unknown>): Promise<T>;
  getDocument<T>(id: string): Promise<T | undefined>;
  transaction(): {
    create(doc: Doc): unknown;
    patch(id: string, ops: { set: Record<string, unknown> }): unknown;
    commit(): Promise<unknown>;
  };
}

export class SanityDocStore implements DocStore {
  kind = 'sanity' as const;
  constructor(private client: SanityLike) {}
  query<T>(groq: string, params: Record<string, unknown> = {}) {
    return this.client.fetch<T>(groq, params);
  }
  async get<T extends Doc>(id: string) {
    return ((await this.client.getDocument<T>(id)) ?? null) as T | null;
  }
  async commit(ops: WriteOp[]) {
    const tx = this.client.transaction();
    for (const op of ops) {
      if ('create' in op) tx.create(op.create);
      else tx.patch(op.patch.id, { set: op.patch.set });
    }
    await tx.commit();
  }
}

// ─── R2 JSON store (local development) ───────────────────────────────────

export interface R2Like {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string, opts?: unknown): Promise<unknown>;
  list(opts: {
    prefix: string;
    cursor?: string;
  }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
}

const DOC_PREFIX = 'dev-docs/';
const docKey = (id: string) => `${DOC_PREFIX}${encodeURIComponent(id)}.json`;

export class R2DocStore implements DocStore {
  kind = 'local-r2' as const;
  constructor(
    private bucket: R2Like,
    /** Read-only documents visible to queries (the demo fixtures). */
    private overlay: Doc[] = [],
  ) {}
  private async all(): Promise<Doc[]> {
    const docs: Doc[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix: DOC_PREFIX, ...(cursor ? { cursor } : {}) });
      for (const o of page.objects) {
        const obj = await this.bucket.get(o.key);
        if (obj) docs.push(JSON.parse(await obj.text()) as Doc);
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    const ids = new Set(docs.map((d) => d._id));
    return [...this.overlay.filter((d) => !ids.has(d._id)), ...docs];
  }
  /** Only the documents written by the pipeline (for local export). */
  async written(): Promise<Doc[]> {
    const docs: Doc[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix: DOC_PREFIX, ...(cursor ? { cursor } : {}) });
      for (const o of page.objects) {
        const obj = await this.bucket.get(o.key);
        if (obj) docs.push(JSON.parse(await obj.text()) as Doc);
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return docs;
  }
  async query<T>(groq: string, params: Record<string, unknown> = {}) {
    const { parse, evaluate } = await import('groq-js');
    const value = await evaluate(parse(groq, { params }), { dataset: await this.all(), params });
    return (await value.get()) as T;
  }
  async get<T extends Doc>(id: string) {
    const obj = await this.bucket.get(docKey(id));
    if (obj) return JSON.parse(await obj.text()) as T;
    return (this.overlay.find((d) => d._id === id) as T | undefined) ?? null;
  }
  async commit(ops: WriteOp[]) {
    const now = new Date().toISOString();
    for (const op of ops) {
      if ('create' in op) {
        if (await this.bucket.get(docKey(op.create._id)))
          throw new Error(`Document exists: ${op.create._id}`);
        await this.bucket.put(
          docKey(op.create._id),
          JSON.stringify({ _createdAt: now, _updatedAt: now, ...op.create }),
        );
      } else {
        const current = await this.get<Doc>(op.patch.id);
        if (!current) throw new Error(`Document not found: ${op.patch.id}`);
        await this.bucket.put(
          docKey(op.patch.id),
          JSON.stringify({ ...current, ...op.patch.set, _updatedAt: now }),
        );
      }
    }
  }
}

/** In-memory store with the same semantics, for tests. */
export class MemoryDocStore implements DocStore {
  kind = 'local-r2' as const;
  docs = new Map<string, Doc>();
  constructor(private overlay: Doc[] = []) {}
  private all() {
    const ids = new Set(this.docs.keys());
    return [...this.overlay.filter((d) => !ids.has(d._id)), ...this.docs.values()];
  }
  async query<T>(groq: string, params: Record<string, unknown> = {}) {
    const { parse, evaluate } = await import('groq-js');
    return (await (
      await evaluate(parse(groq, { params }), { dataset: this.all(), params })
    ).get()) as T;
  }
  async get<T extends Doc>(id: string) {
    return ((this.docs.get(id) ?? this.overlay.find((d) => d._id === id)) as T | undefined) ?? null;
  }
  async commit(ops: WriteOp[]) {
    const now = new Date().toISOString();
    for (const op of ops) {
      if ('create' in op) {
        if (this.docs.has(op.create._id) || this.overlay.some((d) => d._id === op.create._id))
          throw new Error(`Document exists: ${op.create._id}`);
        this.docs.set(op.create._id, { _createdAt: now, _updatedAt: now, ...op.create });
      } else {
        const current = await this.get<Doc>(op.patch.id);
        if (!current) throw new Error(`Document not found: ${op.patch.id}`);
        this.docs.set(op.patch.id, { ...current, ...op.patch.set, _updatedAt: now });
      }
    }
  }
}
