# **Code Review**

Repository:  [m1lun/m1skeletonProject](https://github.com/m1lun/m1skeletonProject)  
Inspected main commit: [149f16a96f8931a37c0b1c8f2affbebcb3c4cc6d](https://github.com/m1lun/m1skeletonProject/commit/149f16a96f8931a37c0b1c8f2affbebcb3c4cc6d)  
Evidence checked: 2 November 2026, Vancouver time.

## 1. Change History

| Date | Sections | Rationale |
| :---- | :---- | :---- |
| 2026-10-19 | 1 to 3 | Prepared the CP1 status report from GitHub PR and Codacy evidence. |
| 2026-10-19 | 1 to 3 | Integrated GitHub Code\_Review.md template fields and review rubric; removed duplicated draft text; refreshed PR merge status while retaining the original review evidence. |
| 2026-10-20 | 2 and 3 | Updated PR and review evidence through PR \#56; corrected the PR \#41 label; distinguished historical tests from current main; recorded outstanding evidence and documentation gaps. |
| 2026-11-02 | 2 and 3 | Completed Section 2 for CP2 from the Codacy results on main, replacing the pull-request-level evidence; updated Section 3 for the CP2 code exchange and added internal reviews since CP1. |

## 2. Automated Code Review Results

Codacy reports 0 issues on main, with grade A. ESLint, detekt and Trivy are the only enabled tools, and ESLint and detekt use the repository's .eslintrc.json and detekt.yml, which have not changed since M1. The code has no inline comments that suppress issues.

### 2.1 Commit Hash Where Codacy Ran

[149f16a96f8931a37c0b1c8f2affbebcb3c4cc6d](https://github.com/m1lun/m1skeletonProject/commit/149f16a96f8931a37c0b1c8f2affbebcb3c4cc6d), analysed on 2 November 2026 at 04:52 UTC. All 41 pull requests merged since CP1 also finished with 0 new issues.

### 2.2 Unfixed Issues per Codacy Category

Codacy reports 0 unfixed issues in total, so no category has any issues.

### 2.3 Unfixed Issues per Codacy Code Pattern

Codacy reports 0 unfixed issues in total, so no code pattern has any issues.

### 2.4 Justifications for Unfixed Issues

None. There are no unfixed issues to justify.

### 2.5 Recorded Responses to Automated Findings

These pull requests document changes made in response to automated analysis findings.

PR \#51:

* **TypeScript**: Addressed two no-unsafe-argument findings related to uploaded files by introducing a local UploadedFile type.
* **Dependencies**: Updated proxy-addr from 2.0.7 to 2.0.8 and qs from 6.15.3 to 6.16.1 in response to dependency alerts.
* **Kotlin**: Simplified PostViewModel by removing the updateRow and removeRow wrappers to address the detekt function-count limit.

Since CP1:

* **Kotlin**: [PR \#160](https://github.com/m1lun/m1skeletonProject/pull/160) removed the labeled return from sendOffer.
* **TypeScript**: [PR \#158](https://github.com/m1lun/m1skeletonProject/pull/158) gave the stored categories list a type.
* **TypeScript**: [PR \#107](https://github.com/m1lun/m1skeletonProject/pull/107) named a caught error so that Codacy sees it as handled.

## 3. Manual Code Review Results

The code exchange with our peer group is due at CP2 and has not happened yet. The review results will be documented at CP3.

### 3.1 Review Performed by Our Group

Our group has not yet performed the formal review of another group’s project. The report is due at CP3. The reviewed group, the commit SHA received and the exchange date will be recorded after the exchange.

### 3.2 Review Received by Our Group

Our group has not yet received a formal peer-review report. The feedback will be recorded at CP3. The reviewing group, the commit SHA handed over and the exchange date will be recorded after the exchange.

| Type | Criterion | Performed | Received |
| :---- | :---- | :---- | :---- |
| Manual code review | Maintainable code, clear names, appropriate method size, efficiency and error handling | N/A – CP2 | N/A – CP2 |
| Manual test review | API / core-feature coverage; edge cases; correct assertions | N/A – CP2 | N/A – CP2 |
| Manual test review | Well-structured, maintainable test code | N/A – CP2 | N/A – CP2 |
| Manual test review | Tests match requirements and design | N/A – CP2 | N/A – CP2 |
| Manual test review | Non-functional requirements are properly tested | N/A – CP2 | N/A – CP2 |
| Manual test review | Coverage targets and justifications for uncovered code | N/A – CP2 | N/A – CP2 |
| Manual test review | Backend tests can be run automatically | N/A – CP2 | N/A – CP2 |
| Automated code review | Codacy configured according to project requirements | N/A – CP2 | N/A – CP2 |
| Automated code review | Remaining Codacy issues appropriately justified | N/A – CP2 | N/A – CP2 |

### 3.3 Actions Taken in Response to the Review

No actions have been taken in response to formal peer review, as feedback has not yet been received. Any resulting changes and unresolved findings will be documented after the review.

### 3.4 Additional Internal Team Review

| PR | Activity and status |
| :---- | :---- |
| [PR \#29](https://github.com/m1lun/m1skeletonProject/pull/29#issuecomment-6185268836)  | Nishim12 requested backend-issued session and refresh tokens. Bwong99 later summarized token issuance, refresh/logout endpoints and protected routes. PR merged.  |
| [PR \#31](https://github.com/m1lun/m1skeletonProject/pull/31#discussion_r4300167547)  | Nishim12 submitted a COMMENTED review requesting removal of a comment in backend/src/models/common.ts. The thread is resolved and outdated. Nishim12 is also the PR author, so this is recorded as author self-review, not independent teammate review. PR merged. |
| [PR \#35](https://github.com/m1lun/m1skeletonProject/pull/35) | Nishim12 requested comment cleanup in the listings-feed work and later wrote “Thanks for fixing the comments. LGTM\!” PR merged. |
| [PR \#46](https://github.com/m1lun/m1skeletonProject/pull/46#pullrequestreview-5579959981) | m1lun submitted a COMMENTED review thanking the author for removing unit tests and stating LGTM. This records a review comment, not an APPROVED review or evidence of test completeness. PR merged. |
| [PR \#53](https://github.com/m1lun/m1skeletonProject/pull/53#pullrequestreview-5593076708) | m1lun submitted a COMMENTED review stating that one function had been made more readable and otherwise LGTM. PR merged. |
| [PR \#54](https://github.com/m1lun/m1skeletonProject/pull/54#pullrequestreview-5593226561) | m1lun submitted an APPROVED review, stating that the tests are standalone, readable and clean up data. PR merged. |
| [PR \#107](https://github.com/m1lun/m1skeletonProject/pull/107) | Nishim12 left review comments asking to remove unit tests that were not needed for CP2, to keep comments to the important parts of the code, and why the user model had both an address and a location, then submitted an APPROVED review. PR merged. |
| [PR \#161](https://github.com/m1lun/m1skeletonProject/pull/161) | Nishim12 submitted an APPROVED review of the documentation update. PR merged. |

### Additional Internal Findings and Fixes

Internal testing also identified issues addressed through subsequent pull requests. [PR \#43](https://github.com/m1lun/m1skeletonProject/pull/43) documents a fix preventing negative values in built-in numeric and dimension fields, following a failure identified during Feature 1 end-to-end testing. [PR \#56](https://github.com/m1lun/m1skeletonProject/pull/56) improved the reliability of oversized-photo end-to-end tests by updating photo selection and test-file cleanup.

These changes were recorded as part of internal development and testing, independently of the formal peer-group review.
