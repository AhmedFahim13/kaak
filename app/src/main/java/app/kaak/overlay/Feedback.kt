package app.kaak.overlay

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.VibrationEffect
import android.os.Vibrator
import app.kaak.core.JumpscareLevel
import app.kaak.data.KaakPrefs

/**
 * Buzzes and caws. The caw is optional: drop a file named caw.ogg (or caw.mp3)
 * into app/src/main/res/raw/ and it is picked up automatically. Record a real
 * Dhaka crow on your phone, trim it in Audacity, done. Zero cost.
 */
class Feedback(context: Context, private val prefs: KaakPrefs) {
    @Suppress("DEPRECATION")
    private val vibrator: Vibrator? = context.getSystemService(Vibrator::class.java)

    private val pool: SoundPool = SoundPool.Builder()
        .setMaxStreams(2)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        .build()

    @SuppressLint("DiscouragedApi")
    private val cawId: Int = context.resources
        .getIdentifier("caw", "raw", context.packageName)
        .let { res -> if (res != 0) pool.load(context, res, 1) else 0 }

    fun peck() = buzz(18)
    fun thud(strong: Boolean) = buzz(if (strong) 55 else 25)

    fun jumpscare(level: JumpscareLevel) {
        caw()
        if (!prefs.haptics) return
        val pattern = when (level) {
            JumpscareLevel.OFF -> return
            JumpscareLevel.GENTLE -> longArrayOf(0, 40)
            JumpscareLevel.MEDIUM -> longArrayOf(0, 90, 40, 160, 40, 60)
            JumpscareLevel.FULL -> longArrayOf(0, 140, 30, 240, 40, 140, 40, 90, 60, 50)
        }
        runCatching { vibrator?.vibrate(VibrationEffect.createWaveform(pattern, -1)) }
    }

    fun caw() {
        if (prefs.sound && cawId != 0) pool.play(cawId, 1f, 1f, 1, 0, 1f)
    }

    private fun buzz(ms: Long) {
        if (!prefs.haptics) return
        runCatching { vibrator?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE)) }
    }

    fun release() = pool.release()
}
