package com.exploreUBC.cpen321application.ui.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.exploreUBC.cpen321application.R
import com.exploreUBC.cpen321application.data.users.BudgetPreference
import com.exploreUBC.cpen321application.data.users.InterestPreference
import com.exploreUBC.cpen321application.data.users.TransportationPreference
import com.exploreUBC.cpen321application.data.users.TransportationMode
import com.exploreUBC.cpen321application.data.users.UserPreferences
import com.exploreUBC.cpen321application.ui.trips.AddressAutocompleteField
import com.exploreUBC.cpen321application.ui.trips.AddressAutocompleteOptions
import coil.compose.AsyncImage

@Composable
internal fun PreferenceSaveControls(
    statusMessage: String?,
    isSaving: Boolean,
    onSave: () -> Unit,
) {
    statusMessage?.let {
        Text(
            text = it,
            modifier = Modifier
                .padding(vertical = 8.dp)
                .testTag("profile_status"),
        )
    }

    Button(
        onClick = onSave,
        enabled = !isSaving,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("profile_save"),
    ) {
        Text(if (isSaving) "Saving…" else "Save preferences")
    }
}

@Composable
internal fun ProfileHeader(
    isEditing: Boolean,
    isSaving: Boolean,
    onEdit: () -> Unit,
    onCancel: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Profile",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            onClick = if (isEditing) onCancel else onEdit,
            enabled = !isSaving,
            modifier = Modifier.testTag("profile_edit"),
        ) {
            Text(if (isEditing) "Cancel" else "Edit")
        }
    }
}

@Composable
internal fun ProfileImage(profileImageUrl: String?) {
    val fallback = painterResource(R.drawable.ic_account_box)
    Surface(
        modifier = Modifier.size(72.dp),
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.secondaryContainer,
    ) {
        if (profileImageUrl.isNullOrBlank()) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    painter = fallback,
                    contentDescription = "Profile image",
                    modifier = Modifier
                        .size(44.dp)
                        .testTag("profile_image"),
                )
            }
        } else {
            AsyncImage(
                model = profileImageUrl,
                contentDescription = "Profile image",
                contentScale = ContentScale.Crop,
                error = fallback,
                fallback = fallback,
                modifier = Modifier.fillMaxSize().testTag("profile_image"),
            )
        }
    }
}

@Composable
internal fun RowScope.ProfileDisplay(
    displayName: String?,
    startLocation: String?,
) {
    Column(
        modifier = Modifier
            .weight(1f)
            .padding(start = 16.dp),
    ) {
        Text(
            text = displayName?.takeIf { it.isNotBlank() } ?: "ExploreUBC User",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.testTag("profile_display_name"),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .testTag("profile_start_location"),
        ) {
            Text(text = "Start location", style = MaterialTheme.typography.labelMedium)
            Text(
                text = startLocation?.takeIf { it.isNotBlank() } ?: "Not set",
                style = MaterialTheme.typography.bodyLarge,
            )
        }
    }
}

@Composable
internal fun RowScope.ProfileEditFields(
    displayName: String,
    startLocation: String,
    isSaving: Boolean,
    onDisplayNameChanged: (String) -> Unit,
    onStartLocationChanged: (String) -> Unit,
    onSave: () -> Unit,
) {
    val displayNameTooLong = displayName.length > DISPLAY_NAME_MAX_LENGTH
    val startLocationTooLong = startLocation.length > START_LOCATION_MAX_LENGTH
    Column(
        modifier = Modifier
            .weight(1f)
            .padding(start = 16.dp),
    ) {
        OutlinedTextField(
            value = displayName,
            onValueChange = onDisplayNameChanged,
            label = { Text("Display name") },
            singleLine = true,
            isError = displayNameTooLong,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("profile_display_name_input"),
        )
        if (displayNameTooLong) {
            Text(
                text = "Display name must be at most $DISPLAY_NAME_MAX_LENGTH characters.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.testTag("profile_display_name_length_error"),
            )
        }
        AddressAutocompleteField(
            value = startLocation,
            onValueChange = onStartLocationChanged,
            label = "Start location",
            tag = "profile_start_location",
            options = AddressAutocompleteOptions(
                placeholder = "Enter a starting location",
                maxLength = START_LOCATION_MAX_LENGTH,
            ),
        )
        Button(
            onClick = onSave,
            enabled = !isSaving && displayName.isNotBlank() && startLocation.isNotBlank() &&
                !displayNameTooLong && !startLocationTooLong,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .testTag("profile_details_save"),
        ) {
            Text(if (isSaving) "Saving…" else "Save profile")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun <T> PreferenceDropdown(
    title: String,
    options: List<T>,
    selected: T,
    label: (T) -> String,
    dropdownTag: String,
    tag: (T) -> String,
    onSelected: (T) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Spacer(modifier = Modifier.height(20.dp))
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = label(selected),
            onValueChange = {},
            readOnly = true,
            label = { Text(title) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .testTag(dropdownTag),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(label(option)) },
                    onClick = {
                        onSelected(option)
                        expanded = false
                    },
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    modifier = Modifier.testTag(tag(option)),
                )
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun ProfilePreferencesFormPreview() {
    ProfilePreferencesForm(
        state = ProfileScreenState(
            preferences = UserPreferences(
                transportation = TransportationPreference(TransportationMode.TRANSIT),
                budget = BudgetPreference.BALANCED,
                interest = InterestPreference.OUTDOORS,
            ),
            isSaving = false,
        ),
        actions = ProfileScreenActions(),
    )
}
