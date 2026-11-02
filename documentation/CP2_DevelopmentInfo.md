# **CP2 Development Information**

## 1. Repository and submission version

| Repository | https\://github.com/m1lun/m1skeletonProject  |
| :---- | :---- |
| Submission branch | main |
| Submission commit SHA | 149f16a96f8931a37c0b1c8f2affbebcb3c4cc6d |

## 2. Backend server

| Configured public IP | 34.168.1.92  |
| :---- | :---- |
| Configured backend URL | https\://34.168.1.92:3000  |
| Domain name | (optional) |
| Health endpoint | GET https\://34.168.1.92:3000/health returns {"status":"ok"} |

## 3. Project scope requirement

| Requirement | Use case | How it is implemented |
| :---- | :---- | :---- |
| Team written computational code | Use Case 3: View Recommendations for a Post | Team-written matching in backend/src/matching/. Hard requirements filter the candidate posts, and soft preferences rank the rest, weighted by their importance, so the best fit comes first. |
| External API | Use Case 3: View Recommendations for a Post | The backend calls the OpenRouteService matrix API for the travel time to each match on the first page of recommendations, with a 2-second timeout. If the call fails, the recommendations are still returned and the app shows "Travel time unavailable". |
| App response to external events | Use Case 4: Send a Message | When one user sends a message or proposes, accepts or declines a price, the other user's open conversation updates without refreshing. The backend pushes these changes through Server-Sent Events on GET /api/events. |

## 4. Configuration and setup

Frontend: Android Studio, Java 17 and Android SDK Platform 35\. Verify the submitted APK on the required Pixel 9 emulator with Android Baklava API 36\.

Backend (only to run it yourself locally): Docker Compose 2.24+ with the supplied MongoDB 7 service. Direct execution instead requires [Node.js](http://Node.js) 22.x, npm 10+ and a running MongoDB instance.

| Configuration | Value |
| :---- | :---- |
| Google Web OAuth client ID | 84981459595-fiektced5pi2ihihr18g1bh49cckka69.apps.googleusercontent.com  |
| Release signing key SHA | SHA-1 43:42:F8:9F:45:6A:5B:D6:1C:84:AF:3E:22:0D:80:F4:C9:17:30:02 |
| Additional API keys or private setup details | ORS\_API\_KEY in backend/.env: an OpenRouteService API key, free at https\://account.heigit.org/signup. It is only needed to run your own backend, and without it travel times are unavailable. The key is not stored in the repository. |
| Android application ID | com.example.matchmarket |
| Backend port / database name | 3000/matchmarket |

### Option A: use the submitted APK with the deployed back end (recommended)

1. Install CP2\_MatchMarket.apk on the Pixel 9 / API 36 emulator.
2. Open the app and sign in with Google. It already points at https\://34.168.1.92:3000, and no other setup is needed.

### Option B: build and deploy it yourself

1. Clone the repository and check out the submission commit recorded in Section 1\.

2. Copy backend/.env.example to backend/.env. Set GOOGLE\_CLIENT\_ID, MONGODB\_URI and MONGODB\_DB=matchmarket. Set JWT\_SECRET to a newly generated value of at least 32 characters for an independent deployment. Set ORS\_API\_KEY to enable travel times.

3. From the repository root, run docker compose up \--build \-d. Compose configures the MongoDB connection. Check that GET /health responds successfully.

4. For HTTPS, set ENABLE\_HTTPS=true and supply backend/certs/server.crt and server.key. For a different server, update the app’s trusted public certificate, network-security domain and backend URL. Follow the README HTTPS instructions.

5. Copy frontend/local.properties.example to frontend/local.properties. Set sdk.dir, API\_BASE\_URL and GOOGLE\_CLIENT\_ID. The Google client ID must match the backend value. Open frontend/ in Android Studio and sync Gradle.

6. Register the signing key’s SHA-1 for com.example.matchmarket in the same Google Cloud project as the Web OAuth client. The current release configuration defaults to the local debug keystore unless release-key settings are supplied.

7. From frontend/, run ./gradlew assembleRelease, or .\\gradlew.bat assembleRelease on Windows. Install app/build/outputs/apk/release/app-release.apk and verify it against the public backend. Submit it as CP2\_MatchMarket.apk.

## 5. Accounts and access

Google sign-in requires an eligible Google account on the device or emulator.

| TA account or sign-in instructions | Launch the application and select "Sign in with Google".  |
| :---- | :---- |
| Required credentials or allowlisting | None. TAs do not need to be added, and any Google account can sign in. |
| Sample data or extra access steps | No sample data is needed. The feed only shows other users' posts, so use two Google accounts: create a request with one and a listing in the same category with the other. This gives both accounts recommendations, messaging, deals and ratings to test. |

### What you can do in the app at CP2

1. **Manage posts**. In My Posts, switch between buying and selling and create a request or a listing. Set the category, address, price, condition, photos and hard or soft preferences, plus custom fields. You can edit, close, reopen and delete your posts.
2. **Browse the feed**. It shows other users' open listings or requests, newest first, filterable by category, price range, and address plus radius.
3. **See recommendations**. Open one of your own open posts and tap See recommendations. Matching posts from other users appear best fit first, with their distance in km and, on the first page, their travel time.
4. **Message other users**. Open another user's post and tap Message to send a proposed price and start a conversation. The Messages tab lists your conversations. New messages and proposals appear in an open conversation without refreshing.
5. **Make a deal**. Accept the other user's proposed price to record a deal and close both posts, or decline it so that either user can propose again.
6. **Rate deals**. In the Deals tab, see your deals with the agreed price and the other user's score, rate the other user from 1 to 5 stars with an optional comment, and edit your rating later.

## 6. Physical device

| Manufacture | Samsung |
| :---- | :---- |
| Model | S20FE |

## 7. Humblebrag

Live chat runs on Server-Sent Events with no extra library, and a chat reloads after a reconnect to recover anything it missed. Sessions use rotating refresh tokens: reusing an old token revokes every token from that sign-in.

## 8. Limitations

- Travel times are for walking only, and only on the first page of recommendations.
- Live updates only reach an open conversation. The Messages tab updates when it is opened, and there are no push notifications.
- A deal cannot be cancelled once a proposal is accepted. Ratings can be edited.
- Users cannot see their own score on the profile tab yet.
- Frontend end-to-end tests cover Feature 1 only.
- NFR 2 has an automated test, and the NFR 1 test has not been added yet.
- The app pins the server's certificate and IP address, so moving the backend needs a new APK.
- Address search uses Android's built-in Geocoder, which needs a network connection.
