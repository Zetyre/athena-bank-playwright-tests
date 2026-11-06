import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { AccountType, Credentials, NewUser, TransferRequest } from '../types/api';
import { apiUrl } from './urls';

/**
 * Thin client for the Athena Bank backend.
 * Methods return the raw APIResponse so tests can assert on status codes and error bodies.
 */
export class AthenaApi {
  constructor(private readonly request: APIRequestContext) {}

  signup(user: Partial<NewUser>): Promise<APIResponse> {
    return this.request.post(apiUrl('/api/auth/signup'), { data: user });
  }

  login(credentials: Partial<Credentials>): Promise<APIResponse> {
    return this.request.post(apiUrl('/api/auth/login'), { data: credentials });
  }

  getAccounts(token?: string): Promise<APIResponse> {
    return this.request.get(apiUrl('/api/accounts'), { headers: authHeader(token) });
  }

  createAccount(token: string, type: AccountType, initialAmount: unknown): Promise<APIResponse> {
    return this.request.post(apiUrl('/api/accounts'), {
      headers: authHeader(token),
      data: { type, initialAmount },
    });
  }

  deposit(token: string, accountId: string, amount: unknown): Promise<APIResponse> {
    return this.request.post(apiUrl(`/api/accounts/${accountId}/deposit`), {
      headers: authHeader(token),
      data: { amount },
    });
  }

  freeze(token: string, accountId: string, isFrozen: boolean): Promise<APIResponse> {
    return this.request.put(apiUrl(`/api/accounts/${accountId}/freeze`), {
      headers: authHeader(token),
      data: { isFrozen },
    });
  }

  deleteAccount(token: string, accountId: string): Promise<APIResponse> {
    return this.request.delete(apiUrl(`/api/accounts/${accountId}`), { headers: authHeader(token) });
  }

  getTransactions(token?: string): Promise<APIResponse> {
    return this.request.get(apiUrl('/api/transactions'), { headers: authHeader(token) });
  }

  /** Logs out the way the app does: the request carries no token, only cookies. */
  logout(): Promise<APIResponse> {
    return this.request.post(apiUrl('/api/auth/logout'));
  }

  transfer(token: string, transfer: TransferRequest): Promise<APIResponse> {
    return this.request.post(apiUrl('/api/transactions/transfer'), {
      headers: authHeader(token),
      data: transfer,
    });
  }
}

function authHeader(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
