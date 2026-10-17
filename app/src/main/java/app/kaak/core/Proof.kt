package app.kaak.core

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Proof checks for bribes that used to run on honor. All on the phone,
 * nothing saved, nothing read: motion, pressure, counts, and two live photos
 * compared in memory.
 */

/** Squats with the phone held to the chest. Feed it |acceleration| - gravity (m/s²). */
class SquatCounter(
    private val up: Float = 2.2f,
    private val down: Float = -1.8f,
    private val minGapMs: Long = 600,
) {
    var count = 0
        private set
    private var armed = false
    private var lastAt = Long.MIN_VALUE / 2

    /** Returns true when this sample completes a rep. */
    fun onSample(linear: Float, now: Long): Boolean {
        if (linear < down) armed = true
        if (armed && linear > up && now - lastAt >= minGapMs) {
            count++; armed = false; lastAt = now
            return true
        }
        return false
    }
}

/** Push-ups with the phone on the floor under your face: each time you come down, the proximity sensor goes "near". */
class PushupCounter(private val minGapMs: Long = 700) {
    var count = 0
        private set
    private var near = false
    private var lastAt = Long.MIN_VALUE / 2

    fun onProximity(isNear: Boolean, now: Long): Boolean {
        if (isNear && !near) {
            near = true
            if (now - lastAt >= minGapMs) { count++; lastAt = now; return true }
        }
        if (!isNear) near = false
        return false
    }
}

/** Stairs: altitude from air pressure. Only climbing counts; small wobbles are ignored. */
class AscentMeter(private val noiseM: Float = 0.6f) {
    private var low: Float? = null
    var climbedM = 0f
        private set

    fun onAltitude(m: Float) {
        val l = low ?: run { low = m; return }
        if (m > l + noiseM) { climbedM += m - l; low = m }
        else if (m < l - noiseM) low = m
    }

    companion object { const val METRES_PER_FLOOR = 3f }
}

/** Chores: at least [targetMs] since starting and at least [minSteps] steps. */
class ChoreGoal(private val startedAt: Long, val targetMs: Long, val minSteps: Int) {
    val steps = StepGoal(minSteps)
    fun elapsedMs(now: Long) = now - startedAt
    fun done(now: Long) = elapsedMs(now) >= targetMs && steps.done
}

/** Reply to a message: some typing in the chosen chat app, and the app open long enough. Counts only, never text. */
class TypingGoal(val packages: Set<String>, val minEdits: Int, minAppMs: Long) {
    val appTime = AppTimeGoal(packages, minAppMs)
    var edits = 0
        private set

    fun onTyping(pkg: String) { if (pkg in packages) edits++ }
    fun done(now: Long) = edits >= minEdits && appTime.done(now)
}

/**
 * Before/after photos. Inputs are 32×32 greyscale thumbnails (0..255).
 * Same place = the coarse layout still correlates; changed = enough pixels moved;
 * and enough time passed between the two.
 */
object PhotoCheck {
    enum class Verdict { OK, TOO_FAST, SAME_PHOTO, DIFFERENT_PLACE }

    const val SIZE = 32

    fun compare(before: IntArray, after: IntArray, elapsedMs: Long, minMs: Long): Verdict {
        require(before.size == SIZE * SIZE && after.size == SIZE * SIZE)
        if (elapsedMs < minMs) return Verdict.TOO_FAST
        if (change(before, after) < 0.035) return Verdict.SAME_PHOTO
        if (sameness(before, after) < 0.3) return Verdict.DIFFERENT_PLACE
        return Verdict.OK
    }

    /** Mean absolute difference, 0..1. */
    fun change(a: IntArray, b: IntArray): Double = a.indices.sumOf { abs(a[it] - b[it]) } / (a.size * 255.0)

    /** Correlation of the 8×8 block layout, -1..1. Ignores overall brightness. */
    fun sameness(a: IntArray, b: IntArray): Double {
        val x = blocks(a); val y = blocks(b)
        val mx = x.average(); val my = y.average()
        var num = 0.0; var dx = 0.0; var dy = 0.0
        for (i in x.indices) { val u = x[i] - mx; val v = y[i] - my; num += u * v; dx += u * u; dy += v * v }
        return if (dx < 1e-6 || dy < 1e-6) 0.0 else num / sqrt(dx * dy)
    }

    private fun blocks(g: IntArray): DoubleArray {
        val out = DoubleArray(64)
        for (by in 0 until 8) for (bx in 0 until 8) {
            var s = 0
            for (y in 0 until 4) for (x in 0 until 4) s += g[(by * 4 + y) * SIZE + bx * 4 + x]
            out[by * 8 + bx] = s / 16.0
        }
        return out
    }
}
