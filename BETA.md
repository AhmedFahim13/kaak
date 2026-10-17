# Kaak beta guide

Everything here is free. You do steps 1–5 once; after that, a release is one git tag.

## The two editions

| Edition | App name | Who it's for | Install |
| --- | --- | --- | --- |
| `full` | Kaak | you, the 5-friend pilot | `kaak-<version>.apk` |
| `study` | Kaak Study | the 40-person beta | `kaak-study-<version>.apk` |

They install side by side (different app ids). The study edition runs the plan by itself:

- **Day 1–7, baseline.** Kaak watches and logs, and asks "Was that worth it?" now and then. Nothing else ever appears. The home screen is a plain "Phone habits study" page.
- **Day 8 onward, the arm.** On first launch each phone secretly drew an arm (50/50):
  - **Kaak:** the full app. On day 8 the tester meets Kaak through the normal onboarding.
  - **Timer:** a plain note at the same moments Kaak would act ("15 minutes on feeds",
    "5 minutes left of your 60-minute limit", "Daily limit reached"). Never blocks, no crow.
- Every logged line carries `"phase"`, and shared stats start with a summary line
  (`edition=study day=9 phase=TIMER arm=TIMER override=none`).

**Researcher codes** (Study screen → Study code) force an arm on one phone: Kaak, timer,
baseline, or back to automatic. They are stored in the app only as SHA-256 hashes and are
deliberately **not** written in this repository (it may be public). Keep them in a private
note. To change them, replace the hashes in `core/StudyPlan.kt`.

Use them to fix an unbalanced split, or to show someone Kaak on day 1.

## 1. Make your release key (once, then guard it)

Android Studio → *Build → Generate Signed App Bundle or APK → APK → Next → Create new…*

- Key store path: the project root, file name `kaak-release.jks`
- Alias: `kaak`; strong passwords; validity 30 years; your name in "First and Last Name"

Then **back up `kaak-release.jks` and the passwords** in two places (e.g. Google Drive and a
USB stick). If you lose them, no tester can install an update: everyone has to uninstall,
losing their data.

Copy `keystore.properties.example` to `keystore.properties` and fill in the passwords.
Both files are in `.gitignore`. Never commit them.

## 2. Build an APK on your laptop (any time)

Android Studio → *Build Variants* panel (left edge) → pick `fullRelease` or `studyRelease`
→ *Build → Build App Bundle(s) / APK(s) → Build APK(s)*. The APK lands in
`app/build/outputs/apk/full/release/` or `.../study/release/`. Send it any way you like.

## 3. Put the code on GitHub (free)

Create a repository. **Public** is simplest: Obtainium can read public Releases with no setup,
and GitHub Actions minutes are unlimited for public repos. (Private works for building,
2,000 free minutes a month, but testers' Obtainium can't see private releases; use Firebase
App Distribution instead in that case.)

Push the project. Check `git status` first: `keystore.properties` and `*.jks` must not appear.

## 4. Add the signing secrets

Repository → *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Value |
| --- | --- |
| `KAAK_KEYSTORE_B64` | the .jks file as base64 (below) |
| `KAAK_STORE_PASSWORD` | keystore password |
| `KAAK_KEY_ALIAS` | `kaak` |
| `KAAK_KEY_PASSWORD` | key password |

Base64 on Windows (PowerShell, in the project folder):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("kaak-release.jks")) | Set-Clipboard
```

Then paste into the secret. (macOS/Linux: `base64 -i kaak-release.jks | pbcopy`.)

## 5. Release

```bash
git tag v0.7.0
git push origin v0.7.0
```

*Actions* tab: about 5–8 minutes. It runs the unit tests, builds both editions with your key,
and publishes a Release with `kaak-0.7.0.apk` and `kaak-study-0.7.0.apk`. Version codes
come from the run number, so every release installs over the last one. A test or build
failure stops the release.

You can also run the workflow by hand (*Actions → Build and release APKs → Run workflow*):
it builds and attaches the APKs to the run instead of publishing a Release.

## 6. Testers install and get updates

1. Install **Obtainium** (free, from its GitHub releases page or F-Droid).
2. *Add App* → paste your repository URL → in *Additional options*, set **APK filter** to
   `kaak-study` → *Add* → *Install*.
3. Follow "Turning Kaak on" in the README (accessibility; "Allow restricted settings" on Android 13+).

Obtainium checks for new Releases and offers each update. Kaak itself still has no
internet permission.

## 7. Before you invite 40 people

Pilot gate from the plan, using the `full` edition: 5 friends, at least 3 phone brands,
3 days, no `CRASH` lines in "Report a problem", Kaak under 3% battery a day, Kaak appeared
for everyone. Then verify on a study phone: the Kaak code shows Kaak, the timer code shows timer notes,
and the automatic code returns to baseline.

## 8. Collecting data

Ask testers to tap *Share my stats* at the end of each week (baseline, week 2, week 3) and
send it to you. Each line is JSON with `phase`, `type` (session, action, label, event)
and minutes. Nothing identifies the person beyond what they send with it.
