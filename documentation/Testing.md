# Testing

## Change History

| Date | Description |
| --- | --- |
| 11/02/2026 | Creation of this file. Reporting E2E testing results for Feature 1 and backend testing results for Bill Import component. |
| 11/18/2026 | Backend tests restructured to one unmocked and one mocked `describe` per interface with Input/Expected comments; added mocked tests for every interface with a mockable component; added full-stack E2E tests that run the app against the Node backend. |


## Locations of Backend Tests

Each interface has one `describe` without mocks (`backend/tests/no-mock/`) and one with mocks (`backend/tests/mock/`), both named after the interface (`Unmocked: <interface>` / `Mocked: <interface>`). Every test starts with the four comments `Input`, `Expected status code`, `Expected behavior` and `Expected output`. The unmocked groups run the real Express app, sessions and MongoDB (an isolated in-memory `mongod` per suite); authenticated interfaces also include the shared missing/unknown/expired-session checks from [sessionRejection.ts](../backend/tests/helpers/sessionRejection.ts). Socket.IO interfaces are listed by namespace and event. Store-level checks that call no interface are in [backend/tests/unit/](../backend/tests/unit/).

| Interfaces | Describe group without mocks | Describe group with mocks | Components mocked |
| --- | --- | --- | --- |
| `POST /api/auth/register` | [accountAuth.test.ts:25](../backend/tests/no-mock/accountAuth.test.ts#L25) | [accountAuth.test.ts:20](../backend/tests/mock/accountAuth.test.ts#L20) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/login` | [accountAuth.test.ts:90](../backend/tests/no-mock/accountAuth.test.ts#L90) | [accountAuth.test.ts:123](../backend/tests/mock/accountAuth.test.ts#L123) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `GET /api/users/me` | [accountAuth.test.ts:158](../backend/tests/no-mock/accountAuth.test.ts#L158) | [accountAuth.test.ts:233](../backend/tests/mock/accountAuth.test.ts#L233) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/logout` | [accountAuth.test.ts:184](../backend/tests/no-mock/accountAuth.test.ts#L184) | [accountAuth.test.ts:192](../backend/tests/mock/accountAuth.test.ts#L192) | MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `PATCH /api/users/me` | [accountSettings.test.ts:27](../backend/tests/no-mock/accountSettings.test.ts#L27) | [accountSettings.test.ts:23](../backend/tests/mock/accountSettings.test.ts#L23) | MongoDB user and session stores (in-memory replacements whose methods fail or race); Google ID-token verifier |
| `POST /api/groups/:groupId/shared-entries` | [entrySharing.test.ts:27](../backend/tests/no-mock/entrySharing.test.ts#L27) | [entrySharing.test.ts:29](../backend/tests/mock/entrySharing.test.ts#L29) | Mongoose `ExpenseModel` and `GroupModel` via `jest.spyOn`: rejected reads/writes, duplicate-key race |
| `GET /api/groups/:groupId/expenses/:expenseId/personal-entry` | [entrySharing.test.ts:124](../backend/tests/no-mock/entrySharing.test.ts#L124) | [entrySharing.test.ts:72](../backend/tests/mock/entrySharing.test.ts#L72) | Mongoose `ExpenseModel` and `GroupModel` via `jest.spyOn`: rejected reads/writes, duplicate-key race |
| `POST /api/groups/:groupId/expenses/:expenseId/personal-entry/imported` | [entrySharing.test.ts:191](../backend/tests/no-mock/entrySharing.test.ts#L191) | [entrySharing.test.ts:97](../backend/tests/mock/entrySharing.test.ts#L97) | Mongoose `ExpenseModel` and `GroupModel` via `jest.spyOn`: rejected reads/writes, duplicate-key race |
| `POST /api/auth/google` | [googleAuth.test.ts:29](../backend/tests/no-mock/googleAuth.test.ts#L29) | [googleAuth.test.ts:32](../backend/tests/mock/googleAuth.test.ts#L32) | Google ID-token verifier; MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/google/register` | [googleAuth.test.ts:54](../backend/tests/no-mock/googleAuth.test.ts#L54) | [googleAuth.test.ts:175](../backend/tests/mock/googleAuth.test.ts#L175) | Google ID-token verifier; MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `POST /api/auth/google/link` | [googleAuth.test.ts:68](../backend/tests/no-mock/googleAuth.test.ts#L68) | [googleAuth.test.ts:263](../backend/tests/mock/googleAuth.test.ts#L263) | Google ID-token verifier; MongoDB user and session stores (in-memory replacements whose methods fail or race) |
| `GET /api/groups` | [groupExpenses.test.ts:70](../backend/tests/no-mock/groupExpenses.test.ts#L70) | [groupExpenses.test.ts:21](../backend/tests/mock/groupExpenses.test.ts#L21) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /api/groups/:groupId/summary` | [groupExpenses.test.ts:86](../backend/tests/no-mock/groupExpenses.test.ts#L86) | [groupExpenses.test.ts:38](../backend/tests/mock/groupExpenses.test.ts#L38) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups/:groupId/expenses` | [groupExpenses.test.ts:145](../backend/tests/no-mock/groupExpenses.test.ts#L145) | [groupExpenses.test.ts:82](../backend/tests/mock/groupExpenses.test.ts#L82) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `PUT /api/groups/:groupId/expenses/:expenseId` | [groupExpenses.test.ts:436](../backend/tests/no-mock/groupExpenses.test.ts#L436) | [groupExpenses.test.ts:130](../backend/tests/mock/groupExpenses.test.ts#L130) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `DELETE /api/groups/:groupId/expenses/:expenseId` | [groupExpenses.test.ts:644](../backend/tests/no-mock/groupExpenses.test.ts#L644) | [groupExpenses.test.ts:174](../backend/tests/mock/groupExpenses.test.ts#L174) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups` | [groupManagement.test.ts:74](../backend/tests/no-mock/groupManagement.test.ts#L74) | [groupManagement.test.ts:20](../backend/tests/mock/groupManagement.test.ts#L20) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /api/groups/invitations/:token` | [groupManagement.test.ts:153](../backend/tests/no-mock/groupManagement.test.ts#L153) | [groupManagement.test.ts:58](../backend/tests/mock/groupManagement.test.ts#L58) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups/invitations/:token/accept` | [groupManagement.test.ts:192](../backend/tests/no-mock/groupManagement.test.ts#L192) | [groupManagement.test.ts:74](../backend/tests/mock/groupManagement.test.ts#L74) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `POST /api/groups/:groupId/invitations` | [groupManagement.test.ts:237](../backend/tests/no-mock/groupManagement.test.ts#L237) | [groupManagement.test.ts:114](../backend/tests/mock/groupManagement.test.ts#L114) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `PUT /api/groups/:groupId/name` | [groupManagement.test.ts:254](../backend/tests/no-mock/groupManagement.test.ts#L254) | [groupManagement.test.ts:131](../backend/tests/mock/groupManagement.test.ts#L131) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `DELETE /api/groups/:groupId` | [groupManagement.test.ts:282](../backend/tests/no-mock/groupManagement.test.ts#L282) | [groupManagement.test.ts:161](../backend/tests/mock/groupManagement.test.ts#L161) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /invite/:token` | [groupManagement.test.ts:317](../backend/tests/no-mock/groupManagement.test.ts#L317) | [groupManagement.test.ts:180](../backend/tests/mock/groupManagement.test.ts#L180) | Mongoose models (`GroupModel`, `GroupInvitationModel`, `ExpenseModel`) via `jest.spyOn`: rejected writes/reads, or no matching document |
| `GET /.well-known/assetlinks.json` | [groupManagement.test.ts:351](../backend/tests/no-mock/groupManagement.test.ts#L351) | — | — (reads only deployment configuration; nothing to mock) |
| `POST /api/groups/:groupId/leave` | [groupMembership.test.ts:26](../backend/tests/no-mock/groupMembership.test.ts#L26) | [groupMembership.test.ts:22](../backend/tests/mock/groupMembership.test.ts#L22) | Mongoose `GroupModel.findOneAndUpdate`: rejects or finds no group |
| `DELETE /api/groups/:groupId/members/:memberId` | [groupMembership.test.ts:94](../backend/tests/no-mock/groupMembership.test.ts#L94) | [groupMembership.test.ts:42](../backend/tests/mock/groupMembership.test.ts#L42) | Mongoose `GroupModel.findOneAndUpdate`: rejects or finds no group |
| `GET /health` | [health.test.ts:6](../backend/tests/no-mock/health.test.ts#L6) | — | — (no database or external component) |
| `GET /api/ledger-saves` | [ledgerSaves.test.ts:44](../backend/tests/no-mock/ledgerSaves.test.ts#L44) | [ledgerSaves.test.ts:28](../backend/tests/mock/ledgerSaves.test.ts#L28) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `GET /api/ledger-saves/:slot` | [ledgerSaves.test.ts:62](../backend/tests/no-mock/ledgerSaves.test.ts#L62) | [ledgerSaves.test.ts:76](../backend/tests/mock/ledgerSaves.test.ts#L76) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `PUT /api/ledger-saves/:slot` | [ledgerSaves.test.ts:79](../backend/tests/no-mock/ledgerSaves.test.ts#L79) | [ledgerSaves.test.ts:121](../backend/tests/mock/ledgerSaves.test.ts#L121) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `PATCH /api/ledger-saves/:slot` | [ledgerSaves.test.ts:137](../backend/tests/no-mock/ledgerSaves.test.ts#L137) | [ledgerSaves.test.ts:238](../backend/tests/mock/ledgerSaves.test.ts#L238) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `DELETE /api/ledger-saves/:slot` | [ledgerSaves.test.ts:169](../backend/tests/no-mock/ledgerSaves.test.ts#L169) | [ledgerSaves.test.ts:290](../backend/tests/mock/ledgerSaves.test.ts#L290) | Ledger save store and user/session stores (in-memory; `list`/`find`/`put`/`rename`/`delete` fail) |
| `GET /api/ledger/meta` | [ledgerServices.test.ts:30](../backend/tests/no-mock/ledgerServices.test.ts#L30) | [ledgerServices.test.ts:39](../backend/tests/mock/ledgerServices.test.ts#L39) | Document extractor and FX provider; `OPENAI_API_KEY` placeholders |
| `GET /api/ledger/exchange` | [ledgerServices.test.ts:46](../backend/tests/no-mock/ledgerServices.test.ts#L46) | [ledgerServices.test.ts:62](../backend/tests/mock/ledgerServices.test.ts#L62) | Frankfurter HTTP `fetch` (real FX provider) and the FX provider `quote` |
| `POST /api/ledger/imports/preview` | [ledgerServices.test.ts:70](../backend/tests/no-mock/ledgerServices.test.ts#L70) | [ledgerServices.test.ts:117](../backend/tests/mock/ledgerServices.test.ts#L117) | OpenAI HTTP `fetch` (real recognition adapter) and the document extractor `extract` |
| `POST /api/ledger/imports/statement-preview` | [ledgerServices.test.ts:115](../backend/tests/no-mock/ledgerServices.test.ts#L115) | [ledgerServices.test.ts:315](../backend/tests/mock/ledgerServices.test.ts#L315) | Local statement extractor and AI extractor `extract` (spy that must not be called) |
| `Socket.IO /dutch connection` | [splitSessionLive.test.ts:35](../backend/tests/no-mock/splitSessionLive.test.ts#L35) | [splitSessionLive.test.ts:50](../backend/tests/mock/splitSessionLive.test.ts#L50) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch subscribe` | [splitSessionLive.test.ts:94](../backend/tests/no-mock/splitSessionLive.test.ts#L94) | [splitSessionLive.test.ts:66](../backend/tests/mock/splitSessionLive.test.ts#L66) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch onGroupUpdated` | [splitSessionLive.test.ts:148](../backend/tests/no-mock/splitSessionLive.test.ts#L148) | [splitSessionLive.test.ts:92](../backend/tests/mock/splitSessionLive.test.ts#L92) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch onGroupChanged` | [splitSessionLive.test.ts:270](../backend/tests/no-mock/splitSessionLive.test.ts#L270) | [splitSessionLive.test.ts:113](../backend/tests/mock/splitSessionLive.test.ts#L113) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `Socket.IO /dutch onGroupMembershipChanged` | [splitSessionLive.test.ts:310](../backend/tests/no-mock/splitSessionLive.test.ts#L310) | [splitSessionLive.test.ts:132](../backend/tests/mock/splitSessionLive.test.ts#L132) | Session store `find` and the live publisher's `GroupModel.findOne` reject |
| `POST /api/groups/:groupId/split-sessions` | [splitSessions.test.ts:98](../backend/tests/no-mock/splitSessions.test.ts#L98) | [splitSessions.test.ts:43](../backend/tests/mock/splitSessions.test.ts#L43) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `GET /api/groups/:groupId/snapshot` | [splitSessions.test.ts:187](../backend/tests/no-mock/splitSessions.test.ts#L187) | [splitSessions.test.ts:69](../backend/tests/mock/splitSessions.test.ts#L69) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `POST /api/split-sessions/:sessionId/claims` | [splitSessions.test.ts:249](../backend/tests/no-mock/splitSessions.test.ts#L249) | [splitSessions.test.ts:96](../backend/tests/mock/splitSessions.test.ts#L96) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `POST /api/split-sessions/:sessionId/finalize` | [splitSessions.test.ts:377](../backend/tests/no-mock/splitSessions.test.ts#L377) | [splitSessions.test.ts:130](../backend/tests/mock/splitSessions.test.ts#L130) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |
| `GET /api/operations/:operationKey` | [splitSessions.test.ts:517](../backend/tests/no-mock/splitSessions.test.ts#L517) | [splitSessions.test.ts:165](../backend/tests/mock/splitSessions.test.ts#L165) | Mongoose models (`SplitSessionModel`, `ExpenseModel`, `GroupModel`) and session/user store spies: rejected reads/writes, lookup counts |

Unknown routes are covered by `Unmocked: GET /does-not-exist` in [health.test.ts](../backend/tests/no-mock/health.test.ts) (404 fallback).

## Location of .yml files

[.github/workflows/backend-tests.yml](../.github/workflows/backend-tests.yml)

## Front-end test suite location

Suite: [frontend/app/src/androidTest/java/com/example/cpen321application/e2e/](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/).

Use-case steps below refer to the formal specifications in Requirements_and_Design.md:
- UC-01: receipt recognition;
- UC-02: duplicate review/commit;
- UC-F1-03: statement import;
- UC-F1-04: manual entry;
- UC-F1-05: review/edit/delete;
- UC-F1-06: currency conversion;
- UC-F1-07: cloud saves.

Execution logs see Gradle log (res/testing/cp2/android-e2e.txt) and per-test JUnit results(res/testing/cp2/android-e2e.xml) on GitHub.

**Feature1E2eTest.kt — 9 tests**

| Test name | Formal use-case steps → test steps and expected behavior | Recorded status |
| --- | --- | --- |
| invalidManualEntryDoesNotPersistAndDeleteCanBeCancelled | **UC-F1-04 1–2, 2a:** Add → Save with no amount; “Check transaction” appears and record IDs are unchanged.<br>**UC-F1-04 2–4:** Enter 8 and a merchant → Save; “Transaction added” appears and one record exists.<br>**UC-F1-05 2a:** Edit amount to `invalid` → Save; validation appears and the saved record is unchanged.<br>**UC-F1-05 3a:** Delete → Keep transaction; the record remains. | PASS |
| csvSystemPickerCorrectInvalidRowSkipDuplicateAndCommitOnce | **UC-F1-03 1–3:** Pick a CSV through DocumentsUI → Preview CSV; review appears and confirmation is disabled.<br>**UC-02 1–3; UC-F1-03 4:** See the duplicate warning → deselect that row → change the invalid amount to 12; confirmation enables and no preview row has been saved.<br>**UC-02 4–8:** Confirm one row; “1 transaction imported,” one CSV record, and a total of 19 are verified.<br>**UC-F1-05 1, 4:** Recreate the activity → search the merchant; saved IDs persist and the filtered expense total is −19. | PASS |
| cancelPickerAndDiscardReviewLeaveLedgerUnchanged | **UC-F1-03 1a:** Open the system picker → Back; Import shows “Choose a file.”<br>**UC-F1-03 1–3:** Pick a CSV → Preview CSV; review appears.<br>**UC-F1-03 3a:** Start a different import → Keep reviewing; the review remains. Repeat → Discard review; file selection returns and the complete ledger equals its initial state. | PASS |
| csvSystemPickerKeepsDuplicateOnlyAfterExplicitAcknowledgement | **UC-F1-03 1–3; UC-02 1–2:** Pick/preview a CSV matching an existing entry; a duplicate warning appears, confirmation is disabled, and only the original record exists.<br>**UC-02 3, 3a:** Choose “Keep transaction 1 despite possible duplicates”; confirmation enables.<br>**UC-02 4–8:** Confirm; one CSV row is imported, both purchases remain, and their amounts total 14. | PASS |
| unsupportedPdfFailsWithoutSavingThenRealChasePdfImportsViaBackend | **UC-F1-03 1, 2b:** Pick an unsupported PDF → Preview statement; the supported-bank error appears and no fixture record is saved.<br>**UC-F1-03 1–3:** Replace it with a real Chase PDF → Preview statement through the backend; review appears before any save.<br>**UC-F1-03 4; UC-02 4–8:** Confirm; one USD 10.00 record dated 2025-01-03 retains its source filename. If conversion is needed, the saved FX source is Frankfurter/ECB with a positive converted amount. | PASS |
| explicitAiReceiptPreviewAndCommitUseRealBackend | **UC-01 1–2:** With a session, pick the synthetic receipt PDF → Send to OpenAI & extract.<br>**UC-01 3–8:** Wait for the real backend/OpenAI review; no fixture record is saved before confirmation. This case uses a valid PDF and requires no field correction.<br>**UC-02 4–8:** Confirm the single candidate; verify amount 10, original currency, date 2025-01-03, and source filename. | PASS |
| cloudSaveRenameCancelLoadRestoreAndDeleteUseRealAccountBackend | **UC-F1-07 1:** Me → Cloud saves; a free slot is available.<br>**2, 2a:** Empty name disables Save; enter a name → Cancel leaves the slot empty; repeat → Save persists its name on the backend.<br>**3:** Rename → Save; the backend name changes.<br>**3a:** Another API client changes the revision while the editor is open; submit the stale rename → conflict message and refreshed remote name, without overwriting it.<br>**4, 4a:** After removing the local fixture, cancel Load → it stays absent; confirm Load → it is restored.<br>**5, 5a:** Cancel Delete → server slot remains; confirm Delete → server slot is absent. | PASS |
| reportingCurrencyUsesHistoricalFxAndUiFiltersSelectOnlyExpenses | **UC-F1-06 1–4:** With USD expense/income fixtures, choose CAD; reporting currency becomes CAD, USD 10 remains the original amount, its converted value is CAD 14.41, and the effective rate date is Friday 2025-01-03.<br>**UC-F1-05 1, 3:** Search the merchant → Expenses → Select all shown; only one expense is selected.<br>**UC-F1-05 3a:** Cancel deletion; both records remain.<br>**UC-F1-05 3–4:** Confirm deletion; “1 transactions deleted” appears and only the income remains. | PASS |
| malformedCsvAndEmptyFileAreRejectedWithoutSaving | **UC-F1-03 1, 2a:** Pick a CSV with unrelated headers → Preview CSV; the required-columns error appears and no fixture record is saved.<br>**UC-F1-03 1b:** Remove it → pick an empty CSV; “This file is empty” appears and no fixture record is saved. | PASS |

**LedgerUiTest.kt — 7 reused tests**

| Test location | Formal use-case steps → test steps and expected behavior | Recorded status |
| --- | --- | --- |
| myExpensesIsHomeAndTabsCanBeReopened | **UC-F1-04 precondition; UC-F1-05 1:** Verify My Expenses is selected → open Me → Back → open Groups → Expenses; My Expenses/dashboard is available again. | PASS |
| expensesTabReturnsToDashboardAndReselectionResetsEditor | **UC-F1-04 1; UC-F1-05 1:** Add → enter 42 → Me → Expenses; the dashboard returns. Open Add again → reselect Expenses; the dashboard returns again. | PASS |
| createEditAndDeleteTransactionThroughTheUi | **UC-F1-04 1–3:** Enter amount/merchant → Save; the success notice appears and SQLite contains 1234 minor units.<br>**UC-F1-05 2:** Open the row → change amount → Save; SQLite contains 2345 minor units and revision 2.<br>**UC-F1-05 3–4:** Open Delete → confirm; the deletion notice appears and the record is absent. | PASS |
| draftSurvivesActivityRecreationWithoutSaving | **UC-F1-04 1, 1a:** Enter amount 42 and merchant → recreate the activity; both draft fields survive and no record is saved.<br>**UC-F1-04 1a:** Back → “Discard your changes?” → Discard; the dashboard returns. | PASS |
| csvContentUriRequiresDuplicateReviewBeforeAtomicImport | **UC-F1-03 1 (partial):** Supply a FileProvider URI through `chooseDocument`; this bypasses the system picker.<br>**UC-F1-03 2–3; UC-02 1–2:** Preview CSV; two review rows appear and duplicate confirmation is disabled.<br>**UC-02 3–8:** Acknowledge the duplicate → Confirm; two CSV records are saved, including the explicitly retained duplicate.<br>**UC-F1-06 1 (menu only):** Open the currency menu; the current-currency checkmark appears. | PASS |
| newViewModelShowsHistoricPdfAndReceiptImportsWithoutReimporting | **UC-F1-05 1, 4:** Seed historical PDF/receipt records through the repository → create a fresh ViewModel; its month filter is unset and both saved IDs are visible. This checks reload state, not document extraction or a full process restart. | PASS |
| bulkDeleteCanCancelAndDeletesOnlyFilteredSelectedRecords | **UC-F1-05 1:** Seed two expenses/one income and set search/kind through the ViewModel; two expenses are visible.<br>**UC-F1-05 3, 3a:** Select all shown → Delete → Cancel; all three records remain.<br>**UC-F1-05 3b:** Change the kind filter through the ViewModel; selection clears and selection mode ends.<br>**UC-F1-05 3–4:** Filter expenses again → Select all shown → confirm deletion; only the income remains. | PASS |

**Full-stack E2E (app + Node backend + MongoDB) — 2 tests**

These launch the real app (`MainActivity`) on the emulator against the real Node backend, Socket.IO live updates and MongoDB. A second member acts as "another device" through the same backend API. They run only when the isolated backend is started (see *How to run Tests*) and `ledgerFullStack=true` is passed; otherwise they are skipped. Shared steps are in [FullStackHarness.kt](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/FullStackHarness.kt).

| Test | Use case → test steps and expected behavior | Recorded status |
| --- | --- | --- |
| [GroupBillFullStackE2eTest](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/GroupBillFullStackE2eTest.kt) `ownerCreatesGroupAndRecordsABillTheMemberReadsFromTheBackend` | **Sign in:** Me → Sign in with a backend-registered username and password → Me shows Log out.<br>**Create Group:** Groups → Create group → enter a name → Create group; the invitation dialog appears → Done; “Group created. You are the owner.”<br>**Join Group (other device):** the member accepts an invitation through the backend; the open group page updates live to “2 members”.<br>**Record Shared Expense:** + Add a bill → Enter manually → description and CAD 30.00, equal split → Save expense; the bill is listed.<br>**Backend check:** the member's `GET /summary` returns total 3000 cents, paid by the owner, split 1500/1500. | PASS (3 consecutive runs, 11/18/2026) |
| [LetsGoDutchFullStackE2eTest](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/LetsGoDutchFullStackE2eTest.kt) `ownerFinalizesASplitAfterAMemberClaimsFromAnotherDevice` | **Start Let's Go Dutch:** owner signs in → opens the group → + Add a bill → Enter manually → CAD 18.00 → Let’s Go Dutch → items Burger 12.00 and Fries 6.00 → confirm review → Start split session; “0 / 2 units claimed”.<br>**Claim Item (other device):** the member claims Burger through `POST /claims`; the app shows “Claimed by First joiner” and “1 / 2 units claimed” over Socket.IO.<br>**Claim and Finalize:** the owner claims Fries → “2 / 2 units claimed” → Finalize split → “Finalized · saved to group expenses”.<br>**Backend check:** the member's summary has one 1800-cent bill “Dutch dinner” with shares member 1200 / owner 600. | PASS (3 consecutive runs, 11/18/2026) |

## NFR location
To be done within CP3. Not covered yet.

## Jest Coverage

Scope: `currencies.ts`, `domain.ts`, `importPolicy.ts`, `providers.ts`, `router.ts`, and `statements.ts`.

**Without mocks:**

![Bill Import coverage without mocks](res/testing/bill-import/no-mock.png)

**With mocks:**

![Bill Import coverage with mocks](res/testing/bill-import/mock.png)

**Combined:**

![Bill Import combined coverage](res/testing/bill-import/combined.png)


## How to run Tests

Commit hash: `c7f846ad5694316405565dc4ca3bded281079416`.

**Test running prerequisites:**
 - Frondend: Install JDK 17 and the Android SDK required by `frontend/`, then start one Android emulator. Preserve `sdk.dir` and set `API_BASE_URL` in `frontend/local.properties` to a running backend with MongoDB and OpenAI recognition configured; use `http://10.0.2.2:3000` for a backend running locally on port 3000. Start a local backend with `npm run dev` from `backend/` in a separate terminal after configuring `backend/.env`.
 - Use Node.js 22.13+ within 22.x and npm 10+. Set a valid `OPENAI_API_KEY` in `backend/.env`. Internet access is required. Commands below were used on PowerShell.

**E2E for Feature 1:**

```powershell
cd frontend
.\gradlew.bat :app:connectedDebugAndroidTest `
  '-Pandroid.testInstrumentationRunnerArguments.class=com.example.cpen321application.e2e.Feature1E2eTest,com.example.cpen321application.e2e.LedgerUiTest' `
  '-Pandroid.testInstrumentationRunnerArguments.ledgerLiveAi=true' `
  '-Pandroid.testInstrumentationRunnerArguments.ledgerProvisionAccount=true' --console=plain
cd ..
```

This runs the two Feature 1 E2E classes. `ledgerLiveAi` enables receipt recognition; `ledgerProvisionAccount` creates temporary test accounts for the authenticated Feature 1 scenarios. Open `frontend/app/build/reports/androidTests/connected/debug/index.html` for results.

**Full-stack E2E (app + Node backend):** no `.env`, OpenAI key or internet is needed; the backend uses an in-memory MongoDB and stops by itself after 15 minutes. Keep `API_BASE_URL=http://10.0.2.2:3000` in `frontend/local.properties`. In one terminal:

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
