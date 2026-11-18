package com.example.cpen321application.core.ui.components

import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import com.example.cpen321application.core.ui.theme.DonutTheme

private const val SPIN_MS = 1100
private const val FULL_TURN = 360f
// The moving arc covers a quarter of the ring
private const val ARC_SWEEP = 90f

/**
 * @return true when the user turned animations off (Developer options or Accessibility → Remove animations)
 */
@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/**
 * A thin ring with a green arc that turns once every 1.1 s. With animations off it stays still.
 * @param size the ring's diameter
 */
@Composable
fun RingSpinner(modifier: Modifier = Modifier, size: Dp = 20.dp) {
    val track = MaterialTheme.colorScheme.outlineVariant
    val arc = MaterialTheme.colorScheme.secondary
    val reducedMotion = rememberReducedMotion()
    val rotation = if (reducedMotion) {
        0f
    } else {
        val transition = rememberInfiniteTransition(label = "spinner")
        val angle by transition.animateFloat(
            initialValue = 0f,
            targetValue = FULL_TURN,
            animationSpec = infiniteRepeatable(tween(SPIN_MS, easing = LinearEasing), RepeatMode.Restart),
            label = "angle",
        )
        angle
    }
    Canvas(
        modifier = modifier
            .size(size)
            .semantics { progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate },
    ) {
        val width = 2.dp.toPx()
        drawCircle(color = track, radius = this.size.minDimension / 2 - width / 2, style = Stroke(width))
        drawArc(
            color = arc,
            startAngle = rotation - FULL_TURN / 4,
            sweepAngle = ARC_SWEEP,
            useCenter = false,
            topLeft = Offset(width / 2, width / 2),
            size = Size(this.size.width - width, this.size.height - width),
            style = Stroke(width, cap = StrokeCap.Round),
        )
    }
}

/**
 * A dark snackbar-style message, e.g. "Friend request sent", with a close button
 * @param message what happened
 * @param isError leaves out the success check
 * @param onDismiss hides the message
 */
@Composable
fun MessageBanner(message: String, isError: Boolean, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = colors.inverseSurface,
        contentColor = colors.inverseOnSurface,
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Errors say what went wrong in the text; successes get a ball-yellow check
            if (!isError) {
                Icon(
                    painter = painterResource(R.drawable.ic_check),
                    contentDescription = null,
                    tint = DonutTheme.colors.highlight,
                    modifier = Modifier.size(20.dp),
                )
            }
            Text(text = message, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            IconButton(onClick = onDismiss) {
                Icon(painterResource(R.drawable.ic_close), contentDescription = "Dismiss")
            }
        }
    }
}
