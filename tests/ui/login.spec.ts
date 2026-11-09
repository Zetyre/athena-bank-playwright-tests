import { expect, test } from '../../fixtures';
import type { AuthResponse } from '../../types/api';
import { knownIssue } from '../../utils/knownIssue';
import { countRequests } from '../../utils/requests';
import { apiUrl } from '../../utils/urls';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test(
    'TC-007: Valid credentials log the user in and open the dashboard',
    { tag: '@smoke' },
    async ({ page, loginPage, dashboardPage, createUser }) => {
      const user = await createUser({ initialBalance: null });

      await loginPage.login(user);

      await expect(page.getByText('Inicio de sesión exitoso')).toBeVisible();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(dashboardPage.title).toBeVisible();
    },
  );

  test(
    'TC-011: Login through the UI returns a token and the expected user',
    { tag: '@regression' },
    async ({ page, loginPage, dashboardPage, createUser }) => {
      const user = await createUser({ initialBalance: null });
      const loginResponse = page.waitForResponse(
        response => response.url() === apiUrl('/api/auth/login') && response.request().method() === 'POST',
      );

      await loginPage.login(user);

      const response = await loginResponse;
      expect(response.status()).toBe(200);
      expect((await response.json()) as AuthResponse).toEqual({
        token: expect.stringMatching(/\S+/),
        user: {
          id: expect.stringMatching(/\S+/),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
        },
      });
      await expect(dashboardPage.title).toBeVisible();
    },
  );

  test(
    'TC-015: A wrong password shows an error and keeps the user on the login page',
    { tag: '@regression' },
    async ({ page, loginPage, createUser }) => {
      const user = await createUser({ initialBalance: null });

      await loginPage.login({ email: user.email, password: `${user.password}-wrong` });

      await expect(page.getByText('Invalid credentials')).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.evaluate(() => localStorage.getItem('jwt'))).resolves.toBeNull();
    },
  );
});

test.describe('Login form validation', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test(
    'TC-052: Submitting the empty login form sends no request and flags the email as required',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      const loginRequests = countRequests(page, 'POST', '/api/auth/login');

      await loginPage.loginButton.click();

      await expect
        .poll(() => loginPage.emailInput.evaluate((input: HTMLInputElement) => input.validity.valueMissing))
        .toBe(true);
      await expect(page).toHaveURL(/\/login$/);
      expect(loginRequests()).toBe(0);
    },
  );

  test(
    'TC-053: A malformed email is rejected by the form before any request is sent',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      const loginRequests = countRequests(page, 'POST', '/api/auth/login');

      await loginPage.login({ email: 'not-an-email', password: 'Password123!' });

      await expect
        .poll(() => loginPage.emailInput.evaluate((input: HTMLInputElement) => input.validity.typeMismatch))
        .toBe(true);
      await expect(page).toHaveURL(/\/login$/);
      expect(loginRequests()).toBe(0);
    },
  );

  test('TC-054: The password is masked while it is typed', { tag: '@regression' }, async ({ page, loginPage }) => {
    const password = 'Visible-Secret-123';

    await loginPage.passwordInput.fill(password);

    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
    await expect(loginPage.passwordInput).toHaveValue(password);
    await expect(page.getByText(password)).toHaveCount(0);
  });

  test(
    'TC-055: The login button is disabled and shows progress while the login request is pending',
    { tag: '@regression' },
    async ({ page, loginPage, dashboardPage, createUser }) => {
      const user = await createUser({ initialBalance: null });
      let release!: () => void;
      const released = new Promise<void>(resolve => (release = resolve));
      await page.route(apiUrl('/api/auth/login'), async route => {
        await released;
        await route.continue();
      });

      await loginPage.login(user);

      await expect(loginPage.loginButton).toBeDisabled();
      await expect(loginPage.loginButton).toHaveText('Iniciando sesión...');
      release();
      await expect(dashboardPage.title).toBeVisible();
    },
  );

  test(
    'TC-062: The login page fits a 320px-wide screen without horizontal scrolling',
    { tag: '@regression' },
    async ({ page, loginPage }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await loginPage.goto();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'Pixels the page is wider than a 320px viewport').toBe(0);
      await expect(loginPage.loginButton).toBeInViewport();
    },
  );
});

test.describe('Session', () => {
  test(
    'TC-016: The dashboard redirects anonymous visitors to the login page',
    { tag: '@smoke' },
    async ({ page, loginPage }) => {
      await page.goto('/dashboard');

      await expect(page).toHaveURL(/\/login$/);
      await expect(loginPage.title).toBeVisible();
    },
  );

  test(
    'TC-017: Logging out clears the session and protects the dashboard again',
    { tag: '@regression' },
    async ({ page, loginAs, loginPage, createUser }) => {
      const user = await createUser({ initialBalance: null });
      const dashboard = await loginAs(user);

      await dashboard.logoutButton.click();

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.evaluate(() => localStorage.getItem('jwt'))).resolves.toBeFalsy();
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login$/);
      await expect(loginPage.title).toBeVisible();
    },
  );

  test(
    'TC-083: A stored token the server rejects sends the user back to the login page',
    knownIssue({
      kind: 'bug',
      issue: 'Zetyre/redux-athena-bank#16',
      summary:
        'App defect: RequireAuth only checks that a token exists, and the dashboard turns a 401 into two error ' +
        'toasts, so an expired or revoked session leaves the user on an empty dashboard.',
      basis:
        'the app sends visitors without a token to the login page (TC-016); a token the server rejects should lead to the same place.',
      fails: /Expected pattern: \/\\\/login\$\/[\s\S]*Received string:\s+"[^"]*\/dashboard"/,
    }),
    async ({ page, loginPage }) => {
      test.fail();
      await page.addInitScript(() => window.localStorage.setItem('jwt', 'expired-or-revoked-token'));
      const accountsRejected = page.waitForResponse(
        response => new URL(response.url()).pathname === '/api/accounts' && response.status() === 401,
      );

      await page.goto('/dashboard');
      await accountsRejected;

      await expect(page).toHaveURL(/\/login$/, { timeout: 5_000 });
      await expect(loginPage.title).toBeVisible();
    },
  );
});
