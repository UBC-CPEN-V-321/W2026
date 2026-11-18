package com.exploreUBC.cpen321application.data.itineraries

import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

internal object ItineraryJsonParser {
    fun parseItinerary(json: JSONObject): Itinerary {
        val itemJson = json.getJSONArray("items")
        val scoreJson = json.getJSONObject("score")
        return Itinerary(
            id = json.getString("id"),
            ownerId = json.getString("ownerId"),
            name = json.getString("name"),
            description = json.optionalString("description"),
            startingLocation = json.optionalString("startingLocation"),
            items = List(itemJson.length()) { index -> parseItem(itemJson.getJSONObject(index)) },
            createdAt = json.getString("createdAt"),
            updatedAt = json.getString("updatedAt"),
            saved = json.getBoolean("saved"),
            inRecommendation = json.getBoolean("inRecommendation"),
            score = scoreJson.keys().asSequence().associateWith { key -> scoreJson.getDouble(key) },
        )
    }

    fun parseItem(json: JSONObject): ItineraryItem = when (json.getString("type")) {
        "activity" -> ActivityItem(
            id = json.getString("id"),
            name = json.getString("name"),
            image = json.getString("image"),
            description = json.optionalString("description"),
            category = json.optionalString("category"),
            location = json.getString("location"),
            startTime = json.getString("startTime"),
            endTime = json.getString("endTime"),
        )
        "transportation" -> TransportationItem(
            id = json.getString("id"),
            mode = json.getString("mode"),
            startLocation = json.getString("startLocation"),
            endLocation = json.getString("endLocation"),
            distanceMeters = json.getDouble("distanceMeters"),
            startTime = json.getString("startTime"),
            endTime = json.getString("endTime"),
        )
        else -> throw IOException("Unknown itinerary item type: ${json.optString("type")}")
    }

    fun parseItineraryMap(json: JSONObject): ItineraryMap {
        val markersJson = json.getJSONArray("markers")
        val routesJson = json.getJSONArray("routes")
        val unmappedJson = json.getJSONArray("unmappedActivities")
        return ItineraryMap(
            itineraryId = json.getString("itineraryId"),
            ownerId = json.getString("ownerId"),
            itineraryUpdatedAt = json.getString("itineraryUpdatedAt"),
            markers = List(markersJson.length()) { index ->
                parseMapMarker(markersJson.getJSONObject(index))
            },
            routes = List(routesJson.length()) { index ->
                parseMapRoute(routesJson.getJSONObject(index))
            },
            unmappedActivities = List(unmappedJson.length()) { index ->
                parseUnmappedActivity(unmappedJson.getJSONObject(index))
            },
            generatedAt = json.getString("generatedAt"),
        )
    }

    private fun parseMapMarker(json: JSONObject): MapMarker {
        val coordinates = json.getJSONObject("coordinates")
        return MapMarker(
            activityId = json.getString("activityId"),
            title = json.getString("title"),
            address = json.getString("address"),
            placeId = json.optString("placeId"),
            coordinates = MapCoordinates(
                latitude = coordinates.getDouble("latitude"),
                longitude = coordinates.getDouble("longitude"),
            ),
            isApproximate = json.optBoolean("isApproximate", false),
        )
    }

    private fun parseMapRoute(json: JSONObject): MapRoute = MapRoute(
        fromActivityId = json.getString("fromActivityId"),
        toActivityId = json.getString("toActivityId"),
        transportationMode = json.optString("transportationMode"),
        encodedPolyline = json.optString("encodedPolyline"),
        distanceMeters = json.optDouble("distanceMeters", 0.0),
        durationSeconds = json.optDouble("durationSeconds", 0.0),
        walking = json.optionalTravelOption("walking"),
        driving = json.optionalTravelOption("driving"),
    )

    private fun JSONObject.optionalTravelOption(key: String): TravelOption? =
        if (has(key) && !isNull(key)) parseTravelOption(getJSONObject(key)) else null

    private fun parseTravelOption(json: JSONObject): TravelOption {
        val stepsJson = json.optJSONArray("steps") ?: JSONArray()
        return TravelOption(
            encodedPolyline = json.optString("encodedPolyline"),
            distanceMeters = json.optDouble("distanceMeters", 0.0),
            durationSeconds = json.optDouble("durationSeconds", 0.0),
            steps = List(stepsJson.length()) { index ->
                RouteStep(stepsJson.getJSONObject(index).optString("instruction"))
            }.filter { step -> step.instruction.isNotBlank() },
        )
    }

    private fun parseUnmappedActivity(json: JSONObject): UnmappedActivity = UnmappedActivity(
        activityId = json.getString("activityId"),
        title = json.getString("title"),
        address = json.optString("address"),
    )

    private fun JSONObject.optionalString(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null
}
