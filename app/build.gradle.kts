import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing. Locally: keystore.properties in the project root (never committed).
// On GitHub Actions: the KAAK_* environment variables set from repository secrets.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(key: String, env: String): String? = (keystoreProps.getProperty(key) ?: System.getenv(env))?.takeIf { it.isNotBlank() }
val releaseStore: String? = secret("storeFile", "KAAK_KEYSTORE")

android {
    namespace = "app.kaak"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.kaak"
        minSdk = 29          // Android 10+
        targetSdk = 35
        // CI sets these from the run number and the git tag; local builds use the defaults.
        versionCode = (System.getenv("KAAK_VERSION_CODE") ?: "13").toInt()
        versionName = System.getenv("KAAK_VERSION_NAME") ?: "0.10.1"
    }

    buildFeatures {
        buildConfig = true
    }

    // Two editions from the same code. They install side by side.
    flavorDimensions += "edition"
    productFlavors {
        create("full") {
            dimension = "edition"
            buildConfigField("boolean", "STUDY", "false")
        }
        create("study") {
            dimension = "edition"
            applicationIdSuffix = ".study"
            versionNameSuffix = "-study"
            buildConfigField("boolean", "STUDY", "true")
        }
    }

    signingConfigs {
        if (releaseStore != null) {
            create("release") {
                storeFile = rootProject.file(releaseStore)
                storePassword = secret("storePassword", "KAAK_STORE_PASSWORD")
                keyAlias = secret("keyAlias", "KAAK_KEY_ALIAS")
                keyPassword = secret("keyPassword", "KAAK_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Without a keystore, release builds fall back to the debug key: fine for your own
            // phone, NOT for testers (updates would fail to install). See BETA.md.
            signingConfig = if (releaseStore != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// No runtime libraries at all: the app uses only the Android framework.
dependencies {
    testImplementation("junit:junit:4.13.2")
}
