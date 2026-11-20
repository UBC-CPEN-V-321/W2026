package com.exploreUBC.cpen321application.nfr

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.exploreUBC.cpen321application.data.auth.AuthRepository
import com.exploreUBC.cpen321application.data.auth.AuthenticatedSession
import com.exploreUBC.cpen321application.data.auth.SessionManager
import com.exploreUBC.cpen321application.data.auth.SessionStartupCoordinator
import com.exploreUBC.cpen321application.data.auth.SessionStartupResult
import com.exploreUBC.cpen321application.data.network.ApiException
import com.exploreUBC.cpen321application.data.network.ApiRequest
import com.exploreUBC.cpen321application.data.network.BackendClient
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
// See documentation/Testing.md, "Security".
class SessionRestorationNfrTest {
    private val storedSession = AuthenticatedSession(
        token = "stored-session-token",
        userId = "stored-user-id",
        expiresAtEpochMillis = 123_456L,
    )

    @Test
    fun restoreUsesBackendSessionEndpointAndPersistsRenewedExpiry() = runBlocking {
        lateinit var request: ApiRequest
        var persistedSession: AuthenticatedSession? = null
        val sessionManager = SessionManager(storedSession)
        val repository = AuthRepository(
            backendClient = BackendClient { received ->
                request = received
                """
                    {
                      "expiresAt": "1970-01-01T00:16:39.999Z",
                      "user": {
                        "id": "stored-user-id",
                        "displayName": "Stored User",
                        "onboardingCompletedAt": "2026-10-24T08:00:00.000Z"
                      }
                    }
                """.trimIndent()
            },
            sessionManager = sessionManager,
            persistSession = { persistedSession = it },
        )

        val restored = repository.restoreSession()

        assertEquals("GET", request.method)
        assertEquals("/auth/session", request.path)
        assertTrue(request.requiresAuthentication)
        assertEquals("stored-session-token", persistedSession?.token)
        assertEquals(999_999L, persistedSession?.expiresAtEpochMillis)
        assertSame(persistedSession, sessionManager.currentSession())
        assertEquals("stored-user-id", restored.userId)
    }

    @Test
    fun unauthorizedRestoreClearsPersistedAndInMemorySession() = runBlocking {
        val sessionManager = SessionManager()
        var persistedSession: AuthenticatedSession? = storedSession
        var clearCount = 0
        val coordinator = SessionStartupCoordinator(
            sessionManager = sessionManager,
            loadSession = { persistedSession },
            clearPersistedSession = {
                persistedSession = null
                clearCount += 1
            },
            restoreSession = {
                throw ApiException.fromHttpStatus(401, "INVALID_SESSION")
            },
            renewSession = { error("Renewal is not expected for this session") },
            nowEpochMillis = { 0L },
            renewalWindowMillis = 0L,
        )

        val result = coordinator.restore()

        assertEquals(SessionStartupResult.SignedOut, result)
        assertEquals(1, clearCount)
        assertNull(persistedSession)
        assertNull(sessionManager.currentSession())
    }
}
