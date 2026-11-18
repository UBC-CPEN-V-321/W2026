// package com.example.cpen321application.screens.avatar

// import androidx.compose.foundation.background
// import androidx.compose.foundation.layout.Arrangement
// import androidx.compose.foundation.layout.Box
// import androidx.compose.foundation.layout.Column
// import androidx.compose.foundation.layout.Row
// import androidx.compose.foundation.layout.fillMaxSize
// import androidx.compose.foundation.layout.fillMaxWidth
// import androidx.compose.foundation.layout.padding
// import androidx.compose.foundation.layout.size
// import androidx.compose.foundation.rememberScrollState
// import androidx.compose.foundation.shape.RoundedCornerShape
// import androidx.compose.foundation.verticalScroll
// import androidx.compose.material3.Checkbox
// import androidx.compose.material3.MaterialTheme
// import androidx.compose.material3.Text
// import androidx.compose.runtime.Composable
// import androidx.compose.ui.Alignment
// import androidx.compose.ui.Modifier
// import androidx.compose.ui.graphics.Color
// import androidx.compose.ui.unit.dp

// data class AvatarBodyPart(val id: String, val displayName: String, val color: Color)

// val AVATAR_BODY_PARTS = listOf(
//     AvatarBodyPart("head", "Head & Neck", Color(0xFF9B5DE5)),
//     AvatarBodyPart("torso", "Torso", Color(0xFFF15BB5)),
//     AvatarBodyPart("leftArm", "Left Arm", Color(0xFF00BBF9)),
//     AvatarBodyPart("rightArm", "Right Arm", Color(0xFF00F5D4)),
//     AvatarBodyPart("upperLegs", "Upper Legs", Color(0xFFFEE440)),
//     AvatarBodyPart("lowerLegs", "Lower Legs", Color(0xFFFF9F1C)),
// )

// @Composable
// internal fun AvatarBodyPartsTab(
//     hiddenParts: Set<String>,
//     onTogglePart: (String) -> Unit,
// ) {
//     Column(
//         modifier = Modifier
//             .fillMaxSize()
//             .verticalScroll(rememberScrollState())
//             .padding(ScreenPadding),
//         verticalArrangement = Arrangement.spacedBy(ControlSpacing),
//     ) {
//         Text(
//             "Toggle body part visibility to see individual segments:",
//             style = MaterialTheme.typography.bodyMedium,
//         )

//         AVATAR_BODY_PARTS.forEach { part ->
//             val isVisible = !hiddenParts.contains(part.id)
//             Row(
//                 verticalAlignment = Alignment.CenterVertically,
//                 horizontalArrangement = Arrangement.SpaceBetween,
//                 modifier = Modifier
//                     .fillMaxWidth()
//                     .padding(vertical = 2.dp),
//             ) {
//                 Row(
//                     verticalAlignment = Alignment.CenterVertically,
//                     horizontalArrangement = Arrangement.spacedBy(8.dp),
//                 ) {
//                     Box(
//                         modifier = Modifier
//                             .size(16.dp)
//                             .background(part.color, RoundedCornerShape(4.dp)),
//                     )
//                     Text(part.displayName, style = MaterialTheme.typography.bodyLarge)
//                 }
//                 Checkbox(
//                     checked = isVisible,
//                     onCheckedChange = { onTogglePart(part.id) },
//                 )
//             }
//         }
//     }
// }
