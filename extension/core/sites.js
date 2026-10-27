// Feed sites and the never-a-feed exclusions (spec section 4), kept in one place:
// content-script matches/exclude_matches, declarativeNetRequest lock rules and the brain's
// classifier all come from these tables. No Kotlin twin (the app lists feed packages in data/).

/**
 * A feed site. `domains` are registrable domains: the site is the domain itself and every
 * subdomain (like the match pattern *://*.instagram.com/*).
 */
export const SITES = Object.freeze([
  site('instagram', 'Instagram', 'I', '#E1306C', true, ['instagram.com'], 'https://www.instagram.com/'),
  site('facebook', 'Facebook', 'F', '#1877F2', true, ['facebook.com'], 'https://www.facebook.com/'),
  site('tiktok', 'TikTok', 'T', '#010101', true, ['tiktok.com'], 'https://www.tiktok.com/'),
  // whole site; long videos are protected by the long-watch rule, as in the app
  site('youtube', 'YouTube', 'Y', '#FF0000', true, ['youtube.com'], 'https://www.youtube.com/'),
  site('x', 'X', 'X', '#000000', false, ['x.com', 'twitter.com'], 'https://x.com/'),
  site('reddit', 'Reddit', 'R', '#FF4500', false, ['reddit.com'], 'https://www.reddit.com/'),
]);

function site(id, name, initial, color, defaultOn, domains, homeUrl) {
  return Object.freeze({
    id, name, initial, color, defaultOn,
    /** Optional feeds use optional_host_permissions and are registered at runtime. */
    optional: !defaultOn,
    domains: Object.freeze(domains),
    matches: Object.freeze(domains.map((d) => `*://*.${d}/*`)),
    /** Where Kaak sends you after a lock ends or a won chase (never back to the exact post). */
    homeUrl,
  });
}

export const DEFAULT_SITE_IDS = Object.freeze(SITES.filter((s) => s.defaultOn).map((s) => s.id));

export function siteById(id) {
  return SITES.find((s) => s.id === id) ?? null;
}

/**
 * Never feeds, even on these domains (the app's protected apps, translated). Left out of the
 * content script, never counted, and allowed through lock redirects.
 * kind: 'host'    = that host and its subdomains, any path
 *       'segment' = `path` itself or anything under `path/` (and its query/hash)
 *       'prefix'  = any path starting with `path` (spec's `tiktok.com/messages*`)
 */
export const EXCLUSIONS = Object.freeze([
  // chats (messenger.com isn't matched at all)
  excl('facebook', 'chat', 'segment', 'facebook.com', '/messages'),
  excl('instagram', 'chat', 'segment', 'instagram.com', '/direct'),
  excl('tiktok', 'chat', 'prefix', 'tiktok.com', '/messages'),
  excl('x', 'chat', 'segment', 'x.com', '/messages'),
  excl('x', 'chat', 'segment', 'twitter.com', '/messages'),
  excl('x', 'chat', 'segment', 'x.com', '/i/chat'), // X's newer chat path
  excl('reddit', 'chat', 'prefix', 'reddit.com', '/chat'),
  // work tools
  excl('facebook', 'work', 'host', 'business.facebook.com'),
  excl('facebook', 'work', 'host', 'adsmanager.facebook.com'),
  excl('youtube', 'work', 'host', 'studio.youtube.com'),
  excl('instagram', 'work', 'segment', 'instagram.com', '/accounts'), // settings, login
  // not a feed
  excl('youtube', 'notFeed', 'host', 'music.youtube.com'),
]);

function excl(siteId, why, kind, host, path = null) {
  return Object.freeze({ siteId, why, kind, host, path });
}

const exclusionsFor = (siteIds) => EXCLUSIONS.filter((e) => !siteIds || siteIds.includes(e.siteId));

// ---------------------------------------------------------------------------
// Match patterns (manifest content_scripts / chrome.scripting.registerContentScripts)

/** Content-script `matches` for these feeds. */
export function matchesFor(siteIds = DEFAULT_SITE_IDS) {
  return siteIds.flatMap((id) => siteById(id)?.matches ?? []);
}

/** Content-script `exclude_matches` for these feeds (every exclusion of those sites). */
export function excludeMatchesFor(siteIds = SITES.map((s) => s.id)) {
  return exclusionsFor(siteIds).flatMap((e) => {
    const h = `*://*.${e.host}`;
    switch (e.kind) {
      case 'host': return [`${h}/*`];
      case 'prefix': return [`${h}${e.path}*`];
      default: return [`${h}${e.path}`, `${h}${e.path}/*`, `${h}${e.path}?*`];
    }
  });
}

/** Every exclusion as match patterns (for all six sites). */
export const EXCLUDE_MATCHES = Object.freeze(excludeMatchesFor());

// ---------------------------------------------------------------------------
// Classifier

const hostIs = (host, domain) => host === domain || host.endsWith('.' + domain);

/** True if `host` is `domain` or one of its subdomains. Exported for the learning-site list. */
export function hostMatches(host, domain) {
  return hostIs(host.toLowerCase().replace(/\.$/, ''), domain);
}

function excluded(e, host, path) {
  if (!hostIs(host, e.host)) return false;
  switch (e.kind) {
    case 'host': return true;
    case 'prefix': return path.startsWith(e.path);
    default: return path === e.path || path.startsWith(e.path + '/');
  }
}

// The "item" in Shorts/Reels/TikTok URLs, used only to notice "a new item" (a swipe). Never stored.
const ITEM_PATTERNS = Object.freeze([
  { siteId: 'youtube', re: /^\/shorts\/([^/?#]+)/ },
  { siteId: 'instagram', re: /^\/reels?\/([^/?#]+)/ },
  { siteId: 'facebook', re: /^\/reels?\/([^/?#]+)/ },
  { siteId: 'tiktok', re: /\/video\/([^/?#]+)/ },
]);

/**
 * Classifies a URL. Never stores it.
 * @param {string} url
 * @param {string[]} [enabledSiteIds] if given, a site that isn't switched on is not a feed
 * @returns {{siteId: string|null, isFeed: boolean, item: string|null}}
 *   siteId is set for any page on a feed domain (even an excluded one); item is the Short/Reel/
 *   TikTok video id when the page is one.
 */
export function classifyUrl(url, enabledSiteIds) {
  const none = { siteId: null, isFeed: false, item: null };
  let u;
  try { u = new URL(url); } catch { return none; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return none;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const s = SITES.find((x) => x.domains.some((d) => hostIs(host, d)));
  if (!s) return none;
  const path = u.pathname || '/';
  // case-insensitive, like the DNR rules (isUrlFilterCaseSensitive: false)
  const lower = path.toLowerCase();
  if (EXCLUSIONS.some((e) => e.siteId === s.id && excluded(e, host, lower))) return { siteId: s.id, isFeed: false, item: null };
  if (enabledSiteIds && !enabledSiteIds.includes(s.id)) return { siteId: s.id, isFeed: false, item: null };
  let item = null;
  for (const p of ITEM_PATTERNS) {
    if (p.siteId !== s.id) continue;
    const m = p.re.exec(path);
    if (m) { item = m[1]; break; }
  }
  return { siteId: s.id, isFeed: true, item };
}

// ---------------------------------------------------------------------------
// declarativeNetRequest lock rules (RE2 regexFilter: no lookaround, no backreferences)

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// an optional trailing dot (www.instagram.com./) is the same host, so it can't slip past a lock
const hostRe = (domains) => `^https?://(?:[^/?#]*\\.)?(?:${domains.map(reEsc).join('|')})\\.?(?::[0-9]+)?`;

/** One regexFilter per site matching any URL on it (exclusions are carved out by allow rules). */
export function lockRegexFor(siteIds = DEFAULT_SITE_IDS) {
  return siteIds.map((id) => {
    const s = siteById(id);
    if (!s) throw new Error(`unknown site ${id}`);
    return { siteId: id, regex: `${hostRe(s.domains)}(?:[/?#]|$)` };
  });
}

/** One regexFilter per exclusion of these sites. */
export function allowRegexFor(siteIds = DEFAULT_SITE_IDS) {
  return exclusionsFor(siteIds).map((e) => {
    const h = hostRe([e.host]);
    let regex;
    switch (e.kind) {
      case 'host': regex = `${h}(?:[/?#]|$)`; break;
      case 'prefix': regex = `${h}${reEsc(e.path)}`; break;
      default: regex = `${h}${reEsc(e.path)}(?:[/?#]|$)`;
    }
    return { siteId: e.siteId, regex };
  });
}

export const LOCK_PRIORITY = 1;
export const ALLOW_PRIORITY = 2;

/**
 * Dynamic rules for a lock: one redirect rule per site (top-level navigations only) to
 * `${redirectPath}?site=<id>` (or `&site=` if redirectPath already has a `?`), plus one
 * higher-priority allow rule per exclusion so chats and work tools stay reachable.
 * @param {{siteIds: string[], redirectPath: string, ruleIdBase: number}} o
 *   redirectPath is an extension path, e.g. '/kaak.html#nap'. Rule ids are ruleIdBase, +1, ...
 */
export function lockRules({ siteIds, redirectPath, ruleIdBase }) {
  if (!redirectPath.startsWith('/')) throw new Error('redirectPath must start with /');
  let id = ruleIdBase;
  const sep = redirectPath.includes('?') ? '&' : '?';
  const out = [];
  for (const { siteId, regex } of lockRegexFor(siteIds)) {
    out.push({
      id: id++,
      priority: LOCK_PRIORITY,
      action: { type: 'redirect', redirect: { extensionPath: `${redirectPath}${sep}site=${encodeURIComponent(siteId)}` } },
      condition: { regexFilter: regex, isUrlFilterCaseSensitive: false, resourceTypes: ['main_frame'] },
    });
  }
  for (const { regex } of allowRegexFor(siteIds)) {
    out.push({
      id: id++,
      priority: ALLOW_PRIORITY,
      action: { type: 'allow' },
      condition: { regexFilter: regex, isUrlFilterCaseSensitive: false, resourceTypes: ['main_frame'] },
    });
  }
  return out;
}
