import { expect, test } from '../../fixtures';
import type { Account } from '../../types/api';
import { knownBug } from '../../utils/knownBug';
import { apiUrl } from '../../utils/urls';

test.describe('Account management', () => {
  test(
    'TC-077: Adding funds updates the account, the total and the history',
    { tag: '@smoke' },
    async ({ page, loginAs, createUser, addFundsModal }) => {
      const user = await createUser({ initialBalance: 1000 });
      const last4 = user.account!.last4;
      const dashboard = await loginAs(user);

      await dashboard.addFundsButton.click();
      await addFundsModal.addFunds(last4, 250);

      await expect(page.getByText('¡Fondos agregados exitosamente!')).toBeVisible();
      await expect(addFundsModal.dialog).toBeHidden();
      await expect(dashboard.accountBalance).toHaveText('$1250.00');
      await expect(dashboard.totalBalance).toHaveText('$1,250.00');
      await expect(dashboard.transactionAmount(dashboard.transaction(`Depósito en cuenta ${last4}`))).toHaveText(
        '+ 250.00',
      );
    },
  );

  test(
    'TC-078: A frozen account cannot be chosen to add funds or send money, until it is unfrozen',
    { tag: '@regression' },
    async ({ loginAs, createUser, freezeAccountModal, addFundsModal, sendMoneyModal }) => {
      const user = await createUser({ initialBalance: 1000 });
      const last4 = user.account!.last4;
      const dashboard = await loginAs(user);

      await test.step('Freeze the account', async () => {
        await dashboard.freezeAccountButton.click();
        await freezeAccountModal.confirmButton.click();
        await expect(freezeAccountModal.dialog).toBeHidden();
        await expect(dashboard.freezeAccountButton).toHaveText('Descongelar');
        await expect(dashboard.transaction(`Cuenta congelada ${last4}`)).toHaveCount(1);
      });

      await test.step('The account is disabled in both forms', async () => {
        await dashboard.addFundsButton.click();
        await addFundsModal.accountDropdown.click();
        await expect(addFundsModal.accountOption(last4)).toBeDisabled();
        await dashboard.page.keyboard.press('Escape');
        await dashboard.page.keyboard.press('Escape');
        await expect(addFundsModal.dialog).toBeHidden();

        await dashboard.sendMoneyButton.click();
        await sendMoneyModal.sourceAccountDropdown.click();
        await expect(dashboard.page.getByRole('option', { name: new RegExp(`•••• ${last4}`) })).toBeDisabled();
        await dashboard.page.keyboard.press('Escape');
        await dashboard.page.keyboard.press('Escape');
      });

      await test.step('Unfreeze it', async () => {
        await dashboard.freezeAccountButton.click();
        await freezeAccountModal.confirmButton.click();
        await expect(freezeAccountModal.dialog).toBeHidden();
        await expect(dashboard.freezeAccountButton).toHaveText('Congelar');
        await expect(dashboard.transaction(`Cuenta descongelada ${last4}`)).toHaveCount(1);
        await dashboard.addFundsButton.click();
        await addFundsModal.accountDropdown.click();
        await expect(addFundsModal.accountOption(last4)).toBeEnabled();
      });
    },
  );

  test(
    'TC-079: Deleting an empty account removes its card and records the closure',
    { tag: '@regression' },
    async ({ page, loginAs, createUser, deleteAccountModal }) => {
      const user = await createUser({ initialBalance: 0 });
      const last4 = user.account!.last4;
      const dashboard = await loginAs(user);

      await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await deleteAccountModal.deleteAccount(last4);

      await expect(page.getByText('Cuenta eliminada exitosamente')).toBeVisible();
      await expect(dashboard.accountBalance).toHaveCount(0);
      await expect(dashboard.transactionItems.filter({ hasText: `cerrada ${last4}` })).toHaveCount(1);
    },
  );

  test(
    'TC-080: The closure of a savings account is labelled as a savings account in the history',
    knownBug({
      issue: 'Zetyre/redux-athena-bank#19',
      summary:
        'App defect: Dashboard.tsx renders every account_closed event as "Cuenta de débito cerrada", ignoring ' +
        'the account type the backend recorded.',
      fails:
        /Expected(?: string)?: "Cuenta de ahorros cerrada \d{4}"\s+Received(?: string)?: "Cuenta de débito cerrada \d{4}"/,
    }),
    async ({ page, loginAs, createUser, deleteAccountModal }) => {
      test.fail();
      const user = await createUser({ initialBalance: 0 });
      const dashboard = await loginAs(user);

      await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await deleteAccountModal.deleteAccount(user.account!.last4);

      // Wait for the closure row, then check its label briefly: the label never changes once the row is drawn.
      const closure = dashboard.transactionItems.filter({ hasText: 'cerrada' });
      await expect(closure).toHaveCount(1);
      await expect(closure.getByTestId('descripcion-transaccion')).toHaveText(
        `Cuenta de ahorros cerrada ${user.account!.last4}`,
        { timeout: 1_000 },
      );
    },
  );

  test(
    'TC-081: The total balance is the sum of every account',
    { tag: '@regression' },
    async ({ api, loginAs, createUser }) => {
      const user = await createUser({ initialBalance: 1000 });
      const second = await api.createAccount(user.token, 'checking', 250.5);
      expect(second.status()).toBe(201);

      const dashboard = await loginAs(user);

      await expect(dashboard.accountBalance).toHaveText(['$1000.00', '$250.50']);
      await expect(dashboard.totalBalance).toHaveText('$1,250.50');
    },
  );

  test(
    'TC-082: The create-account form requires a type and a non-negative amount before sending anything',
    { tag: '@regression' },
    async ({ page, loginAs, createUser, createAccountModal }) => {
      const user = await createUser({ initialBalance: null });
      const dashboard = await loginAs(user);
      let createRequests = 0;
      page.on('request', request => {
        if (request.url() === apiUrl('/api/accounts') && request.method() === 'POST') createRequests++;
      });

      await dashboard.addAccountButton.click();
      await createAccountModal.initialAmountInput.fill('-50');
      await createAccountModal.createButton.click();

      await expect(page.getByText('Tipo de cuenta requerido')).toBeVisible();
      await expect(page.getByText('Monto debe ser un número mayor o igual a 0')).toBeVisible();
      expect(createRequests).toBe(0);
      const accounts = (await (
        await page.request.get(apiUrl('/api/accounts'), { headers: { Authorization: `Bearer ${user.token}` } })
      ).json()) as Account[];
      expect(accounts).toEqual([]);
    },
  );
});
