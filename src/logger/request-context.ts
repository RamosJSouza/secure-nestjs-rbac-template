import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  correlationId: string;
  userId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return asyncLocalStorage.run({ ...data }, fn);
  },

  get(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  },

  setUser(userId: string): void {
    const store = asyncLocalStorage.getStore();
    if (store) {
      store.userId = userId;
    }
  },

  getCorrelationId(): string | undefined {
    return asyncLocalStorage.getStore()?.correlationId;
  },

  getUserId(): string | undefined {
    return asyncLocalStorage.getStore()?.userId;
  },
};
