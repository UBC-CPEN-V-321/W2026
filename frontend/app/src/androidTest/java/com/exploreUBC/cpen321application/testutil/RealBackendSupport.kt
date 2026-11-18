package com.exploreUBC.cpen321application.testutil

import android.Manifest
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performScrollToNode
import androidx.test.platform.app.InstrumentationRegistry
import com.exploreUBC.cpen321application.BuildConfig
import com.exploreUBC.cpen321application.data.users.BudgetPreference
import com.exploreUBC.cpen321application.data.users.InterestPreference
import com.exploreUBC.cpen321application.data.users.TransportationMode
import com.exploreUBC.cpen321application.data.users.TransportationPreference
import com.exploreUBC.cpen321application.data.users.UserPreferences
import com.exploreUBC.cpen321application.data.users.UserUpdate
import com.exploreUBC.cpen321application.data.users.UsersApi
import kotlinx.coroutines.runBlocking
import org.junit.rules.TestRule

/** User the app signs in as (hardcoded in MainActivity2); seeded by backend `npm run e2e:seed`. */
internal const val REAL_BACKEND_USER_ID = "6acd519c76376cefc61e97f1"

/** How long a test waits for a response from the real backend before failing. */
internal const val REAL_BACKEND_TIMEOUT_MS = 20_000L

/** Waits until [text] appears on screen, failing the test if the backend does not deliver it in time. */
internal fun ComposeTestRule.waitForText(
    text: String,
    timeoutMillis: Long = REAL_BACKEND_TIMEOUT_MS,
) {
    waitUntil(timeoutMillis) {
        onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    }
}

/**
 * Grants location permission before the activity starts, so the system permission dialog never
 * covers the app. The app then uses the emulator location (set it to UBC before running).
 */
internal fun grantLocationPermissionRule(): TestRule = TestRule { base, _ ->
    object : org.junit.runners.model.Statement() {
        override fun evaluate() {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val packageName = instrumentation.targetContext.packageName
            listOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ).forEach { instrumentation.uiAutomation.grantRuntimePermission(packageName, it) }
            base.evaluate()
        }
    }
}

/** Waits for [text] in the (lazy) list to load, scrolls to it, and fails if it never appears. */
internal fun ComposeTestRule.scrollToText(
    text: String,
    timeoutMillis: Long = REAL_BACKEND_TIMEOUT_MS,
) {
    val target: SemanticsMatcher = hasText(text)
    waitUntil(timeoutMillis) {
        runCatching { onNode(hasScrollAction()).performScrollToNode(target) }.isSuccess
    }
}

/** Sets the seeded user's interest through the real backend, so every test starts from the same state. */
internal fun resetUserInterest(interest: InterestPreference = InterestPreference.OUTDOORS) {
    runBlocking {
        UsersApi(BuildConfig.API_BASE_URL).updateUser(
            REAL_BACKEND_USER_ID,
            UserUpdate(
                preferences = UserPreferences(
                    transportation = TransportationPreference(TransportationMode.TRANSIT),
                    budget = BudgetPreference.BALANCED,
                    interest = interest,
                ),
            ),
        )
    }
}
