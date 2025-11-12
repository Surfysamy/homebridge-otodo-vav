import type { Logger } from 'homebridge';
import { AuthClient } from './auth';


export class OtodoClient {
  constructor(private readonly log: Logger, private readonly auth: AuthClient) {}

  async getJson<T>(url: string): Promise<T> {
    const res = await this.auth.authedFetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`GET ${url} → ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await this.auth.authedFetch(url, { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      throw new Error(`POST ${url} → ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
}