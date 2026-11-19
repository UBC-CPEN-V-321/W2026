package com.example.cpen321application.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.cpen321application.core.ui.theme.DonutTheme

// The halo is the live colour at 20%, twice the dot's size
private const val HALO_ALPHA = 0.2f

/**
 * A green dot with a soft halo, for something happening right now, e.g. a match found or a friend playing
 * @param dotSize the dot's diameter; the halo around it is twice as wide
 */
@Composable
fun LiveDot(modifier: Modifier = Modifier, dotSize: Dp = 8.dp) {
    val live = DonutTheme.colors.live
    Box(
        modifier = modifier
            .size(dotSize * 2)
            .background(live.copy(alpha = HALO_ALPHA), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Box(modifier = Modifier.size(dotSize).background(live, CircleShape))
    }
}

/**
 * The live dot, then the state in small caps, e.g. "MATCH FOUND" or "PLAYING NOW"
 */
@Composable
fun LiveLabel(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LiveDot()
        Text(text = text.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
    }
}

/**
 * A smaller live dot and a short state in the list's second-line style, e.g. "Playing", for a row
 */
@Composable
fun LiveStatusText(text: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        LiveDot(dotSize = 6.dp)
        Text(text = text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
    }
}
