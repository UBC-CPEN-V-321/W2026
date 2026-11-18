package com.example.cpen321application.e2e

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.example.cpen321application.MainActivity
import java.util.UUID
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/**
 * Full-stack E2E for the Group feature: the real app UI on the emulator, the real Node backend and its
 * MongoDB. A second member acts from "another device" through the same backend API.
 */
class GroupBillFullStackE2eTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var backend: FullStackBackend
    private val ui = FullStackUi(compose)

    @Before fun requireBackend() {
        FullStackBackend.assumeEnabled()
        backend = FullStackBackend()
    }

    @After fun closeSessions() {
        if (::backend.isInitialized) backend.close()
    }

    // UC: Create Group, Invite Member, Record Shared Expense.
    // Steps: sign in through the app -> create a group in the app -> a second member joins through the backend ->
    // the app shows the new member live -> add an equal bill in the app -> the member reads it from the backend.
    @Test fun ownerCreatesGroupAndRecordsABillTheMemberReadsFromTheBackend() {
        val owner = backend.register()
        val member = backend.otherDevice()
        val groupName = "Flat " + UUID.randomUUID().toString().take(6)
        ui.signIn(owner)

        ui.openGroupsTab()
        ui.button("Create group").performClick()
        ui.waitFor("Group name *")
        compose.onNodeWithText("Group name *").performTextInput(groupName)
        ui.button("Create group").performClick()
        ui.waitFor("Share this invitation")
        ui.button("Done").performClick()
        ui.waitFor("Group created. You are the owner.")

        // The app stays on the new group's page; the member's join reaches it as a live update.
        val groupId = backend.groupNamed(owner, groupName)
        backend.join(owner, member, groupId)
        ui.waitFor("· 2 members")

        ui.openManualBill("Full-stack groceries", "30.00")
        ui.button("Save expense").performClick()
        ui.waitFor("Full-stack groceries")

        val summary = backend.summary(member, groupId)
        assertEquals(3000L, summary.getLong("totalCents"))
        val bill = objects(summary.getJSONArray("expenses")).single()
        assertEquals("Full-stack groceries", bill.getString("description"))
        assertEquals(owner.id, bill.getString("paidBy"))
        val shares = objects(bill.getJSONArray("shares")).associate { it.getString("userId") to it.getLong("amountCents") }
        assertEquals(mapOf(owner.id to 1500L, member.id to 1500L), shares)
    }
}
