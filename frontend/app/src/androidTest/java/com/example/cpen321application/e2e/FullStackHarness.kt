package com.example.cpen321application.e2e

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isRoot
import android.util.Log
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.example.cpen321application.BuildConfig
import com.example.cpen321application.MainActivity
import org.junit.After
import org.junit.Before
import org.junit.Rule
import java.util.UUID
import java.util.concurrent.TimeUnit
import okhttp3.MediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue

/** A test account on the real backend. Only accounts made by [FullStackBackend.register] have a password. */
internal data class BackendAccount(val id: String, val name: String, val password: String, val token: String)

/**
 * Direct calls to the same Node backend the app under test uses (BuildConfig.API_BASE_URL).
 * Start it with `LEDGER_TEST_PORT=3000 node backend/tests/helpers/membership-test-server.cjs`
 * and pass `-e ledgerFullStack true`; otherwise the full-stack tests are skipped.
 */
internal class FullStackBackend {
    private val http = OkHttpClient.Builder().followRedirects(false)
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
    private val accounts = mutableListOf<BackendAccount>()

    companion object {
        // Call from @Before so a run without the backend skips instead of failing.
        fun assumeEnabled() {
            val enabled = InstrumentationRegistry.getArguments().getString("ledgerFullStack") == "true"
            assumeTrue("Start the isolated test backend on port 3000 and pass ledgerFullStack=true", enabled)
        }
    }

    // Registers through the public API so the app can sign in with this username and password.
    // Registration is rate-limited per client, so only the account that signs in to the app uses it.
    fun register(): BackendAccount {
        val username = "fs" + UUID.randomUUID().toString().filter(Char::isDigit).take(10).padEnd(10, '7')
        val password = UUID.randomUUID().toString()
        val body = JSONObject().put("username", username).put("password", password).put("confirmPassword", password)
        val json = call("POST", "/api/auth/register", body = body)
        return BackendAccount(json.getJSONObject("user").getString("id"), username, password, json.getString("token"))
            .also { accounts += it }
    }

    // A session-only account from the isolated test server; it acts through the API as another device.
    fun otherDevice(): BackendAccount {
        val json = call("POST", "/test/accounts", body = JSONObject().put("displayName", "First joiner"))
        return BackendAccount(json.getJSONObject("user").getString("id"), "First joiner", "", json.getString("token"))
            .also { accounts += it }
    }

    fun createGroup(owner: BackendAccount, name: String): String = call("POST", "/api/groups", owner,
        JSONObject().put("name", name).put("currency", "CAD").put("requestId", UUID.randomUUID().toString()))
        .getJSONObject("group").getString("id")

    // The owner invites and the member accepts, exactly as a second device would.
    fun join(owner: BackendAccount, member: BackendAccount, groupId: String) {
        val link = call("POST", "/api/groups/$groupId/invitations", owner).getJSONObject("invitation").getString("deepLink")
        call("POST", "/api/groups/invitations/${link.substringAfterLast('/')}/accept", member)
    }

    fun groupNamed(account: BackendAccount, name: String): String {
        val groups = call("GET", "/api/groups", account).getJSONArray("groups")
        return objects(groups).single { it.getString("name") == name }.getString("id")
    }

    fun summary(account: BackendAccount, groupId: String) = call("GET", "/api/groups/$groupId/summary", account)

    fun snapshot(account: BackendAccount, groupId: String) = call("GET", "/api/groups/$groupId/snapshot", account)

    fun claim(account: BackendAccount, sessionId: String, unitId: String, version: Int) = call("POST",
        "/api/split-sessions/$sessionId/claims", account, JSONObject().put("unitId", unitId).put("action", "claim")
            .put("version", version).put("operationKey", "fullstack-claim-" + UUID.randomUUID()))

    fun close() {
        accounts.forEach { runCatching { call("POST", "/api/auth/logout", it) } }
        http.connectionPool().evictAll()
        http.dispatcher().executorService().shutdown()
    }

    private fun call(method: String, path: String, account: BackendAccount? = null, body: JSONObject? = null): JSONObject {
        val payload = if (method == "POST") RequestBody.create(MediaType.parse("application/json"), body?.toString() ?: "{}") else null
        val request = Request.Builder().url(BuildConfig.API_BASE_URL.trimEnd('/') + path).method(method, payload)
        account?.let { request.header("Authorization", "Bearer ${it.token}") }
        http.newCall(request.build()).execute().use { response ->
            val text = response.body()?.string().orEmpty()
            assertTrue("$method $path returned ${response.code()}", response.isSuccessful)
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }
}

internal fun objects(array: JSONArray): List<JSONObject> = List(array.length()) { array.getJSONObject(it) }

/** Base for the full-stack tests: the real app, a backend client and the shared UI steps. */
internal abstract class FullStackE2eTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    protected lateinit var backend: FullStackBackend
    protected val ui = FullStackUi(compose)

    @Before fun requireBackend() {
        FullStackBackend.assumeEnabled()
        backend = FullStackBackend()
    }

    @After fun closeSessions() {
        if (::backend.isInitialized) backend.close()
    }

    // The member's view of the group's only bill, with each member's share in cents.
    protected fun onlyBill(member: BackendAccount, groupId: String): Pair<JSONObject, Map<String, Long>> {
        val bill = objects(backend.summary(member, groupId).getJSONArray("expenses")).single()
        return bill to objects(bill.getJSONArray("shares")).associate { it.getString("userId") to it.getLong("amountCents") }
    }
}

/** UI steps shared by the full-stack tests. All text is the English UI. */
internal class FullStackUi(private val compose: ComposeTestRule) {
    // On timeout the visible tree is logged under the "FullStackE2e" tag to show where the app stopped.
    fun waitFor(text: String, timeoutMs: Long = 20000) {
        try {
            compose.waitUntil(timeoutMs) { compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }
        } catch (timeout: ComposeTimeoutException) {
            compose.onAllNodes(isRoot(), useUnmergedTree = true).fetchSemanticsNodes().forEach(::logText)
            throw timeout
        }
    }

    private fun logText(node: SemanticsNode) {
        node.config.getOrNull(SemanticsProperties.Text)?.let { Log.d("FullStackE2e", it.joinToString()) }
        node.config.getOrNull(SemanticsProperties.ContentDescription)?.let { Log.d("FullStackE2e", "[${it.joinToString()}]") }
        node.children.forEach(::logText)
    }

    // The last matching clickable node, scrolled into view when it sits in a scrolling page (dialogs do not scroll).
    fun button(text: String): SemanticsNodeInteraction {
        val node = compose.onAllNodes(hasText(text) and hasClickAction()).onLast()
        try { node.performScrollTo() } catch (_: AssertionError) { node.assertExists() }
        return node
    }

    // Starts from a signed-out app so the test always signs in through the real form.
    fun signIn(account: BackendAccount) {
        showMeUntil { shows("Log out") || hasTag("guest-sign-in") }
        if (shows("Log out")) {
            button("Log out").performClick()
            waitFor("Log out?")
            compose.onNode(hasText("Log out") and hasClickAction() and hasAnyAncestor(isDialog())).performClick()
            compose.waitUntil(20000) { !shows("Log out?") }
        }
        showMeUntil { hasTag("guest-sign-in") }
        compose.onNodeWithTag("guest-sign-in").performClick()
        waitFor("Welcome back")
        compose.onNodeWithText("Username *").performTextInput(account.name)
        compose.onNodeWithText("Password *").performTextInput(account.password)
        button("Sign in").performClick()
        // A successful sign-in returns to the main sections; Me then offers Log out.
        compose.waitUntil(20000) { !shows("Welcome back") }
        showMeUntil { shows("Log out") }
    }

    fun openGroupsTab() {
        compose.onNodeWithTag("section-Groups").performClick()
        waitFor("Join group")
    }

    fun openGroup(name: String) {
        openGroupsTab()
        waitFor(name)
        button(name).performClick()
        waitFor("+ Add a bill")
    }

    // Group page -> shared Add a bill entry -> the manual bill form.
    fun openManualBill(description: String, total: String) {
        button("+ Add a bill").performClick()
        waitFor("Enter manually")
        button("Enter manually").performClick()
        waitFor("Final total (CAD)")
        compose.onNodeWithText("Description").performScrollTo().performTextInput(description)
        compose.onNodeWithText("Final total (CAD)").performScrollTo().performTextInput(total)
    }

    // Reopens Me until the expected account state is shown; signing in or out navigates asynchronously.
    private fun showMeUntil(ready: () -> Boolean) {
        repeat(30) {
            if (ready()) return
            compose.onNodeWithTag("section-Me").performClick()
            compose.waitForIdle()
            Thread.sleep(500)
        }
        compose.onAllNodes(isRoot(), useUnmergedTree = true).fetchSemanticsNodes().forEach(::logText)
        throw AssertionError("Me did not reach the expected sign-in state")
    }

    private fun shows(text: String) = compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()

    private fun hasTag(tag: String) = compose.onAllNodes(androidx.compose.ui.test.hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()
}
