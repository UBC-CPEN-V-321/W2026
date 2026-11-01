package com.exploreUBC.cpen321application

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.core.content.ContextCompat
import com.exploreUBC.cpen321application.data.events.EventsApi
import com.exploreUBC.cpen321application.data.events.EventsRepository
import com.exploreUBC.cpen321application.data.location.ForegroundLocationTracker
import com.exploreUBC.cpen321application.data.location.UserLocation
import com.exploreUBC.cpen321application.data.users.UsersApi
import com.exploreUBC.cpen321application.data.users.UsersRepository
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesApi
import com.exploreUBC.cpen321application.data.itineraries.Itinerary
import com.exploreUBC.cpen321application.data.itineraries.ItinerariesRepository
import com.exploreUBC.cpen321application.ui.events.AppEventRecommendationEffects
import com.exploreUBC.cpen321application.ui.events.AppEventRecommendationsState
import com.exploreUBC.cpen321application.ui.events.LiveEventsScreen
import com.exploreUBC.cpen321application.ui.events.rememberAppEventRecommendationsState
import com.exploreUBC.cpen321application.ui.map.MapRoute
import com.exploreUBC.cpen321application.ui.profile.ProfileRoute
import com.exploreUBC.cpen321application.ui.trips.TripsRoute
import com.exploreUBC.cpen321application.ui.theme.CPEN321ApplicationTheme

private data class AppRepositories(
    val users: UsersRepository,
    val itineraries: ItinerariesRepository,
    val events: EventsRepository,
)

private data class AppDestinationState(
    val destination: AppDestinations,
    val itineraryIdToOpen: String?,
    val selectedItineraryId: String?,
)

private data class AppDestinationActions(
    val onItineraryOpenRequested: () -> Unit,
    val onItinerarySelected: (String?) -> Unit,
    val onViewMap: (Itinerary) -> Unit,
    val onVisitItinerary: () -> Unit,
    val onPreferencesSaved: () -> Unit,
)

class MainActivity2 : ComponentActivity() {
    private var eventLocation by mutableStateOf(UserLocation.UBC)
    private lateinit var locationTracker: ForegroundLocationTracker

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) locationTracker.start()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        locationTracker = ForegroundLocationTracker(this) { location ->
            eventLocation = location
        }
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                val usersRepository = remember { UsersApi(BuildConfig.API_BASE_URL) }
                val itinerariesRepository = remember { ItinerariesApi(BuildConfig.API_BASE_URL) }
                val eventsRepository = remember { EventsApi(BuildConfig.API_BASE_URL) }
                CPEN321ApplicationApp(
//                    userId = intent.getStringExtra("userId"),
                    userId = "6acd519c76376cefc61e97f1",
                    usersRepository = usersRepository,
                    itinerariesRepository = itinerariesRepository,
                    eventsRepository = eventsRepository,
                    eventLocation = eventLocation,
                )
            }
        }
        requestLocationPermissionIfNeeded()
    }

    override fun onStart() {
        super.onStart()
        if (hasLocationPermission()) locationTracker.start()
    }

    override fun onStop() {
        locationTracker.stop()
        super.onStop()
    }

    private fun requestLocationPermissionIfNeeded() {
        if (!hasLocationPermission()) {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }

    private fun hasLocationPermission(): Boolean {
        val fineLocation = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val coarseLocation = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        return fineLocation || coarseLocation
    }
}

@Composable
fun CPEN321ApplicationApp(
    userId: String?,
    usersRepository: UsersRepository,
    itinerariesRepository: ItinerariesRepository,
    eventsRepository: EventsRepository,
    eventLocation: UserLocation = UserLocation.UBC,
) {
    var currentDestination by rememberSaveable { mutableStateOf(AppDestinations.EVENTS) }
    var selectedMapItineraryId by rememberSaveable { mutableStateOf<String?>(null) }
    var itineraryToOpenInTrips by rememberSaveable { mutableStateOf<String?>(null) }
    val eventRecommendations = rememberAppEventRecommendationsState()
    AppEventRecommendationEffects(
        userId = userId,
        location = eventLocation,
        isEventsVisible = currentDestination == AppDestinations.EVENTS,
        repository = eventsRepository,
        state = eventRecommendations,
        onViewEvents = { currentDestination = AppDestinations.EVENTS },
    )
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            AppDestinations.entries.forEach {
                item(
                    modifier = Modifier.testTag("navigation_${it.label}"),
                    icon = {
                        Icon(
                            painterResource(it.icon),
                            contentDescription = it.label
                        )
                    },
                    label = { Text(it.label) },
                    selected = it == currentDestination,
                    onClick = { currentDestination = it }
                )
            }
        }
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            snackbarHost = { SnackbarHost(eventRecommendations.snackbarHostState) },
        ) { innerPadding ->
            AppDestinationContent(
                state = AppDestinationState(
                    currentDestination,
                    itineraryToOpenInTrips,
                    selectedMapItineraryId,
                ),
                userId = userId,
                repositories = AppRepositories(
                    usersRepository,
                    itinerariesRepository,
                    eventsRepository,
                ),
                actions = AppDestinationActions(
                    onItineraryOpenRequested = { itineraryToOpenInTrips = null },
                    onItinerarySelected = { selectedMapItineraryId = it },
                    onViewMap = { itinerary ->
                        selectedMapItineraryId = itinerary.id
                        currentDestination = AppDestinations.MAP
                    },
                    onVisitItinerary = {
                        itineraryToOpenInTrips = selectedMapItineraryId
                        currentDestination = AppDestinations.TRIPS
                    },
                    onPreferencesSaved = eventRecommendations::refreshAfterPreferenceChange,
                ),
                eventLocation = eventLocation,
                eventRecommendations = eventRecommendations,
                modifier = Modifier.padding(innerPadding),
            )
        }
    }
}

@Composable
private fun AppDestinationContent(
    state: AppDestinationState,
    userId: String?,
    repositories: AppRepositories,
    actions: AppDestinationActions,
    eventLocation: UserLocation,
    eventRecommendations: AppEventRecommendationsState,
    modifier: Modifier = Modifier,
) {
    when (state.destination) {
        AppDestinations.PROFILE -> ProfileRoute(
            userId = userId,
            usersRepository = repositories.users,
            onPreferencesSaved = actions.onPreferencesSaved,
            modifier = modifier,
        )
        AppDestinations.TRIPS -> TripsRoute(
            userId = userId,
            itinerariesRepository = repositories.itineraries,
            itineraryIdToOpen = state.itineraryIdToOpen,
            onItineraryOpenRequested = actions.onItineraryOpenRequested,
            onViewMap = actions.onViewMap,
            modifier = modifier,
        )
        AppDestinations.EVENTS -> LiveEventsScreen(
            userId = userId,
            eventsRepository = repositories.events,
            itinerariesRepository = repositories.itineraries,
            location = eventLocation,
            initialEvents = eventRecommendations.eventsAt(eventLocation),
            onFirstPageLoaded = { events ->
                eventRecommendations.recordRecommendations(
                    eventLocation,
                    events,
                    notifyAboutNewEvents = false,
                )
            },
            modifier = modifier,
        )
        AppDestinations.MAP -> MapRoute(
            userId = userId,
            itinerariesRepository = repositories.itineraries,
            selectedItineraryId = state.selectedItineraryId,
            onItinerarySelected = actions.onItinerarySelected,
            onVisitItinerary = actions.onVisitItinerary,
            modifier = modifier,
        )
    }
}

enum class AppDestinations(
    val label: String,
    val icon: Int,
) {
    EVENTS("Events", R.drawable.notifications_24px),
    TRIPS("Trips", R.drawable.trip_24px),
    MAP("Map", R.drawable.map_24px),
    PROFILE("Profile", R.drawable.ic_account_box),
}

@Composable
fun Greeting2(name: String, modifier: Modifier = Modifier) {
    Text(
        text = "Hello $name!",
        modifier = modifier
    )
}

@Preview(showBackground = true)
@Composable
fun GreetingPreview() {
    CPEN321ApplicationTheme {
        Greeting2("Android")
    }
}
