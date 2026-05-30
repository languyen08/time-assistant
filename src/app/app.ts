import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { AppTheme } from './core/models/app-settings';
import { Task, TaskDraft } from './core/models/task';
import { HistoryService } from './core/services/history.service';
import { BreakService } from './core/services/break.service';
import { ElectronBridgeService } from './core/services/electron-bridge.service';
import { NotificationService } from './core/services/notification.service';
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
  readonly breakService = inject(BreakService);
  readonly notificationService = inject(NotificationService);
  private readonly electron = inject(ElectronBridgeService);

  readonly title = signal('Friendly Task Reminder');
  readonly loading = signal(true);
  readonly editingTaskId = signal<string | undefined>(undefined);
  readonly extensionMinutes = signal(10);
  readonly breakMinutes = signal(10);
  readonly isStickyMode = signal(
    new URLSearchParams(window.location.search).get('window') === 'sticky',
  );
  readonly theme = computed(() => this.settingsService.settings().theme);
  readonly activeTask = this.taskService.activeTask;
  readonly currentTask = this.taskService.currentTask;
  readonly pendingTasks = this.taskService.pendingTasks;
  readonly completedTasks = this.taskService.completedTasks;
  readonly nextTaskCandidate = this.taskService.nextTaskCandidate;
  private notifiedReminderKey = '';

  readonly taskForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    reminderAt: [toDatetimeLocalValue(addMinutes(new Date(), 30)), Validators.required],
    reminderCount: [3, [Validators.required, Validators.min(1), Validators.max(20)]],
    reminderIntervalMinutes: [5, [Validators.required, Validators.min(1), Validators.max(240)]],
    category: ['', Validators.maxLength(80)],
    note: ['', Validators.maxLength(400)],
  });

  constructor() {
    effect(() => {
      const reminder = this.reminderScheduler.activeReminder();
      const settings = this.settingsService.settings();
      if (!reminder) {
        return;
      }

      const key = `${reminder.taskId}:${reminder.attemptNumber}:${reminder.shownAt}`;
      if (key === this.notifiedReminderKey) {
        return;
      }

      this.notifiedReminderKey = key;
      void this.notificationService.showReminder(reminder, settings);
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([
        this.settingsService.load(),
        this.historyService.load(),
        this.taskService.load(),
      ]);
      if (this.isStickyMode() && this.electron.isElectron) {
        await this.settingsService.update({ stickyNoteEnabled: true });
      }
      this.breakMinutes.set(this.settingsService.settings().defaultBreakMinutes);
      if (!this.isStickyMode()) {
        await this.syncStickyWindow();
      }
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
    const task = this.currentTask();
    await this.taskService.completeActive();
    this.reminderScheduler.dismiss();
    if (task) {
      this.breakService.prompt(this.settingsService.settings().defaultBreakMinutes);
      this.breakMinutes.set(this.settingsService.settings().defaultBreakMinutes);
    }
  }

  async addReminderTime(): Promise<void> {
    await this.taskService.addTimeToActive(this.extensionMinutes());
    this.reminderScheduler.dismiss();
  }

  setExtensionMinutes(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.extensionMinutes.set(Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 10);
  }

  async pauseTask(): Promise<void> {
    await this.taskService.pauseActive();
    this.reminderScheduler.dismiss();
  }

  async resumeTask(): Promise<void> {
    await this.taskService.resumeActive();
  }

  async setTheme(event: Event): Promise<void> {
    await this.settingsService.update({
      theme: (event.target as HTMLSelectElement).value as AppTheme,
    });
  }

  async setSoundEnabled(event: Event): Promise<void> {
    await this.settingsService.update({
      notificationSoundEnabled: (event.target as HTMLInputElement).checked,
    });
  }

  async setStickyEnabled(event: Event): Promise<void> {
    await this.settingsService.update({
      stickyNoteEnabled: (event.target as HTMLInputElement).checked,
    });
    await this.syncStickyWindow();
  }

  async setStickyAlwaysOnTop(event: Event): Promise<void> {
    await this.settingsService.update({
      stickyNoteAlwaysOnTop: (event.target as HTMLInputElement).checked,
    });
    await this.syncStickyWindow();
  }

  async startBreak(): Promise<void> {
    await this.breakService.start(this.breakMinutes());
  }

  async skipBreak(): Promise<void> {
    await this.breakService.skip();
  }

  setBreakMinutes(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.breakMinutes.set(Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 10);
  }

  async startNextTask(): Promise<void> {
    const nextTask = this.nextTaskCandidate();
    if (!nextTask) {
      this.breakService.reset();
      return;
    }

    this.breakService.reset();
    await this.startTask(nextTask.id);
  }

  async focusMainWindow(): Promise<void> {
    await this.electron.focusMainWindow();
  }

  async openStickyWindow(): Promise<void> {
    await this.settingsService.update({ stickyNoteEnabled: true });
    await this.syncStickyWindow();
  }

  async closeStickyWindow(): Promise<void> {
    await this.settingsService.update({ stickyNoteEnabled: false });
    await this.electron.setStickyWindow(
      false,
      this.settingsService.settings().stickyNoteAlwaysOnTop,
    );
  }

  elapsedFor(task: Task | undefined): string {
    this.timerService.nowTick();
    return this.timerService.format(this.timerService.elapsedSeconds(task));
  }

  remainingFor(task: Task | undefined): string {
    this.timerService.nowTick();
    return this.timerService.format(this.timerService.remainingSeconds(task));
  }

  formatDuration(seconds: number): string {
    this.timerService.nowTick();
    return this.timerService.format(seconds);
  }

  private syncStickyWindow(): Promise<boolean> {
    const settings = this.settingsService.settings();
    return this.electron.setStickyWindow(
      settings.stickyNoteEnabled,
      settings.stickyNoteAlwaysOnTop,
    );
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
