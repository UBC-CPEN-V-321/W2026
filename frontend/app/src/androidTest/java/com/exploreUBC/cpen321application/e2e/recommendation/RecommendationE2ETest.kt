package com.exploreUBC.cpen321application.e2e.recommendation

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesApi
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_TIMEOUT_MS
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_USER_ID
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.realBackendClient
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import com.exploreUBC.cpen321application.testutil.waitForText
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestName

/** Recommendation journeys through the real main activity and non-mocked backend. */
class RecommendationE2ETest {
    private val testName = TestName()
    private val composeRule = createAndroidComposeRule<MainActivity2>()
    private lateinit var api: ItinerariesApi
    private var recommendationId: String? = null

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(testName)
        .around(signedInTestUserRule())
        .around(beforeActivityRule { clearBackendItineraries() })
        .around(composeRule)

    @Before
    fun openTripsFromMainScreen() {
        if (testName.methodName == "saveRecommendedItineraryEnablesEditingActions") {
            recommendationId = runBlocking {
                api.generateRecommendations(REAL_BACKEND_USER_ID).first().id
            }
        }
        waitForTag("navigation_Trips")
        composeRule.onNodeWithTag("navigation_Trips").performClick()
        waitForTag("generate_recommendations")
    }

    @Test
    fun generateFourRecommendedItineraries() {
        composeRule.onNodeWithTag("generate_recommendations")
            .assertIsDisplayed()
            .assertIsEnabled()
            .performClick()
        composeRule.onNodeWithText("Generate new recommendations?").assertIsDisplayed()
        composeRule.onNodeWithTag("confirm_generate_recommendations").performClick()

        waitForTag("generate_recommendations_loading")
        composeRule.onNodeWithTag("generate_recommendations_loading").assertIsDisplayed()
        composeRule.onNodeWithText("Generating…").assertIsDisplayed()
        composeRule.onNodeWithTag("generate_recommendations").assertIsNotEnabled()

        composeRule.waitForText("Recommendations generated.", GENERATION_TIMEOUT_MS)
        composeRule.onNodeWithTag("trips_status")
            .assertTextContains("Recommendations generated.")
        val recommendations = loadRecommendations()
        assertEquals(4, recommendations.size)
        recommendations.forEach { recommendation ->
            waitForTag("recommended_itinerary_${recommendation.id}")
        }

    }

    @Test
    fun saveRecommendedItineraryEnablesEditingActions() {
        val id = checkNotNull(recommendationId)
        waitForTag("recommended_itinerary_$id")
        composeRule.onNodeWithTag("recommended_itinerary_$id").performClick()
        waitForTag("itinerary_save_recommendation")
        composeRule.onNodeWithTag("itinerary_save_recommendation")
            .performScrollTo()
            .assertIsDisplayed()
            .performClick()

        waitForTag("itinerary_add_activity")
        composeRule.onNodeWithTag("itinerary_add_activity").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag("itinerary_add_transportation")
            .performScrollTo()
            .assertIsDisplayed()

        val saved = runBlocking { api.getItinerary(REAL_BACKEND_USER_ID, id) }
        assertTrue(saved.saved)
        assertFalse(saved.inRecommendation)
    }

    private fun clearBackendItineraries() {
        api = ItinerariesApi(realBackendClient())
        runBlocking {
            api.getItineraries(REAL_BACKEND_USER_ID).forEach {
                api.deleteItinerary(REAL_BACKEND_USER_ID, it.id)
            }
        }
    }

    private fun loadRecommendations() = runBlocking {
        api.getItineraries(REAL_BACKEND_USER_ID, inRecommendation = true)
    }

    private fun waitForTag(tag: String, timeoutMillis: Long = REAL_BACKEND_TIMEOUT_MS) {
        composeRule.waitUntil(timeoutMillis) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private companion object {
        const val GENERATION_TIMEOUT_MS = 150_000L
    }
}
