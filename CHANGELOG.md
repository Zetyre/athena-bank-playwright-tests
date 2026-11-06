# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Login and sign-up boundary and abuse coverage (TC-052 to TC-062): empty and malformed input blocked by the
  form, masked password, busy login button, login page at 320px, 10,000-character and oversized input,
  passwords longer than 72 characters, non-string credentials, brute-force lockout, email letter case, and
  sign-up data validation.
- Five login and sign-up defects documented as `test.fail()` known bugs, with annotated screenshots
  (redux-athena-bank#10 to #14).
- `mobile-chrome` (Pixel 7) and `mobile-safari` (iPhone 14) projects run the smoke suite on emulated phones,
  locally and as two more CI matrix jobs.
- Coverage of every remaining app feature (TC-063 to TC-085): account types, deposits, freezing and unfreezing,
  closing accounts, the transaction history, frozen accounts in transfers, ownership checks, amounts sent as
  text, fractions of a cent, malformed ids, the session after logout or with a rejected token, the total
  balance, the create-account form, and stored HTML in user data.
- TC-085 automates the concurrent-transfer defect (redux-athena-bank#2), until now reproduced only by hand.
- Eight more defects documented as `test.fail()` known bugs, with annotated screenshots
  (redux-athena-bank#15 to #22).
- Page objects for the add-funds, freeze and delete dialogs, and API client methods for deposits, freezing,
  deleting, the history and logout.
- README: what is deliberately not tested, and why.

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

[Unreleased]: https://github.com/Zetyre/athena-bank-playwright-tests/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Zetyre/athena-bank-playwright-tests/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Zetyre/athena-bank-playwright-tests/releases/tag/v1.0.0
