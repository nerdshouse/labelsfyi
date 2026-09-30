declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

declare namespace App {
  interface Locals {
    /**
     * The authenticated /internal actor, set by the middleware: the Cloudflare
     * Access email when present, else the HTTP Basic auth user. Recorded as
     * reviewedBy on internal review actions.
     */
    internalActor?: string;
  }
}
