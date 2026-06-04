export interface StorageAdapter {
  getAll<T>(storeName: string): Promise<T[]>;
  get<T>(storeName: string, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(storeName: string, value: T): Promise<void>;
  delete(storeName: string, id: string): Promise<void>;
  clear(storeName: string): Promise<void>;
}
