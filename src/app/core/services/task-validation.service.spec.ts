import { TestBed } from '@angular/core/testing';
import { TaskDraft } from '../models/task';
import { TaskValidationService } from './task-validation.service';

function draft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    name: 'Write notes',
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:30:00.000Z',
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    ...overrides,
  };
}

describe('TaskValidationService', () => {
  let service: TaskValidationService;
  const now = new Date('2026-05-30T10:00:00.000Z');

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TaskValidationService);
  });

  it('accepts a valid task draft', () => {
    expect(service.validate(draft(), now).valid).toBe(true);
  });

  it('requires a task name', () => {
    const result = service.validate(draft({ name: '   ' }), now);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Task name is required.');
  });

  it('requires a future reminder time', () => {
    const result = service.validate(draft({ reminderAt: '2026-05-30T09:59:00.000Z' }), now);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Reminder time must be in the future.');
  });
});
