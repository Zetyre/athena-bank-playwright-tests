import { randomUUID } from 'node:crypto';
import { expect, test } from '../../fixtures';
import type { AuthResponse, ErrorResponse } from '../../types/api';
import { knownIssue } from '../../utils/knownIssue';
import { apiUrl } from '../../utils/urls';
import { buildUser } from '../../utils/userFactory';

test.describe('Auth API', () => {
  test('TC-009: Sign-up returns 201 with a token and the created user', { tag: '@smoke' }, async ({ api }) => {
    const newUser = buildUser();

    const response = await api.signup(newUser);

    expect(response.status()).toBe(201);
    expect((await response.json()) as AuthResponse).toEqual({
      token: expect.stringMatching(/\S+/),
      user: {
        id: expect.stringMatching(/\S+/),
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
      },
    });
  });

  test(
    'TC-020: Sign-up with an email already in use returns 409',
    { tag: '@regression' },
    async ({ api, createUser }) => {
      const existingUser = await createUser({ initialBalance: null });

      const response = await api.signup(buildUser({ email: existingUser.email }));

      expect(response.status()).toBe(409);
      expect((await response.json()) as ErrorResponse).toEqual({ message: 'Email already in use' });
    },
  );

  for (const missingField of ['firstName', 'lastName', 'email', 'password'] as const) {
    test(`TC-021: Sign-up without ${missingField} returns 400`, { tag: '@regression' }, async ({ api }) => {
      const { [missingField]: _omitted, ...incompleteUser } = buildUser();

      const response = await api.signup(incompleteUser);

      expect(response.status()).toBe(400);
      expect((await response.json()) as ErrorResponse).toEqual({ message: 'All fields are required' });
    });
  }

  test(
    'TC-022: Login with valid credentials returns 200 and a token',
    { tag: '@smoke' },
    async ({ api, createUser }) => {
      const user = await createUser({ initialBalance: null });

      const response = await api.login(user);

      expect(response.status()).toBe(200);
      const body = (await response.json()) as AuthResponse;
      expect(body.token).toMatch(/\S+/);
      expect(body.user.email).toBe(user.email);
    },
  );

  test('TC-023: Login with a wrong password returns 401', { tag: '@regression' }, async ({ api, createUser }) => {
    const user = await createUser({ initialBalance: null });

    const response = await api.login({ email: user.email, password: `${user.password}-wrong` });

    expect(response.status()).toBe(401);
    expect((await response.json()) as ErrorResponse).toEqual({ message: 'Invalid credentials' });
  });

  test(
    'TC-024: Login with an unknown email returns the same 401 as a wrong password',
    { tag: '@regression' },
    async ({ api }) => {
      const response = await api.login({ email: buildUser().email, password: 'Password123!' });

      expect(response.status()).toBe(401);
      expect((await response.json()) as ErrorResponse).toEqual({ message: 'Invalid credentials' });
    },
  );

  test('TC-025: Login without a password returns 400', { tag: '@regression' }, async ({ api }) => {
    const response = await api.login({ email: buildUser().email });

    expect(response.status()).toBe(400);
    expect((await response.json()) as ErrorResponse).toEqual({ message: 'Email and password are required' });
  });
});

test.describe('Auth API: boundaries and abuse', () => {
  test(
    'TC-056: Login with a 10,000-character email or password returns 401, and an oversized body returns 413',
    { tag: '@regression' },
    async ({ api, request, createUser }) => {
      const user = await createUser({ initialBalance: null });

      const longEmail = await api.login({ email: `${'a'.repeat(10_000)}@example.com`, password: user.password });
      const longPassword = await api.login({ email: user.email, password: 'x'.repeat(10_000) });
      const oversized = await request.post(apiUrl('/api/auth/login'), {
        data: { email: user.email, password: 'x'.repeat(200_000) },
      });

      expect(longEmail.status()).toBe(401);
      expect(longPassword.status()).toBe(401);
      expect(oversized.status()).toBe(413);
    },
  );

  test(
    'TC-057: Login rejects a password that only matches the first 72 characters of the real one',
    knownIssue({
      kind: 'bug',
      issue: 'Zetyre/redux-athena-bank#10',
      summary:
        'Bcrypt only hashes the first 72 bytes and the backend does not limit password length, ' +
        'so any password sharing those 72 characters is accepted.',
      basis: 'a password that differs from the registered one is wrong, and login must reject it.',
      fails: /Expected: 401\s+Received: 200/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const first72 = 'A'.repeat(72);
      const user = await createUser({ initialBalance: null, overrides: { password: `${first72}-real-ending` } });

      const response = await api.login({ email: user.email, password: `${first72}-wrong-ending` });

      expect(response.status()).toBe(401);
    },
  );

  const nonStringIssue = (fails: RegExp) =>
    knownIssue({
      kind: 'bug',
      issue: 'Zetyre/redux-athena-bank#11',
      summary:
        'The login handler passes the JSON values to User.findOne and bcrypt.compare without checking ' +
        'they are strings, so an array email is matched with $in and a non-string password throws (500).',
      basis: 'client input never warrants a server error; the handler already answers 400 for missing fields.',
      fails,
    });

  for (const [name, credentials, fails] of [
    ['email sent as an array', (email: string, password: string) => ({ email: [email], password }), /Received: 200/],
    ['password sent as a number', (email: string) => ({ email, password: 12345 }), /Received: 500/],
    ['password sent as an object', (email: string) => ({ email, password: { $ne: null } }), /Received: 500/],
  ] as const) {
    test(
      `TC-058: Login with non-string credentials returns 400: ${name}`,
      nonStringIssue(fails),
      async ({ request, createUser }) => {
        test.fail();
        const user = await createUser({ initialBalance: null });

        const response = await request.post(apiUrl('/api/auth/login'), {
          data: credentials(user.email, user.password),
        });

        expect(response.status()).toBe(400);
      },
    );
  }

  test(
    'TC-059: After 10 failed logins in a row, the account is temporarily locked',
    knownIssue({
      kind: 'observation',
      issue: 'OBS-1',
      summary:
        'There is no lockout or rate limit on POST /api/auth/login, so a password can be guessed ' + 'without limit.',
      basis: 'OWASP ASVS 4.0.3 V2.2.1 (anti-automation against brute force).',
      fails: /Login with the correct password right after 10 failures[\s\S]*Expected: not 200/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: null });

      for (let attempt = 1; attempt <= 10; attempt++) {
        const failed = await api.login({ email: user.email, password: `wrong-${attempt}` });
        expect(failed.status(), `Failed attempt ${attempt}`).toBe(401);
      }
      const afterFailures = await api.login(user);

      expect(afterFailures.status(), 'Login with the correct password right after 10 failures').not.toBe(200);
    },
  );

  const emailCaseIssue = (fails: RegExp) =>
    knownIssue({
      kind: 'observation',
      issue: 'OBS-2',
      summary:
        'Emails are stored and looked up exactly as typed, so the same address in different case ' +
        'is a different user.',
      basis:
        'common practice is to match email addresses case-insensitively (RFC 5321 allows a case-sensitive local part, so this is a design choice).',
      fails,
    });

  test(
    'TC-060: Sign-up with an email already in use in different letter case returns 409',
    emailCaseIssue(/Expected: 409\s+Received: 201/),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: null });

      const response = await api.signup(buildUser({ email: user.email.toUpperCase() }));

      expect(response.status()).toBe(409);
    },
  );

  test(
    'TC-060: Login with the email in different letter case succeeds',
    emailCaseIssue(/Expected: 200\s+Received: 401/),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: null });

      const response = await api.login({ email: user.email.toUpperCase(), password: user.password });

      expect(response.status()).toBe(200);
    },
  );

  const signUpValidationIssue = (fails: RegExp) =>
    knownIssue({
      kind: 'observation',
      issue: 'OBS-3',
      summary:
        'Sign-up only checks that the fields are present; it accepts any email text and a password ' +
        'of any length, in the API and in the form.',
      basis:
        'common practice and NIST SP 800-63B 5.1.1.2 (passwords of at least 8 characters); the login form already requires an email format.',
      fails,
    });

  for (const [name, overrides] of [
    ['malformed email', { email: `not-an-email-${randomUUID()}` }],
    ['1-character password', { password: '1' }],
  ] as const) {
    test(
      `TC-061: Sign-up rejects invalid data with 400: ${name}`,
      signUpValidationIssue(/Expected: 400\s+Received: 201/),
      async ({ api }) => {
        test.fail();

        const response = await api.signup(buildUser(overrides));

        expect(response.status()).toBe(400);
      },
    );
  }
});

test.describe('Auth API: session', () => {
  test(
    'TC-076: A token stops working after the user logs out',
    knownIssue({
      kind: 'observation',
      issue: 'OBS-5',
      summary:
        'Logout only clears a cookie the app never sets; the JWT stays valid for its full 7 days, ' +
        'so a copied token keeps working after the user logs out.',
      basis:
        'OWASP ASVS 4.0.3 V3.3.1 (logout invalidates the session); stateless tokens are a design choice the app made.',
      fails: /Accounts read with the token after logout[\s\S]*Expected: 401\s+Received: 200/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: null });
      const { token } = (await (await api.login(user)).json()) as AuthResponse;

      expect((await api.logout()).status()).toBe(200);

      expect((await api.getAccounts(token)).status(), 'Accounts read with the token after logout').toBe(401);
    },
  );
});
