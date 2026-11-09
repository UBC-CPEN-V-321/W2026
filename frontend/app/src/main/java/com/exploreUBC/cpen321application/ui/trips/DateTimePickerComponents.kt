package com.exploreUBC.cpen321application.ui.trips

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

private val pacificTimeZone = ZoneId.of("America/Vancouver")
private val dateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a z")

@Composable
internal fun DateTimePickerField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    tag: String,
    required: Boolean = false,
) {
    var showDatePicker by remember { mutableStateOf(false) }
    var selectedDateMillis by remember { mutableStateOf<Long?>(null) }
    OutlinedButton(
        onClick = { showDatePicker = true },
        modifier = Modifier.fillMaxWidth().testTag(tag),
    ) {
        val display = if (value.isBlank()) "Select date and time" else value.toPacificDisplayDateTime()
        Text("$label${if (required) " *" else ""}: $display")
    }
    if (showDatePicker) {
        DateSelectionDialog(value, { showDatePicker = false }) {
            selectedDateMillis = it
            showDatePicker = false
        }
    }
    selectedDateMillis?.let { dateMillis ->
        TimeSelectionDialog(value, dateMillis, onValueChange) { selectedDateMillis = null }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateSelectionDialog(
    value: String,
    onDismiss: () -> Unit,
    onSelected: (Long) -> Unit,
) {
    val state = rememberDatePickerState(
        initialSelectedDateMillis = value.toDatePickerMillis() ?: System.currentTimeMillis(),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { state.selectedDateMillis?.let(onSelected) },
                enabled = state.selectedDateMillis != null,
            ) { Text("Next") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    ) { DatePicker(state = state) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeSelectionDialog(
    value: String,
    dateMillis: Long,
    onValueChange: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val currentTime = value.toPacificDateTime()
    val state = rememberTimePickerState(
        initialHour = currentTime?.hour ?: 12,
        initialMinute = currentTime?.minute ?: 0,
        is24Hour = false,
    )
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("Select time", style = MaterialTheme.typography.titleLarge)
                Box(modifier = Modifier.fillMaxWidth()) { TimePicker(state = state) }
                Row(modifier = Modifier.fillMaxWidth()) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = {
                        onValueChange(dateMillis.toIsoTime(state.hour, state.minute))
                        onDismiss()
                    }) { Text("OK") }
                }
            }
        }
    }
}

private fun Long.toIsoTime(hour: Int, minute: Int): String =
    Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()
        .atTime(hour, minute).atZone(pacificTimeZone).toInstant().toString()

private fun String.toPacificDateTime() = runCatching {
    Instant.parse(this).atZone(pacificTimeZone)
}.getOrNull()

private fun String.toDatePickerMillis(): Long? = toPacificDateTime()?.toLocalDate()
    ?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()

internal fun String.toPacificDisplayDateTime(): String =
    toPacificDateTime()?.format(dateTimeFormatter) ?: this
