import { Injectable } from '@angular/core';
import { TaskDraft } from '../models/task';
import { recurrenceErrors } from '../utils/recurrence.util';

export interface TaskValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class TaskValidationService {
  validate(
    draft: TaskDraft,
    now = new Date(),
    existingReminderAt?: string,
    existingDeadlineAt?: string,
  ): TaskValidationResult {
    const errors: string[] = [];
    if (draft.recurrence) errors.push(...recurrenceErrors(draft.recurrence));

    if (!draft.name.trim()) {
      errors.push('Task name is required.');
    }

    const reminderEnabled = draft.reminderEnabled !== false;
    const reminderDate = new Date(draft.reminderAt || (!reminderEnabled ? now.toISOString() : ''));
    if (Number.isNaN(reminderDate.getTime())) {
      errors.push('Start time must be a valid date and time.');
    } else if (
      draft.reminderAt &&
      !draft.recurrence &&
      reminderDate.getTime() <= now.getTime() &&
      draft.reminderAt !== existingReminderAt
    ) {
      errors.push('Start time must be in the future.');
    }

    const deadlineMessage = draft.deadlineMessage?.trim() ?? '';
    if (draft.deadlineAt) {
      const deadlineDate = new Date(draft.deadlineAt);
      if (Number.isNaN(deadlineDate.getTime())) {
        errors.push('Finish-by time must be a valid date and time.');
      } else {
        if (
          !draft.recurrence &&
          deadlineDate.getTime() <= now.getTime() &&
          draft.deadlineAt !== existingDeadlineAt
        ) {
          errors.push('Finish-by time must be in the future.');
        }
        if (
          !Number.isNaN(reminderDate.getTime()) &&
          deadlineDate.getTime() <= reminderDate.getTime()
        ) {
          errors.push('Finish-by time must be later than the Start time.');
        }
      }

      if (!deadlineMessage) {
        errors.push('Deadline message is required when Finish by is enabled.');
      } else if (deadlineMessage.length > 240) {
        errors.push('Deadline message cannot be more than 240 characters.');
      }
    } else if (deadlineMessage) {
      errors.push('Deadline message requires a Finish-by time.');
    }

    if (
      reminderEnabled &&
      (!Number.isInteger(draft.reminderCount) ||
        draft.reminderCount < 1 ||
        draft.reminderCount > 20)
    ) {
      errors.push('Reminder attempts must be between 1 and 20.');
    }

    if (
      reminderEnabled &&
      (!Number.isInteger(draft.reminderIntervalMinutes) ||
        draft.reminderIntervalMinutes < 1 ||
        draft.reminderIntervalMinutes > 240)
    ) {
      errors.push('Repeat interval must be between 1 and 240 minutes.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
