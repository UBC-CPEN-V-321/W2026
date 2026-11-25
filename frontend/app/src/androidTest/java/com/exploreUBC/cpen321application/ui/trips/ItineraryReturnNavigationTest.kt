package com.exploreUBC.cpen321application.ui.trips

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import com.exploreUBC.cpen321application.testutil.E2E_RECOMMENDATION_ID
import com.exploreUBC.cpen321application.testutil.E2E_USER_ID
import com.exploreUBC.cpen321application.testutil.InMemoryItinerariesRepository
import org.junit.Rule
import org.junit.Test

/** Isolated navigation-state component test; real-backend journeys live under the E2E package. */
class ItineraryReturnNavigationTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun requestedRecommendationOpensWhenTripsRouteIsComposed() {
        val repository = InMemoryItinerariesRepository().apply { addRecommendation() }
        composeRule.setContent {
            TripsRoute(
                userId = E2E_USER_ID,
                itinerariesRepository = repository,
                itineraryIdToOpen = E2E_RECOMMENDATION_ID,
            )
        }

        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithTag("itinerary_save_recommendation")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule.onNodeWithText("UBC Recommendation").assertIsDisplayed()
    }
}
