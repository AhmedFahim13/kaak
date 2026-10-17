package app.kaak.data

import android.content.Context
import app.kaak.BuildConfig
import app.kaak.core.Phase
import app.kaak.core.StudyPlan
import app.kaak.core.dayKeyOf
import java.time.LocalDate

/** The study edition's state on this phone: when it was enrolled, which arm it drew, any researcher override. */
object Study {
    val enabled: Boolean get() = BuildConfig.STUDY

    private fun sp(c: Context) = c.getSharedPreferences("kaak_study", Context.MODE_PRIVATE)

    private fun dateOf(key: Int): LocalDate = LocalDate.of(key / 10_000, key / 100 % 100, key % 100)

    /** First launch of the study edition: start the baseline clock and draw an arm (hidden from the tester). */
    fun enroll(c: Context) {
        if (!enabled) return
        val s = sp(c)
        if (s.contains("enrolled")) return
        s.edit().putInt("enrolled", dayKeyOf(LocalDate.now())).putString("arm", StudyPlan.assignArm().name).apply()
    }

    fun enrolled(c: Context): LocalDate? = sp(c).getInt("enrolled", 0).takeIf { it > 0 }?.let(::dateOf)

    private fun arm(c: Context) = runCatching { Phase.valueOf(sp(c).getString("arm", "KAAK")!!) }.getOrDefault(Phase.KAAK)
    private fun override(c: Context) = sp(c).getString("override", null)?.let { runCatching { Phase.valueOf(it) }.getOrNull() }

    fun phase(c: Context): Phase = StudyPlan.phase(enabled, enrolled(c), LocalDate.now(), arm(c), override(c))

    fun day(c: Context): Long = enrolled(c)?.let { StudyPlan.day(it, LocalDate.now()) } ?: 1

    /** Returns true if the code was a researcher code. */
    fun applyCode(c: Context, code: String): Boolean {
        val found = StudyPlan.lookup(code) ?: return false
        sp(c).edit().putString("override", found.getOrNull()?.name).apply()
        return true
    }

    /** One line for the top of shared stats, so the researcher knows whose file it is. */
    fun summary(c: Context): String =
        if (!enabled) "edition=full" else "edition=study day=${day(c)} phase=${phase(c).name} arm=${arm(c).name} override=${override(c)?.name ?: "none"}"
}
