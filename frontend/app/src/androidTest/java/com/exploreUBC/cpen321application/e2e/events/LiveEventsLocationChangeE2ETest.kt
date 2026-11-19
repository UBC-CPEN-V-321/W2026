package com.exploreUBC.cpen321application.e2e.events

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.testutil.MockLocationRule
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.grantLocationPermissionRule
import com.exploreUBC.cpen321application.testutil.resetUserInterest
import com.exploreUBC.cpen321application.testutil.waitForText
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

private const val MOVED_LOCATION_DELIVERY_TIMEOUT_MS = 120_000L

/**
 * Refresh After a Location Change against the real backend. The test sets the device location
 * itself, so it does not depend on the emulator location. Run after `npm run e2e:seed`.
 */
class LiveEventsLocationChangeE2ETest {
    private val mockLocation = MockLocationRule(UBC_LATITUDE, UBC_LONGITUDE)
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(grantLocationPermissionRule())
        .around(mockLocation)
        .around(beforeActivityRule { resetUserInterest() })
        .around(composeRule)

    @Test
    // Section 4.2 — Refresh After a Location Change: UBC -> Abbotsford (about 70 km) -> UBC.
    fun movingFarAwayReplacesTheEventsAndMovingBackRestoresThem() {
        composeRule.waitForText("E2E Event 01")
        composeRule.onAllNodesWithText("E2E Far Event 01").assertCountEquals(0)

        waitForTextWhileResendingDeviceLocation(ABBOTSFORD_LATITUDE, ABBOTSFORD_LONGITUDE, "E2E Far Event 01")
        composeRule.onAllNodesWithText("E2E Event 01").assertCountEquals(0)

        waitForTextWhileResendingDeviceLocation(UBC_LATITUDE, UBC_LONGITUDE, "E2E Event 01")
        composeRule.onAllNodesWithText("E2E Far Event 01").assertCountEquals(0)
    }

    @Test
    // Section 4.2 — Refresh After a Location Change: a move under 10 km does not refresh (UBC -> Kitsilano, about 5.6 km).
    fun movingLessThanTenKilometresDoesNotRefresh() {
        composeRule.waitForText("E2E Event 01")
        composeRule.onAllNodesWithText("0.1 km away").onFirst().assertIsDisplayed()

        // Keep the device at the nearby place for longer than one location update interval (60 s).
        val end = System.currentTimeMillis() + NO_REFRESH_OBSERVATION_MS
        while (System.currentTimeMillis() < end) {
            mockLocation.moveTo(NEARBY_LATITUDE, NEARBY_LONGITUDE)
            Thread.sleep(RESEND_INTERVAL_MS)
        }

        // A refetch would recompute distances from the new place (about 5.6 km), so the
        // seeded "0.1 km away" label would be gone.
        composeRule.onAllNodesWithText("E2E Event 01").onFirst().assertIsDisplayed()
        composeRule.onAllNodesWithText("0.1 km away").onFirst().assertIsDisplayed()
    }

    private fun waitForTextWhileResendingDeviceLocation(latitude: Double, longitude: Double, text: String) {
        val deadline = System.currentTimeMillis() + MOVED_LOCATION_DELIVERY_TIMEOUT_MS
        while (true) {
            mockLocation.moveTo(latitude, longitude)
            val shown = runCatching { composeRule.waitForText(text, RESEND_INTERVAL_MS) }.isSuccess
            if (shown) return
            check(System.currentTimeMillis() < deadline) { "\"$text\" did not appear after moving to $latitude, $longitude" }
        }
    }

    private companion object {
        const val RESEND_INTERVAL_MS = 5_000L
        const val NO_REFRESH_OBSERVATION_MS = 75_000L
        const val NEARBY_LATITUDE = 49.2700
        const val NEARBY_LONGITUDE = -123.1700
        const val UBC_LATITUDE = 49.2606
        const val UBC_LONGITUDE = -123.2460
        const val ABBOTSFORD_LATITUDE = 49.0504
        const val ABBOTSFORD_LONGITUDE = -122.3045
    }
}
