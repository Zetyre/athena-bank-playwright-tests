import type { Locator, Page } from '@playwright/test';

export class AddFundsModal {
  readonly dialog: Locator;
  readonly accountDropdown: Locator;
  readonly amountInput: Locator;
  readonly addButton: Locator;

  constructor(readonly page: Page) {
    this.dialog = page.getByRole('dialog', { name: 'Agregar fondos' });
    this.accountDropdown = this.dialog.getByRole('combobox', { name: 'Cuenta' });
    this.amountInput = this.dialog.getByRole('spinbutton', { name: 'Monto a agregar' });
    this.addButton = this.dialog.getByRole('button', { name: 'Agregar fondos' });
  }

  /** The options of the account dropdown; open it first with `accountDropdown.click()`. */
  accountOption(last4: string): Locator {
    return this.page.getByRole('option', { name: new RegExp(`•••• ${last4}`) });
  }

  async addFunds(last4: string, amount: number): Promise<void> {
    await this.accountDropdown.click();
    await this.accountOption(last4).click();
    await this.amountInput.fill(String(amount));
    await this.addButton.click();
  }
}
