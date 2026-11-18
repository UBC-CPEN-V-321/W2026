package com.exploreUBC.cpen321application.ui.map

import android.content.Context
import com.exploreUBC.cpen321application.R
import com.exploreUBC.cpen321application.data.itineraries.ItineraryMap
import com.exploreUBC.cpen321application.data.itineraries.MapMarker
import com.exploreUBC.cpen321application.data.itineraries.MapRoute

internal object MapItineraryText {
    fun markerSnippet(context: Context, marker: MapMarker, routes: List<MapRoute>): String =
        buildString {
            append(marker.address)
            if (marker.isApproximate) {
                append('\n')
                append(context.getString(R.string.map_marker_approximate))
            }
            val route = routes.find { it.fromActivityId == marker.activityId }
            val summary = route?.let(::travelSummary).orEmpty()
            if (summary.isNotBlank()) {
                append('\n')
                append(summary)
            }
        }

    fun travelSummary(route: MapRoute): String {
        val parts = mutableListOf<String>()
        route.walking?.let { option ->
            parts += "Walk ${formatMapDuration(option.durationSeconds)}"
        }
        route.driving?.let { option ->
            parts += "Drive ${formatMapDuration(option.durationSeconds)}"
        }
        return parts.joinToString(" · ")
    }

    private fun formatMapDuration(seconds: Double): String {
        val totalMinutes = kotlin.math.round(seconds / 60.0).toInt().coerceAtLeast(1)
        val hours = totalMinutes / 60
        val minutes = totalMinutes % 60
        return if (hours > 0) "${hours} hr ${minutes} min" else "$totalMinutes min"
    }

    fun statusMessage(context: Context, itineraryMap: ItineraryMap): String {
        val parts = mutableListOf<String>()
        if (itineraryMap.markers.isEmpty()) {
            parts += context.getString(R.string.map_no_activities)
        } else if (itineraryMap.routes.isEmpty() && itineraryMap.markers.size >= 2) {
            parts += context.getString(R.string.map_routes_empty)
        } else if (itineraryMap.routes.isNotEmpty()) {
            parts += itineraryMap.routes.joinToString("  ") { route ->
                travelSummary(route).ifBlank {
                    context.getString(R.string.map_routes_ready)
                }
            }
        }
        if (itineraryMap.unmappedActivities.isNotEmpty()) {
            val names = itineraryMap.unmappedActivities.joinToString { it.title }
            parts += context.getString(R.string.map_unmapped_stops, names)
        }
        if (itineraryMap.markers.any { it.isApproximate }) {
            parts += context.getString(R.string.map_approximate_locations)
        }
        return parts.joinToString(" ").ifBlank {
            context.getString(R.string.map_routes_ready)
        }
    }
}
