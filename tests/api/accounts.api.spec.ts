import { expect, test } from '../../fixtures';
import type { Account, AccountType, BankUser, ErrorResponse, Transaction } from '../../types/api';
import type { AthenaApi } from '../../utils/athenaApi';
import { knownBug } from '../../utils/knownBug';
import { apiUrl } from '../../utils/urls';

test.describe('Accounts API', () => {
  test('TC-026: A new account is returned with its opening balance', { tag: '@smoke' }, async ({ api, createUser }) => {
    const user = await createUser({ initialBalance: null });

    const created = await api.createAccount(user.token, 'savings', 1234);
    expect(created.status()).toBe(201);

    const accounts = await api.getAccounts(user.token);
    expect(accounts.status()).toBe(200);
    expect((await accounts.json()) as Account[]).toEqual([
      expect.objectContaining({
        type: 'savings',
        balance: 1234,
        frozen: false,
        last4: expect.stringMatching(/^\d{4}$/),
      }),
    ]);
  });

  test('TC-027: Accounts cannot be read without a token', { tag: '@regression' }, async ({ api }) => {
    const response = await api.getAccounts();

    expect(response.status()).toBe(401);
    expect((await response.json()) as ErrorResponse).toEqual({ message: 'No token provided' });
  });

  test('TC-028: Accounts cannot be read with an invalid token', { tag: '@regression' }, async ({ api }) => {
    const response = await api.getAccounts('not-a-real-jwt');

    expect(response.status()).toBe(401);
    expect((await response.json()) as ErrorResponse).toEqual({ message: 'Invalid token' });
  });
});

test.describe('Accounts API: opening accounts', () => {
  test('TC-063: Each of the four account types can be opened', { tag: '@regression' }, async ({ api, createUser }) => {
    const user = await createUser({ initialBalance: null });
    const types: AccountType[] = ['debit', 'credit', 'savings', 'checking'];

    for (const type of types) {
      const response = await api.createAccount(user.token, type, 0);
      expect(response.status(), `Opening a ${type} account`).toBe(201);
    }

    const accounts = (await (await api.getAccounts(user.token)).json()) as Account[];
    expect(accounts.map(account => account.type).sort()).toEqual([...types].sort());
  });

  for (const [name, body] of [
    ['unknown type', { type: 'gold', initialAmount: 100 }],
    ['missing type', { initialAmount: 100 }],
  ] as const) {
    test(
      `TC-064: Opening an account with an ${name} returns 400`,
      { tag: '@regression' },
      async ({ api, request, createUser }) => {
        const user = await createUser({ initialBalance: null });

        const response = await request.post(apiUrl('/api/accounts'), {
          headers: { Authorization: `Bearer ${user.token}` },
          data: body,
        });

        expect(response.status()).toBe(400);
        expect(await accountsOf(api, user.token)).toEqual([]);
      },
    );
  }

  test(
    'TC-065: Opening an account with a negative balance is rejected',
    knownBug({
      issue: 'Zetyre/redux-athena-bank#16',
      summary:
        'App defect: POST /api/accounts stores initialAmount as given, so an account can start in debt ' +
        '(the form blocks it, the API does not).',
      fails: /Expected: 400\s+Received: 201/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: null });

      const response = await api.createAccount(user.token, 'debit', -500);

      expect(response.status()).toBe(400);
    },
  );
});

test.describe('Accounts API: deposits', () => {
  test(
    'TC-066: A deposit increases the balance and is recorded in the history',
    { tag: '@smoke' },
    async ({ api, createUser }) => {
      const user = await createUser({ initialBalance: 1000 });

      const response = await api.deposit(user.token, user.account!._id, 250);

      expect(response.status()).toBe(200);
      expect(((await response.json()) as Account).balance).toBe(1250);
      const history = (await (await api.getTransactions(user.token)).json()) as Transaction[];
      expect(history).toContainEqual(
        expect.objectContaining({ type: 'deposit', direction: 'in', amount: 250, accountId: user.account!._id }),
      );
    },
  );

  for (const [name, status, message, setUp] of [
    ['an amount of 0', 400, 'Invalid amount', () => Promise.resolve({ amount: 0 })],
    ['a negative amount', 400, 'Invalid amount', () => Promise.resolve({ amount: -5 })],
    [
      'a frozen account',
      400,
      'Account is frozen',
      async (api: AthenaApi, user: BankUser) => {
        expect((await api.freeze(user.token, user.account!._id, true)).status()).toBe(200);
        return { amount: 5 };
      },
    ],
  ] as const) {
    test(`TC-067: A deposit to ${name} is rejected`, { tag: '@regression' }, async ({ api, createUser }) => {
      const user = await createUser({ initialBalance: 1000 });
      const { amount } = await setUp(api, user);

      const response = await api.deposit(user.token, user.account!._id, amount);

      expect(response.status()).toBe(status);
      expect((await response.json()) as ErrorResponse).toEqual({ message });
      expect(await accountsOf(api, user.token)).toEqual([expect.objectContaining({ balance: 1000 })]);
    });
  }

  test(
    'TC-068: A deposit amount sent as text is added as a number',
    knownBug({
      issue: 'Zetyre/redux-athena-bank#15',
      summary:
        'App defect: the deposit and transfer handlers do balance += amount without converting amount to a ' +
        'number, so "100" is appended as text: 1000 becomes 1000100.',
      fails: /Expected: 1100\s+Received: 1000100/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: 1000 });

      await api.deposit(user.token, user.account!._id, '100');

      expect((await accountsOf(api, user.token))[0].balance).toBe(1100);
    },
  );

  const centsBug = (fails: RegExp) =>
    knownBug({
      issue: 'Zetyre/redux-athena-bank#17',
      summary:
        'App defect: balances are binary floating-point numbers and amounts are not limited to cents, so ' +
        'sums drift (0.1 + 0.2 = 0.30000000000000004) and fractions of a cent are accepted.',
      fails,
    });

  test(
    'TC-069: Deposits of 0.10 and 0.20 add up to exactly 0.30',
    centsBug(/Expected: 0\.3\s+Received: 0\.30000000000000004/),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: 0 });

      await api.deposit(user.token, user.account!._id, 0.1);
      await api.deposit(user.token, user.account!._id, 0.2);

      expect((await accountsOf(api, user.token))[0].balance).toBe(0.3);
    },
  );

  test(
    'TC-069: A deposit of a fraction of a cent is rejected',
    centsBug(/Expected: 400\s+Received: 200/),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: 0 });

      const response = await api.deposit(user.token, user.account!._id, 0.001);

      expect(response.status()).toBe(400);
    },
  );
});

test.describe('Accounts API: ownership, freezing and closing', () => {
  for (const [action, call] of [
    ['deposit to', (api: AthenaApi, token: string, id: string) => api.deposit(token, id, 5)],
    ['freeze', (api: AthenaApi, token: string, id: string) => api.freeze(token, id, true)],
    ['delete', (api: AthenaApi, token: string, id: string) => api.deleteAccount(token, id)],
  ] as const) {
    test(
      `TC-070: A user cannot ${action} another user's account`,
      { tag: '@regression' },
      async ({ api, createUser }) => {
        const [owner, intruder] = await Promise.all([createUser({ initialBalance: 1000 }), createUser()]);

        const response = await call(api, intruder.token, owner.account!._id);

        expect(response.status()).toBe(404);
        expect(await accountsOf(api, owner.token)).toEqual([expect.objectContaining({ balance: 1000, frozen: false })]);
      },
    );
  }

  test(
    'TC-071: An account that still holds money cannot be deleted',
    knownBug({
      issue: 'Zetyre/redux-athena-bank#18',
      summary:
        'App defect: DELETE /api/accounts/:id deletes an account whatever its balance; the money is gone and ' +
        'the dialog gives no warning.',
      fails: /Expected: 400\s+Received: 200/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: 750 });

      const response = await api.deleteAccount(user.token, user.account!._id);

      expect(response.status()).toBe(400);
    },
  );

  const malformedIdBug = knownBug({
    issue: 'Zetyre/redux-athena-bank#22',
    summary:
      'App defect: a malformed account id reaches Mongoose unchecked; transfer and delete answer 500 with the ' +
      'internal CastError message.',
    fails: /Status for a malformed account id[\s\S]*Received: {3}500/,
  });

  for (const [name, call] of [
    [
      'a transfer',
      (api: AthenaApi, user: BankUser) =>
        api.transfer(user.token, { fromAccountId: 'not-an-id', toEmail: user.email, amount: 1 }),
    ],
    ['a delete', (api: AthenaApi, user: BankUser) => api.deleteAccount(user.token, 'not-an-id')],
  ] as const) {
    test(
      `TC-072: A malformed account id in ${name} returns a client error, not 500`,
      malformedIdBug,
      async ({ api, createUser }) => {
        test.fail();
        const user = await createUser();

        const response = await call(api, user);

        expect(response.status(), 'Status for a malformed account id').toBeLessThan(500);
      },
    );
  }

  test(
    "TC-073: The history lists only the user's own events, newest first",
    { tag: '@regression' },
    async ({ api, createUser }) => {
      const [user, other] = await Promise.all([
        createUser({ initialBalance: 1000 }),
        createUser({ initialBalance: 50 }),
      ]);
      const id = user.account!._id;
      expect((await api.deposit(user.token, id, 10)).status()).toBe(200);
      expect((await api.freeze(user.token, id, true)).status()).toBe(200);
      expect((await api.freeze(user.token, id, false)).status()).toBe(200);

      // The freeze endpoint answers before it records the event, so wait for the last one to be stored.
      let history: Transaction[] = [];
      await expect
        .poll(async () => {
          const response = await api.getTransactions(user.token);
          expect(response.status()).toBe(200);
          history = (await response.json()) as Transaction[];
          return history.length;
        })
        .toBe(4);
      expect(
        history.map(({ type, direction, amount, description }) => ({ type, direction, amount, description })),
      ).toEqual([
        { type: 'status_change', direction: 'neutral', amount: undefined, description: 'Cuenta descongelada' },
        { type: 'status_change', direction: 'neutral', amount: undefined, description: 'Cuenta congelada' },
        { type: 'deposit', direction: 'in', amount: 10, description: 'Deposit' },
        { type: 'account_opened', direction: 'in', amount: 1000, description: 'Cuenta de ahorros creada' },
      ]);
      expect(history.every(event => event.user !== other.account!.user)).toBe(true);
    },
  );

  test('TC-073: The history cannot be read without a token', { tag: '@regression' }, async ({ api }) => {
    const response = await api.getTransactions();

    expect(response.status()).toBe(401);
  });
});

async function accountsOf(api: AthenaApi, token: string): Promise<Account[]> {
  const response = await api.getAccounts(token);
  expect(response.status()).toBe(200);
  return (await response.json()) as Account[];
}
