import { Injectable } from '@angular/core';
import { StorageAdapter } from './storage-adapter';

const DATABASE_NAME = 'friendly-task-reminder';
const DATABASE_VERSION = 1;
const STORE_NAMES = ['tasks', 'settings', 'history'] as const;

@Injectable({ providedIn: 'root' })
export class IndexedDbStorageAdapter implements StorageAdapter {
  private databasePromise: Promise<IDBDatabase> | undefined;

  getAll<T>(storeName: string): Promise<T[]> {
    return this.withStore(storeName, 'readonly', (store) => this.request<T[]>(store.getAll()));
  }

  get<T>(storeName: string, id: string): Promise<T | undefined> {
    return this.withStore(storeName, 'readonly', (store) =>
      this.request<T | undefined>(store.get(id)),
    );
  }

  put<T extends { id: string }>(storeName: string, value: T): Promise<void> {
    return this.withStore(storeName, 'readwrite', async (store) => {
      await this.request(store.put(value));
    });
  }

  delete(storeName: string, id: string): Promise<void> {
    return this.withStore(storeName, 'readwrite', async (store) => {
      await this.request(store.delete(id));
    });
  }

  private async withStore<T>(
    storeName: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const database = await this.openDatabase();
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await action(store);
    await this.transactionDone(transaction);
    return result;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!('indexedDB' in globalThis)) {
      return Promise.reject(new Error('IndexedDB is not available in this environment.'));
    }

    this.databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        for (const storeName of STORE_NAMES) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    });

    return this.databasePromise;
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    });
  }

  private transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  }
}
