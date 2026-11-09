import type { Page } from '@playwright/test';
import { apiUrl } from './urls';

/**
 * Starts counting the requests the page sends to an API endpoint, and returns a function that reads the count.
 * Used to prove a form blocked a submit in the browser: the error is shown AND no request left the page.
 */
export function countRequests(page: Page, method: string, path: string): () => number {
  const url = apiUrl(path);
  let count = 0;
  page.on('request', request => {
    if (request.method() === method && request.url() === url) count++;
  });
  return () => count;
}
