package com.exploreUBC.cpen321application.ui.trips

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.exploreUBC.cpen321application.R
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesRepository
import com.exploreUBC.cpen321application.data.itineraries.Itinerary
import com.exploreUBC.cpen321application.data.itineraries.ItineraryDetails
import com.exploreUBC.cpen321application.data.itineraries.ItineraryItem

private const val MISSING_USER_MESSAGE = "A user ID is required to load itineraries."

@Composable
fun TripsRoute(
    userId: String?,
    itinerariesRepository: ItinerariesRepository,
    modifier: Modifier = Modifier,
    itineraryIdToOpen: String? = null,
    onItineraryOpenRequested: () -> Unit = {},
    onViewMap: (Itinerary) -> Unit = {},
) {
    val state = rememberTripsRouteState(userId, itinerariesRepository)

    LaunchedEffect(state) {
        if (state.hasUser) {
            state.loadItineraries()
        }
    }
    LaunchedEffect(
        itineraryIdToOpen,
        state.savedItineraries,
        state.recommendedItineraries,
    ) {
        val itinerary = (state.savedItineraries + state.recommendedItineraries)
            .firstOrNull { it.id == itineraryIdToOpen }
        if (itinerary != null) {
            state.openItinerary(itinerary)
            onItineraryOpenRequested()
        }
    }

    TripsRouteContent(state, onViewMap, modifier)
    if (state.showGenerateConfirmation) GenerateRecommendationsDialog(state)
}

@Composable
private fun TripsRouteContent(
    state: TripsRouteState,
    onViewMap: (Itinerary) -> Unit,
    modifier: Modifier,
) {
    val itinerary = state.selectedItinerary
    if (itinerary == null) {
        TripsOverview(state, modifier)
    } else {
        SelectedItineraryRoute(state, itinerary, onViewMap, modifier)
    }
}

@Composable
private fun TripsOverview(state: TripsRouteState, modifier: Modifier) {
    TripsList(
        model = TripsListModel(
            savedItineraries = state.savedItineraries,
            recommendedItineraries = state.recommendedItineraries,
            isLoading = state.isLoading,
            isCreating = state.isCreating,
            isGenerating = state.isGenerating,
            statusMessage = if (state.hasUser) state.statusMessage else MISSING_USER_MESSAGE,
        ),
        actions = TripsListActions(
            state.openItinerary,
            state.createItinerary,
            state.showGenerateConfirmationAction,
        ),
        modifier = modifier,
    )
}

@Composable
private fun SelectedItineraryRoute(
    state: TripsRouteState,
    itinerary: Itinerary,
    onViewMap: (Itinerary) -> Unit,
    modifier: Modifier,
) {
    val item = state.selectedItem
    val itemType = state.newItemType

    when {
        item != null -> ItineraryItemScreen(
            ItineraryItemScreenModel(
                item, itinerary.inRecommendation, state.isSaving, state.statusMessage,
            ),
            ItineraryItemScreenActions(
                state.closeItem,
                state.updateActivity,
                state.updateTransportation,
                state.deleteItem,
            ),
            modifier,
        )
        itemType != null -> NewItineraryItemScreen(
            itemType = itemType,
            isSaving = state.isSaving,
            statusMessage = state.statusMessage,
            onBack = state.closeNewItem,
            onAddActivity = state.addActivity,
            onAddTransportation = state.addTransportation,
            modifier = modifier,
        )
        else -> SelectedItineraryDetails(
            state,
            itinerary,
            { onViewMap(itinerary) },
            modifier,
        )
    }
}

@Composable
private fun SelectedItineraryDetails(
    state: TripsRouteState,
    itinerary: Itinerary,
    onViewMap: () -> Unit,
    modifier: Modifier,
) {
    ItineraryScreen(
        model = ItineraryScreenModel(
            itinerary,
            state.isSaving,
            state.statusMessage,
        ),
        actions = ItineraryScreenActions(
            onBack = state.closeItinerary,
            onItemClick = state.openItem,
            onAddActivity = { state.openNewItem(NewItemType.ACTIVITY) },
            onAddTransportation = { state.openNewItem(NewItemType.TRANSPORTATION) },
            onSaveDetails = state.saveDetails,
            onSaveRecommendation = state.saveRecommendation,
            onDelete = state.deleteItinerary,
            onViewMap = onViewMap,
        ),
        modifier = modifier,
    )
}

@Composable
private fun GenerateRecommendationsDialog(state: TripsRouteState) {
    AlertDialog(
        onDismissRequest = state.dismissGenerateConfirmation,
        title = { Text("Generate new recommendations?") },
        text = { Text("Your current recommended itineraries will be removed and replaced.") },
        confirmButton = {
            TextButton(
                onClick = state.generateRecommendations,
                modifier = Modifier.testTag("confirm_generate_recommendations"),
            ) { Text("Confirm") }
        },
        dismissButton = {
            TextButton(
                onClick = state.dismissGenerateConfirmation,
                modifier = Modifier.testTag("cancel_generate_recommendations"),
            ) { Text("Cancel") }
        },
    )
}

data class ItineraryScreenModel(
    val itinerary: Itinerary,
    val isSaving: Boolean,
    val statusMessage: String?,
)

data class ItineraryScreenActions(
    val onBack: () -> Unit,
    val onItemClick: (ItineraryItem) -> Unit,
    val onAddActivity: () -> Unit,
    val onAddTransportation: () -> Unit,
    val onSaveDetails: (ItineraryDetails) -> Unit,
    val onSaveRecommendation: () -> Unit,
    val onDelete: () -> Unit,
    val onViewMap: () -> Unit = {},
)

private class ItineraryEditorState(itinerary: Itinerary) {
    var name by mutableStateOf(itinerary.name)
    var description by mutableStateOf(itinerary.description.orEmpty())
    var startingLocation by mutableStateOf(itinerary.startingLocation.orEmpty())
    var isEditing by mutableStateOf(false)

    fun toggle(itinerary: Itinerary) {
        if (isEditing) {
            name = itinerary.name
            description = itinerary.description.orEmpty()
            startingLocation = itinerary.startingLocation.orEmpty()
        }
        isEditing = !isEditing
    }

    fun details() = ItineraryDetails(name, description, startingLocation)
}

@Composable
fun ItineraryScreen(
    model: ItineraryScreenModel,
    actions: ItineraryScreenActions,
    modifier: Modifier = Modifier,
) {
    val itinerary = model.itinerary
    var showDeleteConfirmation by remember(itinerary.id) { mutableStateOf(false) }
    val editor = remember(itinerary.id, itinerary.updatedAt) {
        ItineraryEditorState(itinerary)
    }
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TextButton(onClick = actions.onBack, modifier = Modifier.testTag("itinerary_back")) {
            Text("Back to itineraries")
        }
        ItineraryDetailsHeader(model, editor)
        if (editor.isEditing) {
            ItineraryDetailsEditor(editor, model.isSaving, actions.onSaveDetails)
        } else {
            ItineraryDetailsContent(itinerary)
        }
        Button(
            onClick = actions.onViewMap,
            modifier = Modifier.fillMaxWidth().testTag("itinerary_view_on_map"),
        ) {
            Text("View on Map")
        }
        model.statusMessage?.let { Text(it, modifier = Modifier.testTag("itinerary_status")) }
        ItineraryItems(itinerary, actions.onItemClick)
        ItineraryActions(model, actions)
        Button(
            onClick = { showDeleteConfirmation = true },
            enabled = !model.isSaving,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError,
            ),
            modifier = Modifier.fillMaxWidth().testTag("itinerary_delete"),
        ) { Text("Delete itinerary") }
        Spacer(Modifier.height(16.dp))
    }
    if (showDeleteConfirmation) {
        ItineraryDeleteDialog(
            onDismiss = { showDeleteConfirmation = false },
            onConfirm = {
                showDeleteConfirmation = false
                actions.onDelete()
            },
        )
    }
}

@Composable
private fun ItineraryDeleteDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete itinerary?") },
        text = { Text("This action cannot be undone.") },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                modifier = Modifier.testTag("confirm_delete_itinerary"),
            ) { Text("Yes") }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("cancel_delete_itinerary"),
            ) { Text("No") }
        },
    )
}

@Composable
private fun ItineraryDetailsHeader(model: ItineraryScreenModel, editor: ItineraryEditorState) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "Itinerary details",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
        )
        if (!model.itinerary.inRecommendation) {
            TextButton(
                onClick = { editor.toggle(model.itinerary) },
                enabled = !model.isSaving,
                modifier = Modifier.testTag("itinerary_details_edit"),
            ) { Text(if (editor.isEditing) "Cancel" else "Edit") }
        }
    }
}

@Composable
private fun ItineraryDetailsEditor(
    editor: ItineraryEditorState,
    isSaving: Boolean,
    onSave: (ItineraryDetails) -> Unit,
) {
    val isValid = editor.name.isNotBlank() &&
        editor.name.length <= ITINERARY_NAME_MAX_LENGTH &&
        editor.description.length <= DESCRIPTION_MAX_LENGTH &&
        editor.startingLocation.length <= LOCATION_MAX_LENGTH
    FormField(
        editor.name, { editor.name = it }, "Name", "itinerary_name",
        maxLength = ITINERARY_NAME_MAX_LENGTH,
    )
    FormField(
        editor.description,
        { editor.description = it },
        "Description",
        "itinerary_description",
        maxLength = DESCRIPTION_MAX_LENGTH,
    )
    AddressAutocompleteField(
        value = editor.startingLocation,
        onValueChange = { editor.startingLocation = it },
        label = "Starting location",
        tag = "itinerary_starting_location",
        options = AddressAutocompleteOptions(
            maxLength = LOCATION_MAX_LENGTH,
            placeholder = "e.g. 6138 Student Union Blvd, Vancouver",
            supportingText = "Pick a recommended address to use as the itinerary's starting pin.",
        ),
    )
    Button(
        onClick = { onSave(editor.details()) },
        enabled = !isSaving && isValid,
        modifier = Modifier.fillMaxWidth().testTag("itinerary_save"),
    ) { Text(if (isSaving) "Saving…" else "Save details") }
}

@Composable
private fun ItineraryDetailsContent(itinerary: Itinerary) {
    DetailField("Name", itinerary.name)
    DetailField("Description", itinerary.description?.takeIf(String::isNotBlank) ?: "Not set")
    DetailField(
        "Starting location",
        itinerary.startingLocation?.takeIf(String::isNotBlank) ?: "Not set",
    )
}

@Composable
private fun ItineraryItems(
    itinerary: Itinerary,
    onItemClick: (ItineraryItem) -> Unit,
) {
    Text(
        text = "Activities and transportation",
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 8.dp),
    )
    if (itinerary.items.isEmpty()) Text("No activities or transportation.")
    itinerary.items.forEach { item ->
        ItineraryItemCard(item = item, onClick = { onItemClick(item) })
    }
}

@Composable
private fun ItineraryActions(model: ItineraryScreenModel, actions: ItineraryScreenActions) {
    if (model.itinerary.inRecommendation) {
        Button(
            onClick = actions.onSaveRecommendation,
            enabled = !model.isSaving,
            modifier = Modifier.fillMaxWidth().testTag("itinerary_save_recommendation"),
        ) { Text(if (model.isSaving) "Saving…" else "Save itinerary") }
    } else {
        Row(modifier = Modifier.fillMaxWidth()) {
            AddItemButton("+ Activity", "itinerary_add_activity", model, actions.onAddActivity)
            Spacer(Modifier.width(12.dp))
            AddItemButton(
                "+ Transportation",
                "itinerary_add_transportation",
                model,
                actions.onAddTransportation,
            )
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.AddItemButton(
    label: String,
    tag: String,
    model: ItineraryScreenModel,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = model.itinerary.saved,
        modifier = Modifier.weight(1f).testTag(tag),
    ) { Text(label) }
}
