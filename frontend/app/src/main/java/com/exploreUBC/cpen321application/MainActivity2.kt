package com.exploreUBC.cpen321application

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.credentials.exceptions.ClearCredentialException
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.exploreUBC.cpen321application.data.auth.AuthComponentFactory
import com.exploreUBC.cpen321application.data.auth.AuthenticatedAuthComponents
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
import com.exploreUBC.cpen321application.ui.profile.CreateProfileRoute
import com.exploreUBC.cpen321application.ui.trips.TripsRoute
import com.exploreUBC.cpen321application.ui.trips.TripsRouteState
import com.exploreUBC.cpen321application.ui.trips.rememberTripsRouteState
import com.exploreUBC.cpen321application.ui.theme.CPEN321ApplicationTheme
import java.io.IOException
import java.security.GeneralSecurityException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

private data class AppEventDestinationState(
    val location: UserLocation,
    val recommendations: AppEventRecommendationsState,
)

private data class AppScreenState(
    val destination: AppDestinations,
    val userId: String?,
    val selectedMapItineraryId: String?,
    val itineraryToOpenInTrips: String?,
    val eventLocation: UserLocation,
)

private data class AppDestinationActions(
    val onDestinationSelected: (AppDestinations) -> Unit,
    val onItineraryOpenRequested: () -> Unit,
    val onItinerarySelected: (String?) -> Unit,
    val onViewMap: (Itinerary) -> Unit,
    val onVisitItinerary: () -> Unit,
    val onPreferencesSaved: () -> Unit,
    val onLogout: () -> Unit,
)

class MainActivity2 : ComponentActivity() {
    private var returningToLogin = false
    private var isLoggingOut = false
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
        showLoading()
        lifecycleScope.launch { initializeAuthenticatedApp() }
    }

    private suspend fun initializeAuthenticatedApp() {
        val auth = AuthComponentFactory(
            context = applicationContext,
            apiBaseUrl = BuildConfig.API_BASE_URL,
            googleClientId = BuildConfig.GOOGLE_CLIENT_ID,
        ).createAuthenticatedComponents(
            activity = this,
            onSessionInvalidated = {
                withContext(Dispatchers.Main.immediate) { returnToLogin() }
            },
        )
        if (auth == null) {
            returnToLogin()
            return
        }

        showAuthenticatedApp(auth)
    }

    private fun showAuthenticatedApp(auth: AuthenticatedAuthComponents) {
        setContent {
            CPEN321ApplicationTheme {
                CPEN321ApplicationApp(
                    userId = auth.userId,
                    onboardingCompletedAt = auth.onboardingCompletedAt,
                    usersRepository = UsersApi(auth.apiClient),
                    itinerariesRepository = ItinerariesApi(auth.apiClient),
                    eventsRepository = EventsApi(auth.apiClient),
                    eventLocation = eventLocation,
                    onLogout = createLogoutAction(auth),
                )
            }
        }
        requestLocationPermissionIfNeeded()
    }

    private fun createLogoutAction(auth: AuthenticatedAuthComponents): () -> Unit = {
        if (!isLoggingOut) {
            isLoggingOut = true
            lifecycleScope.launch {
                try {
                    auth.logout()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: IOException) {
                    Log.w(TAG, "Backend logout failed", error)
                } catch (error: ClearCredentialException) {
                    Log.w(TAG, "Credential state cleanup failed", error)
                } catch (error: GeneralSecurityException) {
                    Log.w(TAG, "Session key cleanup failed", error)
                } finally {
                    returnToLogin()
                }
            }
        }
    }

    private fun showLoading() {
        setContent {
            CPEN321ApplicationTheme {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
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

    private fun returnToLogin() {
        if (returningToLogin) return
        returningToLogin = true
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
        finish()
    }

    private companion object {
        const val TAG = "MainActivity2"
    }
}

@Composable
fun CPEN321ApplicationApp(
    userId: String?,
    onboardingCompletedAt: String? = "completed",
    usersRepository: UsersRepository,
    itinerariesRepository: ItinerariesRepository,
    eventsRepository: EventsRepository,
    eventLocation: UserLocation = UserLocation.UBC,
    onLogout: () -> Unit = {},
) {
    var needsProfileCreation by rememberSaveable { mutableStateOf(onboardingCompletedAt == null) }
    if (needsProfileCreation && !userId.isNullOrBlank()) {
        CreateProfileRoute(
            userId = userId,
            usersRepository = usersRepository,
            onProfileCreated = { needsProfileCreation = false },
            onLogout = onLogout,
        )
        return
    }
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
    AppScreenContent(
        state = AppScreenState(
            destination = currentDestination,
            userId = userId,
            selectedMapItineraryId = selectedMapItineraryId,
            itineraryToOpenInTrips = itineraryToOpenInTrips,
            eventLocation = eventLocation,
        ),
        repositories = AppRepositories(usersRepository, itinerariesRepository, eventsRepository),
        actions = AppDestinationActions(
            onDestinationSelected = { currentDestination = it },
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
            onLogout = onLogout,
        ),
        eventRecommendations = eventRecommendations,
    )
}

@Composable
private fun AppScreenContent(
    state: AppScreenState,
    repositories: AppRepositories,
    actions: AppDestinationActions,
    eventRecommendations: AppEventRecommendationsState,
) {
    val tripsState = rememberTripsRouteState(state.userId, repositories.itineraries)
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            AppDestinations.entries.forEach {
                item(
                    modifier = Modifier.testTag("navigation_${it.label}"),
                    icon = { Icon(painterResource(it.icon), contentDescription = it.label) },
                    label = { Text(it.label) },
                    selected = it == state.destination,
                    onClick = { actions.onDestinationSelected(it) },
                )
            }
        },
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            snackbarHost = { SnackbarHost(eventRecommendations.snackbarHostState) },
        ) { innerPadding ->
            AppDestinationContent(
                state = AppDestinationState(
                    state.destination,
                    state.itineraryToOpenInTrips,
                    state.selectedMapItineraryId,
                ),
                userId = state.userId,
                repositories = repositories,
                actions = actions,
                events = AppEventDestinationState(state.eventLocation, eventRecommendations),
                tripsState = tripsState,
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
    events: AppEventDestinationState,
    tripsState: TripsRouteState,
    modifier: Modifier = Modifier,
) {
    when (state.destination) {
        AppDestinations.PROFILE -> ProfileRoute(
            userId = userId,
            usersRepository = repositories.users,
            onPreferencesSaved = actions.onPreferencesSaved,
            onLogout = actions.onLogout,
            modifier = modifier,
        )
        AppDestinations.TRIPS -> TripsRoute(
            state = tripsState,
            itineraryIdToOpen = state.itineraryIdToOpen,
            onItineraryOpenRequested = actions.onItineraryOpenRequested,
            onViewMap = actions.onViewMap,
            modifier = modifier,
        )
        AppDestinations.EVENTS -> LiveEventsScreen(
            userId = userId,
            eventsRepository = repositories.events,
            itinerariesRepository = repositories.itineraries,
            location = events.location,
            initialEvents = events.recommendations.eventsAt(events.location),
            onFirstPageLoaded = { loadedEvents ->
                events.recommendations.recordRecommendations(
                    events.location,
                    loadedEvents,
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
