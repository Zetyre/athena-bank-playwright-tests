import type { Locator, Page } from '@playwright/test';

/** The confirmation dialog behind a card's "Congelar" / "Descongelar" button. */
export class FreezeAccountModal {
  readonly dialog: Locator;
  readonly confirmButton: Locator;

  constructor(readonly page: Page) {
    this.dialog = page.getByRole('dialog', { name: /^(Congelar|Descongelar) cuenta$/ });
    this.confirmButton = this.dialog.getByRole('button', { name: /^(Congelar|Descongelar)$/ });
  }
}

/** The dialog behind the dashboard's "Eliminar" button. */
export class DeleteAccountModal {
  readonly dialog: Locator;
  readonly accountDropdown: Locator;
  readonly deleteButton: Locator;

  constructor(readonly page: Page) {
    this.dialog = page.getByRole('dialog', { name: 'Eliminar cuenta' });
    this.accountDropdown = this.dialog.getByRole('combobox', { name: 'Selecciona cuenta' });
    this.deleteButton = this.dialog.getByRole('button', { name: 'Eliminar' });
  }

  async deleteAccount(last4: string): Promise<void> {
    await this.accountDropdown.click();
    await this.page.getByRole('option', { name: new RegExp(`••••${last4}`) }).click();
    await this.deleteButton.click();
  }
}
