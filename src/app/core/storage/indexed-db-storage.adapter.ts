import { Injectable } from '@angular/core';
import { StorageAdapter } from './storage-adapter';

const DATABASE_NAME = 'friendly-task-reminder';
const DATABASE_VERSION = 2;
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

  clear(storeName: string): Promise<void> {
    return this.withStore(storeName, 'readwrite', async (store) => {
      await this.request(store.clear());
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

      request.onupgradeneeded = (event) => {
        const database = request.result;
        const oldVersion = event.oldVersion ?? 0;
        this.runMigrations(database, request.transaction, oldVersion);
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

  private runMigrations(
    database: IDBDatabase,
    transaction: IDBTransaction | null,
    oldVersion: number,
  ): void {
    if (oldVersion < 1) {
      this.migrateToV1(database);
    }

    if (oldVersion < 2) {
      this.migrateToV2(database, transaction);
    }
  }

  private migrateToV1(database: IDBDatabase): void {
    for (const storeName of STORE_NAMES) {
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' });
      }
    }
  }

  private migrateToV2(database: IDBDatabase, transaction: IDBTransaction | null): void {
    if (!transaction) {
      return;
    }

    const taskStore = this.getStoreForMigration(database, transaction, 'tasks');
    const historyStore = this.getStoreForMigration(database, transaction, 'history');

    if (taskStore) {
      this.ensureIndex(taskStore, 'tasks_by_order', 'order');
      this.ensureIndex(taskStore, 'tasks_by_status', 'status');
      this.ensureIndex(taskStore, 'tasks_by_next_reminder_at', 'nextReminderAt');
    }

    if (historyStore) {
      this.ensureIndex(historyStore, 'history_by_occurred_at', 'occurredAt');
      this.ensureIndex(historyStore, 'history_by_type', 'type');
    }
  }

  private getStoreForMigration(
    database: IDBDatabase,
    transaction: IDBTransaction,
    storeName: (typeof STORE_NAMES)[number],
  ): IDBObjectStore | undefined {
    if (!database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName, { keyPath: 'id' });
    }

    return transaction.objectStore(storeName);
  }

  private ensureIndex(store: IDBObjectStore, indexName: string, keyPath: string): void {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath);
    }
  }
}
