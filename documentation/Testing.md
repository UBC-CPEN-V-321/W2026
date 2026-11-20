# Testing

## Change History

| Date | Description |
| --- | --- |
| 11/02/2026 | Creation of this file. Reporting E2E testing results for Feature 1 and backend testing results for Bill Import component. |
| 11/19/2026 | Reconciled paths, test inventory, execution prerequisites and evidence status with the repository; marked missing historical artifacts explicitly. |
| 11/19/2026 | Checked the CP2 backend structure against Project Description section 9 and Testing II slides 58-61; moved registration/login input-validation, password-confirmation and rate-limit cases to real MongoDB tests; added mocked dependency-isolation checks for public endpoints. |
| 11/18/2026 | Backend tests restructured to one unmocked and one mocked `describe` per interface with Input/Expected comments; added mocked tests for every interface with a mockable component; added full-stack E2E tests that run the app against the Node backend. |


## Locations of Backend Tests

Local structure-fix verification (2026-11-19): executed on the working-tree code subsequently committed and merged to main as `6a9dfdfeaf16e1bf006741138cffc6e114e19993`. `npm run typecheck` passed; `npm run test:interface -- --silent` passed **24 suites / 567 tests**. Combined coverage: statements 80.36%, branches 74.28%, functions 85.67%, lines 80.80%. This run used Node 24.11.1 / npm 11.6.2; the supported project environment remains Node 22.x. This is the backend validation baseline only; Android tests were not rerun in that validation. The console summary is preserved in [backend-interface-summary.txt](res/testing/backend-interface-summary.txt).

Backend test conventions (Project Description, section 9):

- Use one `Unmocked: METHOD /path` and one `Mocked: METHOD /path` group for each exposed interface. Socket.IO groups name the namespace and event.
- Exercise normal behavior and controllable errors against real components in `tests/no-mock/`. `mongodb-memory-server` launches a real isolated MongoDB process; an injected JavaScript store is a test double and belongs in `tests/mock/`.
- Use the mocked group to force dependency failures and races. Existing extra tests with in-memory stores remain mock tests; they do not replace the real-database cases.
- Immediately precede each test or parameterized table with `Input`, `Expected status code`, `Expected behavior` and `Expected output`. Describe the injected behavior for mock cases. For sockets, specify the acknowledgement/event instead of inventing an HTTP status.
- Assert the response and relevant persistent effects, including unchanged state after rejected writes. Restore mocks and isolate stored data between cases.
- Public infrastructure endpoints have mocked authentication-store failures to verify they remain independent of those stores; these are availability/isolation checks, not invented error responses. Live Google/OpenAI success paths are not established by forged-token/configuration tests.


Each interface has one `describe` without mocks (`backend/tests/no-mock/`) and one with mocks (`backend/tests/mock/`), both named after the interface (`Unmocked: <interface>` / `Mocked: <interface>`). Every test starts with the four comments `Input`, `Expected status code`, `Expected behavior` and `Expected output`. The unmocked groups run the real Express app, sessions and MongoDB (an isolated in-memory `mongod` per suite); authenticated interfaces also include the shared missing/unknown/expired-session checks from [sessionRejection.ts](../backend/tests/helpers/sessionRejection.ts). Socket.IO interfaces are listed by namespace and event. Store-level checks that call no interface are in [backend/tests/unit/](../backend/tests/unit/).

| Interfaces | Describe group without mocks | Describe group with mocks | Components mocked |
| --- | --- | --- | --- |
| `POST /api/auth/register` | [accountAuth.test.ts:14](../backend/tests/no-mock/accountAuth.test.ts#L14) | [accountAuth.test.ts:24](../backend/tests/mock/accountAuth.test.ts#L24) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/login` | [accountAuth.test.ts:127](../backend/tests/no-mock/accountAuth.test.ts#L127) | [accountAuth.test.ts:82](../backend/tests/mock/accountAuth.test.ts#L82) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `GET /api/users/me` | [accountAuth.test.ts:222](../backend/tests/no-mock/accountAuth.test.ts#L222) | [accountAuth.test.ts:167](../backend/tests/mock/accountAuth.test.ts#L167) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/logout` | [accountAuth.test.ts:248](../backend/tests/no-mock/accountAuth.test.ts#L248) | [accountAuth.test.ts:129](../backend/tests/mock/accountAuth.test.ts#L129) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `PATCH /api/users/me` | [accountSettings.test.ts:12](../backend/tests/no-mock/accountSettings.test.ts#L12) | [accountSettings.test.ts:23](../backend/tests/mock/accountSettings.test.ts#L23) | MongoDB user and session stores (in-memory replacements whose methods fail or race); Google ID-token verifier |
| `POST /api/groups/:groupId/shared-entries` | [entrySharing.test.ts:27](../backend/tests/no-mock/entrySharing.test.ts#L27) | [entrySharing.test.ts:19](../backend/tests/mock/entrySharing.test.ts#L19) | Mongoose `ExpenseModel` and `GroupModel` via `jest.spyOn`: rejected reads/writes, duplicate-key race |
| `GET /api/groups/:groupId/expenses/:expenseId/personal-entry` | [entrySharing.test.ts:124](../backend/tests/no-mock/entrySharing.test.ts#L124) | [entrySharing.test.ts:62](../backend/tests/mock/entrySharing.test.ts#L62) | Mongoose `ExpenseModel` and `GroupModel` via `jest.spyOn`: rejected reads/writes, duplicate-key race |
| `POST /api/groups/:groupId/expenses/:expenseId/personal-entry/imported` | [entrySharing.test.ts:191](../backend/tests/no-mock/entrySharing.test.ts#L191) | [entrySharing.test.ts:87](../backend/tests/mock/entrySharing.test.ts#L87) | Mongoose `ExpenseModel` and `GroupModel` via `jest.spyOn`: rejected reads/writes, duplicate-key race |
| `POST /api/auth/google` | [googleAuth.test.ts:20](../backend/tests/no-mock/googleAuth.test.ts#L20) | [googleAuth.test.ts:32](../backend/tests/mock/googleAuth.test.ts#L32) | Google ID-token verifier; MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/google/register` | [googleAuth.test.ts:43](../backend/tests/no-mock/googleAuth.test.ts#L43) | [googleAuth.test.ts:175](../backend/tests/mock/googleAuth.test.ts#L175) | Google ID-token verifier; MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/google/link` | [googleAuth.test.ts:56](../backend/tests/no-mock/googleAuth.test.ts#L56) | [googleAuth.test.ts:263](../backend/tests/mock/googleAuth.test.ts#L263) | Google ID-token verifier; MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `GET /api/groups` | [groupExpenses.test.ts:72](../backend/tests/no-mock/groupExpenses.test.ts#L72) | [groupExpenses.test.ts:21](../backend/tests/mock/groupExpenses.test.ts#L21) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /api/groups/:groupId/summary` | [groupExpenses.test.ts:88](../backend/tests/no-mock/groupExpenses.test.ts#L88) | [groupExpenses.test.ts:38](../backend/tests/mock/groupExpenses.test.ts#L38) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups/:groupId/expenses` | [groupExpenses.test.ts:147](../backend/tests/no-mock/groupExpenses.test.ts#L147) | [groupExpenses.test.ts:82](../backend/tests/mock/groupExpenses.test.ts#L82) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `PUT /api/groups/:groupId/expenses/:expenseId` | [groupExpenses.test.ts:431](../backend/tests/no-mock/groupExpenses.test.ts#L431) | [groupExpenses.test.ts:130](../backend/tests/mock/groupExpenses.test.ts#L130) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `DELETE /api/groups/:groupId/expenses/:expenseId` | [groupExpenses.test.ts:661](../backend/tests/no-mock/groupExpenses.test.ts#L661) | [groupExpenses.test.ts:174](../backend/tests/mock/groupExpenses.test.ts#L174) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups` | [groupManagement.test.ts:75](../backend/tests/no-mock/groupManagement.test.ts#L75) | [groupManagement.test.ts:15](../backend/tests/mock/groupManagement.test.ts#L15) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /api/groups/invitations/:token` | [groupManagement.test.ts:152](../backend/tests/no-mock/groupManagement.test.ts#L152) | [groupManagement.test.ts:53](../backend/tests/mock/groupManagement.test.ts#L53) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups/invitations/:token/accept` | [groupManagement.test.ts:191](../backend/tests/no-mock/groupManagement.test.ts#L191) | [groupManagement.test.ts:69](../backend/tests/mock/groupManagement.test.ts#L69) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups/:groupId/invitations` | [groupManagement.test.ts:236](../backend/tests/no-mock/groupManagement.test.ts#L236) | [groupManagement.test.ts:109](../backend/tests/mock/groupManagement.test.ts#L109) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `PUT /api/groups/:groupId/name` | [groupManagement.test.ts:253](../backend/tests/no-mock/groupManagement.test.ts#L253) | [groupManagement.test.ts:126](../backend/tests/mock/groupManagement.test.ts#L126) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `DELETE /api/groups/:groupId` | [groupManagement.test.ts:281](../backend/tests/no-mock/groupManagement.test.ts#L281) | [groupManagement.test.ts:156](../backend/tests/mock/groupManagement.test.ts#L156) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /invite/:token` | [groupManagement.test.ts:316](../backend/tests/no-mock/groupManagement.test.ts#L316) | [groupManagement.test.ts:175](../backend/tests/mock/groupManagement.test.ts#L175) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /.well-known/assetlinks.json` | [groupManagement.test.ts:350](../backend/tests/no-mock/groupManagement.test.ts#L350) | [publicEndpoints.test.ts:30](../backend/tests/mock/publicEndpoints.test.ts#L30) | Authentication-store reads reject if called; verify neither store is consulted |
| `POST /api/groups/:groupId/leave` | [groupMembership.test.ts:26](../backend/tests/no-mock/groupMembership.test.ts#L26) | [groupMembership.test.ts:22](../backend/tests/mock/groupMembership.test.ts#L22) | Mongoose `GroupModel.findOneAndUpdate`: rejects or finds no group |
| `DELETE /api/groups/:groupId/members/:memberId` | [groupMembership.test.ts:94](../backend/tests/no-mock/groupMembership.test.ts#L94) | [groupMembership.test.ts:42](../backend/tests/mock/groupMembership.test.ts#L42) | Mongoose `GroupModel.findOneAndUpdate`: rejects or finds no group |
| `GET /health` | [health.test.ts:6](../backend/tests/no-mock/health.test.ts#L6) | [publicEndpoints.test.ts:15](../backend/tests/mock/publicEndpoints.test.ts#L15) | Authentication-store reads reject if called; verify neither store is consulted |
| `GET /api/ledger-saves` | [ledgerSaves.test.ts:44](../backend/tests/no-mock/ledgerSaves.test.ts#L44) | [ledgerSaves.test.ts:28](../backend/tests/mock/ledgerSaves.test.ts#L28) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `GET /api/ledger-saves/:slot` | [ledgerSaves.test.ts:62](../backend/tests/no-mock/ledgerSaves.test.ts#L62) | [ledgerSaves.test.ts:76](../backend/tests/mock/ledgerSaves.test.ts#L76) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `PUT /api/ledger-saves/:slot` | [ledgerSaves.test.ts:79](../backend/tests/no-mock/ledgerSaves.test.ts#L79) | [ledgerSaves.test.ts:121](../backend/tests/mock/ledgerSaves.test.ts#L121) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `PATCH /api/ledger-saves/:slot` | [ledgerSaves.test.ts:137](../backend/tests/no-mock/ledgerSaves.test.ts#L137) | [ledgerSaves.test.ts:238](../backend/tests/mock/ledgerSaves.test.ts#L238) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `DELETE /api/ledger-saves/:slot` | [ledgerSaves.test.ts:169](../backend/tests/no-mock/ledgerSaves.test.ts#L169) | [ledgerSaves.test.ts:290](../backend/tests/mock/ledgerSaves.test.ts#L290) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `GET /api/ledger/meta` | [ledgerServices.test.ts:30](../backend/tests/no-mock/ledgerServices.test.ts#L30) | [ledgerServices.test.ts:39](../backend/tests/mock/ledgerServices.test.ts#L39) | Document extractor and FX provider; `OPENAI_API_KEY` placeholders |
| `GET /api/ledger/exchange` | [ledgerServices.test.ts:46](../backend/tests/no-mock/ledgerServices.test.ts#L46) | [ledgerServices.test.ts:62](../backend/tests/mock/ledgerServices.test.ts#L62) | Frankfurter HTTP `fetch` (real FX provider) and the FX provider `quote` |
| `POST /api/ledger/imports/preview` | [ledgerServices.test.ts:70](../backend/tests/no-mock/ledgerServices.test.ts#L70) | [ledgerServices.test.ts:117](../backend/tests/mock/ledgerServices.test.ts#L117) | OpenAI HTTP `fetch` (real recognition adapter) and the document extractor `extract` |
| `POST /api/ledger/imports/statement-preview` | [ledgerServices.test.ts:115](../backend/tests/no-mock/ledgerServices.test.ts#L115) | [ledgerServices.test.ts:315](../backend/tests/mock/ledgerServices.test.ts#L315) | Local statement extractor and AI extractor `extract` (spy that must not be called) |
| `Socket.IO /dutch connection` | [splitSessionLive.test.ts:43](../backend/tests/no-mock/splitSessionLive.test.ts#L43) | [splitSessionLive.test.ts:39](../backend/tests/mock/splitSessionLive.test.ts#L39) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch subscribe` | [splitSessionLive.test.ts:102](../backend/tests/no-mock/splitSessionLive.test.ts#L102) | [splitSessionLive.test.ts:55](../backend/tests/mock/splitSessionLive.test.ts#L55) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch onGroupUpdated` | [splitSessionLive.test.ts:156](../backend/tests/no-mock/splitSessionLive.test.ts#L156) | [splitSessionLive.test.ts:81](../backend/tests/mock/splitSessionLive.test.ts#L81) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch onGroupChanged` | [splitSessionLive.test.ts:265](../backend/tests/no-mock/splitSessionLive.test.ts#L265) | [splitSessionLive.test.ts:102](../backend/tests/mock/splitSessionLive.test.ts#L102) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch onGroupMembershipChanged` | [splitSessionLive.test.ts:301](../backend/tests/no-mock/splitSessionLive.test.ts#L301) | [splitSessionLive.test.ts:121](../backend/tests/mock/splitSessionLive.test.ts#L121) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `POST /api/groups/:groupId/split-sessions` | [splitSessions.test.ts:98](../backend/tests/no-mock/splitSessions.test.ts#L98) | [splitSessions.test.ts:52](../backend/tests/mock/splitSessions.test.ts#L52) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `GET /api/groups/:groupId/snapshot` | [splitSessions.test.ts:187](../backend/tests/no-mock/splitSessions.test.ts#L187) | [splitSessions.test.ts:78](../backend/tests/mock/splitSessions.test.ts#L78) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `POST /api/split-sessions/:sessionId/claims` | [splitSessions.test.ts:249](../backend/tests/no-mock/splitSessions.test.ts#L249) | [splitSessions.test.ts:105](../backend/tests/mock/splitSessions.test.ts#L105) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `POST /api/split-sessions/:sessionId/finalize` | [splitSessions.test.ts:377](../backend/tests/no-mock/splitSessions.test.ts#L377) | [splitSessions.test.ts:139](../backend/tests/mock/splitSessions.test.ts#L139) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `GET /api/operations/:operationKey` | [splitSessions.test.ts:517](../backend/tests/no-mock/splitSessions.test.ts#L517) | [splitSessions.test.ts:174](../backend/tests/mock/splitSessions.test.ts#L174) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |

Unknown routes are covered by `Unmocked: GET /does-not-exist` in [health.test.ts](../backend/tests/no-mock/health.test.ts#L20) and `Mocked: GET /does-not-exist` in [publicEndpoints.test.ts](../backend/tests/mock/publicEndpoints.test.ts#L56) (404 fallback).

## Location of .yml files

**Missing:** `.github/workflows/` contains only `.gitkeep`; `backend-tests.yml` is not present. No GitHub Actions run is claimed here. Implementing and verifying the workflow remains a separate outstanding item.

## Front-end test suite location

### Course requirements and existing implementation

Project Description section 9 requires GUI end-to-end tests for the three main features, their formal-use-case success/failure scenarios, independent test setup, and real backend interactions where applicable. Section 12 (Testing document) requires test locations, use-case-step-to-test-step mappings, and execution logs showing passed/failed status. Submission Guidelines scope CP2 to one end-to-end feature and all interfaces of one backend component; the full project scope is broader. Neither document mandates particular test-class names or TXT/XML filenames.

| Feature | Existing implementation | What remains to verify |
| --- | --- | --- |
| Personal ledger | LedgerUiTest: 7 tests for navigation, manual entry/edit/delete, draft recreation, CSV review, reload and filtered deletion | Existing local flows are implemented. Live receipt/PDF recognition, FX and cloud-save GUI flows are not demonstrated by this class. |
| Group expenses | GroupBillFullStackE2eTest: 1 app + Node + MongoDB flow | Existing create/join/add-bill success flow is implemented. The success flow passed again on 2026-11-20; remaining formal-use-case failure scenarios still need coverage review. |
| Let's Go Dutch | LetsGoDutchFullStackE2eTest: 1 app + Node + MongoDB + Socket.IO flow | Existing claim/live-update/finalize success flow is implemented. The repaired 2026-11-20 run passed the full flow; remaining failure/recovery scenarios still need coverage review. |

The full-stack harness creates disposable accounts and signs in through the UI; the second user acts through real backend requests, not a second automated GUI. The course default assumes a tester already signed in and allows manual second-user steps. Document this setup difference for review rather than claiming that API-side actions test the second user's GUI.

**Located historical execution evidence:** the [Android runner excerpt](res/testing/android-historical-summary.txt) records **18 tests passed** for GroupMembershipUiTest, GroupMembershipIntegrationTest and GroupExpensesUiTest. These were historically under the e2e package and are now categorized as UI/integration tests. The log does not establish its commit/date and is not evidence of a fresh run of the three current E2E classes.

### Initial Android execution record (before repairs)

- Date: 2026-11-19; source commit `2e9fcdd6cb5dd9149226f44068046f8766d64226`. Only documentation/evidence changes were uncommitted.
- Environment: Pixel 9 emulator, Android 16/API 36, x86_64, fresh isolated userdata; real local backend and disposable MongoDB. No online backend was used.
- Build: `:app:assembleDebug :app:assembleDebugAndroidTest` succeeded. The test APK used `http://10.0.2.2:3000`; original local configuration was restored afterwards.
- Runner: all three existing E2E classes selected with `ledgerFullStack=true`. Exact command and original output: [execution log](res/testing/android-e2e-2026-11-19.txt).
- Result: **9 executed, 3 passed, 6 failed, 0 skipped**. Five LedgerUiTest failures report `RootViewWithoutFocusException` during Espresso back/keyboard actions. LetsGoDutchFullStackE2eTest failed to reach its expected sign-in state before its core flow. These are the initial observed failures; see the repaired run below for subsequent diagnosis and verification.
- Passed: filtered bulk deletion, loading historical personal records, and the group-bill full-stack flow. This run is evidence of execution, not a passing suite or complete course coverage.
- Backend ran on Node 24.11.1; the project-supported Node 22.x environment remains unverified for this run.

### Manual follow-up (2026-11-20)

Joy Tao reported that all six manual checks corresponding to the failed automated scenarios behaved normally on an emulator using the "latest version": dismissing the currency menu, returning from Me/Groups, leaving the editor through tabs, creating/editing/deleting a personal entry, checking an unsaved draft, and signing out then signing in again. This is a tester-reported manual result. The exact APK/source commit, emulator model/API level, and activity-recreation mechanism were not independently verified; no screenshots or execution logs were supplied for this follow-up.

This did not reproduce the reported symptoms manually, but does not establish equivalence to the automated run at `2e9fcdd6cb5dd9149226f44068046f8766d64226`. At the time of this manual follow-up, the recorded automated result was **3 passed / 6 failed**. The later repaired run is recorded below. In particular, the manual sign-in check does not establish that the full Let's Go Dutch flow passed.

### Repaired Android execution record (2026-11-20)

- **9 executed, 9 passed, 0 failed, 0 skipped**, in 205.496 seconds: [final execution log](res/testing/android-e2e-2026-11-20.txt). All three existing E2E classes ran together with `ledgerFullStack=true`, including both real-backend flows.
- Source base: latest fetched main `1626ab9f0ac44f74645e29de3a35957c15d0ea66`, with uncommitted repairs in `LedgerUiTest.kt` and `FullStackHarness.kt`. The log records SHA-256 hashes of those files; application source was unchanged.
- During diagnosis, a **System UI isn't responding** dialog owned window focus. It was closed before the final run. Tests now check initial Activity focus, wait for navigation/BackHandler setup before sending system Back, and await IME dismissal through window insets instead of Espresso's focused-root lookup. The currency-menu test additionally asserts dismissal.
- Full-stack tests now clear only their stored authentication before Activity launch and after teardown, so the next test does not depend on logging out the previous test's account. Each test still signs in through the real UI. This establishes test isolation; it is not a separate automated verification of logout behavior.
- [Intermediate diagnostic logs](res/testing/android-e2e-diagnostics-2026-11-20.txt) retain the six-test run (4 pass / 2 fail), the focus-restored recheck (1 pass / 1 fail), and the final navigation-only recheck (1 pass). The initial 2026-11-19 failure log is also retained above.
- Environment: separate Pixel 9 userdata, Android 16/API 36 x86_64, local Node backend and disposable MongoDB. Build succeeded; original API configuration was restored. Node 24.11.1 was used; project-supported Node 22.x remains unverified here.
- These nine passing tests establish the existing scenarios only; they do not close the remaining coverage gaps noted in the feature table.

### Current suites and scenario mappings

Suite: [frontend/app/src/androidTest/java/com/example/cpen321application/e2e/](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/).

Use-case steps below refer to the formal specifications in Requirements_and_Design.md:
- UC-01: receipt recognition;
- UC-02: duplicate review/commit;
- UC-F1-03: statement import;
- UC-F1-04: manual entry;
- UC-F1-05: review/edit/delete;
- UC-F1-06: currency conversion;
- UC-F1-07: cloud saves.

**Evidence status:** `res/testing/cp2/android-e2e.txt` and `res/testing/cp2/android-e2e.xml` are absent from this repository. Current per-test results below refer to the 2026-11-19 run at `2e9fcdd6cb5dd9149226f44068046f8766d64226`, linked in the execution record; the old filenames are not required.

Current tracked Android E2E source contains 7 tests in `LedgerUiTest`, 1 in `GroupBillFullStackE2eTest`, and 1 in `LetsGoDutchFullStackE2eTest`. `FullStackHarness` is a helper, not a test suite.

**[LedgerUiTest.kt](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/LedgerUiTest.kt) — 7 existing local UI tests**

These exercise local UI/SQLite behavior, including some directly seeded state. They do not establish the complete app-to-Node-backend flow.

| Test location | Formal use-case steps → test steps and expected behavior | Recorded status |
| --- | --- | --- |
| myExpensesIsHomeAndTabsCanBeReopened | **UC-F1-04 precondition; UC-F1-05 1:** Verify My Expenses is selected → open Me → Back → open Groups → wait for sign-in page → Back; My Expenses/dashboard is available again. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |
| expensesTabReturnsToDashboardAndReselectionResetsEditor | **UC-F1-04 1; UC-F1-05 1:** Add → enter 42 → Me → Expenses; the dashboard returns. Open Add again → reselect Expenses; the dashboard returns again. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |
| createEditAndDeleteTransactionThroughTheUi | **UC-F1-04 1–3:** Enter amount/merchant → Save; the success notice appears and SQLite contains 1234 minor units.<br>**UC-F1-05 2:** Open the row → change amount → Save; SQLite contains 2345 minor units and revision 2.<br>**UC-F1-05 3–4:** Open Delete → confirm; the deletion notice appears and the record is absent. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |
| draftSurvivesActivityRecreationWithoutSaving | **UC-F1-04 1, 1a:** Enter amount 42 and merchant → recreate the activity; both draft fields survive and no record is saved.<br>**UC-F1-04 1a:** Back → “Discard your changes?” → Discard; the dashboard returns. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |
| csvContentUriRequiresDuplicateReviewBeforeAtomicImport | **UC-F1-03 1 (partial):** Supply a FileProvider URI through `chooseDocument`; this bypasses the system picker.<br>**UC-F1-03 2–3; UC-02 1–2:** Preview CSV; two review rows appear and duplicate confirmation is disabled.<br>**UC-02 3–8:** Acknowledge the duplicate → Confirm; two CSV records are saved, including the explicitly retained duplicate.<br>**UC-F1-06 1 (menu only):** Open the currency menu; the current-currency checkmark appears. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |
| newViewModelShowsHistoricPdfAndReceiptImportsWithoutReimporting | **UC-F1-05 1, 4:** Seed historical PDF/receipt records through the repository → create a fresh ViewModel; its month filter is unset and both saved IDs are visible. This checks reload state, not document extraction or a full process restart. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |
| bulkDeleteCanCancelAndDeletesOnlyFilteredSelectedRecords | **UC-F1-05 1:** Seed two expenses/one income and set search/kind through the ViewModel; two expenses are visible.<br>**UC-F1-05 3, 3a:** Select all shown → Delete → Cancel; all three records remain.<br>**UC-F1-05 3b:** Change the kind filter through the ViewModel; selection clears and selection mode ends.<br>**UC-F1-05 3–4:** Filter expenses again → Select all shown → confirm deletion; only the income remains. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |

**Full-stack E2E (app + Node backend + MongoDB) — 2 tests**

These launch the real app (`MainActivity`) on the emulator against the real Node backend, Socket.IO live updates and MongoDB. A second member acts as "another device" through the same backend API. They run only when the isolated backend is started (see *How to run Tests*) and `ledgerFullStack=true` is passed; otherwise they are skipped. Shared steps are in [FullStackHarness.kt](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/FullStackHarness.kt).

| Test | Use case → test steps and expected behavior | Recorded status |
| --- | --- | --- |
| [GroupBillFullStackE2eTest](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/GroupBillFullStackE2eTest.kt) `ownerCreatesGroupAndRecordsABillTheMemberReadsFromTheBackend` | **Sign in:** Me → Sign in with a backend-registered username and password → Me shows Log out.<br>**Create Group:** Groups → Create group → enter a name → Create group; the invitation dialog appears → Done; “Group created. You are the owner.”<br>**Join Group (other device):** the member accepts an invitation through the backend; the open group page updates live to “2 members”.<br>**Record Shared Expense:** + Add a bill → Enter manually → description and CAD 30.00, equal split → Save expense; the bill is listed.<br>**Backend check:** the member's `GET /summary` returns total 3000 cents, paid by the owner, split 1500/1500. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |
| [LetsGoDutchFullStackE2eTest](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/LetsGoDutchFullStackE2eTest.kt) `ownerFinalizesASplitAfterAMemberClaimsFromAnotherDevice` | **Start Let's Go Dutch:** owner signs in → opens the group → + Add a bill → Enter manually → CAD 18.00 → Let’s Go Dutch → items Burger 12.00 and Fries 6.00 → confirm review → Start split session; “0 / 2 units claimed”.<br>**Claim Item (other device):** the member claims Burger through `POST /claims`; the app shows “Claimed by First joiner” and “1 / 2 units claimed” over Socket.IO.<br>**Claim and Finalize:** the owner claims Fries → “2 / 2 units claimed” → Finalize split → “Finalized · saved to group expenses”.<br>**Backend check:** the member's summary has one 1800-cent bill “Dutch dinner” with shares member 1200 / owner 600. | PASS (2026-11-20); [execution log](res/testing/android-e2e-2026-11-20.txt) |

## NFR location
To be done within CP3. Not covered yet.

## Jest Coverage

The current Jest configuration collects coverage from all `src/**/*.ts` backend files. The combined **interface** run excludes `tests/unit/` and NFR tests.

| Run | Evidence at the baseline commit |
| --- | --- |
| No mocks | Historical image `res/testing/bill-import/no-mock.png` is missing; no current separate-run result is asserted. |
| Mocks | Historical image `res/testing/bill-import/mock.png` is missing; no current separate-run result is asserted. |
| Combined interfaces | 24 suites / 567 tests passed; statements 80.36%, branches 74.28%, functions 85.67%, lines 80.80%. See the [saved console summary](res/testing/backend-interface-summary.txt). Historical image `res/testing/bill-import/combined.png` is missing. |

Coverage is below 100%: interface tests do not launch the production entry point or seed script; several parser/domain cases are tested only in the separate unit suite, and additional error branches remain uncovered. These are coverage gaps, not a claim that every uncovered branch is unreachable. Before submission, capture the separate and combined whole-backend reports and explain remaining uncovered paths.

## How to run Tests

Backend code baseline on main: `6a9dfdfeaf16e1bf006741138cffc6e114e19993`. The previous document recorded `c7f846ad5694316405565dc4ca3bded281079416`; its historical results must not be treated as a run of the current baseline.

**Test running prerequisites:**

- Backend: Node.js 22.13+ within 22.x and npm 10+. Install locked dependencies with `npm ci`. Interface tests use isolated MongoDB processes and do not need a development database or OpenAI key. Network access may be needed for dependency installation, MongoDB binary download and the real Google verifier's certificate retrieval.
- Android: JDK 17, the SDK required by `frontend/`, and one running emulator. Preserve `sdk.dir` in `frontend/local.properties`. Dependencies and emulator images must be installed first.

**Existing local personal-ledger UI tests (PowerShell, repository root):**

```powershell
cd frontend
.\gradlew.bat :app:connectedDebugAndroidTest `
  '-Pandroid.testInstrumentationRunnerArguments.class=com.example.cpen321application.e2e.LedgerUiTest' --console=plain
cd ..
```

The latest Android run uses main `1626ab9f0ac44f74645e29de3a35957c15d0ea66` plus the test repairs described above; the execution log records hashes of the modified test files.

This selects the existing 7-test class only. Open `frontend/app/build/reports/androidTests/connected/debug/index.html` after a run; this generated local report is not committed evidence.

**Full-stack E2E (app + Node backend):** no `.env` or OpenAI key is required. The runner starts a real isolated MongoDB process and stops after 15 minutes. Initial installation and MongoDB binary download may require internet access; the tested group flows use local services. Keep `API_BASE_URL=http://10.0.2.2:3000` in `frontend/local.properties`. In one terminal:

```powershell
cd backend
npm ci
npm run build
$env:LEDGER_TEST_PORT = '3000'
node tests/helpers/membership-test-server.cjs
```

In a second terminal, with only the emulator connected:

```powershell
cd frontend
.\gradlew.bat :app:connectedDebugAndroidTest `
  '-Pandroid.testInstrumentationRunnerArguments.class=com.example.cpen321application.e2e.GroupBillFullStackE2eTest,com.example.cpen321application.e2e.LetsGoDutchFullStackE2eTest' `
  '-Pandroid.testInstrumentationRunnerArguments.ledgerFullStack=true' --console=plain
cd ..
```

Registration is rate-limited per client, so restart the backend if you repeat the run many times within a few minutes.

**Backend interface tests (from the repository root):**

```powershell
cd backend
npm ci
npm run test:no-mock
npm run test:mock
npm run test:interface
cd ..
```

`test:no-mock` and `test:mock` run each folder with coverage (`backend/coverage/no-mock/`, `backend/coverage/mock/`); `test:interface` runs both together (`backend/coverage/interface/`). `npm test` runs every backend suite, including `tests/unit/`.

### Saving frontend execution evidence

Use any clearly named evidence files; the course does not require the old `android-e2e.txt` or `android-e2e.xml` names. Capture the selected Gradle command output, actual source SHA, environment, selected classes, and each test's passed/failed/skipped status. Preserve the generated Android report or JUnit XML when available; XML is supporting evidence, not a specifically mandated format. A successful Gradle build with skipped full-stack tests is not a passing full-stack run. Review logs for credentials/personal data before committing them.
