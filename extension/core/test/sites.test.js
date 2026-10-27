// JS-only: sites.js (feed list, exclusions, classifier, content-script patterns, DNR lock rules).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOW_PRIORITY, DEFAULT_SITE_IDS, EXCLUDE_MATCHES, EXCLUSIONS, LOCK_PRIORITY, SITES,
  allowRegexFor, classifyUrl, excludeMatchesFor, lockRegexFor, lockRules, matchesFor, siteById,
} from '../sites.js';

const ALL_IDS = SITES.map((s) => s.id);

/** URL -> expected [siteId, isFeed, item]. */
const CASES = [
  ['https://www.instagram.com/', 'instagram', true, null],
  ['https://instagram.com/explore/', 'instagram', true, null],
  ['https://www.instagram.com/reels/C9abc_D-1/', 'instagram', true, 'C9abc_D-1'],
  ['https://www.instagram.com/reel/XyZ123/?igsh=1', 'instagram', true, 'XyZ123'],
  ['https://www.instagram.com/direct/inbox/', 'instagram', false, null],
  ['https://www.instagram.com/direct/t/1234/', 'instagram', false, null],
  ['https://www.instagram.com/direct', 'instagram', false, null],
  ['https://www.instagram.com/accounts/edit/', 'instagram', false, null],
  ['https://www.instagram.com/accounts/login/?next=/', 'instagram', false, null],
  ['https://www.instagram.com/directory/', 'instagram', true, null], // only /direct and below
  ['https://www.facebook.com/', 'facebook', true, null],
  ['https://m.facebook.com/home.php', 'facebook', true, null],
  ['https://www.facebook.com/marketplace/', 'facebook', true, null], // stays a feed, as in the app
  ['https://www.facebook.com/groups/123/', 'facebook', true, null],
  ['https://www.facebook.com/reel/98765', 'facebook', true, '98765'],
  ['https://www.facebook.com/messages/t/123', 'facebook', false, null],
  ['https://www.facebook.com/messages', 'facebook', false, null],
  ['https://www.facebook.com/messages?x=1', 'facebook', false, null],
  ['https://www.facebook.com/Messages/t/1', 'facebook', false, null], // case-insensitive like DNR
  ['https://business.facebook.com/latest/inbox', 'facebook', false, null],
  ['https://adsmanager.facebook.com/adsmanager/manage', 'facebook', false, null],
  ['https://www.tiktok.com/', 'tiktok', true, null],
  ['https://www.tiktok.com/@someone/video/7234567890123456789?lang=en', 'tiktok', true, '7234567890123456789'],
  ['https://www.tiktok.com/messages?lang=en', 'tiktok', false, null],
  ['https://www.tiktok.com/messages', 'tiktok', false, null],
  ['https://www.youtube.com/', 'youtube', true, null],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', true, null], // long videos: the long-watch rule protects them
  ['https://www.youtube.com/shorts/abcDEF12345', 'youtube', true, 'abcDEF12345'],
  ['https://m.youtube.com/shorts/abc?feature=share', 'youtube', true, 'abc'],
  ['https://music.youtube.com/watch?v=1', 'youtube', false, null],
  ['https://studio.youtube.com/channel/UC1', 'youtube', false, null],
  ['https://x.com/home', 'x', true, null],
  ['https://twitter.com/home', 'x', true, null],
  ['https://x.com/messages', 'x', false, null],
  ['https://x.com/messages/123-456', 'x', false, null],
  ['https://twitter.com/messages/1', 'x', false, null],
  ['https://x.com/i/chat/123', 'x', false, null],
  ['https://www.reddit.com/', 'reddit', true, null],
  ['https://old.reddit.com/r/all/', 'reddit', true, null],
  ['https://www.reddit.com/chat', 'reddit', false, null],
  ['https://chat.reddit.com/room/1', 'reddit', true, null], // only reddit.com/chat* is listed
  ['https://www.reddit.com/chat/room/abc', 'reddit', false, null],
  ['http://www.instagram.com/', 'instagram', true, null],
  ['https://WWW.INSTAGRAM.COM/', 'instagram', true, null],
  ['https://www.instagram.com./', 'instagram', true, null],
  // not ours
  ['https://www.messenger.com/t/1', null, false, null],
  ['https://web.whatsapp.com/', null, false, null],
  ['https://instagram.com.evil.example/', null, false, null],
  ['https://notinstagram.com/', null, false, null],
  ['https://www.google.com/search?q=instagram.com', null, false, null],
  ['chrome://extensions/', null, false, null],
  ['chrome-extension://abc/kaak.html#nap?site=instagram', null, false, null],
  ['file:///C:/instagram.com/x', null, false, null],
  ['not a url', null, false, null],
  ['', null, false, null],
];

describe('classifyUrl', () => {
  for (const [url, siteId, isFeed, item] of CASES) {
    test(url || '(empty)', () => {
      assert.deepEqual(classifyUrl(url), { siteId, isFeed, item });
    });
  }

  test('a site that is switched off is not a feed', () => {
    assert.deepEqual(classifyUrl('https://x.com/home', DEFAULT_SITE_IDS), { siteId: 'x', isFeed: false, item: null });
    assert.deepEqual(classifyUrl('https://x.com/home', [...DEFAULT_SITE_IDS, 'x']), { siteId: 'x', isFeed: true, item: null });
  });
});

describe('site table', () => {
  test('spec section 4: four default feeds, X and Reddit optional', () => {
    assert.deepEqual(DEFAULT_SITE_IDS, ['instagram', 'facebook', 'tiktok', 'youtube']);
    assert.deepEqual(SITES.filter((s) => s.optional).map((s) => s.id), ['x', 'reddit']);
    for (const s of SITES) {
      assert.match(s.initial, /^[A-Z]$/);
      assert.match(s.color, /^#[0-9A-F]{6}$/i);
      assert.equal(classifyUrl(s.homeUrl).siteId, s.id);
      assert.equal(classifyUrl(s.homeUrl).isFeed, true);
    }
    assert.deepEqual(siteById('x').matches, ['*://*.x.com/*', '*://*.twitter.com/*']);
    assert.equal(siteById('nope'), null);
    assert.deepEqual(matchesFor(['instagram', 'youtube']), ['*://*.instagram.com/*', '*://*.youtube.com/*']);
  });

  test('every exclusion belongs to a site on that site\'s domain', () => {
    for (const e of EXCLUSIONS) {
      const s = siteById(e.siteId);
      assert.ok(s.domains.some((d) => e.host === d || e.host.endsWith('.' + d)), `${e.host}`);
    }
  });
});

// --- a small Chrome match-pattern matcher, to check exclude_matches against classifyUrl ---
function patternMatches(pattern, url) {
  const m = /^(\*|https?):\/\/(\*|\*\.[^/]+|[^/*]+)(\/.*)$/.exec(pattern);
  assert.ok(m, `bad pattern ${pattern}`);
  const u = new URL(url);
  const scheme = u.protocol.slice(0, -1);
  if (m[1] === '*' ? !['http', 'https'].includes(scheme) : scheme !== m[1]) return false;
  const host = u.hostname;
  if (m[2] !== '*') {
    if (m[2].startsWith('*.')) { const d = m[2].slice(2); if (host !== d && !host.endsWith('.' + d)) return false; } else if (host !== m[2]) return false;
  }
  // Chrome matches the path pattern against path + query
  const target = u.pathname + u.search;
  const re = new RegExp('^' + m[3].split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(target);
}

describe('content-script patterns', () => {
  test('matches + exclude_matches agree with classifyUrl', () => {
    const matches = matchesFor(ALL_IDS);
    for (const [url, , isFeed] of CASES) {
      // patterns are case-sensitive; how Chrome patterns treat a trailing-dot host is unverified
      if (!/^https?:/.test(url) || /[A-Z]/.test(new URL(url).pathname) || new URL(url).hostname.endsWith('.')) continue;
      const runs = matches.some((p) => patternMatches(p, url)) && !EXCLUDE_MATCHES.some((p) => patternMatches(p, url));
      assert.equal(runs, isFeed, url);
    }
  });

  test('exclude patterns are valid and only for the given sites', () => {
    for (const p of EXCLUDE_MATCHES) assert.match(p, /^\*:\/\/\*\.[a-z.]+\/[^*]*\*?$|^\*:\/\/\*\.[a-z.]+\/[a-z/]+(\?\*)?$/);
    assert.ok(excludeMatchesFor(['youtube']).every((p) => p.includes('youtube.com')));
    assert.ok(EXCLUDE_MATCHES.includes('*://*.music.youtube.com/*'));
    assert.ok(EXCLUDE_MATCHES.includes('*://*.instagram.com/direct/*'));
    assert.ok(EXCLUDE_MATCHES.includes('*://*.tiktok.com/messages*'));
  });
});

// --- a small declarativeNetRequest simulator for main_frame requests ---
function dnr(rules, url) {
  const hits = rules.filter((r) => r.condition.resourceTypes.includes('main_frame') &&
    new RegExp(r.condition.regexFilter, r.condition.isUrlFilterCaseSensitive ? '' : 'i').test(url));
  if (!hits.length) return null;
  const top = Math.max(...hits.map((r) => r.priority));
  const best = hits.filter((r) => r.priority === top);
  return best.find((r) => r.action.type === 'allow') ?? best[0]; // allow beats redirect at equal priority
}

describe('lock rules (declarativeNetRequest)', () => {
  test('RE2-compatible: no lookaround, no backreferences, and each compiles', () => {
    for (const { regex } of [...lockRegexFor(ALL_IDS), ...allowRegexFor(ALL_IDS)]) {
      assert.ok(!/\(\?[=!<]/.test(regex), regex);
      assert.ok(!/\\[1-9]/.test(regex), regex);
      assert.doesNotThrow(() => new RegExp(regex));
      assert.ok(regex.length < 200);
    }
  });

  test('shape: ids from the base, priorities, main_frame only, site in the redirect', () => {
    const rules = lockRules({ siteIds: ['instagram', 'youtube'], redirectPath: '/kaak.html#nap', ruleIdBase: 1000 });
    assert.deepEqual(rules.map((r) => r.id), rules.map((_, i) => 1000 + i));
    const redirects = rules.filter((r) => r.action.type === 'redirect');
    assert.equal(redirects.length, 2);
    assert.deepEqual(redirects.map((r) => r.action.redirect.extensionPath), ['/kaak.html#nap?site=instagram', '/kaak.html#nap?site=youtube']);
    assert.ok(redirects.every((r) => r.priority === LOCK_PRIORITY));
    const allows = rules.filter((r) => r.action.type === 'allow');
    assert.equal(allows.length, EXCLUSIONS.filter((e) => ['instagram', 'youtube'].includes(e.siteId)).length);
    assert.ok(allows.every((r) => r.priority === ALLOW_PRIORITY && ALLOW_PRIORITY > LOCK_PRIORITY));
    for (const r of rules) {
      assert.deepEqual(r.condition.resourceTypes, ['main_frame']);
      assert.equal(r.condition.isUrlFilterCaseSensitive, false);
    }
    const theft = lockRules({ siteIds: ['tiktok'], redirectPath: '/kaak.html#theft?x=1', ruleIdBase: 1 });
    assert.equal(theft[0].action.redirect.extensionPath, '/kaak.html#theft?x=1&site=tiktok');
    assert.throws(() => lockRules({ siteIds: ['tiktok'], redirectPath: 'kaak.html', ruleIdBase: 1 }));
    assert.throws(() => lockRules({ siteIds: ['myspace'], redirectPath: '/k.html', ruleIdBase: 1 }));
  });

  test('redirects exactly the feed URLs of locked sites; exclusions stay reachable', () => {
    const extra = [
      'https://www.facebook.com/MESSAGES/t/1', 'https://WWW.YOUTUBE.COM/shorts/x', 'https://instagram.com',
      'https://instagram.com?x', 'https://www.instagram.com:443/', 'https://x.com/messagesX',
      'https://www.tiktok.com/messagesfoo', 'https://instagram.com@evil.example/', 'https://www.instagram.com.evil.example/',
    ];
    const urls = [...CASES.map((c) => c[0]).filter((u) => /^https?:/.test(u)), ...extra];
    for (const siteIds of [ALL_IDS, DEFAULT_SITE_IDS, ['youtube'], ['facebook', 'x']]) {
      const rules = lockRules({ siteIds, redirectPath: '/kaak.html#nap', ruleIdBase: 100 });
      for (const url of urls) {
        const hit = dnr(rules, url);
        const redirected = hit?.action.type === 'redirect';
        const c = classifyUrl(url, siteIds);
        assert.equal(redirected, c.isFeed, `${url} with ${siteIds}`);
        if (redirected) assert.ok(hit.action.redirect.extensionPath.endsWith(`site=${c.siteId}`), url);
      }
    }
  });
});
