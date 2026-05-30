import { Injectable, inject } from '@angular/core';
import { Task } from '../models/task';
import { IndexedDbStorageAdapter } from '../storage/indexed-db-storage.adapter';

const TASK_STORE = 'tasks';

@Injectable({ providedIn: 'root' })
export class TaskRepository {
  private readonly storage = inject(IndexedDbStorageAdapter);

  async list(): Promise<Task[]> {
    const tasks = await this.storage.getAll<Task>(TASK_STORE);
    return tasks.sort((first, second) => first.order - second.order);
  }

  save(task: Task): Promise<void> {
    return this.storage.put(TASK_STORE, task);
  }

  delete(taskId: string): Promise<void> {
    return this.storage.delete(TASK_STORE, taskId);
  }
}
