# Testing

## 1. Change History

| **Change Date** | **Modified Sections** | **Rationale** |
| --------------- | --------------------- | ------------- |
| Oct 20, 2026 | 2.1, 4 | First test plan for CP1. Section 2.1 plans the back-end tests for the Game component. Section 4 plans the end-to-end test for Use Case 2, Discover Game. We will write and run the tests, and add the results, coverage, GitHub Actions file and logs, at CP2. |
| Nov 17, 2026 | 2, 2.1 | The back-end tests for the Game and Friend components are written. Each interface now has one test file without mocks and one with mocks, so section 2.1.1 gives those files and the line where each `describe` group starts. The test tables now match the tests that were written, and the Friend component's tests are added. Section 2.1.3 explains how to start the test database and run the tests. |

---

## 2. Back-end Test Specification: APIs

We test every interface of the **Game** and **Friend** components that is built (see Requirements and Design, section 4.1). The Friend component's tests are in the `social` folders.

Each interface has two test files, each with one `describe` group:
- one **without mocks**, in `backend/tests/no-mock/`, for example `describe('Unmocked: GET /api/games/discover', ...)`
- one **with mocks**, in `backend/tests/mock/`, for example `describe('Mocked: GET /api/games/discover', ...)`

Keeping the two kinds in separate folders lets us run each one on its own.

Each test has comments that say its input, the status code we expect, what should happen, and what it should return. Tests with mocks also say what the mock does.

**Tests without mocks** use a real MySQL database:
- Before each test, we add the users the test needs, and each test adds the games, requests and friendships it needs.
- After each test, we delete the users it added. Deleting a user also deletes their games, players, chats, join requests, friend requests and friendships, so one test can't change another.
- We sign in by making a JWT for the test user with `createAuthToken`. This way the tests don't need Google sign in.
- The Friend tests search all users, and other test files run at the same time on the same database. So the search tests use made-up names that no other test uses, and only check the users they added.

**Tests with mocks** don't use the database. They replace the database settings with `backend/tests/mock/mockEnv.ts`, and sign in by mocking the user lookup. They use `jest.spyOn` to:
- make database functions throw an error, to check that the server answers `500 server_error`
- replace the push notification functions (`sendPushToUser` and `sendPushToUsers`), to check who gets a notification and what type it is
- make a push notification fail, to check the server still answers and logs the failure
- replace the database transaction with a fake one, to test a request that is deleted while the server waits for it

### 2.1. Locations of Back-end Tests and Instructions to Run Them

#### 2.1.1. Tests

**Game component**

| **Interface** | **Describe Group Location, No Mocks** | **Describe Group Location, With Mocks** | **Mocked Components** |
| ------------- | ------------------------------------- | --------------------------------------- | --------------------- |
| **POST /api/games** | [`backend/tests/no-mock/game/createGame.test.ts#L18`](../backend/tests/no-mock/game/createGame.test.ts#L18) | [`backend/tests/mock/game/createGame.test.ts#L10`](../backend/tests/mock/game/createGame.test.ts#L10) | Games DB |
| **GET /api/games/mine** | [`backend/tests/no-mock/game/getMyGames.test.ts#L14`](../backend/tests/no-mock/game/getMyGames.test.ts#L14) | [`backend/tests/mock/game/getMyGames.test.ts#L10`](../backend/tests/mock/game/getMyGames.test.ts#L10) | Games DB |
| **GET /api/games/discover** | [`backend/tests/no-mock/game/discoverGames.test.ts#L41`](../backend/tests/no-mock/game/discoverGames.test.ts#L41) | [`backend/tests/mock/game/discoverGames.test.ts#L13`](../backend/tests/mock/game/discoverGames.test.ts#L13) | Games DB |
| **GET /api/games/{gameId}** | [`backend/tests/no-mock/game/getGameDetails.test.ts#L27`](../backend/tests/no-mock/game/getGameDetails.test.ts#L27) | [`backend/tests/mock/game/getGameDetails.test.ts#L21`](../backend/tests/mock/game/getGameDetails.test.ts#L21) | Games DB, Join Requests DB, MySQL queries |
| **PUT /api/games/{gameId}** | [`backend/tests/no-mock/game/updateGame.test.ts#L29`](../backend/tests/no-mock/game/updateGame.test.ts#L29) | [`backend/tests/mock/game/updateGame.test.ts#L22`](../backend/tests/mock/game/updateGame.test.ts#L22) | Games DB, Firebase push |
| **POST /api/games/{gameId}/cancel** | [`backend/tests/no-mock/game/cancelGame.test.ts#L25`](../backend/tests/no-mock/game/cancelGame.test.ts#L25) | [`backend/tests/mock/game/cancelGame.test.ts#L20`](../backend/tests/mock/game/cancelGame.test.ts#L20) | Games DB, Firebase push |
| **POST /api/games/{gameId}/complete** | [`backend/tests/no-mock/game/completeGame.test.ts#L13`](../backend/tests/no-mock/game/completeGame.test.ts#L13) | [`backend/tests/mock/game/completeGame.test.ts#L10`](../backend/tests/mock/game/completeGame.test.ts#L10) | Games DB |
| **POST /api/games/{gameId}/leave** | [`backend/tests/no-mock/game/leaveGame.test.ts#L18`](../backend/tests/no-mock/game/leaveGame.test.ts#L18) | [`backend/tests/mock/game/leaveGame.test.ts#L10`](../backend/tests/mock/game/leaveGame.test.ts#L10) | Games DB |
| **DELETE /api/games/{gameId}/players/{userId}** | [`backend/tests/no-mock/game/removePlayer.test.ts#L14`](../backend/tests/no-mock/game/removePlayer.test.ts#L14) | None yet | None |
| **POST /api/games/{gameId}/invites** | [`backend/tests/no-mock/game/inviteFriends.test.ts#L31`](../backend/tests/no-mock/game/inviteFriends.test.ts#L31) | [`backend/tests/mock/game/inviteFriends.test.ts#L15`](../backend/tests/mock/game/inviteFriends.test.ts#L15) | Games DB, Friends DB, Firebase push |
| **POST /api/games/{gameId}/join-requests** | [`backend/tests/no-mock/game/sendJoinRequest.test.ts#L31`](../backend/tests/no-mock/game/sendJoinRequest.test.ts#L31) | [`backend/tests/mock/game/sendJoinRequest.test.ts#L22`](../backend/tests/mock/game/sendJoinRequest.test.ts#L22) | Join Requests DB, Firebase push |
| **GET /api/games/{gameId}/join-requests** | [`backend/tests/no-mock/game/listJoinRequests.test.ts#L34`](../backend/tests/no-mock/game/listJoinRequests.test.ts#L34) | [`backend/tests/mock/game/listJoinRequests.test.ts#L11`](../backend/tests/mock/game/listJoinRequests.test.ts#L11) | Games DB, Join Requests DB |
| **PATCH /api/games/{gameId}/join-requests/{requestId}** | [`backend/tests/no-mock/game/answerJoinRequest.test.ts#L32`](../backend/tests/no-mock/game/answerJoinRequest.test.ts#L32) | [`backend/tests/mock/game/answerJoinRequest.test.ts#L18`](../backend/tests/mock/game/answerJoinRequest.test.ts#L18) | Games DB, Join Requests DB, Firebase push |

**Friend component**

| **Interface** | **Describe Group Location, No Mocks** | **Describe Group Location, With Mocks** | **Mocked Components** |
| ------------- | ------------------------------------- | --------------------------------------- | --------------------- |
| **GET /api/users/search** | [`backend/tests/no-mock/social/searchUsers.test.ts#L40`](../backend/tests/no-mock/social/searchUsers.test.ts#L40) | [`backend/tests/mock/social/searchUsers.test.ts#L10`](../backend/tests/mock/social/searchUsers.test.ts#L10) | Friends DB |
| **GET /api/friends** | [`backend/tests/no-mock/social/getFriends.test.ts#L13`](../backend/tests/no-mock/social/getFriends.test.ts#L13) | [`backend/tests/mock/social/getFriends.test.ts#L10`](../backend/tests/mock/social/getFriends.test.ts#L10) | Friends DB |
| **GET /api/friends/requests** | [`backend/tests/no-mock/social/listFriendRequests.test.ts#L13`](../backend/tests/no-mock/social/listFriendRequests.test.ts#L13) | [`backend/tests/mock/social/listFriendRequests.test.ts#L10`](../backend/tests/mock/social/listFriendRequests.test.ts#L10) | Friends DB |
| **POST /api/friends/requests** | [`backend/tests/no-mock/social/sendFriendRequest.test.ts#L15`](../backend/tests/no-mock/social/sendFriendRequest.test.ts#L15) | [`backend/tests/mock/social/sendFriendRequest.test.ts#L22`](../backend/tests/mock/social/sendFriendRequest.test.ts#L22) | Friends DB, Firebase push, Logger |
| **PATCH /api/friends/requests/{requestId}** | [`backend/tests/no-mock/social/answerFriendRequest.test.ts#L24`](../backend/tests/no-mock/social/answerFriendRequest.test.ts#L24) | [`backend/tests/mock/social/answerFriendRequest.test.ts#L23`](../backend/tests/mock/social/answerFriendRequest.test.ts#L23) | Friends DB, MySQL transaction, Firebase push, Logger |

The unmocked Friend tests share their setup helpers in [`backend/tests/no-mock/social/friendHelpers.ts`](../backend/tests/no-mock/social/friendHelpers.ts).

#### Test cases

**Signing in**

Every route checks that the user is signed in first, in the same middleware. The Friend component's groups without mocks test it for each of their interfaces:

| **Test** | **Input** | **Expected status** | **What should happen** |
| -------- | --------- | ------------------- | ---------------------- |
| Rejects a call that is not signed in | No `Authorization` header, then `Authorization: Bearer not-a-real-token` | 400, then 401 | Nothing changes. Returns `{ msg: "invalid_request" }`, then `{ msg: "invalid_token", error: "Invalid jwt_token" }` |

##### Game component

**POST /api/games** (create a game)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Organizer creates a game | All fields, starting tomorrow | 201 | The game is saved. The user is its organizer and first player, and its chat is opened. Returns the game with `player_count` 1 and `status` "scheduled" |
| With mocks | Database fails while saving | `createGame` throws | 500 | Returns `{ msg: "server_error" }`. The game is never read back |
| With mocks | Invalid body never reaches the database | A game without `title`, `createGame` watched | 400 | Returns `{ msg: "invalid_request" }`. `createGame` is never called |

**GET /api/games/mine** (the user's games)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Organized and joined | The user organizes one game and plays in another | 200 | `organized_games` and `joined_games` each have the right game |
| No mocks | No games | A user with no games | 200 | Returns `{ msg: "no_games" }` |
| With mocks | Database fails | `getGamesForUser` throws | 500 | Returns `{ msg: "server_error" }` |

**GET /api/games/discover** (games near the user)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Nearby games, closest first | Three games by other users, 200 m, 1 km and 2 km away | 200 | Returns the three games in that order. Each has `distance_m`, and `join_request_status` is null |
| No mocks | Full game still shows | A nearby game with no spots left | 200 | The game is in the list, with `player_count` equal to `max_players` |
| No mocks | Games that should not show | The user's own game, a game they joined, a cancelled game, a past game, and a game 60 km away | 200 | Returns `{ msg: "no_games" }` |
| No mocks | Request status | The user has a pending request for a nearby game | 200 | That game has `join_request_status: "pending"` |
| No mocks | Location out of range | `lat=95&lng=0` | 400 | Returns `{ msg: "invalid_request" }` |
| No mocks | No location | No `lat` in the query | 400 | Returns `{ msg: "invalid_request" }` |
| With mocks | Database fails | `getDiscoverGames` throws | 500 | Returns `{ msg: "server_error" }` |

**GET /api/games/{gameId}** (game details)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Organizer | The organizer opens their game, which has two pending requests | 200 | `viewer_role` is "organizer" and `pending_requests` is 2 |
| No mocks | Player | A user opens a game they joined | 200 | `viewer_role` is "player" |
| No mocks | Viewer | A user opens a game they asked to join | 200 | `viewer_role` is "viewer" and `join_request_status` is "pending" |
| No mocks | Bad id | `/api/games/abc` | 400 | Returns `{ msg: "invalid_request" }` |
| No mocks | Game doesn't exist | An id with no game | 404 | Returns `{ msg: "not_found" }` |
| With mocks | Organizer not in players list | `getGamePlayers` doesn't return the organizer, the user lookup in `findOrganizer` does | 200 | `organizer` comes from the user lookup |
| With mocks | Organizer not found | Neither lookup finds the organizer | 500 | Returns `{ msg: "server_error" }` |
| With mocks | Database fails | `getGameById` throws | 500 | Returns `{ msg: "server_error" }` |

**PUT /api/games/{gameId}** (edit a game)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Valid edit | The organizer changes the title and time | 200 | The game is updated. Returns the game with the new values |
| No mocks | Bad field | `sport: "chess"` | 400 | The game doesn't change. Returns `{ msg: "invalid_request" }` |
| No mocks | Too few spots | `max_players` is less than the players already in the game | 400 | The game doesn't change. The error says how many players are in it |
| No mocks | Cancelled game | Edit a cancelled game | 409 | The game doesn't change. Returns `{ msg: "game_cancelled" }` |
| No mocks | Game already started | Edit a game that already started | 409 | The game doesn't change. Returns `{ msg: "game_started" }` |
| No mocks | Not the organizer | Another user edits the game | 403 | The game doesn't change. Returns `{ msg: "forbidden" }` |
| No mocks | Game doesn't exist | An id with no game | 404 | Returns `{ msg: "not_found" }` |
| With mocks | Players are told | Valid edit, `sendPushToUsers` replaced | 200 | Players and people with pending requests (not the organizer) get a `game_updated` notification that says what changed |
| With mocks | Nothing changed | Same values as before, `sendPushToUsers` replaced | 200 | No notification is sent |
| With mocks | Database fails | `updateGame` throws | 500 | Returns `{ msg: "server_error" }` |

**POST /api/games/{gameId}/cancel** (cancel a game)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Organizer cancels their game | The organizer cancels an upcoming game | 200 | The game's `status` becomes "cancelled". Returns the game |
| No mocks | Already cancelled | Cancel the same game twice | 409 | Returns `{ msg: "game_cancelled" }` the second time |
| No mocks | Game already started | Cancel a game that already started | 409 | The game doesn't change. Returns `{ msg: "game_started" }` |
| No mocks | Game doesn't exist | An id with no game | 404 | Returns `{ msg: "not_found" }` |
| No mocks | Not the organizer | Another user cancels it | 403 | The game doesn't change. Returns `{ msg: "forbidden" }` |
| With mocks | Players are told | `sendPushToUsers` replaced | 200 | Players and people with pending requests get a `game_cancelled` notification |
| With mocks | Database fails | `cancelGame` throws | 500 | Returns `{ msg: "server_error" }` |

**POST /api/games/{gameId}/complete** (mark a game completed)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Organizer marks their started game completed | The organizer completes their started game | 200 | The game's `status` becomes "completed". Returns the game |
| No mocks | A malformed no-show list is rejected | `no_show_user_ids: ["seven"]` | 400 | The game doesn't change. Returns `{ msg: "invalid_request" }` |
| With mocks | Organizer marks players who did not show up | `no_show_user_ids: [7, 8, 7]` | 200 | `completeGame` gets each no-show once, `[7, 8]` |

**POST /api/games/{gameId}/leave** (leave a game)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Player leaves a game that has another player | A player leaves an upcoming game that has another player | 200 | The player is no longer in the game, and the other player and the game remain. Returns the game with `player_count` down by one |
| No mocks | Last player leaves and the game is deleted | The organizer, the only player left in their cancelled game, leaves it | 200 | The game, its players and its chat are deleted. Returns `{ msg: "success", game: null, game_deleted: true }` |
| With mocks | Database fails | `leaveGame` throws | 500 | Returns `{ msg: "server_error" }` |

**DELETE /api/games/{gameId}/players/{userId}** (remove a player from a game)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Organizer removes the second player | The organizer removes the other player from their upcoming game | 200 | The player is no longer in the game, and only the organizer is left. Returns the game with `player_count` 1 |

**POST /api/games/{gameId}/invites** (invite friends to a game)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Organizer cannot invite to a cancelled, started, completed or full game | The organizer invites their friend to a game that isn't open | 409 | Returns `{ msg: "game_cancelled" }`, `{ msg: "game_started" }` (started or completed) or `{ msg: "game_full" }` |
| No mocks | Organizer cannot invite a friend already in the game | The organizer invites a friend and a friend who is already playing | 409 | Returns `{ msg: "already_player" }` |
| No mocks | `friend_ids` is rejected | `friend_ids` is missing, empty, text, not whole or zero | 400 | Returns `{ msg: "invalid_request" }` |
| No mocks | Organizer cannot invite someone who is not their friend | The organizer invites a friend and a user who isn't their friend | 403 | Nobody is invited. Returns `{ msg: "not_friend" }` |
| No mocks | A player who is not the organizer cannot invite | A player invites their own friend | 403 | Returns `{ msg: "forbidden" }` |
| With mocks | Organizer invites two friends | The organizer invites two friends, `sendPushToUsers` replaced | 201 | Each friend gets a `game_invite` notification. Returns `{ msg: "success" }` |
| With mocks | Database error | `getGameById` throws | 500 | Nobody is notified. Returns `{ msg: "server_error" }` |

**POST /api/games/{gameId}/join-requests** (ask to join a game)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Valid request | `skill_level`, `play_frequency` and `message` for another user's game | 201 | A pending request is saved with the answers |
| No mocks | Only skill level | `{ skill_level: "beginner" }` | 201 | Saved, with `play_frequency` and `message` empty |
| No mocks | Ask again | The user's earlier request was declined | 201 | The same request goes back to pending, with the new answers |
| No mocks | Bad answers | No `skill_level`; an unknown `play_frequency`; a message of 201 characters | 400 | Nothing is saved. The error names the bad field |
| No mocks | Already asked | A second request while the first is still pending | 409 | Returns `{ msg: "already_requested" }` |
| No mocks | Already a player | The user is already in the game | 409 | Returns `{ msg: "already_player" }` |
| No mocks | Asking to join a cancelled or started game | A cancelled game, and a game that already started | 409 | Returns `{ msg: "game_cancelled" }` and `{ msg: "game_started" }` |
| No mocks | Game is full | No spots left | 409 | Returns `{ msg: "game_full" }` |
| No mocks | Own game | The organizer asks to join their own game | 409 | Nothing is saved. Returns `{ msg: "own_game" }` |
| No mocks | Game doesn't exist | An id with no game | 404 | Returns `{ msg: "not_found" }` |
| With mocks | Organizer is told | Valid request, `sendPushToUser` replaced | 201 | The organizer gets a `join_request` notification with the game's id |
| With mocks | Database fails | `createJoinRequest` throws | 500 | Returns `{ msg: "server_error" }` |

**GET /api/games/{gameId}/join-requests** (the organizer's list of requests)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Pending requests | The organizer's game has two pending requests and one declined | 200 | Returns only the two pending requests, newest first, with each person's name and answers |
| No mocks | Reputation score | The requester has a no-show in one past game and 3 stars from the only other player in another | 200 | The request's `reputation_score` is 3.8 |
| No mocks | No requests | Nobody has asked to join | 200 | `requests` is an empty list |
| No mocks | Not the organizer | Another user asks for the list | 403 | Returns `{ msg: "forbidden" }` |
| No mocks | Game doesn't exist | An id with no game | 404 | Returns `{ msg: "not_found" }` |
| With mocks | Database fails | `getPendingJoinRequests` throws | 500 | Returns `{ msg: "server_error" }` |

**PATCH /api/games/{gameId}/join-requests/{requestId}** (approve or decline a request)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Game is full | Approve when no spots are left | 409 | Nothing changes. Returns `{ msg: "game_full" }` |
| No mocks | Approve | `{ decision: "approve" }` for a pending request | 200 | The request is approved and the person joins the game. `player_count` goes up by one |
| No mocks | Decline | `{ decision: "decline" }` | 200 | The request is declined. The players don't change |
| No mocks | Already answered | Answer the same request twice | 409 | Returns `{ msg: "already_responded" }` the second time |
| No mocks | Bad input | `{ decision: "maybe" }`, and a bad request id | 400 | The request stays pending. Returns `{ msg: "invalid_request" }` |
| No mocks | Cancelled game | Answer a request for a cancelled game | 409 | Returns `{ msg: "game_cancelled" }` |
| No mocks | Not the organizer | Another user answers | 403 | Nothing changes. Returns `{ msg: "forbidden" }` |
| No mocks | Request doesn't exist | A request id that isn't in this game | 404 | Returns `{ msg: "request_not_found" }` |
| With mocks | Person is told | Approve one request and decline another, `sendPushToUser` replaced | 200 | The first person gets `join_request_approved` and the second gets `join_request_declined` |
| With mocks | Database fails | `decideJoinRequest` throws | 500 | Returns `{ msg: "server_error" }` |

##### Friend component

**GET /api/users/search** (search for users by name)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Rejects a call that is not signed in | See "Signing in" above | 400, then 401 | Nobody is searched for |
| No mocks | Bad query | `q` missing, empty, only spaces, 101 characters, or given twice | 400 | Returns `{ msg: "invalid_request", error: "q must be text of 1 to 100 characters" }` |
| No mocks | Accepts a query of exactly 100 characters | `q` of 100 characters that matches nobody | 200 | Returns `{ msg: "success", users: [] }` |
| No mocks | No user matches | `q` that no name is close to | 200 | Returns `{ msg: "success", users: [] }` |
| No mocks | The searcher is left out of their own results | The searcher searches their own full name, with spaces around it | 200 | The text is trimmed. Another user with the same name is found, the searcher is not |
| No mocks | Each result shows its friendship status | Matching users: a friend, one the searcher asked, one who asked the searcher, one whose request the searcher declined, and a stranger | 200 | `friendship_status` is `friends`, `request_sent`, `request_received`, and `none` for the stranger and for a declined request |
| No mocks | Best matches come first | Names that are the same, start with `q`, have a word starting with `q`, contain `q`, or are one or two letters off | 200 | Results come in that order, equal matches by name then id. Names that are too different are left out |
| No mocks | Returns at most 20 users | 21 users match | 200 | The first 20 by name are returned |
| With mocks | Database fails | `searchUsers` throws | 500 | Returns `{ msg: "server_error" }`. `searchUsers` got the trimmed text |

**GET /api/friends** (the user's friends)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Rejects a call that is not signed in | See "Signing in" above | 400, then 401 | No friends are read |
| No mocks | User has no friends | A user with no friends | 200 | Returns `{ msg: "success", friends: [] }` |
| No mocks | Friends are listed in name order with their chat | Three friends, pending requests each way, and a stranger | 200 | Only the friends are listed, by first name, each with the `chat_id` the two share |
| No mocks | Both friends see each other with the same chat | Two friends, the second lists their friends | 200 | The first user is listed with the same `chat_id` |
| With mocks | Database fails | `getFriends` throws | 500 | Returns `{ msg: "server_error" }` |

**GET /api/friends/requests** (friend requests waiting for the user's answer)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Rejects a call that is not signed in | See "Signing in" above | 400, then 401 | No requests are read |
| No mocks | User has no requests | Nobody sent the user a request | 200 | Returns `{ msg: "success", requests: [] }` |
| No mocks | Pending requests are listed newest first | Four pending requests, two sent at the same time | 200 | Newest first, and requests sent at the same time newest id first. Each has `request_id` and the sender's name |
| No mocks | Only pending requests to the user are listed | Accepted and declined requests, a request the user sent, a request between two other users, and one pending request to the user | 200 | Only the pending request to the user is listed |
| With mocks | Database fails | `getIncomingFriendRequests` throws | 500 | Returns `{ msg: "server_error" }` |

**POST /api/friends/requests** (send a friend request)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Rejects a call that is not signed in | See "Signing in" above | 400, then 401 | No request is saved |
| No mocks | Bad user_id | No body, no `user_id`, or a `user_id` that is text, 0, negative, a decimal, or too big | 400 | No request is saved. Returns `{ msg: "invalid_request" }` |
| No mocks | Cannot send a request to yourself | The user's own `user_id` | 409 | No request is saved. Returns `{ msg: "own_request" }` |
| No mocks | User does not exist | A `user_id` no user has | 404 | No request is saved. Returns `{ msg: "user_not_found" }` |
| No mocks | Already friends | A request to a friend | 409 | No request is saved. Returns `{ msg: "already_friends" }` |
| No mocks | Already sent a request | A second request while the first is pending | 409 | The first request stays the only one. Returns `{ msg: "already_requested" }` |
| No mocks | Already received a request from them | The other user already has a pending request to the user | 409 | Theirs stays pending. Returns `{ msg: "request_received" }` |
| No mocks | Sends a request | A user with no friendship or request with the sender | 201 | A pending request is saved. Returns `{ request: { request_id, user_id, status: "pending" } }` |
| No mocks | Asks again after being declined | The other user declined the sender's earlier request | 201 | The earlier request is pending again, no second one is saved. Returns the earlier `request_id` |
| With mocks | Database fails | `sendFriendRequest` throws | 500 | Nobody is notified. Returns `{ msg: "server_error" }` |
| With mocks | Receiver is told | A request that saves, `sendPushToUser` replaced | 201 | The receiver gets a `friend_request` notification naming the sender |
| With mocks | Notification fails | A request that saves, `sendPushToUser` throws | 201 | The request is still sent and the failed notification is logged |

**PATCH /api/friends/requests/{requestId}** (accept or decline a friend request)

| **Group** | **Test** | **Input** | **Expected status** | **What should happen** |
| --------- | -------- | --------- | ------------------- | ---------------------- |
| No mocks | Rejects a call that is not signed in | See "Signing in" above | 400, then 401 | The request stays pending |
| No mocks | Bad input | A `requestId` of "abc" or 0, no `decision`, or `decision: "maybe"` | 400 | The request stays pending. Returns `{ msg: "invalid_request" }` |
| No mocks | Request does not exist | A request id no request has | 404 | Returns `{ msg: "request_not_found" }` |
| No mocks | Only the receiver can answer | The sender and a third user each try to accept | 404 | The request stays pending and nobody becomes friends. Returns `{ msg: "request_not_found" }` |
| No mocks | Receiver accepts | `{ decision: "accept" }` | 200 | The request is accepted, the two become friends with one shared chat, and each sees the other in `GET /api/friends` |
| No mocks | Receiver declines | `{ decision: "decline" }` | 200 | The request is declined. They don't become friends and no chat is opened |
| No mocks | A request can only be answered once | Answer an accepted request again, with "decline" and with "accept" | 409 | The first answer stands. Returns `{ msg: "already_responded" }` |
| With mocks | Database fails | `decideFriendRequest` throws | 500 | Nobody is notified. Returns `{ msg: "server_error" }` |
| With mocks | Sender is told when the receiver answers | "accept" and "decline", `sendPushToUser` replaced | 200 | The sender gets `friend_request_accepted` or `friend_request_declined` |
| With mocks | Notification fails | An answer that saves, `sendPushToUser` throws | 200 | The answer is still saved and the failed notification is logged |
| With mocks | Request is gone once locked | A fake transaction: the request is found, then gone after the users are locked | 404 | Nothing is written and nobody is notified. Returns `{ msg: "request_not_found" }` |

#### 2.1.2. Commit Hash Where Tests Run

_To be added at CP2._

#### 2.1.3. Explanation on How to Run the Tests

The tests without mocks need MySQL, which runs in Docker. The tests with mocks don't use the database. The tests can run on your own computer with npm, or inside the back-end Docker container.

**Setup (both ways)**

1. **Clone the repository:**
   ```
   git clone https://github.com/pawanpaddaeng/SportsNow_Project.git
   cd SportsNow_Project
   ```
2. **Add the environment files:** copy `.env.example` to `.env` in the root folder and fill it in, and add `backend/.env` with `JWT_SECRET`.
3. **Start Docker Desktop.** The first time MySQL starts, it creates the tables from `mysql/init/`.

**Running the tests on your computer with npm**

In our Docker setup MySQL is only reachable from inside Docker, so `docker-compose.test.yml` also opens it to your own computer, on `127.0.0.1:3307`. Before the tests run, `backend/tests/setupEnv.ts` reads the database login from the root `.env` and connects to that port.

1. **Install the back-end packages:**
   ```
   cd backend
   npm install
   cd ..
   ```
2. **Start the test database** from the root folder:
   ```
   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d mysql-db
   ```
3. **Run all the tests** from the root folder. The script runs the tests with mocks, then without mocks, then both together. Each run saves a coverage report in `backend/coverage/mock`, `backend/coverage/no-mock` and `backend/coverage/interface`.
   - macOS / Linux: `./scripts/run-backend-interface-tests.sh`
   - Windows: `.\scripts\run-backend-interface-tests.ps1`

   Or run one set of tests from the `backend` folder:
   - Tests with mocks: `npx jest tests/mock`
   - Tests without mocks: `npx jest tests/no-mock`
   - One component: `npx jest tests/no-mock/game` or `npx jest tests/mock/social`
   - One interface: `npx jest tests/no-mock/social/searchUsers.test.ts`
4. **Stop the database** from the root folder when you're done:
   ```
   docker compose down
   ```

**Running the tests inside Docker**

The back-end container reaches MySQL directly, so it doesn't need `docker-compose.test.yml` or npm on your computer.

1. **Start MySQL and the back end** from the root folder. The container copies the code when it is built, so run this again after changing a test.
   ```
   docker compose up -d --build mysql-db backend
   ```
2. **Run the tests** from the root folder:
   - Tests with mocks: `docker compose exec backend npx jest tests/mock --coverageDirectory=coverage/mock`
   - Tests without mocks: `docker compose exec backend npx jest tests/no-mock --coverageDirectory=coverage/no-mock`
   - Both together: `docker compose exec backend npx jest tests/mock tests/no-mock --coverageDirectory=coverage/interface`
   - One component or interface: `docker compose exec backend npx jest tests/no-mock/game` or `docker compose exec backend npx jest tests/no-mock/social/searchUsers.test.ts`

   The coverage reports are saved inside the container, in `/app/coverage/`.
3. **Stop the containers** when you're done:
   ```
   docker compose down
   ```

### 2.2. GitHub Actions Configuration Location

_To be added at CP2._

### 2.3. Jest Coverage Report Screenshots With Mocks

_To be added at CP2._

### 2.4. Jest Coverage Report Screenshots Without Mocks

_To be added at CP2._

---

## 3. Tests of Non-Functional Requirements

_To be added at CP2._

---

## 4. Front-end Test Specification

### 4.1. Location in Git of Front-end Test Suite:

`frontend/app/src/androidTest/java/com/example/cpen321application/e2e/DiscoverGameTest.kt` _(written at CP2)_

### 4.2. Tests

- **Use Case: Discover Game (Use Case 4)**

  - **Before the tests:**
    - **Signed in:** Each test starts signed in, on the Home screen.
    - **Test games:** Discover never shows your own games. So before the tests, `scripts/run-frontend-e2e-tests` runs a script that adds games to the database. The games belong to a test organizer, and are near a fixed test location. The script first removes the test games from earlier runs, so every run starts the same. It adds:
      - "E2E Basketball Near": basketball, 200 m away
      - "E2E Basketball Far": basketball, 1 km away
      - "E2E Soccer": soccer, 2 km away
      - no volleyball games
    - **Phone location:** The tests set the phone's location with a test location provider. They allow this with the command `appops set ... android:mock_location allow`.
    - **Location permission:** The tests give the app location permission before each test (`GrantPermissionRule`), so the permission pop-up doesn't appear.
    - **Location off (2a):** The 2a test turns the phone's location off with the command `cmd location set-location-enabled false`. It turns location back on at the end.

  - **Expected Behaviors:**

    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. Player selects the compass in the navigation bar. | Set the phone's location to the test location.<br>Click the "Discover" tab in the bottom bar.<br>Check that the text "Discover" is on the screen. |
    | 2. System gets the Player's location from the phone. | Check that "Showing games near" and "Your location" are on the screen.<br>Check that there is no location error message on the screen. |
    | 2a. System cannot get the Player's location (e.g. location is turned off or location access is denied). | Turn the phone's location off.<br>Click the "Discover" tab in the bottom bar. |
    | 2a1. System displays an error message and lets the Player try again or choose a place on the map. | Check that the text "Location is turned off. Turn it on in your phone's settings, then try again." is on the screen.<br>Check that the "Try again" button is on the screen.<br>Check that "Choose a location" and "Change" are on the screen.<br>Turn the phone's location back on.<br>Click the "Try again" button.<br>Check that the text "3 games nearby" is on the screen. |
    | 3. System displays the nearby games sorted by distance with their information, and a selector bar at the top with various sports. | Check that "3 games nearby" and "Sorted by distance" are on the screen.<br>Check that "1. E2E Basketball Near", "2. E2E Basketball Far" and "3. E2E Soccer" are on the screen, in that order.<br>Check that the first game shows "200 m".<br>Check that the "All", "Basketball", "Soccer" and "Volleyball" chips are on the screen, and "All" is selected. |
    | 3a. No games are found nearby. | Set the phone's location to a place more than 50 km from the test games.<br>Click the "Discover" tab in the bottom bar. |
    | 3a1. System displays a message saying no nearby games were found. | Check that the text "No games nearby right now. Check back later or organize your own game." is on the screen.<br>Check that there are no game cards on the screen. |
    | 4. Player selects a sport in the selector bar. | Click the "Basketball" chip. |
    | 5. System updates the list to show only the games of the selected sport. | Check that the text "2 basketball games nearby" is on the screen.<br>Check that "1. E2E Basketball Near" and "2. E2E Basketball Far" are on the screen.<br>Check that "E2E Soccer" is not on the screen. |
    | 5a. No nearby games are found for the selected sport. | Click the "Volleyball" chip. |
    | 5a1. System displays a message saying no games were found of the selected sport. | Check that the text "No volleyball games nearby. Try another sport." is on the screen.<br>Check that there are no game cards on the screen. |

  - **Test Logs:**
    ```
    To be added at CP2, once the test is written and run.
    ```
