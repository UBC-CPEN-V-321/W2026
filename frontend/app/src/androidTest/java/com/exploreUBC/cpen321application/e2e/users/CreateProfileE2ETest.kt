package com.exploreUBC.cpen321application.e2e.users

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import com.exploreUBC.cpen321application.MainActivity2
import com.exploreUBC.cpen321application.data.AppConstants
import com.exploreUBC.cpen321application.data.network.ApiRequest
import com.exploreUBC.cpen321application.data.users.BudgetPreference
import com.exploreUBC.cpen321application.data.users.InterestPreference
import com.exploreUBC.cpen321application.data.users.TransportationMode
import com.exploreUBC.cpen321application.data.users.UsersApi
import com.exploreUBC.cpen321application.testutil.CREATE_PROFILE_SESSION_TOKEN
import com.exploreUBC.cpen321application.testutil.CREATE_PROFILE_USER_ID
import com.exploreUBC.cpen321application.testutil.LOGOUT_PROFILE_SESSION_TOKEN
import com.exploreUBC.cpen321application.testutil.LOGOUT_PROFILE_USER_ID
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_TIMEOUT_MS
import com.exploreUBC.cpen321application.testutil.beforeActivityRule
import com.exploreUBC.cpen321application.testutil.realBackendClient
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.json.JSONObject

/** First-login profile creation through the real authenticated app and backend. */
class CreateProfileE2ETest {
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(beforeActivityRule {
            val response = runBlocking {
                realBackendClient(CREATE_PROFILE_USER_ID, CREATE_PROFILE_SESSION_TOKEN)
                    .execute(ApiRequest(method = "GET", path = AppConstants.Auth.CURRENT_SESSION_PATH))
            }
            check(JSONObject(response).getJSONObject("user").isNull("onboardingCompletedAt")) {
                "The E2E create-profile user already completed onboarding. " +
                    "Run ./scripts/run-frontend-e2e-tests.sh to reset the isolated E2E database."
            }
        })
        .around(
            signedInTestUserRule(CREATE_PROFILE_USER_ID, CREATE_PROFILE_SESSION_TOKEN),
        )
        .around(composeRule)

    @Test
    fun firstLoginCreatesProfileWithLocationAndPreferences() {
        waitForTag("create_profile_screen")
        composeRule.onNodeWithTag("create_profile_save").performScrollTo().assertIsNotEnabled()
        composeRule.onNodeWithTag("create_profile_start_location")
            .performTextInput("UBC Bus Exchange")
        composeRule.onNodeWithTag("create_profile_transportation_dropdown").performClick()
        composeRule.onNodeWithTag("create_profile_transportation_transit").performClick()
        composeRule.onNodeWithTag("create_profile_budget_dropdown").performClick()
        composeRule.onNodeWithTag("create_profile_budget_balanced").performClick()
        composeRule.onNodeWithTag("create_profile_interest_dropdown").performScrollTo().performClick()
        composeRule.onNodeWithTag("create_profile_interest_outdoors").performClick()
        composeRule.onNodeWithTag("create_profile_save")
            .performScrollTo()
            .assertIsEnabled()
            .performClick()

        waitForTag("navigation_Events")
        val stored = runBlocking {
            UsersApi(
                realBackendClient(CREATE_PROFILE_USER_ID, CREATE_PROFILE_SESSION_TOKEN),
            ).getUser(CREATE_PROFILE_USER_ID)
        }
        assertEquals("UBC Bus Exchange", stored.startLocation)
        assertEquals(TransportationMode.TRANSIT, stored.preferences.transportation.mode)
        assertEquals(BudgetPreference.BALANCED, stored.preferences.budget)
        assertEquals(InterestPreference.OUTDOORS, stored.preferences.interest)
    }

    private fun waitForTag(tag: String) {
        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }
}

/** Logout escape path for a second seeded user whose profile is still incomplete. */
class CreateProfileLogoutE2ETest {
    private val composeRule = createAndroidComposeRule<MainActivity2>()

    @get:Rule
    val rules: RuleChain = RuleChain
        .outerRule(
            signedInTestUserRule(LOGOUT_PROFILE_USER_ID, LOGOUT_PROFILE_SESSION_TOKEN),
        )
        .around(composeRule)

    @Test
    fun incompleteProfileCanLogOut() {
        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) {
            composeRule.onAllNodesWithTag("create_profile_logout").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("create_profile_logout")
            .performScrollTo()
            .assertIsDisplayed()
            .performClick()

        composeRule.waitUntil(REAL_BACKEND_TIMEOUT_MS) {
            runCatching { composeRule.onNodeWithText("Login with Google").assertIsDisplayed() }
                .isSuccess
        }
    }
}
