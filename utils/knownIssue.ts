import type { TestDetails } from '@playwright/test';

/** Tag every known-issue test carries. The known-issues reporter keys on it. */
export const KNOWN_ISSUE_TAG = '@known-issue';
/** Annotation holding the issue reference, its kind and a description. */
export const ISSUE_ANNOTATION = 'issue';
/** Annotation holding the kind of issue: "bug" or "observation". */
export const ISSUE_KIND_ANNOTATION = 'issue-kind';
/** Annotation holding the source of the regular expression the failure message must match. */
export const EXPECTED_FAILURE_ANNOTATION = 'expected-failure';

/**
 * The app has no specification, so every known issue says where its expected behaviour comes from:
 * - `bug`: the result is wrong by the app's own intent (its UI, code or messages say otherwise) or by basic
 *   correctness (money created or lost, a server error on client input, data shown wrongly).
 * - `observation`: the expected behaviour comes only from a standard or common practice (WCAG, OWASP ASVS, NIST,
 *   banking practice). A design gap or a missing requirement rather than a contradiction.
 */
export type IssueKind = 'bug' | 'observation';

export type KnownIssue = {
  kind: IssueKind;
  /**
   * Where the issue is recorded: a GitHub issue ("Zetyre/redux-athena-bank#4") for bugs, or the id of an observation
   * listed in the README ("OBS-1"), since observations are not filed as issues.
   */
  issue: `${string}/${string}#${number}` | `OBS-${number}`;
  /** What happens today, in one or two sentences. */
  summary: string;
  /** Why the test expects something else: the app's own rule it contradicts, or the standard it follows. */
  basis: string;
  /**
   * What the failure looks like while the issue is present. Every error of the test must match it, so a test that
   * fails for another reason (a broken selector, a timeout, a setup error) is reported instead of counted as the
   * known issue.
   */
  fails: RegExp;
};

const KIND_LABEL: Record<IssueKind, string> = { bug: 'Bug', observation: 'Observation' };

/**
 * Details for a test that asserts the expected behaviour of a known issue still present in the app. The test must
 * also call `test.fail()`, so it reports as "expected to fail" today and fails loudly once the app changes.
 * The known-issues reporter lists these tests apart from real passes and fails the run when one fails for the wrong
 * reason.
 */
export function knownIssue({ kind, issue, summary, basis, fails }: KnownIssue): TestDetails {
  if (fails.flags)
    throw new Error(`knownIssue: use an expected-failure pattern without flags, got /${fails.source}/${fails.flags}`);
  return {
    tag: ['@regression', KNOWN_ISSUE_TAG, `@${kind}`],
    annotation: [
      {
        type: ISSUE_ANNOTATION,
        description: `${issue}. ${KIND_LABEL[kind]}: ${summary} Expected behaviour based on: ${basis} Remove test.fail() once this changes.`,
      },
      { type: ISSUE_KIND_ANNOTATION, description: kind },
      { type: EXPECTED_FAILURE_ANNOTATION, description: fails.source },
    ],
  };
}
