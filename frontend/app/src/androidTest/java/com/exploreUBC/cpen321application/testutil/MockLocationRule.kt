package com.exploreUBC.cpen321application.testutil

import android.location.Location
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.TimeUnit
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement

/**
 * Sends locations directly to the fused provider used by the app. Mock mode is enabled before the
 * activity starts and disabled after it closes, so other tests use the device's normal location.
 */
internal class MockLocationRule(
    private val initialLatitude: Double,
    private val initialLongitude: Double,
) : TestRule {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val locationClient = LocationServices.getFusedLocationProviderClient(context)

    override fun apply(base: Statement, description: Description): Statement = object : Statement() {
        override fun evaluate() {
            // Allow this app to supply mock locations (the debug manifest declares the permission).
            ParcelFileDescriptor.AutoCloseInputStream(
                instrumentation.uiAutomation.executeShellCommand(
                    "appops set --user 0 ${context.packageName} android:mock_location allow",
                ),
            ).use { it.readBytes() }
            awaitMockLocationTask { locationClient.setMockMode(true) }
            try {
                moveTo(initialLatitude, initialLongitude)
                base.evaluate()
            } finally {
                awaitMockLocationTask { locationClient.setMockMode(false) }
            }
        }
    }

    /** Delivers a location to the app's fused location subscription. */
    fun moveTo(latitude: Double, longitude: Double) {
        val location = Location("mock").apply {
            this.latitude = latitude
            this.longitude = longitude
            accuracy = 5f
            time = System.currentTimeMillis()
            elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
        }
        awaitMockLocationTask { locationClient.setMockLocation(location) }
    }

    private fun awaitMockLocationTask(task: () -> Task<Void>) {
        Tasks.await(task(), 10, TimeUnit.SECONDS)
    }
}
