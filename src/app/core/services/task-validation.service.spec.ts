import { TestBed } from '@angular/core/testing';
import { TaskDraft } from '../models/task';
import { TaskValidationService } from './task-validation.service';

function draft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    name: 'Write notes',
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:30:00.000Z',
    reminderEnabled: true,
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
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

  it('accepts a disabled reminder without timing, attempts, or interval', () => {
    expect(
      service.validate(
        draft({
          reminderEnabled: false,
          reminderAt: '',
          reminderCount: NaN,
          reminderIntervalMinutes: NaN,
        }),
        now,
      ).errors,
    ).toEqual([]);
  });

  it.each([true, undefined])(
    'preserves reminder validation when enabled is %s',
    (reminderEnabled) => {
      expect(
        service.validate(
          draft({ reminderEnabled, reminderAt: '', reminderCount: 0, reminderIntervalMinutes: 0 }),
          now,
        ).errors,
      ).toEqual([
        'Start time must be a valid date and time.',
        'Reminder attempts must be between 1 and 20.',
        'Repeat interval must be between 1 and 240 minutes.',
      ]);
    },
  );

  it('still validates an entered Start time and Finish by on a no-reminder task', () => {
    expect(service.validate(draft({ reminderEnabled: false, reminderAt: 'bad' }), now).valid).toBe(
      false,
    );
    expect(
      service.validate(
        draft({
          reminderEnabled: false,
          reminderAt: '',
          deadlineAt: '2026-05-30T10:00:00.000Z',
          deadlineMessage: 'Finish.',
        }),
        now,
      ).errors,
    ).toContain('Finish-by time must be later than the Start time.');
  });

  it('requires a task name', () => {
    const result = service.validate(draft({ name: '   ' }), now);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Task name is required.');
  });

  it('requires a future Start time', () => {
    const result = service.validate(draft({ reminderAt: '2026-05-30T09:59:00.000Z' }), now);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Start time must be in the future.');
  });

  it('allows an unchanged overdue Start time while editing other task fields', () => {
    const reminderAt = '2026-05-30T09:59:00.000Z';
    const result = service.validate(draft({ reminderAt }), now, reminderAt);

    expect(result.valid).toBe(true);
  });

  it('accepts a task without a deadline or custom message', () => {
    expect(
      service.validate(draft({ deadlineAt: undefined, deadlineMessage: undefined }), now).valid,
    ).toBe(true);
  });

  it('requires a custom message when Finish by is enabled', () => {
    const result = service.validate(
      draft({ deadlineAt: '2026-05-30T11:00:00.000Z', deadlineMessage: '   ' }),
      now,
    );

    expect(result.errors).toContain('Deadline message is required when Finish by is enabled.');
  });

  it('limits the custom deadline message to 240 characters', () => {
    const result = service.validate(
      draft({ deadlineAt: '2026-05-30T11:00:00.000Z', deadlineMessage: 'x'.repeat(241) }),
      now,
    );

    expect(result.errors).toContain('Deadline message cannot be more than 240 characters.');
  });

  it('rejects invalid and non-future changed deadlines', () => {
    expect(
      service.validate(draft({ deadlineAt: 'bad', deadlineMessage: 'Finish now.' }), now).errors,
    ).toContain('Finish-by time must be a valid date and time.');
    expect(
      service.validate(
        draft({ deadlineAt: '2026-05-30T09:59:00.000Z', deadlineMessage: 'Finish now.' }),
        now,
      ).errors,
    ).toContain('Finish-by time must be in the future.');
  });

  it('requires Finish by to be strictly later than Start time', () => {
    const result = service.validate(
      draft({ deadlineAt: '2026-05-30T10:30:00.000Z', deadlineMessage: 'Finish now.' }),
      now,
    );

    expect(result.errors).toContain('Finish-by time must be later than the Start time.');
  });

  it('accepts a future deadline after Start time', () => {
    const result = service.validate(
      draft({ deadlineAt: '2026-05-30T11:00:00.000Z', deadlineMessage: ' Finish now. ' }),
      now,
    );

    expect(result.valid).toBe(true);
  });

  it('allows unrelated edits with an unchanged historical deadline', () => {
    const reminderAt = '2026-05-30T09:00:00.000Z';
    const deadlineAt = '2026-05-30T09:30:00.000Z';
    const result = service.validate(
      draft({ reminderAt, deadlineAt, deadlineMessage: 'Historical message.' }),
      now,
      reminderAt,
      deadlineAt,
    );

    expect(result.valid).toBe(true);
  });

  it('rejects changing an expired deadline to another expired deadline', () => {
    const result = service.validate(
      draft({
        reminderAt: '2026-05-30T08:00:00.000Z',
        deadlineAt: '2026-05-30T09:45:00.000Z',
        deadlineMessage: 'Still expired.',
      }),
      now,
      '2026-05-30T08:00:00.000Z',
      '2026-05-30T09:30:00.000Z',
    );

    expect(result.errors).toContain('Finish-by time must be in the future.');
  });
});
