// Port of app/src/main/java/app/kaak/core/Detours.kt (app v0.10.x) with a desktop catalog.
// The picking rules are unchanged: 3 at a time, each of a different type, fitted to the time
// of day, avoiding ones shown recently; after bedtime only Rest, "Go to sleep" first.
import { defaultRandom, shuffled } from './model.js';
import { classifyUrl } from './sites.js';

export const DetourType = Object.freeze({
  LEARN: 'LEARN', CONNECT: 'CONNECT', MOVE: 'MOVE', MAKE: 'MAKE', CLEAR: 'CLEAR', REST: 'REST',
});
export const DETOUR_TYPE_LABELS = Object.freeze({
  LEARN: 'Learn', CONNECT: 'Connect', MOVE: 'Move', MAKE: 'Make', CLEAR: 'Clear', REST: 'Rest',
});

/** What one click on the detour opens (desktop). */
export const Opener = Object.freeze({
  LINK: 'LINK',   // opens the detour's url in the tab (app: CHOSEN_APP, an app the user picked)
  TASK: 'TASK',   // one of Kaak's own bribe screens on kaak.html (note, breathing, away...)
  TIMER: 'TIMER', // a countdown on Kaak's page, then an honor check (app: TIMER, NAP, DIAL_FRIEND)
  SLEEP: 'SLEEP', // goodnight
});

export const Slot = Object.freeze({ MORNING: 'MORNING', DAY: 'DAY', EVENING: 'EVENING', NIGHT: 'NIGHT' });
const ALL_DAY = Object.freeze([Slot.MORNING, Slot.DAY, Slot.EVENING, Slot.NIGHT]);

/**
 * Kotlin data class Detour, plus `url` (desktop: what a LINK detour opens; the user can change it).
 * bribeId: finishing the detour pays this bribe's loot and trust (and minutes, within the cap).
 */
export function Detour(id, title, type, opener, bribeId, slots, url = null) {
  return Object.freeze({ id, title, type, opener, bribeId, slots: Object.freeze([...slots]), url });
}

export const DetourCatalog = (() => {
  const ALL = Object.freeze([
    Detour('learn_site', 'One lesson on a learning site', DetourType.LEARN, Opener.LINK, 'lesson', [Slot.MORNING, Slot.DAY], 'https://www.duolingo.com/'),
    Detour('saved_video', 'That long video you saved for later', DetourType.LEARN, Opener.LINK, null, [Slot.DAY, Slot.EVENING], 'https://www.youtube.com/playlist?list=WL'),
    Detour('read_book', 'Read a few pages of a book, away from the screen', DetourType.LEARN, Opener.TASK, 'away20', ALL_DAY),
    Detour('call_friend', 'Call the friend you chose', DetourType.CONNECT, Opener.TIMER, 'call', [Slot.DAY, Slot.EVENING]),
    Detour('text_someone', "Text someone you haven't talked to in a while", DetourType.CONNECT, Opener.LINK, null, [Slot.DAY, Slot.EVENING], 'https://web.whatsapp.com/'),
    Detour('walk_outside', 'Walk outside for 10 minutes', DetourType.MOVE, Opener.TASK, 'away10', [Slot.MORNING, Slot.DAY, Slot.EVENING]),
    Detour('stretch', '5-min stretch', DetourType.MOVE, Opener.TASK, 'stretch', [Slot.MORNING, Slot.DAY, Slot.EVENING]),
    Detour('draw_kaak', 'Draw Kaak while he poses smugly', DetourType.MAKE, Opener.TASK, 'draw', [Slot.DAY, Slot.EVENING]),
    Detour('tea', 'Tea break: make a cup, away from the screen', DetourType.MAKE, Opener.TASK, 'away5', [Slot.MORNING, Slot.DAY, Slot.EVENING]),
    Detour('feed_kaak', 'Feed Kaak 3 good things about today', DetourType.MAKE, Opener.TASK, 'feed', [Slot.EVENING, Slot.NIGHT]),
    Detour('focus', 'Do the avoided task for 15 min', DetourType.CLEAR, Opener.TASK, 'focus15', [Slot.MORNING, Slot.DAY]),
    Detour('tidy', 'Tidy your desk', DetourType.CLEAR, Opener.TIMER, 'tidy', [Slot.MORNING, Slot.DAY, Slot.EVENING]),
    Detour('plan', "Plan tomorrow's top 3", DetourType.CLEAR, Opener.TASK, 'plan', [Slot.EVENING, Slot.NIGHT]),
    Detour('eyes', '20-20-20 eye break', DetourType.REST, Opener.TASK, 'eyes', ALL_DAY),
    Detour('breathe', '3-min breathing', DetourType.REST, Opener.TASK, 'breathing', ALL_DAY),
    Detour('nap', '20-min nap', DetourType.REST, Opener.TIMER, null, [Slot.DAY]),
    Detour('sleep', 'Go to sleep', DetourType.REST, Opener.SLEEP, null, [Slot.NIGHT]),
  ]);
  return Object.freeze({
    ALL,
    /** Used until the user picks their own in onboarding: none need setup. */
    DEFAULT_IDS: Object.freeze(['walk_outside', 'breathe', 'plan', 'stretch', 'feed_kaak']),
    byId: (id) => ALL.find((d) => d.id === id) ?? null,
    slotFor(hour) {
      if (hour >= 5 && hour <= 10) return Slot.MORNING;
      if (hour >= 11 && hour <= 16) return Slot.DAY;
      if (hour >= 17 && hour <= 20) return Slot.EVENING;
      return Slot.NIGHT;
    },
  });
})();

export const DetourPicker = Object.freeze({
  /**
   * Three detours from the user's list, each of a different type, preferring
   * ones that fit the time of day and weren't shown recently.
   * After bedtime, only Rest detours, with "Go to sleep" always first.
   *
   * @param {Iterable<string>} chosenIds
   * @param {number} hour
   * @param {boolean} bedtime
   * @param {Iterable<string>} recent
   * @param {object} [random]
   * @param {number} [count]
   * @param {{feedsLocked?: boolean, catalog?: object[]}} [opts] JS-only. feedsLocked: during a
   *   nap or theft lock, LINK detours that point at a feed site (e.g. a saved YouTube video)
   *   would just bounce, so they are left out. catalog: the user's edited detours (default ALL).
   */
  pick(chosenIds, hour, bedtime, recent, random = defaultRandom, count = 3, opts = {}) {
    const catalog = opts.catalog ?? DetourCatalog.ALL;
    const chosenList = [...chosenIds];
    const ids = new Set(chosenList.length ? chosenList : DetourCatalog.DEFAULT_IDS);
    const recentSet = new Set(recent);
    const usable = (d) => !(opts.feedsLocked && d.url && classifyUrl(d.url).isFeed);
    const chosen = catalog.filter((d) => ids.has(d.id) && usable(d));
    if (bedtime) {
      const sleep = catalog.find((d) => d.id === 'sleep') ?? DetourCatalog.byId('sleep');
      const rest = chosen.filter((d) => d.type === DetourType.REST && d.id !== 'sleep' && d.id !== 'nap');
      return [sleep, ...shuffled(rest, random)].slice(0, count);
    }
    const slot = DetourCatalog.slotFor(hour);
    // sort is stable, like Kotlin's sortedBy
    const ranked = shuffled(chosen.filter((d) => d.opener !== Opener.SLEEP), random)
      .map((d) => ({ d, k: (d.slots.includes(slot) ? 0 : 2) + (recentSet.has(d.id) ? 1 : 0) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.d);
    const picked = [];
    for (const d of ranked) if (picked.length < count && !picked.some((p) => p.type === d.type)) picked.push(d);
    for (const d of ranked) if (picked.length < count && !picked.includes(d)) picked.push(d);
    return picked;
  },
});
