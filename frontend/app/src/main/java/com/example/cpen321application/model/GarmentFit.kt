package com.example.cpen321application.model

import dev.romainguy.kotlin.math.Float3

// How high a garment's top edge sits, as a fraction of the avatar's height: the base of the neck for tops
// and outerwear, the waist for bottoms.
private const val TOP_EDGE_HEIGHT = 0.95f
private const val BOTTOM_EDGE_HEIGHT = 0.62f

// How much wider than the body a garment is made, so the avatar doesn't show through it.
private const val GARMENT_EASE = 1.15f

/** How much the user can shrink or enlarge a garment on the avatar. */
val GarmentSizeRange = 0.7f..1.3f

/** A model's bounding box, as the 3D viewer reports it. */
data class Bounds(val center: Float3, val halfExtent: Float3) {
    val top get() = center.y + halfExtent.y
    val bottom get() = center.y - halfExtent.y
    val height get() = halfExtent.y * 2
    val width get() = halfExtent.x * 2
}

data class GarmentPlacement(val scale: Float3, val position: Float3)

/**
 * How wide the avatar's body is where a garment sits:
 * - Tops and Outerwear → shoulder width (from user measurements)
 * - Bottoms            → hip width (from user measurements)
 */
fun bodyWidth(category: ClothingCategory, measurements: AvatarMeasurements, avatar: Bounds): Float {
    val across = when (category) {
        ClothingCategory.Bottom -> BodyMeasurement.Hips
        else -> BodyMeasurement.Shoulders   // tops and outerwear scale to shoulder width
    }
    return measurements[across].toFloat() / measurements[BodyMeasurement.Height] * avatar.height
}

/**
 * Where to put a garment on the avatar. Garment models come in different units, sizes and origins, so the
 * garment is scaled for the avatar's height, then moved so its top edge is at the neck or waist and it is
 * centred on the body. A garment narrower than [bodyWidth] is widened to fit around it. [size] is the
 * user's adjustment; the top edge stays put as it changes.
 */
fun placeGarment(
    category: ClothingCategory,
    garment: Bounds,
    avatar: Bounds,
    bodyWidth: Float = 0f,
    size: Float = 1f,
): GarmentPlacement {
    val edge = avatar.bottom + avatar.height * (if (category == ClothingCategory.Bottom) BOTTOM_EDGE_HEIGHT else TOP_EDGE_HEIGHT)
    // Scaled about the garment's own origin, which sits at the feet of the body it was modelled on.
    val scale = (edge - avatar.bottom) / garment.top * size
    val across = scale * maxOf(1f, bodyWidth * GARMENT_EASE * size / (garment.width * scale))
    return GarmentPlacement(
        scale = Float3(across, scale, across),
        position = Float3(
            x = avatar.center.x - garment.center.x * across,
            y = edge - garment.top * scale,
            z = avatar.center.z - garment.center.z * across,
        ),
    )
}

private const val ARM_RADIUS_RATIO = 0.30f * 0.072f
private const val SHOULDER_Y_RATIO = 0.80f * 0.99f
private const val WAIST_Y_RATIO = 0.65f
private const val WAIST_HALF_HEIGHT_RATIO = 0.125f
private const val HIP_JOINT_DROP_FACTOR = 0.80f
private const val HEM_DROP_RATIO = 0.02f
private const val TOP_EASE = 1.05f
private const val BOTTOM_EASE = 0.90f
private const val PANTS_LIFT = 0.05f
private const val LEG_LENGTH_RATIO = 0.48f
private const val UPPER_LEG_FRACTION = 0.53f
private const val LEG_COS = 0.979386f
private const val MIN_SPAN = 1e-4f
private const val CM_PER_M = 100f

fun placeGarmentWithReferencePoints(
    category: ClothingCategory,
    referencePoints: GarmentReferencePoints,
    measurements: AvatarMeasurements,
    isPants: Boolean = false,
    size: Float = 1f,
): GarmentPlacement? = when (category) {
    ClothingCategory.Top, ClothingCategory.Outerwear ->
        placeTop(referencePoints, measurements, size)
    ClothingCategory.Bottom ->
        placeBottom(referencePoints, measurements, isPants, size)
    else -> null
}

private fun placeTop(
    referencePoints: GarmentReferencePoints,
    measurements: AvatarMeasurements,
    size: Float,
): GarmentPlacement? {
    val l = referencePoints.leftShoulder ?: return null
    val r = referencePoints.rightShoulder ?: return null
    val hem = referencePoints.bottomHem ?: return null
    val gDist = kotlin.math.abs(l.x - r.x)
    if (gDist < MIN_SPAN) return null

    val h = measurements[BodyMeasurement.Height] / CM_PER_M
    val shoulderWidth = measurements[BodyMeasurement.Shoulders] / CM_PER_M
    val shoulderY = h * SHOULDER_Y_RATIO + h * ARM_RADIUS_RATIO
    val torsoBottomY = h * WAIST_Y_RATIO - h * WAIST_HALF_HEIGHT_RATIO
    val hemTargetY = torsoBottomY - HEM_DROP_RATIO * h

    val sx = shoulderWidth * TOP_EASE * size / gDist
    val midY = (l.y + r.y) / 2f
    val span = midY - hem.y
    val sy = if (span > MIN_SPAN) ((shoulderY - hemTargetY) / span) * size else sx

    return buildPlacement(
        scale = Float3(sx, sy, sx),
        ref = Float3((l.x + r.x) / 2f, midY, referencePoints.boundingBoxCenterZ),
        target = Float3(0f, shoulderY, 0f),
    )
}

private fun placeBottom(
    referencePoints: GarmentReferencePoints,
    measurements: AvatarMeasurements,
    isPants: Boolean,
    size: Float,
): GarmentPlacement? {
    val tl = referencePoints.topHemLeft ?: return null
    val tr = referencePoints.topHemRight ?: return null
    val hl = referencePoints.bottomHemLeft ?: return null
    val hr = referencePoints.bottomHemRight ?: return null
    val gTopW = kotlin.math.abs(tl.x - tr.x)
    if (gTopW < MIN_SPAN) return null

    val h = measurements[BodyMeasurement.Height] / CM_PER_M
    val hipWidth = measurements[BodyMeasurement.Hips] / CM_PER_M
    val hipJointY = hipJointY(h)
    val hipY = hipJointY + PANTS_LIFT
    val hemTargetY = legHemTargetY(h, hipJointY, isPants)

    val sx = hipWidth * BOTTOM_EASE * size / gTopW
    val topY = (tl.y + tr.y) / 2f
    val span = topY - (hl.y + hr.y) / 2f
    val sy = if (span > MIN_SPAN) ((hipY - hemTargetY) / span) * size else sx

    return buildPlacement(
        scale = Float3(sx, sy, sx),
        ref = Float3((tl.x + tr.x) / 2f, topY, referencePoints.boundingBoxCenterZ),
        target = Float3(0f, hipY, 0f),
    )
}

private fun hipJointY(h: Float): Float =
    h * WAIST_Y_RATIO - h * WAIST_HALF_HEIGHT_RATIO * HIP_JOINT_DROP_FACTOR

private fun legHemTargetY(h: Float, hipJointY: Float, isPants: Boolean): Float {
    val legLength = LEG_LENGTH_RATIO * h
    val upperLegLength = legLength * UPPER_LEG_FRACTION
    val lowerLegLength = legLength - upperLegLength
    val kneeY = hipJointY - upperLegLength * LEG_COS
    return if (isPants) kneeY - lowerLegLength * LEG_COS else kneeY
}

private fun buildPlacement(scale: Float3, ref: Float3, target: Float3) = GarmentPlacement(
    scale = scale,
    position = Float3(
        x = target.x - ref.x * scale.x,
        y = target.y - ref.y * scale.y,
        z = target.z - ref.z * scale.z,
    ),
)