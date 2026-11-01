package com.exploreUBC.cpen321application.ui.map

import android.content.Context
import android.view.View
import androidx.core.content.ContextCompat
import com.example.cpen321application.maps.PolylineDecoder
import com.exploreUBC.cpen321application.R
import com.exploreUBC.cpen321application.data.itineraries.MapRoute
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds

internal fun routePolylinePoints(route: MapRoute, travelMode: TripTravelMode): List<LatLng> {
    val selectedRoute = when (travelMode) {
        TripTravelMode.WALKING -> route.walking
        TripTravelMode.DRIVING -> route.driving
    }
    val encoded = selectedRoute?.encodedPolyline?.takeIf { it.isNotBlank() } ?: route.encodedPolyline
    return runCatching { PolylineDecoder.decode(encoded) }.getOrDefault(emptyList())
}

internal fun routePolylineColor(
    selected: Boolean,
    travelMode: TripTravelMode,
    context: Context,
): Int {
    val colorRes = if (!selected) {
        R.color.text_secondary
    } else if (travelMode == TripTravelMode.WALKING) {
        R.color.ubc_gold
    } else {
        R.color.ubc_blue_mid
    }
    return ContextCompat.getColor(context, colorRes)
}

internal fun fitMapCamera(map: GoogleMap, points: List<LatLng>, hostView: View) {
    if (points.isEmpty()) return
    if (points.size == 1) {
        map.moveCamera(CameraUpdateFactory.newLatLngZoom(points.first(), 15f))
        return
    }

    val bounds = LatLngBounds.builder().apply { points.forEach { include(it) } }.build()
    try {
        if (hostView.width > 0 && hostView.height > 0) {
            map.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds, 160))
        } else {
            map.moveCamera(CameraUpdateFactory.newLatLngZoom(points.first(), 14f))
        }
    } catch (_: IllegalStateException) {
        map.moveCamera(CameraUpdateFactory.newLatLngZoom(points.first(), 14f))
    }
}
