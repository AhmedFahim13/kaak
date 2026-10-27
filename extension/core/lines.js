// Port of app/src/main/java/app/kaak/core/Lines.kt (app v0.10.x): every line, all three languages.
import { Lang, Mood, defaultRandom, pickRandom } from './model.js';

/**
 * Picked lines, keyed by the same pick keys Lines.kt uses. `{m}` = minutes.
 * en = English, bl = Banglish, bn = Bangla.
 */
export const LINES = Object.freeze({
  arrive: { en: ['I see you.', 'hm.', '…'], bl: ['dekhi tomake.', 'hm.', '…'], bn: ['তোমাকে দেখছি।', 'হুম।', '…'] },
  peck: { en: ['tap tap.', 'hello?', 'knock knock.'], bl: ['tak tak.', 'hello?', 'shuncho?'], bn: ['ঠক ঠক।', 'হ্যালো?', 'শুনছো?'] },
  again: { en: ['again?', 'back already?', 'oh. you.'], bl: ['abar?', 'eto taratari?', 'o. tumi.'], bn: ['আবার?', 'এত তাড়াতাড়ি?', 'ও। তুমি।'] },
  walk: {
    en: ['just passing through.', "don't mind me.", 'nice feed. anyway.'],
    bl: ['ami just jacchi.', 'amake dekho na.', 'bhalo feed. jak.'],
    bn: ['আমি শুধু যাচ্ছি।', 'আমাকে দেখো না।', 'ভালো ফিড। যাক।'],
  },
  sit: {
    en: ['what are you doing', 'again?', "bro, it's been {m} minutes"],
    bl: ['ki korcho eta', 'abar?', 'bhai {m} minute hoye gelo'],
    bn: ['কী করছো এটা', 'আবার?', 'ভাই, {m} মিনিট হয়ে গেলো'],
  },
  splat: { en: ['oops.', 'my bad.', 'that was on purpose.'], bl: ['oops.', 'sorry na.', 'eta ichche kore.'], bn: ['উফ।', 'সরি না।', 'এটা ইচ্ছে করে।'] },
  wiped: { en: ['thank you.', 'much better.', 'fine.'], bl: ['dhonnobad.', 'eibar bhalo.', 'thik ache.'], bn: ['ধন্যবাদ।', 'এবার ভালো।', 'ঠিক আছে।'] },
  steal: { en: ['mine now.', 'nope.', "this? I'll take it."], bl: ['eta amar.', 'na.', 'eta ami nilam.'], bn: ['এটা আমার।', 'না।', 'এটা আমি নিলাম।'] },
  hit: {
    en: ['hey!', 'rude.', 'missed. no wait.', 'ow.', 'stop that.'],
    bl: ['ei!', 'beyadob.', 'lagse.', 'uff.', 'thamo.'],
    bn: ['এই!', 'বেয়াদব।', 'লাগছে।', 'উফ।', 'থামো।'],
  },
  chaseWon: {
    en: ['fine. take it.', 'ugh. here.', 'you win. this time.'],
    bl: ['thik ache. nao.', 'dhur. nao.', 'tumi jitle. eibar.'],
    bn: ['ঠিক আছে। নাও।', 'ধুর। নাও।', 'তুমি জিতলে। এবার।'],
  },
  chaseLost: {
    en: ['keeping it.', 'too slow.', "it's in my nest now."],
    bl: ['eta rekhe dilam.', 'onek slow.', 'eta ekhon amar basay.'],
    bn: ['এটা রেখে দিলাম।', 'অনেক ধীর।', 'এটা এখন আমার বাসায়।'],
  },
  warn: {
    en: ['{m} minutes till I eat this.', 'getting hungry. {m} minutes.'],
    bl: ['{m} minute pore eta khabo.', 'khide pacche. {m} minute.'],
    bn: ['{m} মিনিট পরে এটা খাব।', 'খিদে পাচ্ছে। {m} মিনিট।'],
  },
  burp: { en: ['burp.', 'delicious.', 'all gone.'], bl: ['dhekur.', 'moja.', 'shesh.'], bn: ['ঢেকুর।', 'মজা।', 'শেষ।'] },
  holding: { en: ['…', 'really?', "I'm watching."], bl: ['…', 'sotti?', 'dekhchi.'], bn: ['…', 'সত্যি?', 'দেখছি।'] },
  letGo: { en: ['thought so.', 'good choice.'], bl: ['bhebechilam.', 'bhalo siddhanto.'], bn: ['ভেবেছিলাম।', 'ভালো সিদ্ধান্ত।'] },
  escaped: {
    en: ["fine. I'll remember this.", "go. I'm judging."],
    bl: ['thik ache. mone rakhbo.', 'jao. ami judge korchi.'],
    bn: ['ঠিক আছে। মনে রাখব।', 'যাও। আমি দেখছি।'],
  },
  yawn: { en: ['*yawn*', "it's late.", 'bed. now.'], bl: ['*hai*', 'onek raat.', 'ghumao. ekhon.'], bn: ['*হাই*', 'অনেক রাত।', 'ঘুমাও। এখন।'] },
  morning: {
    en: ['you slept. here.', 'good morning. for you.', 'look what I found.'],
    bl: ['tumi ghumiyecho. nao.', 'shubho shokal. tomar jonno.', 'dekho ki pelam.'],
    bn: ['তুমি ঘুমিয়েছ। নাও।', 'শুভ সকাল। তোমার জন্য।', 'দেখো কী পেলাম।'],
  },
  bribeOk: { en: ['fine.', 'acceptable.', 'this pleases me.'], bl: ['thik ache.', 'cholbe.', 'khushi holam.'], bn: ['ঠিক আছে।', 'চলবে।', 'খুশি হলাম।'] },
  drawing: {
    en: ['flattering.', 'my beak is bigger.', 'frame it.'],
    bl: ['shundor.', 'amar thot aro boro.', 'bandhiye rakho.'],
    bn: ['সুন্দর।', 'আমার ঠোঁট আরও বড়।', 'বাঁধিয়ে রাখো।'],
  },
  nudge: {
    en: ['{m} minutes.', 'still here.', 'tap tap. {m} minutes.', "you've been at this {m} minutes.", 'hello? {m} minutes.', "I'm not leaving."],
    bl: ['{m} minute.', 'ekhono achi.', 'tak tak. {m} minute.', '{m} minute dhore cholche.', 'hello? {m} minute.', 'ami jabo na.'],
    bn: ['{m} মিনিট।', 'এখনো আছি।', 'ঠক ঠক। {m} মিনিট।', '{m} মিনিট ধরে চলছে।', 'হ্যালো? {m} মিনিট।', 'আমি যাব না।'],
  },
  working: {
    en: ['working, I see.', 'very busy. very important.', "I'll be quiet. mostly."],
    bl: ['kaj korcho, dekhchi.', 'onek busy. onek important.', 'chup thakbo. mostly.'],
    bn: ['কাজ করছো, দেখছি।', 'অনেক ব্যস্ত। অনেক জরুরি।', 'চুপ থাকব। বেশিরভাগ।'],
  },
  calm: {
    en: ['take your time.', 'I trust you. a bit.', 'just keeping you company.'],
    bl: ['shomoy nao.', 'tomake bishshash kori. ektu.', 'shudhu shonge achi.'],
    bn: ['সময় নাও।', 'তোমাকে বিশ্বাস করি। একটু।', 'শুধু সঙ্গে আছি।'],
  },
});

/** Fixed (not picked) strings, by the Lines.kt method that returns them. `{m}` = minutes. */
export const FIXED = Object.freeze({
  kaa: { en: 'KAA!', bl: 'KAA!', bn: 'কা!' },
  chomp: { en: 'CHOMP.', bl: 'CHOMP.', bn: 'কচ।' },
  asleep: { en: 'Kaak is full. Back in {m} min.', bl: 'Kaak er pet bhora. {m} minute pore.', bn: 'কাকের পেট ভরা। {m} মিনিট পরে।' },
  snore: { en: 'zzz', bl: 'zzz', bn: 'zzz' },
  worthIt: { en: 'Was that worth it?', bl: 'Eta ki worth chilo?', bn: 'এটা কি দরকার ছিল?' },
  tooMuch: { en: 'Too much? Turn off jumpscares', bl: 'Beshi hoye geche? Jumpscare off koro', bn: 'বেশি হয়ে গেছে? জাম্পস্কেয়ার বন্ধ করো' },
  detoursTitle: { en: "Kaak's full. Try one of these:", bl: 'Kaak er pet bhora. Egulor ekta koro:', bn: 'কাকের পেট ভরা। এগুলোর একটা করো:' },
  moodQuestion: { en: 'Why are you scrolling?', bl: 'Keno scroll korcho?', bn: 'কেন স্ক্রল করছো?' },
  extra: { en: 'EXTRA! EXTRA!', bl: 'EXTRA! EXTRA!', bn: 'গরম খবর!' },
  timesOut: { en: "Kaak Times is out. You're in it.", bl: 'Kaak Times beriyeche. Tumi ache.', bn: 'কাক টাইমস বেরিয়েছে। তুমি আছো।' },
});

/** moodLabel(m): English uses Mood.label. */
export const MOOD_LABELS = Object.freeze({
  BORED: { en: 'Bored', bl: 'Bored', bn: 'বিরক্ত' },
  TIRED: { en: 'Tired', bl: 'Klanto', bn: 'ক্লান্ত' },
  AVOIDING: { en: 'Avoiding something', bl: 'Kichu edachhi', bn: 'কিছু এড়াচ্ছি' },
  LONELY: { en: 'Lonely', bl: 'Eka lagche', bn: 'একা লাগছে' },
});

export const MOOD_REPLIES = Object.freeze({
  BORED: { en: "stretch. then we'll see.", bl: 'stretch koro. tarpor dekhbo.', bn: 'স্ট্রেচ করো। তারপর দেখব।' },
  TIRED: { en: "sleep. I'll hold this.", bl: 'ghumao. eta ami rakhchi.', bn: 'ঘুমাও। এটা আমি রাখছি।' },
  AVOIDING: { en: "I'll hold this. you do the thing.", bl: 'eta ami rakhchi. tumi kaj ta koro.', bn: 'এটা আমি রাখছি। তুমি কাজটা করো।' },
  LONELY: { en: 'text someone real.', bl: 'kono asol manush ke text koro.', bn: 'কোনো আসল মানুষকে টেক্সট করো।' },
});

const LANG_KEY = { ENGLISH: 'en', BANGLISH: 'bl', BANGLA: 'bn' };
const fill = (s, m) => (m === undefined ? s : s.replaceAll('{m}', String(m)));

/**
 * Kaak's subtitles. English is the default; Banglish and Bangla are opt-in.
 * Never repeats the same line twice in a row for a given moment.
 * Rule: mock the behaviour, never the person.
 */
export class Lines {
  #random;
  #lang = Lang.ENGLISH;
  #last = new Map();

  constructor(random = defaultRandom) {
    this.#random = random;
  }

  /** A Lang entry; assigning a name ('BANGLA') also works. */
  get lang() { return this.#lang; }
  set lang(v) {
    const l = Lang.from(v);
    if (!l) throw new Error(`unknown lang ${v}`);
    this.#lang = l;
  }

  #k() { return LANG_KEY[this.#lang.name]; }

  /**
   * Picks a line for a LINES key in the current language, never the same as last time for
   * that key. `minutes` fills `{m}` before the repeat check (as Kotlin formats first).
   */
  pick(key, minutes) {
    const entry = LINES[key];
    if (!entry) throw new Error(`unknown line key ${key}`);
    const pool = entry[this.#k()].map((s) => fill(s, minutes));
    const last = this.#last.get(key);
    let options = pool.filter((s) => s !== last);
    if (options.length === 0) options = pool;
    const out = pickRandom(options, this.#random);
    this.#last.set(key, out);
    return out;
  }

  /** A FIXED string in the current language. */
  fixed(key, minutes) {
    const entry = FIXED[key];
    if (!entry) throw new Error(`unknown fixed key ${key}`);
    return fill(entry[this.#k()], minutes);
  }

  arrive() { return this.pick('arrive'); }
  peck() { return this.pick('peck'); }
  again() { return this.pick('again'); }
  walk() { return this.pick('walk'); }
  sit(minutes) { return this.pick('sit', minutes); }
  splat() { return this.pick('splat'); }
  wiped() { return this.pick('wiped'); }
  steal() { return this.pick('steal'); }
  hit() { return this.pick('hit'); }
  chaseWon() { return this.pick('chaseWon'); }
  chaseLost() { return this.pick('chaseLost'); }
  kaa() { return this.fixed('kaa'); }
  warn(minutes) { return this.pick('warn', minutes); }
  chomp() { return this.fixed('chomp'); }
  burp() { return this.pick('burp'); }
  asleep(minutes) { return this.fixed('asleep', minutes); }
  holding() { return this.pick('holding'); }
  letGo() { return this.pick('letGo'); }
  escaped() { return this.pick('escaped'); }
  yawn() { return this.pick('yawn'); }
  snore() { return this.fixed('snore'); }
  morning() { return this.pick('morning'); }
  worthIt() { return this.fixed('worthIt'); }
  tooMuch() { return this.fixed('tooMuch'); }
  detoursTitle() { return this.fixed('detoursTitle'); }
  bribeAccepted() { return this.pick('bribeOk'); }
  drawingReview() { return this.pick('drawing'); }
  nudge(minutes) { return this.pick('nudge', minutes); }
  moodQuestion() { return this.fixed('moodQuestion'); }
  /** @param m a Mood entry or name */
  moodLabel(m) {
    const mood = Mood.from(m);
    return this.#lang === Lang.ENGLISH ? mood.label : MOOD_LABELS[mood.name][this.#k()];
  }
  moodReply(m) { return MOOD_REPLIES[Mood.from(m).name][this.#k()]; }
  working() { return this.pick('working'); }
  calm() { return this.pick('calm'); }
  extra() { return this.fixed('extra'); }
  timesOut() { return this.fixed('timesOut'); }

  /** JS-only: the no-repeat memory, so it survives a service worker restart. */
  toJSON() { return { lang: this.#lang.name, last: Object.fromEntries(this.#last) }; }
  static fromJSON(o, random = defaultRandom) {
    const l = new Lines(random);
    l.lang = o.lang;
    l.#last = new Map(Object.entries(o.last ?? {}));
    return l;
  }
}
