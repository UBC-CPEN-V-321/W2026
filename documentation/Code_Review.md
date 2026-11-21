# Code Review

## 1. Change History

| Date | Sections | Reason |
| --- | --- | --- |
| 2026-11-02 | Section 2 | Recorded the CP2 automated review results. |
| 2026-11-20 | Sections 2 and 3 | Updated the Codacy evidence for the proposed CP3 revision and recorded the peer reviews and Ledger's response. |

## 2. Automated Code Review Results

### Commit Hash Where Codacy Ran

Codacy analyzed `3951c8d3722d5255a056a12cc6fef27c08a2aa8d` on `main`, the revision proposed in `CP3_DevelopmentInfo.pdf`. The analysis ended at 2026-11-21 00:16:29 UTC. The report recorded 0 new issues and 0 fixed issues. The preceding commit `43b5d0a` had 0 outstanding issues in Codacy's branch statistics. The later documentation merge `7f6ce59` was the dashboard's last analyzed commit when checked and also showed 0 outstanding issues. [GitHub commit](https://github.com/WYJ529/Ledger/commit/3951c8d3722d5255a056a12cc6fef27c08a2aa8d) · [Codacy commit result](https://api.codacy.com/api/v3/analysis/organizations/gh/WYJ529/repositories/Ledger/commits/3951c8d3722d5255a056a12cc6fef27c08a2aa8d) · [Codacy branch statistics](https://api.codacy.com/api/v3/analysis/organizations/gh/WYJ529/repositories/Ledger/commit-statistics?branch=main&days=7)

### Unfixed Issues per Codacy Category

The counts below are from the public Codacy `main` category breakdown at `7f6ce59`. The CP3 revision's issue delta and its zero-issue parent yield the same outstanding total. [Codacy Overview](https://app.codacy.com/gh/WYJ529/Ledger/dashboard) · [Category breakdown data](https://api.codacy.com/api/v3/analysis/organizations/gh/WYJ529/repositories/Ledger/category-overviews?branch=main)

| Category | Unfixed issues |
| --- | ---: |
| Best Practice | 0 |
| Comprehensibility | 0 |
| Code Style | 0 |
| Security | 0 |
| Error Prone | 0 |
| Performance | 0 |
| Compatibility | 0 |
| Code Complexity | 0 |
| Documentation | 0 |
| Unused Code | 0 |
| **Total** | **0** |

### Unfixed Issues per Codacy Code Pattern

| Code pattern | Unfixed issues |
| --- | ---: |
| No patterns listed with open issues | 0 |
| **Total** | **0** |

The public `main` issues search returned an empty result, the issue overview returned no patterns, and the ignored-issues search returned 0 entries. [Codacy Issues](https://app.codacy.com/gh/WYJ529/Ledger/issues/current)

### Unfixed Issues and Justifications

There were no reported open issues requiring individual justifications. The analysis logs contain a separate tooling limitation. They list detekt, ESLint and Trivy, along with additional tools such as Opengrep and ShellCheck. The TypeScript ESLint run exited with an error within `security-node/detect-unhandled-async-errors` while linting `backend/src/seedExpenseGroup.ts`. ESLint also reported TSConfig parsing errors for several JavaScript scripts. The zero-issue count reflects Codacy's published results with these limitations. The course-required tool setup and a successful ESLint rerun still need verification. [Codacy analysis logs](https://api.codacy.com/api/v3/analysis/organizations/gh/WYJ529/repositories/Ledger/commits/3951c8d3722d5255a056a12cc6fef27c08a2aa8d/logs)

## 3. Manual Code Review

### Review Performed by Ledger

Ledger reviewed MeetFair at `5a1db43039f4dde53e37ae97aa2f3441e6749cc9`. The review covered frontend and backend maintainability, the group and voting end-to-end scenarios, Recommendation Engine interface tests, test automation and coverage, and Codacy evidence. The team review draft records that leaving a group during an active trip can leave the trip unresolved and block settlement. The backend behavior was reproduced. Android verification and screenshots are outstanding in the draft available for this record. The full assessment belongs in the separate `CP3_MeetFair_Review.pdf`. [Reviewed repository snapshot](https://github.com/w-lin5/CPEN321_MeetFair/tree/5a1db43039f4dde53e37ae97aa2f3441e6749cc9)

### Review Received and Actions Taken

MeetFair's review highlighted Ledger's deterministic rounding, safe expense retries and atomic item claims. It also raised maintainability concerns in large route modules, gaps in test evidence, and two user-facing faults.

| Review feedback | Ledger's response and evidence |
| --- | --- |
| Editing a historical expense description after a member leaves could change the saved split. The report's CAD 60 example would change the remaining member's share from CAD 30 to CAD 60. | A description-only edit now preserves the original payer and allocations. Regression tests cover former participants and former payers. [PR #140](https://github.com/WYJ529/Ledger/pull/140) |
| Biometric app lock interfered with Google sign-in. | The biometric app-lock feature was removed from the current Android app, eliminating the reported interaction from this revision. [PR #133](https://github.com/WYJ529/Ledger/pull/133) |
| Test documentation referenced missing artifacts, and group expense and live split scenarios lacked clear end-to-end evidence. | Restructured backend interface tests, added real-backend Android scenarios, added the backend GitHub Actions workflow, and published Jest coverage screenshots. `Testing.md` records the executed tests and remaining coverage gaps. [PR #141](https://github.com/WYJ529/Ledger/pull/141) · [Backend CI](https://github.com/WYJ529/Ledger/commit/f3dfa900e507eb333eacc7755b08786902dd8598) · [Testing and coverage](Testing.md) |
| The review flagged concentrated route responsibilities, duplicated logic and missing measurements for live responsiveness. | The overall maintainability concerns remain open. The responsiveness requirement has a revised rationale, and load-test evidence remains outstanding. [PR #146](https://github.com/WYJ529/Ledger/pull/146) · [Testing status](Testing.md#nfr-location) |
