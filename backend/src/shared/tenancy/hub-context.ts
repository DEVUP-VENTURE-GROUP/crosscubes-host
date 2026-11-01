import { AsyncLocalStorage } from 'async_hooks';

interface HubContext {
  hubId: string;
}

const storage = new AsyncLocalStorage<HubContext>();

/** Runs fn with every hub-scoped query and write limited to one hub. */
export function runInHub<T>(hubId: string, fn: () => T): T {
  return storage.run({ hubId }, fn);
}

/** The hub the current request is limited to; undefined for HQ, guests, hosts and background jobs. */
export function currentHubId(): string | undefined {
  return storage.getStore()?.hubId;
}
