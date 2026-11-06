import type { APIResponse } from '@playwright/test';
import { expect, test } from '../../fixtures';
import type { Account, BankUser, ErrorResponse } from '../../types/api';
import type { AthenaApi } from '../../utils/athenaApi';
import { knownBug } from '../../utils/knownBug';
import { apiUrl } from '../../utils/urls';
import { buildUser } from '../../utils/userFactory';

async function balanceOf(api: AthenaApi, user: BankUser): Promise<number> {
  const response = await api.getAccounts(user.token);
  expect(response.status()).toBe(200);
  const [account] = (await response.json()) as Account[];
  return account.balance;
}

async function expectError(response: APIResponse, status: number, message: string): Promise<void> {
  expect(response.status()).toBe(status);
  expect((await response.json()) as ErrorResponse).toEqual({ message });
}

test.describe('Transfers API', () => {
  test(
    'TC-029: A transfer debits the sender and credits the receiver by the same amount',
    { tag: '@smoke' },
    async ({ api, createUser, randomAmount }) => {
      const sender = await createUser({ initialBalance: 5000 });
      const receiver = await createUser({ initialBalance: 100 });
      const amount = randomAmount(1, 1000);

      const response = await api.transfer(sender.token, {
        fromAccountId: sender.account!._id,
        toEmail: receiver.email,
        amount,
      });

      expect(response.status()).toBe(200);
      expect(await balanceOf(api, sender)).toBe(5000 - amount);
      expect(await balanceOf(api, receiver)).toBe(100 + amount);
    },
  );

  test(
    'TC-030: A transfer larger than the balance is rejected and nothing moves',
    { tag: '@regression' },
    async ({ api, createUser }) => {
      const sender = await createUser({ initialBalance: 50 });
      const receiver = await createUser({ initialBalance: 0 });

      const response = await api.transfer(sender.token, {
        fromAccountId: sender.account!._id,
        toEmail: receiver.email,
        amount: 51,
      });

      await expectError(response, 400, 'Insufficient funds');
      expect(await balanceOf(api, sender)).toBe(50);
      expect(await balanceOf(api, receiver)).toBe(0);
    },
  );

  for (const amount of [0, -10]) {
    test(`TC-031: A transfer of ${amount} is rejected`, { tag: '@regression' }, async ({ api, createUser }) => {
      const sender = await createUser();
      const receiver = await createUser();

      const response = await api.transfer(sender.token, {
        fromAccountId: sender.account!._id,
        toEmail: receiver.email,
        amount,
      });

      await expectError(response, 400, 'Invalid transfer data');
    });
  }

  test('TC-032: A transfer to an unknown email returns 404', { tag: '@regression' }, async ({ api, createUser }) => {
    const sender = await createUser();

    const response = await api.transfer(sender.token, {
      fromAccountId: sender.account!._id,
      toEmail: buildUser().email,
      amount: 10,
    });

    await expectError(response, 404, 'Recipient user not found');
  });

  test(
    'TC-033: A transfer to a recipient without an account returns 400',
    { tag: '@regression' },
    async ({ api, createUser }) => {
      const sender = await createUser();
      const recipientWithoutAccount = await createUser({ initialBalance: null });

      const response = await api.transfer(sender.token, {
        fromAccountId: sender.account!._id,
        toEmail: recipientWithoutAccount.email,
        amount: 10,
      });

      await expectError(response, 400, 'Recipient has no account');
    },
  );

  test(
    'TC-034: A user cannot transfer from an account they do not own',
    { tag: '@regression' },
    async ({ api, createUser }) => {
      const attacker = await createUser();
      const victim = await createUser({ initialBalance: 1000 });

      const response = await api.transfer(attacker.token, {
        fromAccountId: victim.account!._id,
        toEmail: attacker.email,
        amount: 500,
      });

      await expectError(response, 404, 'Sender account not found');
      expect(await balanceOf(api, victim)).toBe(1000);
    },
  );

  test('TC-035: A transfer without a token returns 401', { tag: '@regression' }, async ({ api, createUser }) => {
    const sender = await createUser();
    const receiver = await createUser();

    const response = await api.transfer('', {
      fromAccountId: sender.account!._id,
      toEmail: receiver.email,
      amount: 10,
    });

    await expectError(response, 401, 'No token provided');
  });

  test(
    'TC-036: A transfer to your own account does not change the balance',
    knownBug({
      issue: 'Zetyre/redux-athena-bank#1',
      summary:
        'App defect: routes/transactions.js loads the same account twice as sender and recipient and saves both, ' +
        'so a self-transfer of X credits the account by X.',
      fails: /Expected: 1000\s+Received: 1100/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const user = await createUser({ initialBalance: 1000 });

      await api.transfer(user.token, { fromAccountId: user.account!._id, toEmail: user.email, amount: 100 });

      expect(await balanceOf(api, user)).toBe(1000);
    },
  );
});

test.describe('Transfers API: frozen accounts and amount types', () => {
  for (const [side, frozenUser] of [
    ['send', 'sender'],
    ['receive', 'receiver'],
  ] as const) {
    test(`TC-075: A frozen account cannot ${side} money`, { tag: '@regression' }, async ({ api, createUser }) => {
      const users = {
        sender: await createUser({ initialBalance: 1000 }),
        receiver: await createUser({ initialBalance: 0 }),
      };
      const frozen = users[frozenUser];
      expect((await api.freeze(frozen.token, frozen.account!._id, true)).status()).toBe(200);

      const response = await api.transfer(users.sender.token, {
        fromAccountId: users.sender.account!._id,
        toEmail: users.receiver.email,
        amount: 100,
      });

      await expectError(
        response,
        400,
        frozenUser === 'sender' ? 'Sender account is frozen' : 'Recipient account is frozen',
      );
      expect(await balanceOf(api, users.sender)).toBe(1000);
      expect(await balanceOf(api, users.receiver)).toBe(0);
    });
  }

  test(
    'TC-074: A transfer amount sent as text credits the receiver by that amount',
    knownBug({
      issue: 'Zetyre/redux-athena-bank#15',
      summary:
        'App defect: the transfer handler does recipient.balance += amount without converting amount to a ' +
        'number, so "100" is appended as text: the receiver\'s 1000 becomes 1000100 while the sender loses 100.',
      fails: /Expected: 1100\s+Received: 1000100/,
    }),
    async ({ request, api, createUser }) => {
      test.fail();
      const [sender, receiver] = await Promise.all([
        createUser({ initialBalance: 1000 }),
        createUser({ initialBalance: 1000 }),
      ]);

      await request.post(apiUrl('/api/transactions/transfer'), {
        headers: { Authorization: `Bearer ${sender.token}` },
        data: { fromAccountId: sender.account!._id, toEmail: receiver.email, amount: '100' },
      });

      expect(await balanceOf(api, sender)).toBe(900);
      expect(await balanceOf(api, receiver)).toBe(1100);
    },
  );

  test(
    'TC-085: Simultaneous transfers of the whole balance: only one succeeds',
    knownBug({
      issue: 'Zetyre/redux-athena-bank#2',
      summary:
        'App defect: the transfer handler reads the balance, checks it and saves it in separate steps, so ' +
        'simultaneous transfers all pass the check; each is recorded but only one balance update survives.',
      fails: /Successful transfers of the whole balance[\s\S]*Expected: 1\s+Received: [2-5]/,
    }),
    async ({ api, createUser }) => {
      test.fail();
      const [sender, receiver] = await Promise.all([
        createUser({ initialBalance: 1000 }),
        createUser({ initialBalance: 0 }),
      ]);

      // The race reproduced in 40 of 40 local runs with 2 or 5 parallel requests.
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          api.transfer(sender.token, { fromAccountId: sender.account!._id, toEmail: receiver.email, amount: 1000 }),
        ),
      );

      const succeeded = responses.filter(response => response.status() === 200).length;
      expect(succeeded, 'Successful transfers of the whole balance').toBe(1);
    },
  );
});
