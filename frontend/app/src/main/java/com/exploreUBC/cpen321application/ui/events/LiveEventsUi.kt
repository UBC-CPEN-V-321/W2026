package com.exploreUBC.cpen321application.ui.events

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.exploreUBC.cpen321application.data.events.Event
import com.exploreUBC.cpen321application.data.itineraries.CreateActivityInput
import com.exploreUBC.cpen321application.data.itineraries.CreateItineraryInput
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesRepository
import com.exploreUBC.cpen321application.data.itineraries.Itinerary
import com.exploreUBC.cpen321application.data.itineraries.ItineraryTimeConflictException
import com.exploreUBC.cpen321application.ui.trips.DateTimePickerField
import com.exploreUBC.cpen321application.ui.trips.TimeConflictDialog
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

@Composable
internal fun EventItineraryDialog(
    userId: String?,
    repository: ItinerariesRepository,
    state: LiveEventsScreenState,
) {
    val pendingReplacement = state.pendingReplacement
    if (pendingReplacement != null) {
        EventReplacementDialog(
            userId = userId,
            repository = repository,
            state = state,
            replacement = pendingReplacement,
        )
        return
    }
    val selectedEvent = state.eventToAdd ?: return
    EventSelectionDialog(userId, repository, state, selectedEvent)
}

@Composable
internal fun EventReplacementDialog(
    userId: String?,
    repository: ItinerariesRepository,
    state: LiveEventsScreenState,
    replacement: PendingEventReplacement,
) {
    val scope = rememberCoroutineScope()
    TimeConflictDialog(
        conflicts = replacement.conflicts,
        isWorking = state.isAddingToItinerary,
        onKeepExisting = {
            state.pendingReplacement = null
            state.eventToAdd = null
        },
        onReplace = {
            if (userId.isNullOrBlank()) {
                state.itineraryError = "User is unavailable"
            } else {
                scope.launch {
                    addEventToItinerary(
                        repository,
                        userId,
                        replacement.itinerary,
                        replacement.activity,
                        state,
                        replaceConflicts = true,
                    )
                }
            }
        },
    )
}

@Composable
internal fun EventSelectionDialog(
    userId: String?,
    repository: ItinerariesRepository,
    state: LiveEventsScreenState,
    selectedEvent: Event,
) {
    val scope = rememberCoroutineScope()
    AddEventToItineraryDialog(
        state = AddToItineraryDialogState(
            selectedEvent,
            state.itineraries,
            state.isLoadingItineraries,
            state.isAddingToItinerary,
            state.itineraryError,
        ),
        onDismiss = { state.eventToAdd = null },
        onSelect = { itinerary, endTime ->
            if (userId.isNullOrBlank()) {
                state.itineraryError = "User is unavailable"
            } else {
                scope.launch {
                    addEventToItinerary(
                        repository,
                        userId,
                        itinerary,
                        selectedEvent.toActivityInput(endTime),
                        state,
                    )
                }
            }
        },
        onCreate = { name, endTime ->
            if (userId.isNullOrBlank()) {
                state.itineraryError = "User is unavailable"
            } else {
                scope.launch {
                    createItineraryWithEvent(
                        repository,
                        userId,
                        name,
                        selectedEvent.toActivityInput(endTime),
                        state,
                    )
                }
            }
        },
    )
}

internal suspend fun addEventToItinerary(
    repository: ItinerariesRepository,
    userId: String,
    itinerary: Itinerary,
    activity: CreateActivityInput,
    state: LiveEventsScreenState,
    replaceConflicts: Boolean = false,
) {
    state.isAddingToItinerary = true
    state.itineraryError = null
    runCatching {
        repository.addActivity(
            userId,
            itinerary.id,
            activity,
            replaceConflicts,
        )
    }.onSuccess {
        state.itineraryStatus = "Added to ${itinerary.name}."
        state.pendingReplacement = null
        state.eventToAdd = null
    }.onFailure {
        if (it is ItineraryTimeConflictException) {
            state.pendingReplacement = PendingEventReplacement(
                itinerary,
                activity,
                it.conflicts,
            )
        } else {
            state.itineraryError = it.message ?: "Unable to add event"
        }
    }
    state.isAddingToItinerary = false
}

internal suspend fun createItineraryWithEvent(
    repository: ItinerariesRepository,
    userId: String,
    itineraryName: String,
    activity: CreateActivityInput,
    state: LiveEventsScreenState,
) {
    state.isAddingToItinerary = true
    state.itineraryError = null
    runCatching {
        val itinerary = repository.createItinerary(
            userId,
            CreateItineraryInput(name = itineraryName),
        )
        repository.addActivity(userId, itinerary.id, activity)
        itinerary
    }.onSuccess {
        state.itineraryStatus = "Created ${it.name} and added the event."
        state.eventToAdd = null
    }.onFailure {
        state.itineraryError = it.message ?: "Unable to create itinerary"
    }
    state.isAddingToItinerary = false
}

@Composable
internal fun MessageWithButton(
    message: String,
    buttonText: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message)
        Button(onClick = onClick, modifier = Modifier.padding(top = 12.dp)) {
            Text(buttonText)
        }
    }
}

internal data class EventListState(
    val events: List<Event>,
    val hasMoreEvents: Boolean,
    val isLoadingMore: Boolean,
    val loadMoreError: String?,
    val itineraryStatus: String?,
)

@Composable
internal fun EventList(
    state: EventListState,
    onAddToItinerary: (Event) -> Unit,
    onLoadMore: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Live Events", style = MaterialTheme.typography.headlineMedium)
                TextButton(onClick = onRefresh) {
                    Text("Refresh")
                }
            }
        }
        if (state.itineraryStatus != null) {
            item {
                Text(state.itineraryStatus, color = MaterialTheme.colorScheme.primary)
            }
        }
        items(state.events, key = { it.id }) { event ->
            EventCard(event, onAddToItinerary)
        }
        if (state.loadMoreError != null) {
            item {
                Text(
                    text = state.loadMoreError,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        if (state.hasMoreEvents) {
            item {
                Button(
                    onClick = onLoadMore,
                    enabled = !state.isLoadingMore,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        when {
                            state.isLoadingMore -> "Loading..."
                            state.loadMoreError != null -> "Retry loading"
                            else -> "Load more"
                        },
                    )
                }
            }
        }
    }
}

@Composable
internal fun EventCard(
    event: Event,
    onAddToItinerary: (Event) -> Unit,
) {
    val uriHandler = LocalUriHandler.current

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(event.title, style = MaterialTheme.typography.titleMedium)
            Text(event.category, style = MaterialTheme.typography.labelLarge)
            Text(
                text = event.description ?: "No description available.",
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Text(formatDate(event.startDateTime))
            Text("${event.venueName}, ${event.city}")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(formatPrice(event))
                Text(String.format(Locale.CANADA, "%.1f km away", event.distanceKm))
            }
            Button(
                onClick = { uriHandler.openUri(event.ticketUrl) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("View event details")
            }
            OutlinedButton(
                onClick = { onAddToItinerary(event) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Add to itinerary")
            }
        }
    }
}

internal data class AddToItineraryDialogState(
    val event: Event,
    val itineraries: List<Itinerary>,
    val isLoading: Boolean,
    val isWorking: Boolean,
    val errorMessage: String?,
)

internal data class AddEventFormState(
    val itineraryName: String,
    val endTime: String,
    val hasValidEndTime: Boolean,
)

@Composable
internal fun AddEventToItineraryDialog(
    state: AddToItineraryDialogState,
    onDismiss: () -> Unit,
    onSelect: (Itinerary, String) -> Unit,
    onCreate: (String, String) -> Unit,
) {
    var itineraryName by remember(state.event.id) { mutableStateOf("") }
    var endTime by remember(state.event.id) { mutableStateOf(state.event.suggestedEndTime()) }
    val hasValidEndTime = endTime.isAfter(state.event.startDateTime)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add ${state.event.title}") },
        text = {
            AddEventDialogBody(
                state = state,
                form = AddEventFormState(itineraryName, endTime, hasValidEndTime),
                onNameChange = { itineraryName = it },
                onEndTimeChange = { endTime = it },
                onSelect = onSelect,
                onCreate = onCreate,
            )
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !state.isWorking) {
                Text("Cancel")
            }
        },
    )
}

@Composable
internal fun AddEventDialogBody(
    state: AddToItineraryDialogState,
    form: AddEventFormState,
    onNameChange: (String) -> Unit,
    onEndTimeChange: (String) -> Unit,
    onSelect: (Itinerary, String) -> Unit,
    onCreate: (String, String) -> Unit,
) {
    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Starts: ${formatDate(state.event.startDateTime)}")
        DateTimePickerField(
            label = "End time",
            value = form.endTime,
            onValueChange = onEndTimeChange,
            tag = "event_end_time",
        )
        if (!form.hasValidEndTime) {
            Text(
                "End time must be after the event start time.",
                color = MaterialTheme.colorScheme.error,
            )
        }
        when {
            state.isLoading -> CircularProgressIndicator()
            state.itineraries.isEmpty() -> {
                Text("You do not have an itinerary yet.")
                OutlinedTextField(
                    value = form.itineraryName,
                    onValueChange = onNameChange,
                    label = { Text("Itinerary name") },
                    enabled = !state.isWorking,
                )
                Button(
                    onClick = { onCreate(form.itineraryName.trim(), form.endTime) },
                    enabled = form.itineraryName.isNotBlank() &&
                        form.hasValidEndTime && !state.isWorking,
                ) {
                    Text(if (state.isWorking) "Creating..." else "Create and add")
                }
            }
            else -> state.itineraries.forEach { itinerary ->
                OutlinedButton(
                    onClick = { onSelect(itinerary, form.endTime) },
                    enabled = form.hasValidEndTime && !state.isWorking,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(itinerary.name)
                }
            }
        }
        if (state.errorMessage != null) {
            Text(state.errorMessage, color = MaterialTheme.colorScheme.error)
        }
    }
}

internal fun Event.suggestedEndTime(): String {
    val providedEndTime = endDateTime
    return if (providedEndTime != null && providedEndTime.isAfter(startDateTime)) {
        providedEndTime
    } else {
        Instant.parse(startDateTime).plusSeconds(2 * 60 * 60).toString()
    }
}

internal fun String.isAfter(startTime: String): Boolean =
    runCatching { Instant.parse(this).isAfter(Instant.parse(startTime)) }.getOrDefault(false)

internal fun Event.toActivityInput(endTime: String): CreateActivityInput =
    CreateActivityInput(
        name = title,
        image = imageUrl,
        description = description,
        category = category,
        location = "$venueName, $city",
        startTime = startDateTime,
        endTime = endTime,
    )

internal fun formatDate(value: String): String = try {
    val formatter = DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a")
    Instant.parse(value).atZone(ZoneId.systemDefault()).format(formatter)
} catch (_: Exception) {
    value
}

internal fun formatPrice(event: Event): String {
    val currency = event.currency ?: ""
    return when {
        event.priceMin != null && event.priceMax != null ->
            "$currency ${formatAmount(event.priceMin)} - ${formatAmount(event.priceMax)}"
        event.priceMin != null -> "$currency ${formatAmount(event.priceMin)}"
        else -> "Price unavailable"
    }
}

internal fun formatAmount(amount: Double): String =
    String.format(Locale.CANADA, "%.2f", amount)
