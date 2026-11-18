package com.example.cpen321application.screens.avatar

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.example.cpen321application.model.AvatarMeasurements
import com.example.cpen321application.model.BodyMeasurement
import com.example.cpen321application.model.Bounds
import com.example.cpen321application.model.ClothingCategory
import com.example.cpen321application.model.ClothingItem
import com.example.cpen321application.model.GarmentPlacement
import com.example.cpen321application.model.MOVABLE_BODY_PARTS
import com.example.cpen321application.model.bodyWidth
import com.example.cpen321application.model.computeBodyAdjustments
import com.example.cpen321application.model.isPantsItem
import com.example.cpen321application.model.placeGarment
import com.example.cpen321application.model.placeGarmentWithReferencePoints
import dev.romainguy.kotlin.math.Float3
import io.github.sceneview.Scene
import io.github.sceneview.math.Position
import io.github.sceneview.node.ModelNode
import io.github.sceneview.rememberCameraManipulator
import io.github.sceneview.rememberCameraNode
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberNodes
import java.io.File

private const val CM_PER_M = 100f

@Composable
internal fun AvatarViewer(
    modelFile: File,
    garments: Map<ClothingCategory, File>,
    garmentItems: Map<ClothingCategory, ClothingItem?>,
    sizes: Map<ClothingCategory, Float>,
    measurements: AvatarMeasurements,
) {
    val engine = rememberEngine()
    val modelLoader = rememberModelLoader(engine)

    val h = measurements[BodyMeasurement.Height] / CM_PER_M
    val cameraNode = rememberCameraNode(engine) {
        position = Position(x = 0f, y = h * 0.6f, z = h * 2.4f)
    }

    val garmentNodes = remember { mutableMapOf<ClothingCategory, ModelNode>() }
    val initialPartPositions = remember { mutableMapOf<String, Position>() }
    val initialPartBounds = remember { mutableMapOf<String, Bounds>() }

    val childNodes = rememberNodes {
        val avatarNode = ModelNode(
            modelInstance = modelLoader.createModelInstance(modelFile),
        ).apply {
            position = Position(0f, 0f, 0f)
            renderableNodes.forEach { node ->
                val partName = node.name
                if (!partName.isNullOrEmpty()) {
                    initialPartPositions[partName] = node.position
                    val halfExtent = node.axisAlignedBoundingBox.halfExtent
                    val center = node.axisAlignedBoundingBox.center
                    initialPartBounds[partName] = Bounds(
                        center = Float3(center[0], center[1], center[2]),
                        halfExtent = Float3(halfExtent[0], halfExtent[1], halfExtent[2]),
                    )
                }
            }
            // Add bottoms before tops/outerwear so tops draw after bottoms
            val orderedGarments = garments.entries.sortedBy { (category, _) ->
                if (category == ClothingCategory.Bottom) 0 else 1
            }
            orderedGarments.forEach { (category, file) ->
                val gNode = ModelNode(
                    modelInstance = modelLoader.createModelInstance(file),
                ).apply {
                    val priority = if (category == ClothingCategory.Bottom) 4 else 5
                    renderableNodes.forEach { it.setPriority(priority) }
                }
                garmentNodes[category] = gNode
                addChildNode(gNode)
            }
        }
        add(avatarNode)
    }

    val avatar = childNodes.first() as ModelNode
    SideEffect {
        val avatarBounds = Bounds(avatar.center, avatar.halfExtent)
        val placements = mutableMapOf<ClothingCategory, GarmentPlacement>()

        // 1. Fit each garment slot and record placements
        garmentNodes.forEach { (category, node) ->
            val item = garmentItems[category]
            val refPoints = item?.referencePoints
            val isPants = isPantsItem(item)
            val size = sizes[category] ?: 1f

            val refPlacement = if (refPoints != null) {
                placeGarmentWithReferencePoints(
                    category = category,
                    referencePoints = refPoints,
                    measurements = measurements,
                    isPants = isPants,
                    size = size,
                )
            } else null

            val placement = refPlacement ?: placeGarment(
                category = category,
                garment = Bounds(node.center, node.halfExtent),
                avatar = avatarBounds,
                bodyWidth = bodyWidth(category, measurements, avatarBounds),
                size = size,
            )
            placements[category] = placement
            node.scale = placement.scale
            node.position = placement.position
        }

        // Automatically hide covered body parts & relocate extremities to garment openings
        val topCategory = if (garmentItems.containsKey(ClothingCategory.Outerwear)) {
            ClothingCategory.Outerwear
        } else {
            ClothingCategory.Top
        }
        val adjustments = computeBodyAdjustments(
            measurements = measurements,
            partBounds = initialPartBounds,
            topItem = garmentItems[topCategory],
            topPlacement = placements[topCategory],
            bottomItem = garmentItems[ClothingCategory.Bottom],
            bottomPlacement = placements[ClothingCategory.Bottom],
        )

        val nodesByName = avatar.renderableNodes
            .filter { !it.name.isNullOrEmpty() }
            .associateBy { it.name!! }

        // Apply automatic visibility
        nodesByName.forEach { (partName, node) ->
            node.isVisible = !adjustments.autoHiddenParts.contains(partName)
        }

        // Apply automatic position offsets (resetting unadjusted movable parts to their initial origin)
        for (partName in MOVABLE_BODY_PARTS) {
            val node = nodesByName[partName] ?: continue
            val base = initialPartPositions[partName] ?: Position(0f, 0f, 0f)
            val offset = adjustments.offsets[partName] ?: Float3(0f, 0f, 0f)
            node.position = Position(
                x = base.x + offset.x,
                y = base.y + offset.y,
                z = base.z + offset.z,
            )
        }
    }

    Scene(
        modifier = Modifier.fillMaxSize(),
        engine = engine,
        modelLoader = modelLoader,
        cameraNode = cameraNode,
        childNodes = childNodes,
        cameraManipulator = rememberCameraManipulator(
            orbitHomePosition = cameraNode.worldPosition,
            targetPosition = Position(0f, h * 0.5f, 0f),
        ),
    )
}