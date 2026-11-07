import { randomUUID } from 'node:crypto';
import { expect, test } from '../../fixtures';

test.describe('Accounts and transfers', () => {
  test(
    'TC-019: A user can open a savings account from the dashboard',
    { tag: '@smoke' },
    async ({ page, loginAs, createUser, createAccountModal }) => {
      const user = await createUser({ initialBalance: null });
      const dashboard = await loginAs(user);

      await dashboard.addAccountButton.click();
      await createAccountModal.createAccount('Ahorros', 2500);

      await expect(page.getByText('Cuenta creada exitosamente')).toBeVisible();
      await expect(page.getByTestId('tarjeta-cuenta')).toHaveCount(1);
      await expect(dashboard.accountBalance).toHaveText('$2500.00');
      await expect(dashboard.accountType).toHaveText('Ahorros');
      await expect(dashboard.totalBalance).toHaveText('$2,500.00');
    },
  );

  test(
    'TC-012: A transfer to a recipient without an account is rejected',
    { tag: '@regression' },
    async ({ page, loginAs, createUser, sendMoneyModal }) => {
      const sender = await createUser();
      const recipientWithoutAccount = await createUser({ initialBalance: null });
      const dashboard = await loginAs(sender);

      await dashboard.sendMoneyButton.click();
      await sendMoneyModal.send(recipientWithoutAccount.email, 100);

      await expect(page.getByText('Recipient has no account')).toBeVisible();
    },
  );

  test(
    'TC-018: The send form blocks a transfer larger than the balance',
    { tag: '@regression' },
    async ({ page, loginAs, createUser, sendMoneyModal }) => {
      const sender = await createUser({ initialBalance: 50 });
      const receiver = await createUser();
      const dashboard = await loginAs(sender);
      const transferRequests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/api/transactions/transfer')) transferRequests.push(request.url());
      });

      await dashboard.sendMoneyButton.click();
      await sendMoneyModal.send(receiver.email, 51);

      await expect(sendMoneyModal.insufficientBalanceError).toBeVisible();
      expect(transferRequests, 'The UI should not call the transfer API').toHaveLength(0);
    },
  );

  test(
    'TC-014: A transfer made through the UI appears for both sender and receiver',
    { tag: '@smoke' },
    async ({ page, loginAs, createUser, randomAmount, sendMoneyModal, openDashboardInNewContext }) => {
      // Two users and two browser contexts: allow 3x the default timeout.
      test.slow();
      const sender = await createUser();
      const receiver = await createUser();
      const amount = randomAmount(1, 1000);
      const senderDashboard = await loginAs(sender);

      await test.step(`Send ${amount} to the receiver through the UI`, async () => {
        await senderDashboard.sendMoneyButton.click();
        await sendMoneyModal.send(receiver.email, amount);
        await expect(page.getByText(`Transferencia enviada a ${receiver.email}`)).toBeVisible();
      });

      await test.step('Verify the outgoing transfer in the sender dashboard', async () => {
        const outgoing = senderDashboard.transaction(`Transferencia a ${receiver.email}`);
        await expect(outgoing).toHaveCount(1);
        await expect(senderDashboard.transactionAmount(outgoing)).toContainText(amount.toFixed(2));
      });

      await test.step('Verify the incoming transfer in the receiver dashboard', async () => {
        const receiverDashboard = await openDashboardInNewContext(receiver);
        const incoming = receiverDashboard.transaction(`Transferencia de ${sender.email}`);
        await expect(incoming).toHaveCount(1);
        await expect(receiverDashboard.transactionAmount(incoming)).toContainText(amount.toFixed(2));
      });
    },
  );

  test(
    "TC-084: HTML in another user's name and email is shown as text, never run",
    { tag: '@regression' },
    async ({ page, api, loginAs, createUser }) => {
      // Sign-up accepts any text as the email (observation OBS-3), and the receiver's history shows the sender's
      // email, so it is a path for stored cross-site scripting into another user's dashboard.
      const payload = '<img src=x onerror="window.__xss=1">';
      const sender = await createUser({
        initialBalance: 100,
        overrides: { firstName: '<script>window.__xss=1</script>', email: `${payload}${randomUUID()}@example.com` },
      });
      const receiver = await createUser({ initialBalance: 0 });
      const transfer = await api.transfer(sender.token, {
        fromAccountId: sender.account!._id,
        toEmail: receiver.email,
        amount: 5,
      });
      expect(transfer.status()).toBe(200);

      const dashboard = await loginAs(receiver);

      await expect(dashboard.transaction(`Transferencia de ${sender.email}`)).toHaveCount(1);
      await expect(dashboard.transactionItems.locator('img, script')).toHaveCount(0);
      expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
    },
  );
});
