import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures';
import { expectNoViolations, scanAccessibility } from '../../utils/accessibility';
import { knownIssue } from '../../utils/knownIssue';

/**
 * "¿Ya tienes cuenta? Iniciar sesión" under the sign-up form. It is hidden under the particle background
 * (redux-athena-bank#3), and axe measures it against the page's white base instead, so it is left out of the scan.
 */
const SIGNUP_LOGIN_PROMPT = '[data-testid="texto-pregunta-cuenta"]';

test.describe('Accessibility (WCAG 2.2 AA)', () => {
  // An axe scan runs over the whole DOM after the animations settle; under local parallel load Firefox can need
  // more than 30 s.
  test.slow();

  test.describe('axe-core scans', () => {
    test('TC-037: Login page has no WCAG violations', { tag: '@regression' }, async ({ page, loginPage }) => {
      await loginPage.goto();

      expectNoViolations(await scanAccessibility(page));
    });

    test('TC-038: Sign-up page has no WCAG violations', { tag: '@regression' }, async ({ page, registerPage }) => {
      await registerPage.goto();

      expectNoViolations(await scanAccessibility(page, { exclude: [SIGNUP_LOGIN_PROMPT] }));
    });

    test('TC-039: Dashboard has no WCAG violations', { tag: '@regression' }, async ({ page, createUser, loginAs }) => {
      await loginAs(await createUser());

      expectNoViolations(await scanAccessibility(page));
    });

    test(
      'TC-040: Create account dialog has no WCAG violations',
      { tag: '@regression' },
      async ({ page, createUser, loginAs, createAccountModal }) => {
        const dashboard = await loginAs(await createUser({ initialBalance: null }));

        await dashboard.addAccountButton.click();
        await expect(createAccountModal.accountTypeDropdown).toBeVisible();

        expectNoViolations(await scanAccessibility(page));
      },
    );

    test(
      'TC-041: Send money dialog has no WCAG violations',
      { tag: '@regression' },
      async ({ page, createUser, loginAs, sendMoneyModal }) => {
        const dashboard = await loginAs(await createUser());

        await dashboard.sendMoneyButton.click();
        await expect(sendMoneyModal.sourceAccountDropdown).toBeVisible();

        expectNoViolations(await scanAccessibility(page));
      },
    );
  });

  test.describe('Keyboard', () => {
    test(
      'TC-042: The login form can be filled in and submitted with the keyboard only',
      { tag: '@regression' },
      async ({ page, loginPage, dashboardPage, createUser }) => {
        const user = await createUser({ initialBalance: null });
        await loginPage.goto();

        // What is under test is focus order and submitting with Enter, not typing speed. Each value goes in as one
        // input event (like pasting): typing key by key can drop a character when the animated background keeps
        // the browser busy, because the form re-renders its state on every keystroke.
        await loginPage.emailInput.focus();
        await page.keyboard.insertText(user.email);
        await page.keyboard.press('Tab');
        await expect(loginPage.passwordInput).toBeFocused();
        await page.keyboard.insertText(user.password);
        await expect(loginPage.emailInput).toHaveValue(user.email);
        await expect(loginPage.passwordInput).toHaveValue(user.password);
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(dashboardPage.title).toBeVisible();
      },
    );

    test(
      'TC-047: "Agregar cuenta" can be reached with Tab and opened with Enter',
      knownIssue({
        kind: 'observation',
        issue: 'Zetyre/redux-athena-bank#5',
        summary:
          'The "Agregar cuenta" tile is a <div> with an onClick handler and no ' +
          'tabindex or role, so keyboard and screen reader users cannot open a new account.',
        basis: 'WCAG 2.2 AA 2.1.1 Keyboard and 4.1.2 Name, Role, Value.',
        fails: /Elements reached with Tab/,
      }),
      async ({ page, createUser, loginAs, createAccountModal }) => {
        test.fail();
        const dashboard = await loginAs(await createUser());

        const tabStops: (string | null)[] = [];
        for (let i = 0; i < 10; i++) {
          await page.keyboard.press('Tab');
          tabStops.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null));
        }
        expect(tabStops, 'Elements reached with Tab').toContain('tarjeta-agregar-cuenta');

        await dashboard.addAccountButton.focus();
        await page.keyboard.press('Enter');
        await expect(createAccountModal.accountTypeDropdown).toBeVisible();
      },
    );
  });

  test.describe('Layout', () => {
    test(
      'TC-043: The sign-up page fits a 320px-wide screen without horizontal scrolling',
      knownIssue({
        kind: 'bug',
        issue: 'Zetyre/redux-athena-bank#3',
        summary:
          'The "¿Ya tienes cuenta? Iniciar sesión" prompt in SignUp.tsx sits outside the form card, under the ' +
          'particle canvas, so it is never drawn (see the issue screenshots), and it pushes the page 30px wider ' +
          'than a 320px viewport.',
        basis:
          'the login page, built the same way, fits 320px (TC-062); the extra width comes only from the misplaced prompt.',
        fails: /Pixels the page is wider than a 320px viewport/,
      }),
      async ({ page, registerPage }) => {
        test.fail();
        await page.setViewportSize({ width: 320, height: 640 });
        await registerPage.goto();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, 'Pixels the page is wider than a 320px viewport').toBe(0);
      },
    );
  });

  test.describe('Page metadata', () => {
    test(
      'TC-048: The page language is declared as Spanish',
      knownIssue({
        kind: 'bug',
        issue: 'Zetyre/redux-athena-bank#6',
        summary:
          'The page declares <html lang="en"> in index.html, but the whole interface is in Spanish, so ' +
          'screen readers read it with English pronunciation.',
        basis:
          'the interface is in Spanish; lang="en" is a leftover of the Vite template (WCAG 3.1.1 also asks for the right language).',
        fails: /Received string:\s+"en"/,
      }),
      async ({ page, loginPage }) => {
        test.fail();
        await loginPage.goto();

        await expect(page.locator('html')).toHaveAttribute('lang', /^es\b/);
      },
    );

    test(
      'TC-049: Each page has its own descriptive title',
      knownIssue({
        kind: 'bug',
        issue: 'Zetyre/redux-athena-bank#7',
        summary:
          'Every page keeps the Vite template title "Vite + React + TS", so tabs, history ' +
          'and screen readers cannot tell the pages apart.',
        basis:
          '"Vite + React + TS" is a leftover of the Vite template, not a title for this app (WCAG 2.4.2 also asks for descriptive titles).',
        fails: /Page titles[\s\S]*Vite \+ React \+ TS/,
      }),
      async ({ page, loginPage, registerPage, createUser, loginAs }) => {
        test.fail();
        await loginPage.goto();
        const loginTitle = await page.title();
        await registerPage.goto();
        const signupTitle = await page.title();
        await loginAs(await createUser({ initialBalance: null }));
        const dashboardTitle = await page.title();

        const titles = [loginTitle, signupTitle, dashboardTitle];
        expect(titles, 'Page titles').not.toContain('Vite + React + TS');
        expect(new Set(titles).size, `Distinct titles among ${JSON.stringify(titles)}`).toBe(titles.length);
      },
    );
  });

  test.describe('Forms', () => {
    const autofillIssue = (fails: RegExp) =>
      knownIssue({
        kind: 'observation',
        issue: 'Zetyre/redux-athena-bank#9',
        summary:
          'No field sets an autocomplete purpose, and the sign-up form sets ' +
          'autocomplete="off", so browsers and assistive tools cannot fill in or label the user\'s own data.',
        basis: 'WCAG 2.2 AA 1.3.5 Identify Input Purpose.',
        fails,
      });

    /** Every field's autocomplete value, read once: the attributes are static, so retrying assertions would only wait. */
    const autocompleteByField = (page: Page) =>
      page
        .locator('form input[name]')
        .evaluateAll(inputs =>
          Object.fromEntries(
            (inputs as HTMLInputElement[]).map(input => [input.name, input.getAttribute('autocomplete')]),
          ),
        );

    test(
      'TC-051: Form fields identify their purpose for autofill: login',
      autofillIssue(/"email": null,[\s\S]*"password": null/),
      async ({ page, loginPage }) => {
        test.fail();
        await loginPage.goto();
        await expect(loginPage.passwordInput).toBeVisible();

        expect(await autocompleteByField(page)).toEqual({ email: 'email', password: 'current-password' });
      },
    );

    test(
      'TC-051: Form fields identify their purpose for autofill: sign-up',
      autofillIssue(/"email": null,[\s\S]*"firstName": null,[\s\S]*"lastName": null,[\s\S]*"password": null/),
      async ({ page, registerPage }) => {
        test.fail();
        await registerPage.goto();
        await expect(registerPage.passwordInput).toBeVisible();

        expect(await autocompleteByField(page)).toEqual({
          firstName: 'given-name',
          lastName: 'family-name',
          email: 'email',
          password: 'new-password',
        });
      },
    );
  });
});
