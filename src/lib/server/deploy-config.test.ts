import { describe, expect, it } from 'vitest';
import {
  accessAudProblem,
  accessTeamDomainProblem,
  workerConfigProblems,
  type WorkerConfig,
} from './deploy-config';

const TEAM = 'gentle-glitter-5a69.cloudflareaccess.com';
const AUD = 'f462a8558f5b9b748028c56bf2c36e3e0ac22e73a70da65b390a425ba41d3129';

const production = (vars: Record<string, string> = {}): WorkerConfig => ({
  name: 'labelsfyi',
  workers_dev: false,
  preview_urls: false,
  routes: [{ pattern: 'labels.fyi', custom_domain: true }],
  vars: {
    DEPLOY_ENV: 'production',
    CONTENT_SOURCE: 'sanity',
    SANITY_PROJECT_ID: 'r1eiikj7',
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ...vars,
  },
});

describe('deploy guard: Access AUD', () => {
  it('accepts the real production AUD', () => {
    expect(AUD).toHaveLength(64);
    expect(accessAudProblem(AUD)).toBeNull();
  });
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['padded real value', ` ${AUD} `],
    ['changeme', 'changeme'],
    ['<ACCESS_AUD>', '<ACCESS_AUD>'],
    ['placeholder word', 'placeholder'],
    ['63 hex', AUD.slice(0, 63)],
    ['65 hex', `${AUD}a`],
    ['uppercase hex', AUD.toUpperCase()],
    ['mixed-case hex', `F${AUD.slice(1)}`],
    ['non-hex, 64 chars', 'g'.repeat(64)],
    ['non-hex inside', `${AUD.slice(0, 63)}z`],
    ['all zeros', '0'.repeat(64)],
    ['repeated a', 'a'.repeat(64)],
    ['0-9a-f run', '0123456789abcdef'.repeat(4)],
    ['not a string', undefined],
  ])('rejects %s', (_label, value) => {
    expect(accessAudProblem(value)).not.toBeNull();
  });
});

describe('deploy guard: Access team domain', () => {
  it('accepts the real production team domain', () => {
    expect(accessTeamDomainProblem(TEAM)).toBeNull();
  });
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['padded real value', ` ${TEAM}`],
    ['https:// prefix', `https://${TEAM}`],
    ['http:// prefix', `http://${TEAM}`],
    ['path', `${TEAM}/cdn-cgi/access/certs`],
    ['trailing slash', `${TEAM}/`],
    ['trailing dot', `${TEAM}.`],
    ['port', `${TEAM}:443`],
    ['uppercase', TEAM.toUpperCase()],
    ['arbitrary domain', 'evil.example.com'],
    ['look-alike suffix', `${TEAM}.evil.com`],
    ['look-alike prefix', 'gentle-glitter-5a69.cloudflareaccess.com.evil.com'],
    ['nested subdomain', `a.${TEAM}`],
    ['bare suffix', 'cloudflareaccess.com'],
    ['placeholder your-team', 'your-team.cloudflareaccess.com'],
    ['placeholder example', 'example.cloudflareaccess.com'],
    ['placeholder <team>', '<team>.cloudflareaccess.com'],
    ['not a string', undefined],
  ])('rejects %s', (_label, value) => {
    expect(accessTeamDomainProblem(value)).not.toBeNull();
  });
});

describe('deploy guard: baked production Worker config', () => {
  it('passes with the real production values', () => {
    expect(workerConfigProblems(production())).toEqual([]);
  });
  it('rejects malformed Access values without normalising them', () => {
    expect(workerConfigProblems(production({ ACCESS_AUD: AUD.toUpperCase() }))).toHaveLength(1);
    expect(
      workerConfigProblems(production({ ACCESS_TEAM_DOMAIN: `https://${TEAM}` })),
    ).toHaveLength(1);
    expect(
      workerConfigProblems(production({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' })),
    ).toHaveLength(2);
  });
  it('still enforces name, workers.dev, previews, route and production vars', () => {
    expect(workerConfigProblems({ ...production(), name: 'labelsfyi-local' })).toHaveLength(1);
    expect(workerConfigProblems({ ...production(), workers_dev: true })).toHaveLength(1);
    expect(workerConfigProblems({ ...production(), preview_urls: true })).toHaveLength(1);
    expect(workerConfigProblems({ ...production(), routes: [] })).toHaveLength(1);
    expect(workerConfigProblems(production({ DEPLOY_ENV: 'development' }))).toHaveLength(1);
    expect(workerConfigProblems(production({ CONTENT_SOURCE: 'demo' }))).toHaveLength(1);
    expect(workerConfigProblems(production({ SANITY_PROJECT_ID: '' }))).toHaveLength(1);
  });
});
