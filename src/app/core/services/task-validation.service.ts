import { Injectable } from '@angular/core';
import { TaskDraft } from '../models/task';

export interface TaskValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class TaskValidationService {
  validate(draft: TaskDraft, now = new Date()): TaskValidationResult {
    const errors: string[] = [];

    if (!draft.name.trim()) {
      errors.push('Task name is required.');
    }

    const reminderDate = new Date(draft.reminderAt);
    if (Number.isNaN(reminderDate.getTime())) {
      errors.push('Reminder time must be a valid date and time.');
    } else if (reminderDate.getTime() <= now.getTime()) {
      errors.push('Reminder time must be in the future.');
    }

    if (
      !Number.isInteger(draft.reminderCount) ||
      draft.reminderCount < 1 ||
      draft.reminderCount > 20
    ) {
      errors.push('Reminder attempts must be between 1 and 20.');
    }

    if (
      !Number.isInteger(draft.reminderIntervalMinutes) ||
      draft.reminderIntervalMinutes < 1 ||
      draft.reminderIntervalMinutes > 240
    ) {
      errors.push('Repeat interval must be between 1 and 240 minutes.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
