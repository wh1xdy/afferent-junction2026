package fi.junction.afferent

import com.getcapacitor.Plugin

/**
 * The in-app Capacitor plugins of the Android shell (the counterpart of
 * AfferentViewController.capacitorDidLoad in ios/App/App/AfferentEyes.swift).
 *
 * MainActivity registers every class in [all] before the bridge is created, so each one is
 * reachable from the web layer as window.Capacitor.Plugins.<name>, where <name> is the
 * `name` of its @CapacitorPlugin annotation. That name must be the jsName of the iOS plugin
 * (AfferentFinger, AfferentPresence, AfferentEyes): the web layer looks plugins up by that
 * name and has no platform checks. PluginSetupTest enforces it.
 *
 * To add a plugin: write the class in this package and add `YourPlugin::class.java` below.
 * npm plugins (e.g. @capacitor/local-notifications) are not listed here; `cap sync` wires them.
 */
object AfferentPlugins {
    @JvmField
    val all: List<Class<out Plugin>> = listOf(
        AfferentFingerPlugin::class.java,
        AfferentPresencePlugin::class.java,
    )
}
