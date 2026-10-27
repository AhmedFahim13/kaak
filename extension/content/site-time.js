// Registered only on a learning site the user picked for a bribe, and only after they allowed it.
// Reports "this site's tab is in front" every 5 seconds. Nothing else: no URL, no content.
(() => {
  if (globalThis.__kaakSiteTime) return;
  globalThis.__kaakSiteTime = true;
  const host = location.hostname;
  setInterval(() => {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    try { chrome.runtime.sendMessage({ t: "siteBeat", host }); } catch (e) {}
  }, 5000);
})();
