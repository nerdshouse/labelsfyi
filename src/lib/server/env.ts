/**
 * Runtime environment for on-demand routes (Cloudflare Worker). Imported
 * lazily so prerendered pages (built in Node) never touch it.
 */
import type { R2Like } from '@/lib/submissions/store';

export interface RateLimiter {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

/** The subset of Cloudflare's R2Bucket we use. Structurally an R2Like. */
export interface R2Bucket extends Omit<R2Like, 'get' | 'put'> {
  get(key: string): Promise<{
    text(): Promise<string>;
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
  } | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string, opts?: unknown): Promise<unknown>;
}

export interface ServerEnv {
  /** Static assets (the build output), bound by the Cloudflare adapter. */
  ASSETS?: { fetch(input: Request | URL | string): Promise<Response> };
  SUBMISSIONS?: R2Bucket;
  SUBMIT_RATE_LIMITER?: RateLimiter;
  /** Per-IP limit for the URL analyser (outbound fetches). */
  ANALYSE_RATE_LIMITER?: RateLimiter;
  /** "production" on the live Worker (wrangler env.production.vars). */
  DEPLOY_ENV?: string;
  /** Cloudflare Access for /internal/* (required in production). */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  REVIEW_USER?: string;
  REVIEW_PASSWORD?: string;
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_WRITE_TOKEN?: string;
  /** Must be "true": the hard prerequisite from docs/ingestion.md. */
  SUBMISSIONS_PRIVATE_DATASET?: string;
  /** Public intake: "open" opens it; anything else (incl. unset) keeps it closed. */
  PUBLIC_SUBMISSIONS?: string;
  /** Base URL of Sanity Studio for "Open in Studio" links (default: local Studio). */
  SANITY_STUDIO_URL?: string;
}

export async function serverEnv(): Promise<ServerEnv> {
  const mod = (await import('cloudflare:workers')) as unknown as { env: ServerEnv };
  return mod.env;
}
