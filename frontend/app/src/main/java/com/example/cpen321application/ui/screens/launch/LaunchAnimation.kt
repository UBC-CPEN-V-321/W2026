package com.example.cpen321application.ui.screens.launch

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.lerp
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import com.example.cpen321application.R
import com.example.cpen321application.ui.theme.SportsOnSurface
import com.example.cpen321application.ui.theme.SportsPrimary
import com.example.cpen321application.ui.theme.SportsSurfaceContainer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

// Timeline in ms: three smears orbit in, collide, then the logo pops out of the impact
private const val T_START = 80f
private const val T_HIT = 900f
private const val T_LOGO = 960f
private const val T_END = 2450f
private const val PI_F = PI.toFloat()
private const val TWO_PI = 2 * PI_F
// straight up, where the first smear starts
private const val UP = -PI_F / 2

// Plays the timeline above this many times faster (1.5 = about 1.6 s in total)
private const val SPEED = 1.5f

// How long the finished animation takes to fade out, at the same speed
val LAUNCH_FADE_OUT_MS = (250 / SPEED).toInt()

// The animation is designed on a 360 x 760 phone and scaled to the real screen
private const val DESIGN_W = 360f
private const val DESIGN_H = 760f

private val Background = SportsSurfaceContainer
private val BackgroundCentre = Color(0xFFDFE8F6)
private val FlashColor = SportsPrimary

private class Smear(val color: Color, val startAngle: Float)

private val SMEARS = listOf(
    Smear(Color(0xFFF08A24), UP),
    Smear(Color(0xFFCFE23A), UP + TWO_PI / 3),
    Smear(Color(0xFF16181D), UP + 2 * TWO_PI / 3),
)

private class Spark(val angle: Float, val speed: Float, val size: Float, val color: Color)

// Each ball's picture, where it sits on the orbit ring around the word (degrees), and its radius in design units
private class LogoBall(val drawable: Int, val ringAngle: Float, val r: Float)

private val LOGO_BALLS = listOf(
    LogoBall(R.drawable.ball_basketball, 205f, 21f),
    LogoBall(R.drawable.ball_soccer, 95f, 14f),
    LogoBall(R.drawable.ball_tennis, -20f, 12f),
)
private const val WORD_SIZE = 62f
// space kept free beside the word for the ring and balls (design units)
private const val RING_MARGIN = 110f
// how far the ring reaches past the ends of the word, and how tall it is relative to the word size
private const val RING_PAD_X = 34f
private const val RING_HEIGHT = .95f
private const val RING_TILT_DEGREES = -12f

private val Wordmark = FontFamily(Font(R.font.barlow_condensed_extrabold_italic, FontWeight.ExtraBold, FontStyle.Italic))

/**
 * Full-screen launch animation. Plays once (about 1.6 s at [SPEED] 1.5) and then calls [onFinished].
 * Blocks touches while it is showing so taps don't reach the screen underneath.
 */
@Composable
fun LaunchAnimation(onFinished: () -> Unit, modifier: Modifier = Modifier) {
    val finished by rememberUpdatedState(onFinished)
    val time = remember { Animatable(0f) }
    val sparks = remember {
        List(42) { i ->
            Spark(
                angle = Random.nextFloat() * TWO_PI,
                speed = 140f + Random.nextFloat() * 240f,
                size = 1.8f + Random.nextFloat() * 3.4f,
                color = SMEARS[i % 3].color,
            )
        }
    }
    val textMeasurer = rememberTextMeasurer()
    val ballPictures = LOGO_BALLS.map { painterResource(it.drawable) }

    LaunchedEffect(Unit) {
        time.animateTo(T_END, tween(durationMillis = (T_END / SPEED).toInt(), easing = LinearEasing))
        finished()
    }

    Canvas(
        modifier
            .fillMaxSize()
            .semantics { contentDescription = "SportsNow" }
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) awaitPointerEvent().changes.forEach { it.consume() }
                }
            }
    ) {
        val t = time.value
        val u = min(size.width / DESIGN_W, size.height / DESIGN_H)
        val centre = Offset(size.width / 2, size.height * 0.46f)

        drawRect(
            Brush.radialGradient(
                listOf(BackgroundCentre, Background),
                center = centre,
                radius = size.height * 0.75f,
            )
        )

        // short screen shake just after the impact
        val shake = if (t > T_HIT && t < T_HIT + 260) (1 - (t - T_HIT) / 260) * 4 * u else 0f
        translate((Random.nextFloat() - .5f) * 2 * shake, (Random.nextFloat() - .5f) * 2 * shake) {
            if (t < T_HIT) drawOrbit(t, u, centre) else drawImpact(t, u, centre, sparks)
            if (t >= T_LOGO) {
                drawLogo(t - T_LOGO, u, centre, ballPictures) { fontPx ->
                    val style = TextStyle(fontFamily = Wordmark, fontSize = fontPx.toSp())
                    textMeasurer.measure("Sports", style) to textMeasurer.measure("Now", style)
                }
            }
        }
    }
}

// ---------- phases ----------

private fun orbitPosition(smear: Smear, time: Float, u: Float, centre: Offset): Offset {
    val p = ((time - T_START) / (T_HIT - T_START)).coerceIn(0f, 1f)
    val radius = 118f * u * (1 - p * p * p)
    // a falling angle turns anticlockwise on screen; three-quarters of a turn in total, speeding up
    val theta = smear.startAngle - 0.75f * TWO_PI * p * p
    return Offset(centre.x + cos(theta) * radius, centre.y + sin(theta) * radius)
}

private fun DrawScope.drawOrbit(t: Float, u: Float, centre: Offset) {
    val appear = easeOutBack((t / 320f).coerceIn(0f, 1f)).coerceIn(0f, 1.1f)
    val fadeIn = (t / 400f).coerceIn(0f, 1f)
    val steps = 22
    SMEARS.forEach { smear ->
        // the smear: soft blobs back along the path, thinning and fading
        for (i in steps downTo 1) {
            val k = i.toFloat() / steps
            val point = orbitPosition(smear, t - i * 11, u, centre)
            blob(point, 22f * u * appear * (1 - k * .55f), smear.color, (1 - k).pow(1.6f) * .45f * fadeIn)
        }
        blob(orbitPosition(smear, t, u, centre), 24f * u * appear, smear.color, 1f)
    }
}

private fun DrawScope.drawImpact(t: Float, u: Float, centre: Offset, sparks: List<Spark>) {
    val s = (t - T_HIT) / 1000f
    if (s < .22f) {
        val a = 1 - s / .22f
        drawRect(
            Brush.radialGradient(
                listOf(FlashColor.copy(alpha = .9f * a), FlashColor.copy(alpha = 0f)),
                center = centre,
                radius = 140f * u,
            )
        )
    }
    if (s < .5f) {
        val k = easeOutCubic(s / .5f)
        drawCircle(
            FlashColor.copy(alpha = .7f * (1 - k)),
            radius = (10f + 170f * k) * u,
            center = centre,
            style = Stroke(width = (3 * (1 - k) + .5f) * u),
        )
    }
    if (s < .9f) {
        val alpha = (1 - s / .9f).coerceIn(0f, 1f)
        sparks.forEach { spark ->
            val distance = spark.speed * (1 - exp(-4 * s)) / 4 * u
            drawCircle(
                spark.color.copy(alpha = alpha),
                radius = spark.size * (1 - s * .6f) * u,
                center = centre + Offset(cos(spark.angle) * distance, sin(spark.angle) * distance),
            )
        }
    }
}

private fun DrawScope.drawLogo(
    elapsed: Float,
    u: Float,
    centre: Offset,
    ballPictures: List<Painter>,
    measure: (Float) -> Pair<TextLayoutResult, TextLayoutResult>,
) {
    // fit the word in the middle, leaving room either side for the ring and balls
    var fontPx = WORD_SIZE * u
    var (sports, now) = measure(fontPx)
    val maxWidth = (DESIGN_W - RING_MARGIN) * u
    val fullWidth = (sports.size.width + now.size.width).toFloat()
    if (fullWidth > maxWidth) {
        fontPx *= maxWidth / fullWidth
        val fitted = measure(fontPx)
        sports = fitted.first
        now = fitted.second
    }
    val wordWidth = (sports.size.width + now.size.width).toFloat()
    val wordX = centre.x - wordWidth / 2
    val wordY = centre.y

    // the orbit ring: a tilted ellipse around the word
    val ringRx = wordWidth / 2 + RING_PAD_X * u
    val ringRy = fontPx * RING_HEIGHT
    val tilt = radians(RING_TILT_DEGREES)
    fun onRing(degrees: Float): Offset {
        val a = radians(degrees)
        val x = cos(a) * ringRx
        val y = sin(a) * ringRy
        return centre + Offset(x * cos(tilt) - y * sin(tilt), x * sin(tilt) + y * cos(tilt))
    }

    // the word and ring pop in together with a small overshoot
    val qw = ((elapsed - 110f) / 560f).coerceIn(0f, 1f)
    if (qw > 0f) {
        val scale = max(0.01f, lerp(.55f, 1f, easeOutBack(qw)))
        val alpha = (qw * 2.2f).coerceIn(0f, 1f)
        val top = wordY - sports.size.height / 2f
        withTransform({ scale(scale, scale, pivot = Offset(centre.x, wordY)) }) {
            rotateRad(tilt, pivot = centre) {
                drawOval(
                    SportsPrimary.copy(alpha = .35f * alpha),
                    topLeft = centre - Offset(ringRx, ringRy),
                    size = Size(ringRx * 2, ringRy * 2),
                    style = Stroke(width = 1.5f * u, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f * u, 5f * u))),
                )
            }
            drawText(sports, color = SportsOnSurface, topLeft = Offset(wordX, top), alpha = alpha)
            drawText(now, color = SportsPrimary, topLeft = Offset(wordX + sports.size.width, top), alpha = alpha)
        }
    }

    // the balls fly out of the impact point onto the ring, spinning anticlockwise to rest
    LOGO_BALLS.forEachIndexed { i, ball ->
        val q = ((elapsed - i * 70f) / 540f).coerceIn(0f, 1f)
        if (q > 0f) {
            val e = easeOutBack(q)
            val position = lerp(centre, onRing(ball.ringAngle), e)
            val rotation = (1 - easeOutCubic(q)) * TWO_PI * 1.25f
            sportBall(ballPictures[i], position, ball.r * u * e.coerceIn(0f, 1.15f), rotation, ringWidth = 2.2f * u)
        }
    }
}

// ---------- drawing helpers ----------

// soft, borderless blob: solid core fading out to nothing
private fun DrawScope.blob(at: Offset, radius: Float, color: Color, alpha: Float) {
    if (radius <= .5f || alpha <= 0f) return
    drawCircle(
        Brush.radialGradient(
            0f to color.copy(alpha = alpha),
            .4f to color.copy(alpha = alpha * .85f),
            1f to color.copy(alpha = 0f),
            center = at,
            radius = radius,
        ),
        radius = radius,
        center = at,
    )
}

// draws one of the ball pictures (res/drawable/ball_*.xml) centred on [at], turned by [rotation]
private fun DrawScope.sportBall(picture: Painter, at: Offset, r: Float, rotation: Float, ringWidth: Float) {
    if (r <= .5f) return
    // a ring in the background colour keeps overlapping balls apart
    drawCircle(Background, radius = r + ringWidth, center = at)
    rotateRad(-rotation, pivot = at) {
        translate(at.x - r, at.y - r) {
            with(picture) { draw(Size(2 * r, 2 * r)) }
        }
    }
}

// ---------- maths ----------

private fun radians(degrees: Float) = degrees * PI_F / 180f

private fun lerp(a: Float, b: Float, k: Float) = a + (b - a) * k

private fun easeOutCubic(k: Float) = 1 - (1 - k).pow(3)

private fun easeOutBack(k: Float): Float {
    val c1 = 1.70158f
    val c3 = c1 + 1
    return 1 + c3 * (k - 1).pow(3) + c1 * (k - 1).pow(2)
}
