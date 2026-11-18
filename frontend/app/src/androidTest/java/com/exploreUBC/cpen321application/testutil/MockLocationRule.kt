package com.exploreUBC.cpen321application.testutil

import android.content.Context
import android.location.Criteria
import android.location.Location
import android.location.LocationManager
import android.os.ParcelFileDescriptor
import android.util.Log
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.TimeUnit
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement

/**
 * Sets the device location through Android's test location providers (GPS and network), which the
 * fused location provider used by the app reads from. A test can start at a known place and later
 * "move" the user. The test providers are removed again after the test.
 * Place this rule before the activity rule so the app starts at [initialLatitude], [initialLongitude].
 */
internal class MockLocationRule(
    private val initialLatitude: Double,
    private val initialLongitude: Double,
) : TestRule {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)

    override fun apply(base: Statement, description: Description): Statement = object : Statement() {
        override fun evaluate() {
            // Allow this app to supply mock locations (the debug manifest declares the permission).
            // Read the command's output to the end so it has finished before providers are added.
            ParcelFileDescriptor.AutoCloseInputStream(
                instrumentation.uiAutomation.executeShellCommand(
                    "appops set --user 0 ${context.packageName} android:mock_location allow",
                ),
            ).use { it.readBytes() }
            providers.forEach(::addTestProvider)
            try {
                moveTo(initialLatitude, initialLongitude)
                base.evaluate()
            } finally {
                providers.forEach { runCatching { locationManager.removeTestProvider(it) } }
            }
        }
    }

    /** Moves the device to the given place; the app sees it as a normal location update. */
    fun moveTo(latitude: Double, longitude: Double) {
        providers.forEach { provider ->
            val location = Location(provider).apply {
                this.latitude = latitude
                this.longitude = longitude
                accuracy = 5f
                time = System.currentTimeMillis()
                elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
            }
            locationManager.setTestProviderLocation(provider, location)
            val readBack = locationManager.getLastKnownLocation(provider)
            Log.i(TAG, "set $provider to $latitude, $longitude; $provider now reports ${readBack?.latitude}, ${readBack?.longitude}")
        }
        // What the app's own location source (the fused provider) currently reports.
        val fused = runCatching {
            Tasks.await(LocationServices.getFusedLocationProviderClient(context).lastLocation, 5, TimeUnit.SECONDS)
        }.getOrNull()
        Log.i(TAG, "fused provider reports ${fused?.latitude}, ${fused?.longitude}")
    }

    private companion object {
        const val TAG = "LocationTest"
    }

    @Suppress("DEPRECATION")
    private fun addTestProvider(provider: String) {
        runCatching { locationManager.removeTestProvider(provider) }
        locationManager.addTestProvider(
            provider,
            false, false, false, false, true, true, true,
            Criteria.POWER_LOW,
            Criteria.ACCURACY_FINE,
        )
        locationManager.setTestProviderEnabled(provider, true)
    }
}
