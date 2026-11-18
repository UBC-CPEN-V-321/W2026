package com.example.cpen321application.feature.matchmaking

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.cpen321application.core.ui.components.HIDE_PLACES_STYLE
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.GoogleMapComposable
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.rememberCameraPositionState
import kotlin.math.PI
import kotlin.math.sin

private val QueueMapHeight = 160.dp

// The backend's matching radius (MAX_DISTANCE_KM), drawn as a faint circle
private const val MATCH_RADIUS_M = 10_000.0

// Fits the 10 km circle in the card's map
private const val QUEUE_MAP_ZOOM = 9.4f

// One sweep of the radar ring, from the player out to 10 km
private const val RADAR_MS = 2400

// One pulse of a player's dot
private const val TWINKLE_MS = 1800

// How long a dot takes to appear or disappear
private const val FADE_MS = 600

// The dots are sized in metres, which works because the map can't be zoomed
private const val OWN_DOT_RADIUS_M = 750.0
private const val PLAYER_DOT_RADIUS_M = 600.0

// Fill opacities of the map's shapes
private const val RADIUS_FILL_ALPHA = 0.04f
private const val RADIUS_STROKE_ALPHA = 0.5f
private const val RADAR_FILL_ALPHA = 0.12f
private const val RADAR_STROKE_ALPHA = 0.6f

// Each dot grows and shrinks between 80% and 120% of its size, and fades between 60% and 100%
private const val TWINKLE_MIN_SIZE = 0.8
private const val TWINKLE_SIZE_RANGE = 0.4
private const val TWINKLE_MIN_ALPHA = 0.6f
private const val TWINKLE_ALPHA_RANGE = 0.4f

private const val DOT_OUTLINE_ALPHA = 0.7f

// Spreads the dots' pulses over 256 steps of a cycle
private const val PHASE_STEPS = 256

/**
 * A dot on the map
 * @param copy tells apart players the backend rounded to the same point
 */
data class DotKey(val point: MapPoint, val copy: Int)

/**
 * @return one key per player, numbering the players rounded to the same point
 */
fun dotKeys(players: List<MapPoint>): List<DotKey> {
    val copies = mutableMapOf<MapPoint, Int>()
    val keys = mutableListOf<DotKey>()
    for (point in players) {
        val copy = copies.getOrDefault(point, 0)
        copies[point] = copy + 1
        keys.add(DotKey(point, copy))
    }
    return keys
}

/**
 * The dots to draw: the ones already drawn, still searching or fading out, then the new ones
 */
fun dotsToDraw(drawn: List<DotKey>, latest: List<DotKey>): List<DotKey> {
    return drawn + latest.filter { it !in drawn }
}

// The map only shows what is around the player: no gestures and no buttons
private val StaticMapSettings = MapUiSettings(
    compassEnabled = false,
    mapToolbarEnabled = false,
    myLocationButtonEnabled = false,
    rotationGesturesEnabled = false,
    scrollGesturesEnabled = false,
    tiltGesturesEnabled = false,
    zoomControlsEnabled = false,
    zoomGesturesEnabled = false
)

/**
 * A map of where the player is searching and the other players searching nearby. A radar ring pulses out from
 * the player to the 10 km matching radius, and the other players are dots that fade in, twinkle and fade out.
 * @param nearby null until the first load, which shows an empty box of the same size
 */
@Composable
internal fun QueueMap(nearby: NearbyPlayers?, modifier: Modifier = Modifier) {
    val mapModifier = modifier
        .fillMaxWidth()
        .height(QueueMapHeight)
    if (nearby == null) {
        Box(modifier = mapModifier.background(MaterialTheme.colorScheme.surfaceVariant))
        return
    }

    val center = LatLng(nearby.center.latitude, nearby.center.longitude)
    val cameraPositionState = rememberCameraPositionState()
    val properties = remember { MapProperties(mapStyleOptions = MapStyleOptions(HIDE_PLACES_STYLE)) }
    val latest = dotKeys(nearby.players)
    var drawn by remember { mutableStateOf(emptyList<DotKey>()) }
    val colors = MaterialTheme.colorScheme
    val radar by rememberLoop(RADAR_MS, LinearOutSlowInEasing)
    val twinkle by rememberLoop(TWINKLE_MS, LinearEasing)

    LaunchedEffect(center) {
        cameraPositionState.position = CameraPosition.fromLatLngZoom(center, QUEUE_MAP_ZOOM)
    }
    // Players who left stay drawn until they fade out
    LaunchedEffect(latest) {
        drawn = dotsToDraw(drawn, latest)
    }

    GoogleMap(
        modifier = mapModifier,
        cameraPositionState = cameraPositionState,
        properties = properties,
        uiSettings = StaticMapSettings,
        contentDescription = nearbyText(nearby)
    ) {
        SearchArea(center = center, radar = radar, color = colors.primary, outline = colors.surface)
        drawn.forEach { dot ->
            key(dot) {
                PlayerDot(
                    dot = dot,
                    isSearching = dot in latest,
                    twinkle = twinkle,
                    color = colors.tertiary,
                    outline = colors.onSurface,
                    onFadedOut = { drawn = drawn - dot }
                )
            }
        }
    }
}

/**
 * @return a value going from 0 to 1 over and over, once every durationMs
 */
@Composable
private fun rememberLoop(durationMs: Int, easing: Easing): State<Float> {
    return rememberInfiniteTransition(label = "queue map").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(durationMs, easing = easing)),
        label = "loop"
    )
}

/**
 * The player's dot, the 10 km matching radius around it, and the radar ring that grows to it and fades
 * @param radar how far the ring has grown, from 0 to 1
 */
@Composable
@GoogleMapComposable
private fun SearchArea(center: LatLng, radar: Float, color: Color, outline: Color) {
    Circle(
        center = center,
        radius = MATCH_RADIUS_M,
        fillColor = color.copy(alpha = RADIUS_FILL_ALPHA),
        strokeColor = color.copy(alpha = RADIUS_STROKE_ALPHA),
        strokeWidth = 3f
    )
    Circle(
        center = center,
        radius = MATCH_RADIUS_M * radar,
        fillColor = color.copy(alpha = (1 - radar) * RADAR_FILL_ALPHA),
        strokeColor = color.copy(alpha = (1 - radar) * RADAR_STROKE_ALPHA),
        strokeWidth = 4f
    )
    // The player, on top of the other players' dots
    Circle(
        center = center,
        radius = OWN_DOT_RADIUS_M,
        fillColor = color,
        strokeColor = outline,
        strokeWidth = 4f,
        zIndex = 1f
    )
}

/**
 * Another player: fades in, twinkles while they search, and fades out once they leave or are matched
 * @param twinkle the shared pulse, from 0 to 1; each dot is offset from it so they don't blink together
 * @param outline keeps the dot visible on light parts of the map
 * @param onFadedOut called once the dot is gone, to stop drawing it
 */
@Composable
@GoogleMapComposable
private fun PlayerDot(
    dot: DotKey,
    isSearching: Boolean,
    twinkle: Float,
    color: Color,
    outline: Color,
    onFadedOut: () -> Unit
) {
    val shown = remember { Animatable(0f) }
    LaunchedEffect(isSearching) {
        if (isSearching) {
            shown.animateTo(1f, tween(FADE_MS))
        } else {
            shown.animateTo(0f, tween(FADE_MS))
            onFadedOut()
        }
    }

    val offset = (dot.hashCode() and (PHASE_STEPS - 1)).toFloat() / PHASE_STEPS
    // From 0 to 1 and back, once per pulse
    val wave = (sin((twinkle + offset) * 2 * PI) + 1) / 2
    Circle(
        center = LatLng(dot.point.latitude, dot.point.longitude),
        radius = PLAYER_DOT_RADIUS_M * shown.value * (TWINKLE_MIN_SIZE + TWINKLE_SIZE_RANGE * wave),
        fillColor = color.copy(alpha = shown.value * (TWINKLE_MIN_ALPHA + TWINKLE_ALPHA_RANGE * wave.toFloat())),
        strokeColor = outline.copy(alpha = shown.value * DOT_OUTLINE_ALPHA),
        strokeWidth = 2f
    )
}

/**
 * The line under the queue card's map, also read out for the map
 * @param nearby null until the first load
 */
fun nearbyText(nearby: NearbyPlayers?): String {
    if (nearby == null) {
        return "Looking for players nearby…"
    }
    val count = nearby.players.size
    if (count == 0) {
        return "No one else is searching nearby yet"
    }
    if (count == 1) {
        return "1 other player is searching nearby"
    }
    return "$count other players are searching nearby"
}
