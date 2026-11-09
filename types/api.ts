export type NewUser = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type Credentials = Pick<NewUser, 'email' | 'password'>;

export type AuthResponse = {
  token: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type AccountType = 'debit' | 'credit' | 'savings' | 'checking';

export type Account = {
  _id: string;
  user: string;
  type: AccountType;
  last4: string;
  name: string;
  frozen: boolean;
  balance: number;
};

export type TransferRequest = {
  fromAccountId: string;
  toEmail: string;
  amount: number;
};

export type Transaction = {
  _id: string;
  date: string;
  user: string;
  accountId: string;
  type: 'transfer' | 'deposit' | 'withdraw' | 'account_opened' | 'account_closed' | 'status_change';
  direction: 'in' | 'out' | 'neutral';
  amount?: number;
  description?: string;
  last4?: string;
};

export type ErrorResponse = {
  message: string;
};

/** A user created for a single test, already authenticated against the API. */
export type BankUser = NewUser & {
  token: string;
  account?: Account;
};
