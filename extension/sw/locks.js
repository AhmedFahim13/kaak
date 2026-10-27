// Nap and theft locks: declarativeNetRequest rules that send feed pages to Kaak's page.
//
// Never a trap (spec 7.6): rules survive browser restarts and being disabled, so the wanted set
// of rules is recomputed from state on every start, alarm and lock change, and anything that
// shouldn't be there is removed. Kaak's page also clears stale rules before sending you back.
// The redirect carries only the site's name (lockRules adds &site=…), never the URL.
import { lockRules } from "../core/sites.js";

const BASE = { nap: 1000, theft: 2000 };

/** wanted: { nap: {until, siteIds} | null, theft: {until, siteIds} | null } */
export async function reconcile(wanted) {
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const want = [];
  for (const kind of ["nap", "theft"]) {
    const w = wanted[kind];
    if (!w || !w.siteIds.length) continue;
    want.push(...lockRules({ siteIds: w.siteIds, redirectPath: `/pages/kaak.html?lock=${kind}`, ruleIdBase: BASE[kind] }));
  }
  const sig = r => JSON.stringify([r.priority, r.action, r.condition]);
  const curById = new Map(current.map(r => [r.id, r]));
  const wantById = new Map(want.map(r => [r.id, r]));
  const removeRuleIds = current.filter(r => !wantById.has(r.id) || sig(r) !== sig(wantById.get(r.id))).map(r => r.id);
  const addRules = want.filter(r => !curById.has(r.id) || sig(curById.get(r.id)) !== sig(r));
  if (removeRuleIds.length || addRules.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  }
}

export async function clearAll() {
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  if (current.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: current.map(r => r.id) });
}
