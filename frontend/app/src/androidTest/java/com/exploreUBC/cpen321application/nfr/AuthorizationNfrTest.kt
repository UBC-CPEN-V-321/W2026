package com.exploreUBC.cpen321application.nfr

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.exploreUBC.cpen321application.BuildConfig
import com.exploreUBC.cpen321application.data.auth.SessionManager
import com.exploreUBC.cpen321application.data.auth.SessionStore
import com.exploreUBC.cpen321application.data.network.ApiClient
import com.exploreUBC.cpen321application.data.network.ApiException
import com.exploreUBC.cpen321application.data.network.ApiRequest
import com.exploreUBC.cpen321application.data.users.UsersApi
import com.exploreUBC.cpen321application.testutil.CREATE_PROFILE_SESSION_TOKEN
import com.exploreUBC.cpen321application.testutil.CREATE_PROFILE_USER_ID
import com.exploreUBC.cpen321application.testutil.REAL_BACKEND_USER_ID
import com.exploreUBC.cpen321application.testutil.signedInTestUserRule
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
// See documentation/Testing.md, "Security".
class AuthorizationNfrTest {
    @get:Rule
    val signedInSession = signedInTestUserRule(
        CREATE_PROFILE_USER_ID,
        CREATE_PROFILE_SESSION_TOKEN,
    )

    private val applicationContext
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun protectedRequestWithoutSessionIsRejectedByBackend() {
        val client = ApiClient(
            apiBaseUrl = BuildConfig.API_BASE_URL,
            sessionManager = SessionManager(),
        )

        val error = assertThrows(ApiException::class.java) {
            runBlocking {
                client.execute(
                    ApiRequest(
                        method = "GET",
                        path = "/users/$REAL_BACKEND_USER_ID",
                        requiresAuthentication = false,
                    ),
                )
            }
        }

        assertEquals(401, error.statusCode)
        assertEquals("SESSION_REQUIRED", error.errorCode)
    }

    @Test
    fun authenticatedUserCannotReadDatabaseInitUser() {
        val storedSession = checkNotNull(SessionStore(applicationContext).load()) {
            "The NFR runner must install the seeded signed-in session fixture."
        }
        assertNotEquals(
            "The signed-in test account must not be the database initialization user.",
            REAL_BACKEND_USER_ID,
            storedSession.userId,
        )
        val usersApi = UsersApi(
            ApiClient(
                apiBaseUrl = BuildConfig.API_BASE_URL,
                sessionManager = SessionManager(storedSession),
            ),
        )

        val error = assertThrows(ApiException::class.java) {
            runBlocking { usersApi.getUser(REAL_BACKEND_USER_ID) }
        }

        assertEquals(403, error.statusCode)
        assertEquals("FORBIDDEN", error.errorCode)
    }
}
