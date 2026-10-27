import { ask, openKaak, drawStillCrow } from "./common.js";

const $ = id => document.getElementById(id);

async function render() {
  const s = await ask({ t: "status" });
  if (!s) return;
  $("minutes").innerHTML = `${s.dailyMin}<small>/ ${s.limitMin} min</small>`;
  $("bar").style.width = Math.min(100, Math.round(100 * s.dailyMin / Math.max(1, s.limitMin))) + "%";
  $("trust").textContent = s.trustLabel;
  $("status").textContent = s.statusText;
  const paused = s.pausedNow;
  $("pauseRow").classList.toggle("hidden", paused || s.strict || s.napping);
  $("pauseLabel").classList.toggle("hidden", paused || s.strict || s.napping);
  $("resume").classList.toggle("hidden", !paused);
  $("pauseNote").classList.toggle("hidden", !(s.strict || s.napping) || paused);
  $("pauseNote").textContent = s.strict ? "Strict mode is on: no pausing until it ends." :
    s.napping ? "Kaak is napping. Pause can't skip a nap." : "";
  $("giftCard").classList.toggle("hidden", !s.badge);
  if (s.badge) $("giftTitle").textContent = s.badge === "times" ? "Kaak Times is out." : "Kaak left you a morning gift.";
}

document.querySelectorAll("[data-pause]").forEach(b => b.addEventListener("click", async () => {
  await ask({ t: "pause", how: b.dataset.pause });
  render();
}));
$("resume").addEventListener("click", async () => { await ask({ t: "pause", how: "off" }); render(); });
$("open").addEventListener("click", () => openKaak("home"));
$("giftOpen").addEventListener("click", async () => {
  const s = await ask({ t: "status" });
  openKaak(s.badge === "times" ? "times" : "gift");
});

drawStillCrow($("crow"), { mood: "stare" });
render();
