package app.kaak

import android.app.Application
import app.kaak.data.CrashLog
import app.kaak.data.KaakPrefs
import app.kaak.data.Study
import app.kaak.tasks.TaskCenter

class KaakApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
        TaskCenter.init(this)
        KaakPrefs(this).installedAt // stamps first-launch time
        Study.enroll(this)
    }
}
