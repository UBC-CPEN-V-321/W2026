package com.example.cpen321application.feature.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.cpen321application.core.auth.AuthViewModel
import com.example.cpen321application.core.network.dto.EquipmentDto
import com.example.cpen321application.core.network.dto.EquipmentType
import com.example.cpen321application.core.ui.components.MessageBanner
import com.example.cpen321application.core.ui.components.UnderlineTabs

private val PROFILE_TABS = listOf(ProfileTab.MATCH_HISTORY, ProfileTab.FRIENDS, ProfileTab.EQUIPMENT)

data class ProfileActions(
    val onSignOut: () -> Unit = {},
    val onSelectTab: (ProfileTab) -> Unit = {},
    val onRemoveFriend: (String) -> Unit = {},
    val onAcceptRequest: (String) -> Unit = {},
    val onRefresh: () -> Unit = {},
    val onClearMessages: () -> Unit = {},
    val onOpenAddEquipment: () -> Unit = {},
    val onOpenEditEquipment: (EquipmentDto) -> Unit = {},
    val onCloseEquipmentDialog: () -> Unit = {},
    val onUpdateEquipmentInputs: (String, EquipmentType, Boolean) -> Unit = { _, _, _ -> },
    val onSaveEquipment: () -> Unit = {},
    val onDeleteEquipment: (Int) -> Unit = {},
    val onOpenMatch: (gameId: String) -> Unit = {},
    val onOpenStats: () -> Unit = {},
    // Opens a game, e.g. the one a friend is playing
    val onOpenGame: (gameId: String) -> Unit = {},
)

@Composable
fun ProfileRoute(
    authViewModel: AuthViewModel,
    onSignOut: () -> Unit,
    onOpenMatch: (gameId: String) -> Unit,
    onOpenStats: () -> Unit,
    onOpenGame: (gameId: String) -> Unit,
    viewModel: ProfileViewModel = viewModel(),
) {
    val session = authViewModel.session
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(session) {
        viewModel.initSession(session)
    }

    // Live friends and requests only while the Friends tab is on screen: another tab, another screen or a
    // backgrounded app keeps no connection open. Coming back reconnects, and the backend sends the current page first
    val lifecycleOwner = LocalLifecycleOwner.current
    val onFriendsTab = uiState.selectedTab == ProfileTab.FRIENDS
    LaunchedEffect(viewModel, session, lifecycleOwner, onFriendsTab) {
        if (session != null && onFriendsTab) {
            lifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.followFriendsPage(session)
            }
        }
    }

    val actions = ProfileActions(
        onSignOut = onSignOut,
        onSelectTab = { viewModel.selectTab(it) },
        onRemoveFriend = { userId -> viewModel.removeFriend(session, userId) },
        onAcceptRequest = { userId -> viewModel.acceptFriendRequest(session, userId) },
        onRefresh = { viewModel.loadAll(session) },
        onClearMessages = { viewModel.clearMessages() },
        onOpenAddEquipment = { viewModel.openAddEquipmentDialog() },
        onOpenEditEquipment = { equipment -> viewModel.openEditEquipmentDialog(equipment) },
        onCloseEquipmentDialog = { viewModel.closeEquipmentDialog() },
        onUpdateEquipmentInputs = { name, type, isDefault ->
            viewModel.updateEquipmentInputs(name, type, isDefault)
        },
        onSaveEquipment = { viewModel.saveEquipment(session) },
        onDeleteEquipment = { equipmentId -> viewModel.deleteEquipment(session, equipmentId) },
        onOpenMatch = onOpenMatch,
        onOpenStats = onOpenStats,
        onOpenGame = onOpenGame,
    )

    ProfileScreen(uiState = uiState, actions = actions)
}

@Composable
fun ProfileScreen(
    uiState: ProfileUiState,
    actions: ProfileActions = ProfileActions(),
) {
    Column(modifier = Modifier.fillMaxSize()) {
        ProfileTopBar(onSignOut = actions.onSignOut)

        val message = uiState.errorMessage ?: uiState.successMessage
        if (message != null) {
            MessageBanner(
                message = message,
                isError = uiState.errorMessage != null,
                onDismiss = actions.onClearMessages,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp),
            )
        }

        ProfileIdentity(name = uiState.name, username = uiState.username)
        RatingCard(
            rating = uiState.elo,
            lastChange = uiState.matchHistory.firstOrNull()?.ratingChange,
            trend = ratingTrend(uiState.matchHistory),
            onOpenStats = actions.onOpenStats,
        )
        StatsRow(
            stats = listOf(
                recordText(uiState.matchHistory) to "Record",
                uiState.matchHistory.size.toString() to "Matches",
                uiState.friendCount.toString() to "Friends",
            )
        )

        UnderlineTabs(
            titles = listOf("History", "Friends", "Equipment"),
            selectedIndex = PROFILE_TABS.indexOf(uiState.selectedTab),
            onSelect = { actions.onSelectTab(PROFILE_TABS[it]) },
            badges = mapOf(PROFILE_TABS.indexOf(ProfileTab.FRIENDS) to uiState.friendRequests.size),
        )

        ProfileTabBody(
            uiState = uiState,
            actions = actions,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )
    }

    if (uiState.showEquipmentDialog) {
        EquipmentDialog(
            uiState = uiState,
            actions = actions,
        )
    }
}

@Composable
private fun ProfileTabBody(
    uiState: ProfileUiState,
    actions: ProfileActions,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        when (uiState.selectedTab) {
            ProfileTab.MATCH_HISTORY -> MatchHistoryTabContent(
                matchHistory = uiState.matchHistory,
                isLoading = uiState.isLoadingMatches,
                onRefresh = actions.onRefresh,
                onOpenMatch = actions.onOpenMatch,
            )
            ProfileTab.FRIENDS -> FriendsTabContent(
                uiState = uiState,
                actions = actions,
            )
            ProfileTab.EQUIPMENT -> EquipmentTabContent(
                uiState = uiState,
                actions = actions,
            )
        }
    }
}

@Composable
internal fun LoadingBox() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}
