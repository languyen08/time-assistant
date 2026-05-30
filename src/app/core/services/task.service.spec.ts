import { TestBed } from '@angular/core/testing';
import { Task } from '../models/task';
import { TaskRepository } from '../repositories/task.repository';
import { HistoryService } from './history.service';
import { TaskService } from './task.service';
import { TaskValidationService } from './task-validation.service';

function activeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    name: 'Deep work',
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:30:00.000Z',
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    order: 0,
    status: 'active',
    createdAt: '2026-05-30T10:00:00.000Z',
    updatedAt: '2026-05-30T10:00:00.000Z',
    activeStartedAt: '2026-05-30T10:00:00.000Z',
    nextReminderAt: '2026-05-30T10:30:00.000Z',
    reminderAttemptsShown: 0,
    totalPausedSeconds: 0,
    ...overrides,
  };
}

describe('TaskService pause/resume', () => {
  let service: TaskService;
  let savedTasks: Task[];
  let record: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    savedTasks = [activeTask()];
    record = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        TaskService,
        {
          provide: TaskRepository,
          useValue: {
            list: vi.fn(async () => savedTasks),
            save: vi.fn(async (task: Task) => {
              savedTasks = savedTasks.map((item) => (item.id === task.id ? task : item));
            }),
            delete: vi.fn(),
          },
        },
        { provide: HistoryService, useValue: { record } },
        {
          provide: TaskValidationService,
          useValue: { validate: vi.fn(() => ({ valid: true, errors: [] })) },
        },
      ],
    });
    service = TestBed.inject(TaskService);
    await service.load();
  });

  it('pauses an active task and freezes remaining reminder seconds', async () => {
    await service.pauseActive(new Date('2026-05-30T10:10:00.000Z'));

    expect(service.currentTask()?.status).toBe('paused');
    expect(service.currentTask()?.pausedRemainingSeconds).toBe(1200);
    expect(record).toHaveBeenCalledWith('task_paused', 'Paused "Deep work".', 'task_1');
  });

  it('resumes a paused task and shifts the next reminder by remaining seconds', async () => {
    await service.pauseActive(new Date('2026-05-30T10:10:00.000Z'));
    await service.resumeActive(new Date('2026-05-30T10:20:00.000Z'));

    expect(service.currentTask()?.status).toBe('active');
    expect(service.currentTask()?.totalPausedSeconds).toBe(600);
    expect(service.currentTask()?.nextReminderAt).toBe('2026-05-30T10:40:00.000Z');
    expect(record).toHaveBeenCalledWith('task_resumed', 'Resumed "Deep work".', 'task_1');
  });
});
