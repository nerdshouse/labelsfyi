/**
 * Minimal robots.txt evaluation (RFC 9309 semantics that matter here):
 * the most specific user-agent group applies (ours, else "*"); the longest
 * matching Allow/Disallow rule wins, Allow on ties; "*" and "$" supported.
 * A 4xx robots.txt means "no restrictions"; a 5xx/unreachable one means
 * "disallow everything" (fail closed), which the caller decides.
 */

export const ROBOTS_TOKEN = 'labels-fyi-analyser';

interface Group {
  agents: string[];
  rules: Array<{ allow: boolean; path: string }>;
}

function parse(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (value || key === 'allow') current.rules.push({ allow: key === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function matches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

export function robotsAllows(
  robotsTxt: string,
  pathAndQuery: string,
  token = ROBOTS_TOKEN,
): boolean {
  const groups = parse(robotsTxt);
  const mine = groups.filter((g) =>
    g.agents.some((a) => a !== '*' && token.toLowerCase().includes(a)),
  );
  const applicable = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!matches(rule.path, pathAndQuery)) continue;
    const len = rule.path.length;
    if (!best || len > best.len || (len === best.len && rule.allow))
      best = { allow: rule.allow, len };
  }
  return best ? best.allow : true;
}
