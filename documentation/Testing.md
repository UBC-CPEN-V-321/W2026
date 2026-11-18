# Testing

## 1. Change History

| **Change Date**   | **Modified Sections** | **Rationale** |
| ----------------- | --------------------- | ------------- |
| October 28, 2026  | 3.1, 3.2              | Added automated and manual verification details and results for the Accessibility NFR. |
| November 6, 2026  | 2.1.1, 2.1.3, 2.3, 2.4, 2.5, 2.6 | Added the planned Live Events backend API test locations, run instructions, and coverage placeholders. |
| November 6, 2026  | 4.1, 4.2              | Added the planned Live Events frontend E2E scenarios: View Event Recommendations, Add an Event to an Itinerary, and Refresh After a Preference Change. |

---

## 2. Back-end Test Specification: APIs

### 2.1. Locations of Back-end Tests and Instructions to Run Them

#### 2.1.1. Tests

| **Interface** | **Describe Group Location, No Mocks** | **Describe Group Location, With Mocks** | **Mocked Components** |
| --- | --- | --- | --- |
| **GET /api/v1/users/:userId** | [`backend/tests/no-mock/users/users.test.ts`](../backend/tests/no-mock/users/users.test.ts) | [`backend/tests/mock/users/users.test.ts`](../backend/tests/mock/users/users.test.ts) | Get one user's data from the database |
| **PATCH /api/v1/users/:userId** | [`backend/tests/no-mock/users/users.test.ts`](../backend/tests/no-mock/users/users.test.ts) | [`backend/tests/mock/users/users.test.ts`](../backend/tests/mock/users/users.test.ts) | Update a user's display name, starting location, or preferences in the database |
| **POST /api/v1/users/:userId/itineraries** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Create an itinerary for a user in the database |
| **GET /api/v1/users/:userId/itineraries** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Get all itineraries for a user from the database. The itinerary-list endpoint accepts the optional Boolean query parameters `saved` and `inRecommendation`. |
| **GET /api/v1/users/:userId/itineraries/:itineraryId/details** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Get an itinerary's details from the database |
| **GET /api/v1/users/:userId/itineraries/:itineraryId** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Get one complete itinerary from the database |
| **PATCH /api/v1/users/:userId/itineraries/:itineraryId** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Update an itinerary's details in the database |
| **DELETE /api/v1/users/:userId/itineraries/:itineraryId** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Delete an itinerary from the database |
| **POST /api/v1/users/:userId/itineraries/:itineraryId/activities** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Add an activity to an itinerary in the database |
| **PATCH /api/v1/users/:userId/itineraries/:itineraryId/activities/:activityId** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Update an itinerary activity in the database |
| **DELETE /api/v1/users/:userId/itineraries/:itineraryId/activities/:activityId** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Remove an activity from an itinerary in the database |
| **POST /api/v1/users/:userId/itineraries/:itineraryId/transportation-segments** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Add a transportation segment to an itinerary in the database |
| **PATCH /api/v1/users/:userId/itineraries/:itineraryId/transportation-segments/:segmentId** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Update a transportation segment in the database |
| **DELETE /api/v1/users/:userId/itineraries/:itineraryId/transportation-segments/:segmentId** | [`backend/tests/no-mock/itineraries/itineraries.test.ts`](../backend/tests/no-mock/itineraries/itineraries.test.ts) | [`backend/tests/mock/itineraries/itineraries.test.ts`](../backend/tests/mock/itineraries/itineraries.test.ts) | Remove a transportation segment from an itinerary in the database |
| **GET /api/v1/users/:userId/events** | [`backend/tests/no-mock/events/events.test.ts`](../backend/tests/no-mock/events/events.test.ts) | [`backend/tests/mock/events/events.test.ts`](../backend/tests/mock/events/events.test.ts) | Get a user's stored preference and the nearby upcoming events from the database (database failure and unexpected service failure) |

Live Events exposes only this one HTTP interface. Ticketmaster synchronization (`syncEvents`) is currently run by a script (`npm run sync:events`) rather than an HTTP route, so it has no row above. The Ticketmaster client, event synchronization, `EventDao`, and event recommendation service are covered by supporting tests in the same `events` test folders. The Ticketmaster API is never called from the automated suite; the supporting tests mock it.

#### 2.1.2. Commit Hash Where Tests Run

`[Insert Commit SHA here]`

#### 2.1.3. Explanation on How to Run the Tests

1. Add a reachable `MONGODB_URI` to `backend/.env`. The no-mock suites create uniquely named temporary databases and drop them after the run.
2. From `backend`, install dependencies with `npm install`.
3. Run the user, itinerary, and Live Events API suites with coverage:
   ```sh
   npm run test:no-mock
   ```
4. Run the mocked database-failure and race-condition suites (including the mocked Live Events suites) with coverage:
   ```sh
   npm run test:mock
   ```
5. Run both sets together with coverage:
   ```sh
   npm run test:combined
   ```

The Live Events suites do not need a `TICKETMASTER_API_KEY` because no test calls Ticketmaster. The `jest.no-mock`, `jest.mock`, and `jest.combined` configurations include `tests/*/events/` and collect coverage for `src/events/`. Supporting suites for the Ticketmaster client, synchronization, `EventDao`, and `EventService` are in the same `tests/mock/events/` and `tests/no-mock/events/` folders.

### 2.2. GitHub Actions Configuration Location

`~/.github/workflows/backend-tests.yml`

### 2.3. Jest Coverage Report Screenshots With Mocks

Run `npm run test:mock` to generate the per-file HTML report under `backend/coverage/mock`. 
![Users Coverage](https://raw.githubusercontent.com/islamhampriv/ExploreUBC/main/documentation/images/mock-users.png)
![Itineraries Coverage](https://raw.githubusercontent.com/islamhampriv/ExploreUBC/main/documentation/images/mock-itineraries.png)
The current mocked user and itinerary suites cover 55.82% of statements, 40.85% of branches, 64.70% of functions, and 55.93% of lines. Lower standalone mock coverage is expected because these tests focus on database exceptions and concurrency-related error handling rather than normal API behavior.

**Live Events:** `[Placeholder: screenshot of per-file mocked coverage for src/events and the statement, branch, function, and line percentages, added after the tests are implemented and run.]`

### 2.4. Jest Coverage Report Screenshots Without Mocks


Run `npm run test:no-mock` to generate the per-file HTML report under `backend/coverage/no-mock`.
![Users Coverage](https://raw.githubusercontent.com/islamhampriv/ExploreUBC/main/documentation/images/no-mock-users.png)
![Itineraries Coverage](https://raw.githubusercontent.com/islamhampriv/ExploreUBC/main/documentation/images/no-mock-itineraries.png)
The current user and itinerary suites cover 96.11% of statements, 93.11% of branches, 99.01% of functions, and 96.09% of lines.

The no-mock Jest configuration enforces minimum global thresholds of 95% statements, 90% branches, 95% functions, and 95% lines.

**Live Events:** `[Placeholder: screenshot of per-file no-mock coverage for src/events and the statement, branch, function, and line percentages, added after the tests are implemented and run.]`

### 2.5. Jest Coverage Report Screenshots (Mock + No-Mocks)


Run `npm run test:combined` to generate the per-file HTML report under `backend/coverage/combined`.
![Users Coverage](https://raw.githubusercontent.com/islamhampriv/ExploreUBC/main/documentation/images/combined-users.png)
![Itineraries Coverage](https://raw.githubusercontent.com/islamhampriv/ExploreUBC/main/documentation/images/combined-itineraries.png)
Statements: 98.05%, Branches: 96.91%, Functions: 99.01%, Lines: 98.04%

**Live Events:** `[Placeholder: screenshot of per-file combined coverage for src/events and the overall result, added after the tests are implemented and run.]`

### 2.6. Coverage Justifications

The no-mock run is intentionally below 100% because database/network failure branches require controlled mocks, empty Express path parameters cannot be produced through normal HTTP routing, and race conditions in which a document is removed between a service read and write cannot be triggered deterministically without mocking.
The main remaining branches are unreachable empty Express route parameters and `findPreferences`, which belongs to the currently excluded recommendation flow. `*Types.ts` and `*Repository.ts` files contain only TypeScript types and interfaces that are erased at runtime, so both focused coverage configurations exclude them. The mock suites cover the controllable database-failure and concurrency-related branches.

**Live Events:** `src/events/eventDao.ts`, `eventRouter.ts`, and `eventService.ts` reach 100% in the combined run. The uncovered areas are:

- `src/events/eventSync.ts` (manual runner): the code that connects to the database and starts a sync when the file is run as a script is not tested. Event synchronization is not exposed through the API, and it will be run automatically by a scheduled job (GitHub Actions or an AWS cron job) rather than by users. The `syncEvents` function it calls is tested in `backend/tests/mock/events/eventSync.test.ts`. The runner is kept because it is the entry point the scheduled job will use.
- `src/events/ticketmaster/ticketmaster.client.ts`: `[Placeholder: to be filled in once the Ticketmaster client coverage is reviewed.]`

---

## 3. Tests of Non-Functional Requirements

### 3.1. Test Locations in Git

| **Non-Functional Requirement**  | **Location in Git**                              |
| ------------------------------- | ------------------------------------------------ |
| **Performance (Response Time)** | [`backend/tests/nfr/response_time.test.js`](#) |
| **Chat Data Security**          | [`backend/tests/nfr/chat_security.test.js`](#) |
| **Accessibility**               | [`frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/nfr/AccessibilityTest.kt`](../frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/nfr/AccessibilityTest.kt)<br>[`frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/nfr/AccessibilityScreenScalingTest.kt`](../frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/nfr/AccessibilityScreenScalingTest.kt) |

### 3.2. Test Verification and Logs

- **Performance (Response Time)**

  - **Verification:** This test suite simulates multiple concurrent API calls using Jest along with a load-testing utility to mimic real-world user behavior. The focus is on key endpoints such as user login and study group search to ensure that each call completes within the target response time of 2 seconds under normal load. The test logs capture metrics such as average response time, maximum response time, and error rates. These logs are then analyzed to identify any performance bottlenecks, ensuring the system can handle expected traffic without degradation in user experience.
  - **Log Output**
    ```
    [Placeholder for response time test logs]
    ```

- **Chat Data Security**
  - **Verification:** ...
  - **Log Output**
    ```
    [Placeholder for chat security test logs]
    ```

- **Accessibility: Visual Label and Content Description Consistency**

  - **Verification:** The test renders the primary navigation and reads each destination's visible text and icon `contentDescription` from the Compose semantics tree. It asserts that both values are equal for Events, Trips, Map, and Profile, and confirms that each label is present in the merged accessibility tree.
  - **Log Output:** This test was run as part of the combined automated accessibility test suite. The combined Gradle output is shown under **Accessibility: Automated Test Suite Execution**.

- **Accessibility: Minimum Navigation Target Size**

  - **Verification:** The test measures the rendered bounds of every primary navigation target, converts the measurements from pixels to density-independent pixels, and asserts that both the width and height are at least 48 dp.
  - **Log Output:** This test was run as part of the combined automated accessibility test suite. The combined Gradle output is shown under **Accessibility: Automated Test Suite Execution**.

- **Accessibility: Navigation Click Actions**

  - **Verification:** The test confirms that Events, Trips, Map, and Profile each expose a click action in the Compose semantics tree, ensuring that accessibility services recognize every primary navigation target as interactive.
  - **Log Output:** This test was run as part of the combined automated accessibility test suite. The combined Gradle output is shown under **Accessibility: Automated Test Suite Execution**.

- **Accessibility: Navigation at 200% Font Scale**

  - **Verification:** The test renders the application with a font scale of 2.0 and asserts that the Events, Trips, Map, and Profile labels remain displayed and expose click actions. This automated check verifies basic visibility and operability at 200% font scaling. A separate manual test verifies visual clipping and overlap.
  - **Log Output:** This test was run as part of the combined automated accessibility test suite. The combined Gradle output is shown under **Accessibility: Automated Test Suite Execution**.

- **Accessibility: Automated Test Suite Execution**

  - **Verification:** All four automated accessibility tests were executed together on a Pixel 9 API 36 emulator. The Gradle task completed successfully with no accessibility test failures.
  - **Log Output**
    ```
    > ./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.package=com.exploreUBC.cpen321application.nfr
    Starting 4 tests on Pixel_9_2(AVD) - 16
    Finished 4 tests on Pixel_9_2(AVD) - 16
    BUILD SUCCESSFUL in 15s
    ```

- **Accessibility: Manual TalkBack Verification**

  - **Verification:** TalkBack was enabled on the Pixel 9 API 36 emulator. Each primary navigation destination was focused and activated. TalkBack announced the same destination name shown in the interface, and each item remained operable.
  - **Log Output**
    ```
    Device: Pixel 9 emulator, API 36
    Events: Correct name announced and item activated successfully.
    Trips: Correct name announced and item activated successfully.
    Map: Correct name announced and item activated successfully.
    Profile: Correct name announced and item activated successfully.
    Overall result: PASS
    ```

- **Accessibility: Manual 200% Font-Scale Verification**

  - **Verification:** Android font scaling was set to 200% on the Pixel 9 API 36 emulator. The Events, Trips, Map, and Profile labels remained visible and operable. No navigation label was clipped, overlapped, or displayed with unusable wrapping.
  - **Log Output**
    ```
    Device: Pixel 9 emulator, API 36
    Events: Visible and operable with no clipping or overlap.
    Trips: Visible and operable with no clipping or overlap.
    Map: Visible and operable with no clipping or overlap.
    Profile: Visible and operable with no clipping or overlap.
    Overall result: PASS
    ```

---

## 4. Front-end Test Specification

### 4.1. Location in Git of Front-end Test Suite:

- Itinerary scenarios: [`frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/itineraries/ItineraryE2ETest.kt`](../frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/itineraries/ItineraryE2ETest.kt)
- User scenarios: [`frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/users/UserProfileE2ETest.kt`](../frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/users/UserProfileE2ETest.kt)
- Live Events scenarios *(planned)*: `frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/events/`. These tests use the real backend and automatically prepared test data. Files: [`LiveEventsE2ETest.kt`](../frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/events/LiveEventsE2ETest.kt) (recommendations, Load more, preference change), [`LiveEventsEmptyStateE2ETest.kt`](../frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/events/LiveEventsEmptyStateE2ETest.kt) (empty state), and the setup check [`LiveEventsSmokeE2ETest.kt`](../frontend/app/src/androidTest/java/com/exploreUBC/cpen321application/e2e/events/LiveEventsSmokeE2ETest.kt).

#### Running the real-backend E2E tests

The Live Events E2E tests launch the real app on its main screen and talk to the real, non-mocked backend. The backend runs against a throwaway local MongoDB (Docker, port 27018), never Atlas, so the data is predictable and nothing shared is changed. Use an emulator on API 36 or lower.

1. Start the database and seed it (from `backend/`): `npm run e2e:db:up`, then `npm run e2e:seed`. The seed creates the test user (interest `outdoors`), 21 Sports events and 3 Music events near UBC, and one itinerary whose activity overlaps the first seeded event. Event times are relative to the current time.
2. Start the backend on that database (from `backend/`): `npm run e2e:backend`.
3. Set the emulator location to UBC: `adb emu geo fix -123.2460 49.2606`.
4. Run the tests from Android Studio (or `./gradlew :app:connectedDebugAndroidTest` from `frontend/`). Each test resets the user's interest through the real backend first.
5. Empty state: run `npm run e2e:seed -- empty` (no events), restart nothing, and run `LiveEventsEmptyStateE2ETest`. With events seeded, that test is skipped.
6. When finished, stop the backend and run `npm run e2e:db:down` to discard the database.

### 4.2. Tests

- **Use Case: Update Preferences** (Users)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens the user profile tab. | Open User Profile screen |
    | 2. The app shows the logged in userName, the user's start location input field, transportation, budget, interest dropdowns, and a `Saved Prefrences` button. | Check that the user name is present.<br>Check the start location input is present and enabled.<br>Check the three preferences dropdowns are present and enabled.<br>Check the save button is present and enabled. |
    | 2a. The user enters profile details that exceed the supported length. | Click the `Edit` button.<br>Input a 201-character value in the `Display name` field and a valid value in the `Starting location` field. |
    | 2a1. The profile length error is displayed. | Check that the `Save profile` button is disabled.<br>Check that the red error message `Display name must be at most 200 characters.` is present. |
    | 3. The user inputs a new start location. | Input "12345 abc Avenue, Vancouver BC" in the text field. |
    | 4. The user selects another transportation preference | Click the transportation dropdown <br> Check the list option 'walking', 'cycling', 'transit','driving','other' appears. <br>Select "transit" and check if the field value is 'transit'    |
    | 5. The user selects another budget preference | Click the budget dropdown <br> Check the list option 'economical', 'balanced', 'premium' appears. <br>Select "balanced" and check if the field value is 'balanced'    |
    | 6. The user selects another interest preference | Click the interest dropdown <br> Check the list option 'food', 'art', 'outdoors', 'markets', 'live_music', 'gaming' appears. <br>Select "outdoors" and check if the field value is 'outdoor'    |
    | 7. The user saves the user profile change | Click the `Save preferences` button <br>Check the confirmation message "Preference saved` appears   |

- **Use Case: Create an itinerary** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens the Trips page | Open the Trips page and <br> Check that the "Create" button is present |
    | 2. The user clicks the 'Create' button  | Check that a blank itinerary details form is present  |
    | 3. The user clicks 'back to itineraries' button  | Check that a new itinerary is present under "Saved Itineraries" |

- **Use Case: Modify an itinerary** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens an itinerary under the "Saved Itineraries" list| Open the Itinerary details <br> Check that the Itinerary details form is present and the `edit` button is present |
    | 2. The user clicks the 'edit' button  | Check that input forms "Name", "Description", and "Starting location" are present and enabled. <br> Check that the "Save details" button is present  |
    | 3. The user types "new name" under "Name" field, "new description" under "Description" field, and "UBC nest" under "Starting Location" field, | Input "new name" in the "Name" text field. Input "new description" in the "Description" text field. Input "ubc nest" in the "Starting Location" text field.    |
    | 3a. The user enters itinerary details that exceed the supported length. | Input a 101-character value in the `Name` field. |
    | 3a1. The itinerary length error is displayed. | Check that the `Save details` button is disabled.<br>Check that the red error message `Name must be at most 100 characters.` is present. |
    | 4. The user clicks the  "Save details" button  | Check that the message "Itinerary details saved" is present <br> Check that the fields are updated with the input from step 3 and disabled.  |

- **Use Case: Add an activity** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens an itinerary under the "Saved Itineraries" list| Open the Itinerary details <br> Check that the "Itinerary details form is present and the `+ Activity` button is present" |
    | 2. The user clicks the `+ Activity` button  | Check that an empty new activty form is present <br> Check that under "Category" dropdown, the list options "food", "art", "outdoors", "markets", "live_music", "gaming", "museum", "other" are present. <br> Check that the "Add" button is disabled. |
    | 3. The user types "new activity" under "Name", selects "outdoors" under the required "Category" dropdown, inputs "UBC nest" under "Location", and sets start time to "2027-11-30 14:00:00" and end time to "2027-11-30 15:00:00". The optional "Image URL" is left blank. | Input "new activity" in the "Name" field.<br>Select "outdoors" in the "Category" dropdown.<br>Input "UBC nest" in the "Location" field.<br>Leave "Image URL (optional)" blank.<br>Check that the start and end times are displayed. |
     | 3a. The user enters an invalid time range.   | Set start time to "2027-11-30 14:00:00", Set end time to "2027-11-30 13:00:00"|
     | 3a1. The error message is displayed | Check the "Add" button is disabled <br> Check the error message "End time must be after start time." is present |
    | 3b. The user enters an activity name that exceeds the supported length. | Input a 201-character value in the `Name` field.<br>Keep all other required fields valid. |
    | 3b1. The activity length error is displayed. | Check that the `Add` button is disabled.<br>Check that the red error message `Name must be at most 200 characters.` is present. |
    | 4. The user clicks the  "Add" button  | Check that the "Itinerary details" page is present <br> Check that the new activity is present (check the activity name, start time and end time, and the "Activity" tag is present). |

- **Use Case: Add a transportation** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens an itinerary under the "Saved Itineraries" list| Open the Itinerary details <br> Check that the "Itinerary details form is present and the `+ Transportation` button is present" |
    | 2. The user clicks the `+ Transportation` button  | Check that an empty new transportation form is present <br> Check that the under "Mode" dropdown, the list options "walking", "cycling", "transit", "driving", "other" are present. <br> Check that the "Add" button is disabled. |
    | 3. The user selects "walking" under the "Mode" dropdown, inputs "UBC Nest" under "Start location", "UBC MCLD" under "End location", and `400` under "Distance in meters", then sets start time to "2027-11-30 14:00:00" and end time to "2027-11-30 15:00:00". | Check that the "walking" option is selected for the "Mode" dropdown.<br>Input "UBC Nest" in the "Start location" field.<br>Input "UBC MCLD" in the "End location" field.<br>Input `400` in the "Distance in meters" field.<br>Check that the start and end times are displayed. |
     | 3a. The user enters an invalid distance.   | Input "abc" in distance field|
     | 3a1. The error message is displayed | Check the "Add" button is disabled <br> Check the error message "Distance must be a number." is present |
    | 3b. The user enters an invalid time range. | Set start time to `2027-11-30 14:00:00` and end time to `2027-11-30 13:00:00`. |
    | 3b1. The time-range error is displayed. | Check that the `Add` button is disabled.<br>Check that the error message `End time must be after start time.` is present. |
    | 3c. The user enters a transportation location that exceeds the supported length. | Input a 501-character value in the `Start location` field.<br>Keep all other required fields valid. |
    | 3c1. The transportation length error is displayed. | Check that the `Add` button is disabled.<br>Check that the red error message `Start location must be at most 500 characters.` is present. |
    | 4. The user clicks the  "Add" button  | Check that the "Itinerary details" page is present <br> Check that the new transportation is present (check the transportation mode, start time and end time, and the "Transportation" tag is present). |

- **Use Case: Modify an activity** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens an activity from the Itinerary Details page | Check that "Edit" button is present <br> Check that the Activity form is present. |
    | 2. The user clicks the `Edit` button  | Check that the activity fields are enabled.<br>Check that "Name", "Category", "Location", "Start time", and "End time" have required-field asterisks.<br>Check that "Image URL" is marked optional. |
    | 3. The user types "edited activity" under "Name", selects "art" under "Category", inputs "UBC Nest" under "Location", and sets start time to "2027-11-30 14:00:00" and end time to "2027-11-30 15:00:00". | Input "edited activity" in the "Name" field.<br>Select "art" in the "Category" dropdown.<br>Input "UBC Nest" in the "Location" field.<br>Leave "Image URL (optional)" blank.<br>Check that the start and end times are displayed. |
    | 4. The user clicks the  "Save" button  | Check that the message "Activity saved." is present. |

- **Use Case: Modify a transportation** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens a transportation segment from the Itinerary Details page | Check that the "Edit" button is present.<br>Check that the transportation details are present. |
    | 2. The user clicks the `Edit` button  | Check that the fields from Transportation form are enabled.  |
    | 3. The user selects "transit" under the "Mode" dropdown, inputs "UBC Nest" under "Start location", "UBC Exchange" under "End location", and `400` under "Distance in meters", then sets start time to "2027-11-30 14:00:00" and end time to "2027-11-30 15:00:00". | Check that the "transit" option is selected.<br>Input the start location, end location, and distance values.<br>Check that the start and end times are displayed. |
    | 3a. The user enters an invalid distance. | Replace the value in the `Distance in meters` field with `abc`. |
    | 3a1. The distance error is displayed. | Check that the `Save` button is disabled.<br>Check that the error message `Distance must be a number.` is present. |
    | 3b. The user enters an invalid time range. | Set start time to `2027-11-30 14:00:00` and end time to `2027-11-30 13:00:00`. |
    | 3b1. The time-range error is displayed. | Check that the `Save` button is disabled.<br>Check that the error message `End time must be after start time.` is present. |
    | 3c. The user enters a transportation location that exceeds the supported length. | Input a 501-character value in the `Start location` field.<br>Keep all other required fields valid. |
    | 3c1. The transportation length error is displayed. | Check that the `Save` button is disabled.<br>Check that the red error message `Start location must be at most 500 characters.` is present. |
    | 4. The user clicks the  "Save" button  | Check that the message "Transportation saved." is present. |

- **Use Case: Remove an Activities** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens an activity from the Itinerary Details page | Check that "Delete" button is present. |
    | 2. The user clicks the 'delete' button  | Check that a dialog with a message "Delete Item?" is present.  |
    | 3. The user clicks the 'yes' button from the dialog | Check that Itineray Details page <br> Check that the message "Item deleted." is present <br> Check that the deleted activity is not present".|

- **Use Case: Remove a Transportation** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens an Transportation from the Itinerary Details page | Check that "Delete" button is present. |
    | 2. The user clicks the 'delete' button  | Check that a dialog with a message "Delete Item?" is present.  |
    | 3. The user clicks the 'yes' button from the dialog | Check that Itineray Details page <br> Check that the message "Item deleted." is present <br> Check that the deleted transportation is not present".|

- **Use Case: Delete an itinerary** (Itineraries)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens an itinerary under the "Saved Itineraries" list| Open the Itinerary details <br> Check that the Itinerary details form is present and the `delete` button is present. |
    | 2. The user clicks the 'delete' button  | Check that a dialog with a message "Delete Itinerary?" is present.  |
    | 3. The user clicks the 'yes' button from the dialog | Check that Trip Screen is present <br> Check that the message "Itinerary deleted." is present <br> Check that the deleted itinerary is not present under "Saved itineraries".|


- **Use Case: View Event Recommendations** (Live Events) *(planned; not yet implemented or run)*

  - **Setup:** The test starts on the main screen with a known user already logged in. Before the test, the backend is seeded with the user's `live_music` interest and 21 known upcoming Music events near the default location, each with a different distance so their ranking is known. The seeded data is removed after the test.
  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens the live-events feature. | Click the `Events` navigation item. |
    | 2. The system retrieves the user's saved interest preference and location, ranks nearby upcoming events, and displays the first page of event cards with their relevant information. | Check that the `Live Events` heading is present.<br>Check that the highest-ranked seeded event card is present with its title, category, description, formatted start time, `<venue>, <city>`, price, distance, `View event details` button, and `Add to itinerary` button.<br>Check that exactly 20 event cards are loaded. |
    | 3. The user reviews the recommended events. | Scroll through the list.<br>Check that the cards appear in descending recommendation order (nearest event first for the seeded data). |
    | 4. The system indicates whether more recommendations are available. | Check that the `Load more` button is present at the bottom of the list. |
    | 5. The user requests the next page when they want to view more recommendations. | Click the `Load more` button. |
    | 6. The system retrieves and displays the additional recommendations. | Check that the 21st seeded event card is now present.<br>Check that no card is duplicated.<br>Check that the `Load more` button is no longer present. |
    | 2b. No stored events satisfy the location and recommendation threshold. | Seed a user whose interest and location produce no event with a score of 40 or higher. Click the `Events` navigation item. |
    | 2b1. The system informs the user that no matching events are currently available. | Check that the message `No events found` and the `Refresh` button are present. |

  - **Omitted failure scenarios:** Failures 2a and 6a (network or server error while loading) can only be produced by replacing the frontend's backend connection with a mock, so they are not part of the required real-backend E2E suite.
  - **Test Logs:**
    ```
    [Placeholder for E2E test execution logs]
    ```

- **Use Case: Add an Event to an Itinerary** (Live Events to Itineraries) *(planned; not yet implemented or run)*

  - **Setup:** The test starts on the main screen with a known user already logged in, one seeded upcoming event, and one seeded saved itinerary. The conflict scenarios additionally seed an itinerary item that overlaps the event. The seeded data is removed after the test.
  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user selects `Add to itinerary` on an event card. | Click the `Events` navigation item.<br>Click the `Add to itinerary` button on the seeded event card.<br>Check that the dialog titled `Add <event title>` is present. |
    | 2. The system displays the event's suggested end time and the user's saved itineraries. | Check that `Starts: <formatted start time>` is present.<br>Check that the `End time` field contains the event's end time (or two hours after the start when the event has none).<br>Check that the seeded itinerary name is present as a button. |
    | 2a. The user has no saved itinerary. | Seed a user with no saved itinerary and open the dialog. |
    | 2a1. The system lets the user create an itinerary for the event. | Check that `You do not have an itinerary yet.` is present and `Create and add` is disabled.<br>Input a new itinerary name.<br>Click the `Create and add` button.<br>Check that the message `Created <itinerary name> and added the event.` is present. |
    | 3. The user selects an itinerary. | Click the seeded itinerary's name button. |
    | 3a. The user sets an end time that is not after the event start. | Set the `End time` field to the event's start time. |
    | 3a1. The system rejects the end time. | Check that `End time must be after the event start time.` is present.<br>Check that the itinerary buttons are disabled. |
    | 4. The system adds the event as an activity. | Check that the dialog closes and the message `Added to <itinerary name>.` is present.<br>Click the `Trips` navigation item and open the seeded itinerary.<br>Check that an activity is present with the event's title, `<venue>, <city>` as its location, and the event's start and end times. |
    | 3b. The event overlaps an existing itinerary item. | Select an itinerary that contains an item overlapping the event's time. |
    | 3b1. The system shows the conflicting items. | Check that the `Schedule conflict` dialog lists the conflicting item's name and time.<br>Check that `Added to <itinerary name>.` is not present. |
    | 3b2. The user keeps the existing schedule. | Click the `Keep existing schedule` button.<br>Open the itinerary and check that the conflicting item is still present and the event was not added. |
    | 3b3. The user replaces the conflicting items with the event. | Click the `Replace with new item` button.<br>Check that `Added to <itinerary name>.` is present.<br>Open the itinerary and check that the event is present and the conflicting item is not. |

  - **Omitted failure scenarios:** Failures that need the itinerary request to fail (itinerary loading error, creation error, activity insertion error, replacement error) can only be produced by mocking the frontend's backend connection, so they are not part of the required E2E suite.
  - **Test Logs:**
    ```
    [Placeholder for E2E test execution logs]
    ```

- **Use Case: Refresh Event Recommendations After a Preference Change** (Live Events) *(planned; not yet implemented or run)*

  - **Setup:** The test starts on the main screen (the app opens on Events) with a known user already logged in whose interest is `outdoors`. The backend is seeded with Sports events and Music events, so changing the interest to `live_music` adds Music events to the user's first page of recommendations. The seeded data is removed after the test.
  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The app loads the user's current recommendations. | Wait for the Sports event cards to be present on the Events screen. |
    | 2. The user opens their profile and saves a different interest. | Click the `Profile` navigation item.<br>Select `live_music` in the interest dropdown.<br>Click the `Save preferences` button.<br>Check that the message `Preferences saved.` is present. |
    | 3. The system refreshes recommendations in the background and compares them with the previous recommendations. It notifies the user while they remain on another screen. | Without leaving the Profile screen, check that the in-app notification `<count> new events near you` is present with a `View` action. |
    | 3a. The new recommendations contain no new events. | Seed so the changed interest produces no event that was not already recommended. Save the changed preference. |
    | 3a1. The system displays no notification. | Check that no `new event` notification is present. |

  - **Test Logs:**
    ```
    [Placeholder for E2E test execution logs]
    ```

- **Use Case: Refresh Event Recommendations After a Location Change** (Live Events) *(to be defined)*

  - The 10 km movement threshold depends on the device location provider, so how to test it will be decided later.

    <!-- | 3a. The user inputs an ill-formatted string. | Input "_^_^^OQ#$" in the text field. |
    | 3a1. The app displays an error message prompting the user for the expected format. | Check that a dialog is opened with the text: "Please use only alphanumeric characters ". |
    | 4. The user presses the "Add" button. | Click the button labelled "add ". |
    | 5. The screen refreshes and the new item is at the bottom of the todo list. | Check that a text box with the text "buy milk" is present on screen.<br>Input "buy chocolate" in the text field.<br>Click the button labelled "add".<br>Check that two text boxes are present on the screen with "buy milk" on top and "buy chocolate" at the bottom. |
    | 5a. The list exceeds the maximum todo-list size. | Repeat steps 3 to 5 ten times.<br>Check that a dialog is opened with the text: "You have too many items, try completing one first". | -->

  - **Test Logs:**
    ```
    Starting 9 tests on Medium_Phone_API_36.0(AVD) - 16
    Finished 9 tests on Medium_Phone_API_36.0(AVD) - 16
    BUILD SUCCESSFUL
    ```

- **Use Case: ...**

  - **Expected Behaviors:**

    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | ...                | ...                 |

  - **Test Logs:**
    ```
    [Placeholder for Espresso test execution logs]
    ```

- **...**
