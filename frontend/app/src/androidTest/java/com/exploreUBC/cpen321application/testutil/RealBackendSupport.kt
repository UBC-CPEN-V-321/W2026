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
import com.exploreUBC.cpen321application.data.auth.AuthenticatedSession
import com.exploreUBC.cpen321application.data.auth.SessionManager
import com.exploreUBC.cpen321application.data.auth.SessionStore
import com.exploreUBC.cpen321application.data.network.ApiClient
import com.exploreUBC.cpen321application.data.events.EventsApi
import com.exploreUBC.cpen321application.data.itineraries.ActivityItem
import com.exploreUBC.cpen321application.data.itineraries.CreateActivityInput
import com.exploreUBC.cpen321application.data.itineraries.CreateItineraryInput
import com.exploreUBC.cpen321application.data.itineraries.Itinerary
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesApi
import com.exploreUBC.cpen321application.data.users.BudgetPreference
import com.exploreUBC.cpen321application.data.users.InterestPreference
import com.exploreUBC.cpen321application.data.users.TransportationMode
import com.exploreUBC.cpen321application.data.users.TransportationPreference
import com.exploreUBC.cpen321application.data.users.UserPreferences
import com.exploreUBC.cpen321application.data.users.UserUpdate
import com.exploreUBC.cpen321application.data.users.UsersApi
import kotlinx.coroutines.runBlocking
import java.time.Instant
import org.junit.rules.TestRule

/** User the app signs in as; seeded, together with its session, by backend `npm run e2e:seed`. */
internal const val REAL_BACKEND_USER_ID = "6acd519c76376cefc61e97f1"

private const val SEEDED_USER_SESSION_TOKEN = "e2e-live-events-session-token"
private const val SESSION_VALID_FOR_MILLIS = 24L * 60 * 60 * 1000

private fun realBackendSession() = AuthenticatedSession(
    token = SEEDED_USER_SESSION_TOKEN,
    userId = REAL_BACKEND_USER_ID,
    expiresAtEpochMillis = System.currentTimeMillis() + SESSION_VALID_FOR_MILLIS,
)

/** Client that calls the real backend as the seeded user, for resetting and reading test data. */
internal fun realBackendClient(): ApiClient = ApiClient(
    apiBaseUrl = BuildConfig.API_BASE_URL,
    sessionManager = SessionManager(realBackendSession()),
)

/**
 * Stores the seeded user's session in the app before the activity starts, so the app opens signed in
 * without the Google sign-in screen. The backend accepts it because the seed script created it.
 */
internal fun signedInTestUserRule(): TestRule = TestRule { base, _ ->
    object : org.junit.runners.model.Statement() {
        override fun evaluate() {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            SessionStore(context).save(realBackendSession())
            base.evaluate()
        }
    }
}

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
        UsersApi(realBackendClient()).updateUser(
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

internal const val BASELINE_ITINERARY_NAME = "E2E Baseline Itinerary"
internal const val OVERLAPPING_ACTIVITY_NAME = "E2E Overlapping Activity"
private const val UBC_LATITUDE = 49.2606
private const val UBC_LONGITUDE = -123.246

/**
 * Deletes all of the seeded user's itineraries through the real backend. With [withOverlap] it then
 * recreates [BASELINE_ITINERARY_NAME], holding one activity that overlaps "E2E Event 01".
 */
internal fun resetItineraries(withOverlap: Boolean = true) {
    runBlocking {
        val itineraries = ItinerariesApi(realBackendClient())
        itineraries.getItineraries(REAL_BACKEND_USER_ID).forEach {
            itineraries.deleteItinerary(REAL_BACKEND_USER_ID, it.id)
        }
        if (withOverlap) {
            val firstEvent = EventsApi(realBackendClient())
                .getEvents(REAL_BACKEND_USER_ID, UBC_LATITUDE, UBC_LONGITUDE, 1, 20)
                .first { it.title == "E2E Event 01" }
            val start = Instant.parse(firstEvent.startDateTime)
            val baseline = itineraries.createItinerary(
                REAL_BACKEND_USER_ID,
                CreateItineraryInput(name = BASELINE_ITINERARY_NAME),
            )
            itineraries.addActivity(
                REAL_BACKEND_USER_ID,
                baseline.id,
                CreateActivityInput(
                    name = OVERLAPPING_ACTIVITY_NAME,
                    image = "https://example.com/e2e-activity.jpg",
                    category = "outdoors",
                    location = "UBC",
                    startTime = start.plusSeconds(30 * 60).toString(),
                    endTime = start.plusSeconds(90 * 60).toString(),
                ),
            )
        }
    }
}

/** Reads the seeded user's itineraries from the real backend, to check what the app saved. */
internal fun loadItineraries(): List<Itinerary> = runBlocking {
    ItinerariesApi(realBackendClient()).getItineraries(REAL_BACKEND_USER_ID)
}

internal fun Itinerary.activities(): List<ActivityItem> = items.filterIsInstance<ActivityItem>()

/**
 * Runs [block] before the next rule in a RuleChain (put it before the activity rule), so backend
 * state is reset before the app starts and its first request sees the reset data.
 */
internal fun beforeActivityRule(block: () -> Unit): TestRule = TestRule { base, _ ->
    object : org.junit.runners.model.Statement() {
        override fun evaluate() {
            block()
            base.evaluate()
        }
    }
}
