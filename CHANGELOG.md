# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.1] - 2026-11-09

### Fixed

- TC-078 gets three times the default timeout (`test.slow()`). It opens and closes five dialogs in one flow, which
  takes about 34 s in WebKit on CI, over the 30 s default, so `main` failed after 1.2.0. Pull requests only run the
  smoke tests in WebKit, so it was not caught there.

## [1.2.0] - 2026-11-09

Final version: every feature of the app covered, findings classified as bugs or observations, and the suite
trimmed to what a demo app needs. 79 test cases, 97 tests, 179 runs.

### Added

- Coverage of every app feature still untested: login boundaries and abuse (empty, malformed, huge and non-string
  input, long passwords, lockout, email letter case), account types, deposits, freezing, closing accounts, the
  transaction history, frozen accounts in transfers, ownership checks, amounts sent as text, cents, malformed ids,
  the session after logout or with a rejected token, the total balance, stored HTML in user data, and the
  concurrent-transfer bug (redux-athena-bank#2), until now only reproduced by hand.
- Test case catalogue (`docs/test-cases.md`): what every test checks, where its expected result comes from, and how
  it is built.
- Page objects for the add-funds, freeze and delete dialogs, and API client methods for deposits, freezing,
  deleting, the history and logout.
- README: what is deliberately not tested, and why.

### Changed

- Findings are classified as **bugs** (the app contradicts itself or basic correctness) or **observations** (the
  expectation comes only from a standard or common practice, since the app has no specification). 13 bugs, 9
  observations. Bugs are reported as issues on the app's repository; new observations are listed in the README
  (`OBS-1` to `OBS-5`).
- `knownBug()` became `knownIssue()`, which also records the kind and the basis of the expectation and tags tests
  `@bug` or `@observation`. The known-defects reporter became the known-issues reporter and lists bugs and
  observations separately.
- TC-005 also checks the redirect to login; TC-019 also checks the new account's balance, type and total.
- README rewritten shorter.
- Wording fixes in test titles and known-issue summaries.
- `randomAmount` picks a plain `Math.random()` amount and records it in the report; the seeded hash helper and
  `PLAYWRIGHT_TEST_SEED` are gone.
- Tests that prove a form blocked a submit share one helper, `countRequests()`.

### Fixed

- TC-078 could time out in WebKit under full parallel load: it now waits for the send-money dialog to finish
  closing before clicking the account card.

### Removed

- On-screen contrast measurement from screenshot pixels (`measureTextContrast`) and its tests (TC-044, TC-045,
  TC-046, TC-050). axe-core scans stay; the contrast observations (redux-athena-bank#4 and #8) stay documented with screenshots.
- TC-001 and TC-013, which other tests already covered.
- Unused code: `frontendUrl()` and `LoginPage.signUpLink`.

## [1.1.0] - 2026-11-06

Accessibility coverage, documented defects and a reporter that keeps known bugs apart from real passes.
51 test cases, 67 tests, 157 executions.

### Added

- Accessibility audit (TC-037 to TC-051): axe-core scans against WCAG 2.2 A and AA for the login, sign-up and
  dashboard pages and the create-account and send-money dialogs, a keyboard-only login test, and on-screen contrast,
  keyboard access, autofill purpose, page language and page title checks.
- `utils/accessibility.ts`: `scanAccessibility` waits for animations to settle and attaches the axe results to the
  report; `measureTextContrast` and `expectSufficientContrast` measure text contrast against the pixels rendered
  behind it, which axe cannot do over the app's particle canvas and gradients.
- Seven accessibility defects documented as `test.fail()` known bugs: the invisible sign-up prompt (TC-043), text
  contrast on the login, sign-up and dashboard pages (TC-044, TC-045), the "Agregar cuenta" tile not reachable by
  keyboard (TC-047), the page language (TC-048), the page titles (TC-049), notification contrast (TC-050) and
  autofill purpose (TC-051). TC-046 is a control that proves the contrast check passes readable text.
- Each known-bug check is its own test (one per text, notification or form), so a partial fix in the app turns
  exactly one test red instead of hiding behind the checks that still fail.
- `docs/defects/`: annotated screenshots for every defect report (redux-athena-bank#1 to #9).
- Known-defects reporter (`reporters/known-defects.ts`): lists the known defects still present by issue, in the
  terminal and the CI job summary, and fails the run when a `@known-bug` test fails for a reason other than the
  one it declares. `utils/knownBug.ts` provides `knownBug()`, which every known-bug test, TC-036 included, now
  uses to declare its issue and expected failure.
- The CI job summary counts known defects (expected failures) apart from passed tests.

### Changed

- README: motivation, local setup, tooling, design notes and the list of known defects with screenshots.

## [1.0.0] - 2026-11-05

First stable version of the framework.

### Added

- Typed Playwright fixtures: page objects, API client, `createUser`, `loginAs`, `openDashboardInNewContext`,
  `randomAmount`. Every test creates its own users and accounts through the API.
- Browserless `api` project with contract and negative tests for auth, accounts and transfers.
- UI coverage for sign-up, login, sessions (route guard, logout), account creation and transfers across Chromium,
  Firefox and WebKit. 36 test cases, 76 executions, tagged `@smoke` / `@regression`.
- TC-036 documents an app defect: a transfer to your own account increases the balance (`test.fail()`).
- ESLint (type-aware `typescript-eslint`, `eslint-plugin-playwright`), Prettier, EditorConfig and VS Code settings.
- CI pipeline: quality gate, one job per browser, merged HTML report with job summary, nightly and manual runs, a
  single `test` gate for branch protection, and a published report archive on GitHub Pages.

### Changed

- Removed `networkidle` waits in favour of web-first assertions, and the shared setup project in favour of per-test
  data.

### Fixed

- Parallel runs no longer race on shared sender and receiver accounts.
- The Pages archive now prunes old reports and also publishes failed runs.

[Unreleased]: https://github.com/Zetyre/athena-bank-playwright-tests/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/Zetyre/athena-bank-playwright-tests/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/Zetyre/athena-bank-playwright-tests/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Zetyre/athena-bank-playwright-tests/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Zetyre/athena-bank-playwright-tests/releases/tag/v1.0.0
