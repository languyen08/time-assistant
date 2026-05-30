import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { AppTheme } from './core/models/app-settings';
import { Task, TaskDraft } from './core/models/task';
import { HistoryService } from './core/services/history.service';
import { ReminderSchedulerService } from './core/services/reminder-scheduler.service';
import { SettingsService } from './core/services/settings.service';
import { TaskService } from './core/services/task.service';
import { TimerService } from './core/services/timer.service';
import {
  addMinutes,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from './core/utils/date-time.util';

@Component({
  selector: 'app-root',
  imports: [DatePipe, ReactiveFormsModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly formBuilder = inject(FormBuilder);
  readonly taskService = inject(TaskService);
  readonly settingsService = inject(SettingsService);
  readonly historyService = inject(HistoryService);
  readonly timerService = inject(TimerService);
  readonly reminderScheduler = inject(ReminderSchedulerService);

  readonly title = signal('Friendly Task Reminder');
  readonly loading = signal(true);
  readonly editingTaskId = signal<string | undefined>(undefined);
  readonly extensionMinutes = signal(10);
  readonly selectedTheme = signal<AppTheme>('system');
  readonly theme = computed(() => this.selectedTheme());
  readonly activeTask = this.taskService.activeTask;
  readonly pendingTasks = this.taskService.pendingTasks;
  readonly completedTasks = this.taskService.completedTasks;
  readonly nextTaskCandidate = this.taskService.nextTaskCandidate;

  readonly taskForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    reminderAt: [toDatetimeLocalValue(addMinutes(new Date(), 30)), Validators.required],
    reminderCount: [3, [Validators.required, Validators.min(1), Validators.max(20)]],
    reminderIntervalMinutes: [5, [Validators.required, Validators.min(1), Validators.max(240)]],
    category: ['', Validators.maxLength(80)],
    note: ['', Validators.maxLength(400)],
  });

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([
        this.settingsService.load(),
        this.historyService.load(),
        this.taskService.load(),
      ]);
      this.selectedTheme.set(this.settingsService.settings().theme);
      this.resetForm();
      this.timerService.start();
      this.reminderScheduler.start();
    } catch (error) {
      this.taskService.errorMessage.set(
        error instanceof Error ? error.message : 'The app could not load local data.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.timerService.stop();
    this.reminderScheduler.stop();
  }

  async saveTask(): Promise<void> {
    this.taskForm.markAllAsTouched();
    if (this.taskForm.invalid) {
      this.taskService.errorMessage.set('Please check the highlighted fields.');
      return;
    }

    const draft = this.formToDraft();
    const editingTaskId = this.editingTaskId();
    const saved = editingTaskId
      ? await this.taskService.update(editingTaskId, draft)
      : await this.taskService.create(draft);

    if (saved) {
      this.resetForm();
    }
  }

  editTask(task: Task): void {
    this.editingTaskId.set(task.id);
    this.taskService.clearError();
    this.taskForm.setValue({
      name: task.name,
      reminderAt: toDatetimeLocalValue(new Date(task.reminderAt)),
      reminderCount: task.reminderCount,
      reminderIntervalMinutes: task.reminderIntervalMinutes,
      category: task.category,
      note: task.note,
    });
  }

  resetForm(): void {
    this.editingTaskId.set(undefined);
    this.taskForm.reset({
      name: '',
      reminderAt: toDatetimeLocalValue(addMinutes(new Date(), 30)),
      reminderCount: this.settingsService.settings().defaultReminderCount,
      reminderIntervalMinutes: this.settingsService.settings().defaultReminderRepeatMinutes,
      category: '',
      note: '',
    });
  }

  async startTask(taskId: string): Promise<void> {
    await this.taskService.start(taskId);
  }

  async completeActiveTask(): Promise<void> {
    await this.taskService.completeActive();
    this.reminderScheduler.dismiss();
  }

  async addReminderTime(): Promise<void> {
    await this.taskService.addTimeToActive(this.extensionMinutes());
    this.reminderScheduler.dismiss();
  }

  setExtensionMinutes(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.extensionMinutes.set(Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 10);
  }

  setTheme(event: Event): void {
    this.selectedTheme.set((event.target as HTMLSelectElement).value as AppTheme);
  }

  elapsedFor(task: Task | undefined): string {
    this.timerService.nowTick();
    return this.timerService.format(this.timerService.elapsedSeconds(task));
  }

  remainingFor(task: Task | undefined): string {
    this.timerService.nowTick();
    return this.timerService.format(this.timerService.remainingSeconds(task));
  }

  private formToDraft(): TaskDraft {
    const value = this.taskForm.getRawValue();
    return {
      name: value.name,
      reminderAt: fromDatetimeLocalValue(value.reminderAt),
      reminderCount: Number(value.reminderCount),
      reminderIntervalMinutes: Number(value.reminderIntervalMinutes),
      category: value.category,
      note: value.note,
    };
  }
}
