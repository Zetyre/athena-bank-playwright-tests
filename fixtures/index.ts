import { test as base, expect, type Page } from '@playwright/test';
import { DeleteAccountModal, FreezeAccountModal } from '../pages/accountDialogs';
import { AddFundsModal } from '../pages/addFundsModal';
import { CreateAccountModal } from '../pages/createAccountModal';
import { DashboardPage } from '../pages/dashboardPage';
import { LoginPage } from '../pages/loginPage';
import { RegisterPage } from '../pages/registerPage';
import { SendMoneyModal } from '../pages/sendMoneyModal';
import type { Account, AuthResponse, BankUser, NewUser } from '../types/api';
import { AthenaApi } from '../utils/athenaApi';
import { frontendBaseUrl } from '../utils/urls';
import { buildUser } from '../utils/userFactory';

type CreateUserOptions = {
  /** Opening balance of a savings account. Pass `null` to create a user without an account. */
  initialBalance?: number | null;
  overrides?: Partial<NewUser>;
};

type Fixtures = {
  api: AthenaApi;
  /** Creates a fresh user (and by default a funded account) through the API. */
  createUser: (options?: CreateUserOptions) => Promise<BankUser>;
  /** Authenticates the test's `page` as `user` without going through the login form. */
  loginAs: (user: BankUser) => Promise<DashboardPage>;
  /** Opens the dashboard as `user` in a second, isolated browser context. */
  openDashboardInNewContext: (user: BankUser) => Promise<DashboardPage>;
  /** A random whole amount between min and max, recorded in the test's report so a failure shows what was used. */
  randomAmount: (min: number, max: number) => number;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  dashboardPage: DashboardPage;
  createAccountModal: CreateAccountModal;
  sendMoneyModal: SendMoneyModal;
  addFundsModal: AddFundsModal;
  freezeAccountModal: FreezeAccountModal;
  deleteAccountModal: DeleteAccountModal;
};

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new AthenaApi(request));
  },

  createUser: async ({ api }, use) => {
    await use(async ({ initialBalance = 10_000, overrides } = {}) => {
      const newUser = buildUser(overrides);
      const signup = await api.signup(newUser);
      expect(signup.status(), 'Sign-up of a test user failed').toBe(201);
      const { token } = (await signup.json()) as AuthResponse;

      let account: Account | undefined;
      if (initialBalance !== null) {
        const created = await api.createAccount(token, 'savings', initialBalance);
        expect(created.status(), 'Account creation for a test user failed').toBe(201);
        account = (await created.json()) as Account;
      }
      return { ...newUser, token, account };
    });
  },

  loginAs: async ({ page }, use) => {
    await use(async user => {
      await authenticate(page, user.token);
      const dashboard = new DashboardPage(page);
      await dashboard.goto();
      return dashboard;
    });
  },

  openDashboardInNewContext: async ({ browser }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
    await use(async user => {
      const context = await browser.newContext({
        baseURL: frontendBaseUrl,
        storageState: {
          cookies: [],
          origins: [{ origin: frontendBaseUrl, localStorage: [{ name: 'jwt', value: user.token }] }],
        },
      });
      contexts.push(context);
      const dashboard = new DashboardPage(await context.newPage());
      await dashboard.goto();
      return dashboard;
    });
    await Promise.all(contexts.map(context => context.close()));
  },

  randomAmount: async ({}, use, testInfo) => {
    await use((min, max) => {
      const amount = min + Math.floor(Math.random() * (max - min + 1));
      testInfo.annotations.push({ type: 'random-amount', description: String(amount) });
      return amount;
    });
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  createAccountModal: async ({ page }, use) => {
    await use(new CreateAccountModal(page));
  },
  sendMoneyModal: async ({ page }, use) => {
    await use(new SendMoneyModal(page));
  },
  addFundsModal: async ({ page }, use) => {
    await use(new AddFundsModal(page));
  },
  freezeAccountModal: async ({ page }, use) => {
    await use(new FreezeAccountModal(page));
  },
  deleteAccountModal: async ({ page }, use) => {
    await use(new DeleteAccountModal(page));
  },
});

/**
 * The app keeps its session JWT in localStorage under "jwt".
 * The token is written by an init script, before any app code runs: setting it after a page has loaded
 * races with AuthContext, whose effect removes "jwt" when the app started without a token.
 * The sessionStorage flag makes it a one-off, so a later logout is not undone on the next navigation.
 */
async function authenticate(page: Page, token: string): Promise<void> {
  await page.addInitScript(jwt => {
    if (window.sessionStorage.getItem('__test_session_seeded')) return;
    window.localStorage.setItem('jwt', jwt);
    window.sessionStorage.setItem('__test_session_seeded', '1');
  }, token);
}

export { expect };
