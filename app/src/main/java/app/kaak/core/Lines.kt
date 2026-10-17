package app.kaak.core

import kotlin.random.Random

/**
 * Kaak's subtitles. English is the default; Banglish and Bangla are opt-in.
 * Never repeats the same line twice in a row for a given moment.
 * Rule: mock the behaviour, never the person.
 */
class Lines(private val random: Random = Random.Default) {
    var lang: Lang = Lang.ENGLISH
    private val last = HashMap<String, String>()

    fun arrive() = pick(
        "arrive",
        en = listOf("I see you.", "hm.", "…"),
        bl = listOf("dekhi tomake.", "hm.", "…"),
        bn = listOf("তোমাকে দেখছি।", "হুম।", "…"),
    )

    fun peck() = pick(
        "peck",
        en = listOf("tap tap.", "hello?", "knock knock."),
        bl = listOf("tak tak.", "hello?", "shuncho?"),
        bn = listOf("ঠক ঠক।", "হ্যালো?", "শুনছো?"),
    )

    fun again() = pick(
        "again",
        en = listOf("again?", "back already?", "oh. you."),
        bl = listOf("abar?", "eto taratari?", "o. tumi."),
        bn = listOf("আবার?", "এত তাড়াতাড়ি?", "ও। তুমি।"),
    )

    fun walk() = pick(
        "walk",
        en = listOf("just passing through.", "don't mind me.", "nice feed. anyway."),
        bl = listOf("ami just jacchi.", "amake dekho na.", "bhalo feed. jak."),
        bn = listOf("আমি শুধু যাচ্ছি।", "আমাকে দেখো না।", "ভালো ফিড। যাক।"),
    )

    fun sit(minutes: Int) = pick(
        "sit",
        en = listOf("what are you doing", "again?", "bro, it's been $minutes minutes"),
        bl = listOf("ki korcho eta", "abar?", "bhai $minutes minute hoye gelo"),
        bn = listOf("কী করছো এটা", "আবার?", "ভাই, $minutes মিনিট হয়ে গেলো"),
    )

    fun splat() = pick(
        "splat",
        en = listOf("oops.", "my bad.", "that was on purpose."),
        bl = listOf("oops.", "sorry na.", "eta ichche kore."),
        bn = listOf("উফ।", "সরি না।", "এটা ইচ্ছে করে।"),
    )

    fun wiped() = pick(
        "wiped",
        en = listOf("thank you.", "much better.", "fine."),
        bl = listOf("dhonnobad.", "eibar bhalo.", "thik ache."),
        bn = listOf("ধন্যবাদ।", "এবার ভালো।", "ঠিক আছে।"),
    )

    fun steal() = pick(
        "steal",
        en = listOf("mine now.", "nope.", "this? I'll take it."),
        bl = listOf("eta amar.", "na.", "eta ami nilam."),
        bn = listOf("এটা আমার।", "না।", "এটা আমি নিলাম।"),
    )

    fun hit() = pick(
        "hit",
        en = listOf("hey!", "rude.", "missed. no wait.", "ow.", "stop that."),
        bl = listOf("ei!", "beyadob.", "lagse.", "uff.", "thamo."),
        bn = listOf("এই!", "বেয়াদব।", "লাগছে।", "উফ।", "থামো।"),
    )

    fun chaseWon() = pick(
        "chaseWon",
        en = listOf("fine. take it.", "ugh. here.", "you win. this time."),
        bl = listOf("thik ache. nao.", "dhur. nao.", "tumi jitle. eibar."),
        bn = listOf("ঠিক আছে। নাও।", "ধুর। নাও।", "তুমি জিতলে। এবার।"),
    )

    fun chaseLost() = pick(
        "chaseLost",
        en = listOf("keeping it.", "too slow.", "it's in my nest now."),
        bl = listOf("eta rekhe dilam.", "onek slow.", "eta ekhon amar basay."),
        bn = listOf("এটা রেখে দিলাম।", "অনেক ধীর।", "এটা এখন আমার বাসায়।"),
    )

    fun kaa() = when (lang) {
        Lang.BANGLA -> "কা!"
        else -> "KAA!"
    }

    fun warn(minutes: Int) = pick(
        "warn",
        en = listOf("$minutes minutes till I eat this.", "getting hungry. $minutes minutes."),
        bl = listOf("$minutes minute pore eta khabo.", "khide pacche. $minutes minute."),
        bn = listOf("$minutes মিনিট পরে এটা খাব।", "খিদে পাচ্ছে। $minutes মিনিট।"),
    )

    fun chomp() = when (lang) {
        Lang.BANGLA -> "কচ।"
        else -> "CHOMP."
    }

    fun burp() = pick(
        "burp",
        en = listOf("burp.", "delicious.", "all gone."),
        bl = listOf("dhekur.", "moja.", "shesh."),
        bn = listOf("ঢেকুর।", "মজা।", "শেষ।"),
    )

    fun asleep(minutes: Int) = when (lang) {
        Lang.ENGLISH -> "Kaak is full. Back in $minutes min."
        Lang.BANGLISH -> "Kaak er pet bhora. $minutes minute pore."
        Lang.BANGLA -> "কাকের পেট ভরা। $minutes মিনিট পরে।"
    }

    fun holding() = pick(
        "holding",
        en = listOf("…", "really?", "I'm watching."),
        bl = listOf("…", "sotti?", "dekhchi."),
        bn = listOf("…", "সত্যি?", "দেখছি।"),
    )

    fun letGo() = pick(
        "letGo",
        en = listOf("thought so.", "good choice."),
        bl = listOf("bhebechilam.", "bhalo siddhanto."),
        bn = listOf("ভেবেছিলাম।", "ভালো সিদ্ধান্ত।"),
    )

    fun escaped() = pick(
        "escaped",
        en = listOf("fine. I'll remember this.", "go. I'm judging."),
        bl = listOf("thik ache. mone rakhbo.", "jao. ami judge korchi."),
        bn = listOf("ঠিক আছে। মনে রাখব।", "যাও। আমি দেখছি।"),
    )

    fun yawn() = pick(
        "yawn",
        en = listOf("*yawn*", "it's late.", "bed. now."),
        bl = listOf("*hai*", "onek raat.", "ghumao. ekhon."),
        bn = listOf("*হাই*", "অনেক রাত।", "ঘুমাও। এখন।"),
    )

    fun snore() = "zzz"

    fun morning() = pick(
        "morning",
        en = listOf("you slept. here.", "good morning. for you.", "look what I found."),
        bl = listOf("tumi ghumiyecho. nao.", "shubho shokal. tomar jonno.", "dekho ki pelam."),
        bn = listOf("তুমি ঘুমিয়েছ। নাও।", "শুভ সকাল। তোমার জন্য।", "দেখো কী পেলাম।"),
    )

    fun worthIt() = when (lang) {
        Lang.ENGLISH -> "Was that worth it?"
        Lang.BANGLISH -> "Eta ki worth chilo?"
        Lang.BANGLA -> "এটা কি দরকার ছিল?"
    }

    fun tooMuch() = when (lang) {
        Lang.ENGLISH -> "Too much? Turn off jumpscares"
        Lang.BANGLISH -> "Beshi hoye geche? Jumpscare off koro"
        Lang.BANGLA -> "বেশি হয়ে গেছে? জাম্পস্কেয়ার বন্ধ করো"
    }

    fun detoursTitle() = when (lang) {
        Lang.ENGLISH -> "Kaak's full. Try one of these:"
        Lang.BANGLISH -> "Kaak er pet bhora. Egulor ekta koro:"
        Lang.BANGLA -> "কাকের পেট ভরা। এগুলোর একটা করো:"
    }

    fun bribeAccepted() = pick(
        "bribeOk",
        en = listOf("fine.", "acceptable.", "this pleases me."),
        bl = listOf("thik ache.", "cholbe.", "khushi holam."),
        bn = listOf("ঠিক আছে।", "চলবে।", "খুশি হলাম।"),
    )

    fun drawingReview() = pick(
        "drawing",
        en = listOf("flattering.", "my beak is bigger.", "frame it."),
        bl = listOf("shundor.", "amar thot aro boro.", "bandhiye rakho."),
        bn = listOf("সুন্দর।", "আমার ঠোঁট আরও বড়।", "বাঁধিয়ে রাখো।"),
    )

    fun nudge(minutes: Int) = pick(
        "nudge",
        en = listOf("$minutes minutes.", "still here.", "tap tap. $minutes minutes.", "you've been at this $minutes minutes.", "hello? $minutes minutes.", "I'm not leaving."),
        bl = listOf("$minutes minute.", "ekhono achi.", "tak tak. $minutes minute.", "$minutes minute dhore cholche.", "hello? $minutes minute.", "ami jabo na."),
        bn = listOf("$minutes মিনিট।", "এখনো আছি।", "ঠক ঠক। $minutes মিনিট।", "$minutes মিনিট ধরে চলছে।", "হ্যালো? $minutes মিনিট।", "আমি যাব না।"),
    )

    fun moodQuestion() = when (lang) {
        Lang.ENGLISH -> "Why are you scrolling?"
        Lang.BANGLISH -> "Keno scroll korcho?"
        Lang.BANGLA -> "কেন স্ক্রল করছো?"
    }

    fun moodLabel(m: Mood) = when (lang) {
        Lang.ENGLISH -> m.label
        Lang.BANGLISH -> when (m) { Mood.BORED -> "Bored"; Mood.TIRED -> "Klanto"; Mood.AVOIDING -> "Kichu edachhi"; Mood.LONELY -> "Eka lagche" }
        Lang.BANGLA -> when (m) { Mood.BORED -> "বিরক্ত"; Mood.TIRED -> "ক্লান্ত"; Mood.AVOIDING -> "কিছু এড়াচ্ছি"; Mood.LONELY -> "একা লাগছে" }
    }

    fun moodReply(m: Mood) = when (lang) {
        Lang.ENGLISH -> when (m) {
            Mood.BORED -> "stretch. then we'll see."
            Mood.TIRED -> "sleep. I'll hold this."
            Mood.AVOIDING -> "I'll hold this. you do the thing."
            Mood.LONELY -> "text someone real."
        }
        Lang.BANGLISH -> when (m) {
            Mood.BORED -> "stretch koro. tarpor dekhbo."
            Mood.TIRED -> "ghumao. eta ami rakhchi."
            Mood.AVOIDING -> "eta ami rakhchi. tumi kaj ta koro."
            Mood.LONELY -> "kono asol manush ke text koro."
        }
        Lang.BANGLA -> when (m) {
            Mood.BORED -> "স্ট্রেচ করো। তারপর দেখব।"
            Mood.TIRED -> "ঘুমাও। এটা আমি রাখছি।"
            Mood.AVOIDING -> "এটা আমি রাখছি। তুমি কাজটা করো।"
            Mood.LONELY -> "কোনো আসল মানুষকে টেক্সট করো।"
        }
    }

    fun working() = pick(
        "working",
        en = listOf("working, I see.", "very busy. very important.", "I'll be quiet. mostly."),
        bl = listOf("kaj korcho, dekhchi.", "onek busy. onek important.", "chup thakbo. mostly."),
        bn = listOf("কাজ করছো, দেখছি।", "অনেক ব্যস্ত। অনেক জরুরি।", "চুপ থাকব। বেশিরভাগ।"),
    )

    fun calm() = pick(
        "calm",
        en = listOf("take your time.", "I trust you. a bit.", "just keeping you company."),
        bl = listOf("shomoy nao.", "tomake bishshash kori. ektu.", "shudhu shonge achi."),
        bn = listOf("সময় নাও।", "তোমাকে বিশ্বাস করি। একটু।", "শুধু সঙ্গে আছি।"),
    )

    fun extra() = when (lang) {
        Lang.BANGLA -> "গরম খবর!"
        else -> "EXTRA! EXTRA!"
    }

    fun timesOut() = when (lang) {
        Lang.ENGLISH -> "Kaak Times is out. You're in it."
        Lang.BANGLISH -> "Kaak Times beriyeche. Tumi ache."
        Lang.BANGLA -> "কাক টাইমস বেরিয়েছে। তুমি আছো।"
    }

    private fun pick(key: String, en: List<String>, bl: List<String>, bn: List<String>): String {
        val pool = when (lang) {
            Lang.ENGLISH -> en
            Lang.BANGLISH -> bl
            Lang.BANGLA -> bn
        }
        val options = pool.filter { it != last[key] }.ifEmpty { pool }
        return options.random(random).also { last[key] = it }
    }
}
