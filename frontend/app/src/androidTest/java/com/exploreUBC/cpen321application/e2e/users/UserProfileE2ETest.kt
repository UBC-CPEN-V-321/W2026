package com.exploreUBC.cpen321application.e2e.users

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.data.users.BudgetPreference
import com.exploreUBC.cpen321application.data.users.InterestPreference
import com.exploreUBC.cpen321application.data.users.TransportationMode
import com.exploreUBC.cpen321application.data.users.TransportationPreference
import com.exploreUBC.cpen321application.data.users.UserPreferences
import com.exploreUBC.cpen321application.data.users.UserUpdate
import com.exploreUBC.cpen321application.data.users.UsersApi
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_TIMEOUT_MS
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_USER_ID
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.realBackendClient
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain

/** Profile journeys through the real main activity and non-mocked backend. */
class UserProfileE2ETest {
    private val composeRule = createAndroidComposeRule<MainActivity2>()
    private lateinit var api: UsersApi

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(signedInTestUserRule())
        .around(beforeActivityRule { resetBackendProfile() })
        .around(composeRule)

    @Before
    fun openProfileFromMainScreen() {
        waitForTag("navigation_Profile")
        composeRule.onNodeWithTag("navigation_Profile").performClick()
        waitForTag("profile_display_name")
    }

    @Test
    fun updateDisplayNameAndStartingLocationAndValidateMaximumLength() {
        composeRule.onNodeWithTag("profile_display_name").assertTextContains("ExploreUBC User")
        composeRule.onNodeWithText("UBC Bus Exchange").assertIsDisplayed()

        composeRule.onNodeWithTag("profile_edit").performClick()
        composeRule.onNodeWithTag("profile_display_name_input")
            .performTextReplacement("a".repeat(201))
        composeRule.onNodeWithTag("profile_display_name_length_error").assertIsDisplayed()
        composeRule.onNodeWithTag("profile_details_save").assertIsNotEnabled()

        composeRule.onNodeWithTag("profile_display_name_input")
            .performTextReplacement("Updated Explorer")
        composeRule.onNodeWithTag("profile_start_location")
            .performTextReplacement("BC")
        composeRule.onNodeWithTag("profile_details_save").performClick()

        waitForTag("profile_display_name")
        composeRule.onNodeWithTag("profile_display_name").assertTextContains("Updated Explorer")
        val stored = loadUser()
        assertEquals("Updated Explorer", stored.displayName)
        assertEquals("BC", stored.startLocation)
    }

    @Test
    fun updateTransportationBudgetAndInterestPreferences() {
        composeRule.onNodeWithTag("profile_transportation_dropdown").performClick()
        composeRule.onNodeWithTag("profile_transportation_transit").performClick()
        composeRule.onNodeWithTag("profile_budget_dropdown").performClick()
        composeRule.onNodeWithTag("profile_budget_balanced").performClick()
        composeRule.onNodeWithTag("profile_interest_dropdown").performScrollTo().performClick()
        composeRule.onNodeWithTag("profile_interest_outdoors").performClick()
        composeRule.onNodeWithTag("profile_save").performScrollTo().performClick()

        composeRule.onNodeWithTag("profile_status").assertTextContains("Preferences saved.")
        val preferences = loadUser().preferences
        assertEquals(TransportationMode.TRANSIT, preferences.transportation.mode)
        assertEquals(BudgetPreference.BALANCED, preferences.budget)
        assertEquals(InterestPreference.OUTDOORS, preferences.interest)
    }

    private fun resetBackendProfile() {
        api = UsersApi(realBackendClient())
        runBlocking {
            api.updateUser(
                REAL_BACKEND_USER_ID,
                UserUpdate(
                    displayName = "ExploreUBC User",
                    startLocation = "UBC Bus Exchange",
                    preferences = UserPreferences(
                        transportation = TransportationPreference(TransportationMode.WALKING),
                        budget = BudgetPreference.ECONOMICAL,
                        interest = InterestPreference.FOOD,
                    ),
                ),
            )
        }
    }

    private fun loadUser() = runBlocking { api.getUser(REAL_BACKEND_USER_ID) }

    private fun waitForTag(tag: String) {
        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }
}
