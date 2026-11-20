package com.exploreUBC.cpen321application.e2e.events

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.testutil.grantLocationPermissionRule
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import com.exploreUBC.cpen321application.testutil.waitForText
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

/**
 * Smoke test for the real-backend E2E setup. It launches the real app (no fakes) and expects
 * the seeded events from the real backend. Requires: local E2E database seeded, backend running
 * on it, and the emulator location set to UBC (see documentation/Testing.md, Section 4).
 */
class LiveEventsSmokeE2ETest {
    private val permissions = grantLocationPermissionRule()
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(permissions)
        .around(signedInTestUserRule())
        .around(composeRule)

    @Test
    fun appLaunchesOnEventsScreenAndShowsSeededEventFromBackend() {
        composeRule.waitForText("E2E Event 01")

        composeRule.onNodeWithText("Live Events").assertIsDisplayed()
        composeRule.onNodeWithText("E2E Event 01").assertIsDisplayed()
    }
}
