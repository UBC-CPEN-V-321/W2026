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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.exploreUBC.cpen321application.data.itineraries.Itinerary
import java.util.Locale

data class TripsListModel(
    val savedItineraries: List<Itinerary>,
    val recommendedItineraries: List<Itinerary>,
    val isLoading: Boolean,
    val isCreating: Boolean,
    val isGenerating: Boolean,
    val statusMessage: String?,
)

data class TripsListActions(
    val onItineraryClick: (Itinerary) -> Unit,
    val onCreateItinerary: () -> Unit,
    val onGenerateRecommendations: () -> Unit,
)

private data class ItinerarySectionModel(
    val title: String,
    val emptyMessage: String,
    val itineraries: List<Itinerary>,
    val tagPrefix: String,
    val showGenerateAction: Boolean = false,
    val showCreateAction: Boolean = false,
    val isCreating: Boolean = false,
    val isGenerating: Boolean = false,
)

@Composable
fun TripsList(
    model: TripsListModel,
    actions: TripsListActions,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(
                text = "Trips",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 20.dp),
            )
        }
        if (model.isLoading) {
            item { CircularProgressIndicator(modifier = Modifier.testTag("trips_loading")) }
        }
        model.statusMessage?.let { message ->
            item { Text(message, modifier = Modifier.testTag("trips_status")) }
        }
        itinerarySection(
            model = ItinerarySectionModel(
                title = "Saved Itineraries",
                emptyMessage = "No saved itineraries.",
                itineraries = model.savedItineraries,
                tagPrefix = "saved",
                showCreateAction = true,
                isCreating = model.isCreating,
            ),
            actions = actions,
        )
        itinerarySection(
            model = ItinerarySectionModel(
                title = "Recommended Itineraries",
                emptyMessage = "No recommended itineraries.",
                itineraries = model.recommendedItineraries,
                tagPrefix = "recommended",
                showGenerateAction = true,
                isGenerating = model.isGenerating,
            ),
            actions = actions,
        )
        item { Spacer(Modifier.height(16.dp)) }
    }
}

private fun LazyListScope.itinerarySection(
    model: ItinerarySectionModel,
    actions: TripsListActions,
) {
    item { ItinerarySectionHeader(model, actions) }
    if (model.itineraries.isEmpty()) {
        item { Text(model.emptyMessage) }
    } else {
        items(model.itineraries, key = { "${model.tagPrefix}-${it.id}" }) { itinerary ->
            ItineraryCard(itinerary, model.tagPrefix, actions.onItineraryClick)
        }
    }
}

@Composable
private fun ItinerarySectionHeader(model: ItinerarySectionModel, actions: TripsListActions) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = model.title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
        )
        if (model.showCreateAction) {
            Button(
                onClick = actions.onCreateItinerary,
                enabled = !model.isCreating,
                modifier = Modifier.testTag("create_itinerary"),
            ) {
                if (model.isCreating) {
                    CircularProgressIndicator(
                        modifier = Modifier.width(18.dp).height(18.dp)
                            .testTag("create_itinerary_loading"),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text("Create")
                }
            }
        }
        if (model.showGenerateAction) {
            Button(
                onClick = actions.onGenerateRecommendations,
                enabled = !model.isGenerating,
                modifier = Modifier.testTag("generate_recommendations"),
            ) {
                if (model.isGenerating) GenerateProgress() else Text("Generate")
            }
        }
    }
}

@Composable
private fun GenerateProgress() {
    CircularProgressIndicator(
        modifier = Modifier.width(18.dp).height(18.dp)
            .testTag("generate_recommendations_loading"),
        strokeWidth = 2.dp,
    )
    Spacer(Modifier.width(8.dp))
    Text("Generating…")
}

@Composable
private fun ItineraryCard(
    itinerary: Itinerary,
    tagPrefix: String,
    onClick: (Itinerary) -> Unit,
) {
    Card(
        onClick = { onClick(itinerary) },
        modifier = Modifier.fillMaxWidth().testTag("${tagPrefix}_itinerary_${itinerary.id}"),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(itinerary.name, fontWeight = FontWeight.Bold)
            itinerary.description?.takeIf(String::isNotBlank)?.let { Text(it) }
            ItineraryCardFooter(itinerary)
        }
    }
}

@Composable
private fun ItineraryCardFooter(itinerary: Itinerary) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(text = "${itinerary.items.size} items", modifier = Modifier.weight(1f))
        val score = itinerary.score["interestSimilarityOutOfFive"]
        if (itinerary.inRecommendation && score != null) {
            Text(
                text = String.format(Locale.US, "%.1f/5", score),
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("recommended_itinerary_score_${itinerary.id}"),
            )
        }
    }
}
