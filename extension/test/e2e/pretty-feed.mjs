// An unbranded, good-looking stand-in feed for store screenshots: no real site's content, logos or
// people. Served by store-shots.mjs on the mapped feed domains. Dev only.
const PALETTES = [
  ["#FF8A5B", "#EA526F"], ["#25CED1", "#2E86AB"], ["#FCEADE", "#FF8A5B"], ["#7B5EA7", "#F15BB5"],
  ["#00BBF9", "#00F5D4"], ["#F9C74F", "#F3722C"], ["#43AA8B", "#277DA1"], ["#F94144", "#F8961E"],
];
const HANDLES = ["sunset.dhaka", "chai_and_code", "rickshaw.art", "monsoon.mood", "street.eats", "pixel.paddy",
  "kites_over_old_town", "late.night.loops"];
const CAPTIONS = ["golden hour, again", "you won't believe what happens next", "day 47 of learning guitar",
  "this one's for the rain", "best fuchka in town?", "wait for the drop", "POV: it's 2 a.m.", "part 3 (you asked)"];

export function prettyFeed() {
  const posts = Array.from({ length: 60 }, (_, i) => {
    const [a, b] = PALETTES[i % PALETTES.length];
    const shape = i % 3 === 0 ? "border-radius:50%" : i % 3 === 1 ? "border-radius:28px;transform:rotate(18deg)" : "border-radius:50% 50% 12px 12px";
    return `<article class="post">
      <div class="media" style="background:linear-gradient(160deg, ${a}, ${b})">
        <div class="blob" style="${shape}"></div><div class="blob two"></div>
        <div class="side"><i></i><span>${(12 + i * 7) % 90 + 1}K</span><i class="c"></i><span>${(3 + i * 5) % 40 + 1}0</span><i class="s"></i></div>
      </div>
      <div class="meta"><b class="av" style="background:${b}"></b><div><strong>@${HANDLES[i % HANDLES.length]}</strong><br>${CAPTIONS[i % CAPTIONS.length]}</div></div>
    </article>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Feed</title><style>
    html,body{margin:0;background:#0F0F12;color:#EDEDF2;font:15px/1.35 "Segoe UI",system-ui,sans-serif}
    header{position:sticky;top:0;z-index:2;height:56px;display:flex;align-items:center;gap:14px;padding:0 24px;background:#0F0F12EE;border-bottom:1px solid #222}
    header .logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#9B5DE5,#F15BB5)}
    header .search{margin-left:auto;margin-right:auto;width:360px;height:34px;border-radius:17px;background:#1C1C22}
    nav{position:fixed;left:0;top:56px;bottom:0;width:180px;padding:18px 20px;display:flex;flex-direction:column;gap:18px;color:#9A9AA8}
    nav i{display:inline-block;width:18px;height:18px;border-radius:5px;background:#2A2A33;vertical-align:middle;margin-right:10px}
    main{width:400px;margin:18px auto}
    .post{margin:0 0 22px}
    .media{position:relative;height:620px;border-radius:14px;overflow:hidden}
    .blob{position:absolute;left:22%;top:26%;width:56%;height:34%;background:#FFFFFF3A}
    .blob.two{left:12%;top:68%;width:30%;height:12%;border-radius:40px;background:#00000026}
    .side{position:absolute;right:12px;bottom:18px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px}
    .side i{width:38px;height:38px;border-radius:50%;background:#00000055}
    .meta{display:flex;gap:10px;align-items:center;padding:10px 4px;color:#B9B9C6}
    .meta strong{color:#EDEDF2}
    .av{width:34px;height:34px;border-radius:50%;flex:none}
    input{display:block;margin:10px auto;width:380px;padding:8px 12px;border-radius:10px;border:1px solid #333;background:#16161B;color:#ddd}
  </style></head><body>
  <header><div class="logo"></div><div class="search"></div></header>
  <nav><span><i></i>Home</span><span><i></i>Explore</span><span><i></i>Reels</span><span><i></i>Messages</span><span><i></i>Profile</span></nav>
  <main><input id="comment" placeholder="Add a comment">${posts}</main>
  <script>
    let cur = -1;
    addEventListener("scroll", () => { const i = Math.floor(scrollY / 690); if (i !== cur) { cur = i; history.replaceState(null, "", "/reels/p" + i + "/"); } });
  </script></body></html>`;
}
