import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { StickyNoteColor } from './core/models/app-settings';
import { StickyResizeReason } from './core/models/electron-api';
import { Task, TaskDraft } from './core/models/task';
import { BreakService } from './core/services/break.service';
import { ChartSummaryService } from './core/services/chart-summary.service';
import { CsvService } from './core/services/csv.service';
import { ElectronBridgeService } from './core/services/electron-bridge.service';
import { HistoryService } from './core/services/history.service';
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
import { TaskActionButtonsComponent } from './shared/components/task-action-buttons.component';

@Component({
  selector: 'app-root',
  imports: [
    BaseChartDirective,
    DatePipe,
    ReactiveFormsModule,
    RouterOutlet,
    TaskActionButtonsComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly stickyQueueNoteEstimatedHeight = 94;
  private readonly stickyWindowVerticalPadding = 16;
  private readonly stickyResizeThresholdPx = 2;
  private readonly stickyColorResizeSuppressMs = 250;
  private readonly historyPageSize = 5;
  private readonly pendingPageSize = 4;
  private stickyResizeFrameOne: number | undefined;
  private stickyResizeFrameTwo: number | undefined;
  private stickyResizeObserver: ResizeObserver | undefined;
  private lastStickyMeasuredHeight = 0;
  private suppressStickyResizeUntil = 0;
  private lastStickyReminderVisible = false;
  private readonly formBuilder = inject(FormBuilder);
  readonly taskService = inject(TaskService);
  readonly settingsService = inject(SettingsService);
  readonly historyService = inject(HistoryService);
  readonly timerService = inject(TimerService);
  readonly reminderScheduler = inject(ReminderSchedulerService);
  readonly breakService = inject(BreakService);
  readonly notificationService = inject(NotificationService);
  private readonly chartSummary = inject(ChartSummaryService);
  private readonly csv = inject(CsvService);
  readonly electron = inject(ElectronBridgeService);

  readonly loading = signal(true);
  readonly editingTaskId = signal<string | undefined>(undefined);
  readonly exportStatus = signal('');
  readonly importStatus = signal('');
  readonly importErrors = signal<string[]>([]);
  readonly settingsStatus = signal('');
  readonly settingsOpen = signal(false);
  readonly csvOpen = signal(false);
  readonly historyOpen = signal(true);
  readonly historyPage = signal(0);
  readonly pendingPage = signal(0);
  readonly stickyQueueTrim = signal(0);
  readonly extensionMinutes = signal(10);
  readonly breakMinutes = signal(10);
  readonly isStickyMode = signal(
    new URLSearchParams(window.location.search).get('window') === 'sticky',
  );
  readonly stickyNoteColor = computed(() => this.settingsService.settings().stickyNoteColor);
  readonly stickyVisibleNotes = computed(() =>
    Math.min(5, Math.max(1, this.settingsService.settings().stickyVisibleNotes)),
  );
  readonly activeTask = this.taskService.activeTask;
  readonly currentTask = this.taskService.currentTask;
  readonly pendingTasks = this.taskService.pendingTasks;
  readonly completedTasks = this.taskService.completedTasks;
  readonly nextTaskCandidate = this.taskService.nextTaskCandidate;
  readonly globalErrorMessage = computed(
    () =>
      this.taskService.errorMessage() ||
      this.settingsService.errorMessage() ||
      this.historyService.errorMessage() ||
      this.breakService.errorMessage() ||
      this.reminderScheduler.errorMessage(),
  );
  readonly currentHistoryPage = computed(() =>
    Math.min(this.historyPage(), this.historyPageCount() - 1),
  );
  readonly pendingPageCount = computed(() =>
    Math.max(1, Math.ceil(this.pendingTasks().length / this.pendingPageSize)),
  );
  readonly currentPendingPage = computed(() =>
    Math.min(this.pendingPage(), this.pendingPageCount() - 1),
  );
  readonly historyPageCount = computed(() =>
    Math.max(1, Math.ceil(this.historyService.events().length / this.historyPageSize)),
  );
  readonly pagedHistory = computed(() => {
    const page = this.currentHistoryPage();
    const start = page * this.historyPageSize;
    return this.historyService.events().slice(start, start + this.historyPageSize);
  });
  readonly pagedPendingTasks = computed(() => {
    const page = this.currentPendingPage();
    const start = page * this.pendingPageSize;
    return this.pendingTasks().slice(start, start + this.pendingPageSize);
  });
  readonly completedTasksChart = computed(() =>
    this.chartSummary.completedTasksPerDay(this.taskService.tasks()),
  );
  readonly focusMinutesChart = computed(() =>
    this.chartSummary.focusMinutesPerDay(this.taskService.tasks()),
  );
  readonly categoryMinutesChart = computed(() =>
    this.chartSummary.focusMinutesByCategory(this.taskService.tasks()),
  );
  readonly reminderSummaryChart = computed(() =>
    this.chartSummary.reminderSummary(this.historyService.events()),
  );
  readonly barChartOptions = this.chartSummary.chartOptions;
  readonly insightsChartOptions: ChartConfiguration<'bar'>['options'] = {
    ...this.chartSummary.chartOptions,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 8,
        right: 6,
        bottom: 10,
        left: 0,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#6f6657',
          font: {
            size: 12,
            weight: 500,
          },
        },
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: '#817867',
          font: {
            size: 12,
            weight: 400,
          },
          padding: 8,
        },
        grid: {
          color: 'rgba(138, 124, 97, 0.11)',
        },
        border: {
          display: false,
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(59, 52, 40, 0.94)',
        bodyColor: '#fffaf0',
        titleColor: '#fffaf0',
        cornerRadius: 12,
        displayColors: false,
        padding: 10,
      },
    },
  };
  readonly completedTasksInsightsChart = computed(() =>
    this.withInsightsPalette(this.completedTasksChart(), '#f7dd77', '#efcb57'),
  );
  readonly focusMinutesInsightsChart = computed(() =>
    this.withInsightsPalette(this.focusMinutesChart(), '#b9d97f', '#9fc766'),
  );
  readonly categoryMinutesInsightsChart = computed(() =>
    this.withInsightsPalette(this.categoryMinutesChart(), '#f2a0a3', '#ea878c'),
  );
  readonly reminderSummaryInsightsChart = computed(() =>
    this.withInsightsPalette(this.reminderSummaryChart(), '#a88dd8', '#9678ce'),
  );
  readonly stickyNoteColors: readonly StickyNoteColor[] = [
    'yellow',
    'green',
    'pink',
    'purple',
    'blue',
    'gray',
  ];
  readonly stickyVisibleQueueTasks = computed(() =>
    this.pendingTasks().slice(
      0,
      Math.max(0, this.stickyVisibleNotes() - 1 - this.stickyQueueTrim()),
    ),
  );
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
      const stickyMode = this.isStickyMode();
      document.body.classList.toggle('sticky-mode', stickyMode);
      document.documentElement.classList.toggle('sticky-mode', stickyMode);
      if (stickyMode) {
        this.setupStickyResizeObserver();
      } else {
        this.teardownStickyResizeObserver();
      }
    });

    effect(() => {
      const reminder = this.reminderScheduler.activeReminder();
      const settings = this.settingsService.settings();
      if (this.electron.isElectron) {
        const stickyMode = this.isStickyMode();
        void this.electron.setReminderOverlayState(
          stickyMode ? false : Boolean(reminder),
          settings.stickyNoteAlwaysOnTop,
        );
      }

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

    effect(() => {
      if (!this.isStickyMode()) {
        return;
      }

      const activeTask = this.currentTask();
      activeTask?.id;
      activeTask?.status;
      activeTask?.name;
      activeTask?.category;
      activeTask?.note;
      this.nextTaskCandidate()?.id;
      this.scheduleStickyResize('active-task-change');
    });

    effect(() => {
      if (!this.isStickyMode()) {
        return;
      }

      this.pendingTasks().length;
      this.scheduleStickyResize('task-count-change');
    });

    effect(() => {
      if (!this.isStickyMode()) {
        this.lastStickyReminderVisible = false;
        return;
      }

      this.settingsService.settings().stickyVisibleNotes;
      this.stickyQueueTrim();
      this.scheduleStickyResize('settings-note-count-change');
    });

    effect(() => {
      const stickyMode = this.isStickyMode();
      const reminderVisible = Boolean(this.reminderScheduler.activeReminder());
      if (!stickyMode) {
        this.lastStickyReminderVisible = false;
        return;
      }

      if (reminderVisible !== this.lastStickyReminderVisible) {
        this.lastStickyReminderVisible = reminderVisible;
        this.scheduleStickyResize(reminderVisible ? 'reminder-opened' : 'reminder-closed');
      }
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
      await this.syncStickyWindow();
      this.resetForm();
      this.timerService.start();
      this.reminderScheduler.start();
      this.scheduleStickyResize('initial-open');
    } catch (error) {
      this.taskService.errorMessage.set(
        error instanceof Error ? error.message : 'The app could not load local data.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove('sticky-mode');
    document.body.classList.remove('sticky-mode');
    this.teardownStickyResizeObserver();
    this.timerService.stop();
    this.reminderScheduler.stop();
    this.cancelStickyResizeFrames();
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

  clearGlobalError(): void {
    this.taskService.clearError();
    this.settingsService.errorMessage.set('');
    this.historyService.errorMessage.set('');
    this.breakService.errorMessage.set('');
    this.reminderScheduler.errorMessage.set('');
  }

  async setSoundEnabled(event: Event): Promise<void> {
    await this.settingsService.update({
      notificationSoundEnabled: (event.target as HTMLInputElement).checked,
    });
  }

  async setNotificationSound(event: Event): Promise<void> {
    await this.settingsService.update({
      notificationSoundId: (event.target as HTMLSelectElement).value,
    });
    this.settingsStatus.set('Notification sound updated.');
  }

  async setDefaultBreakMinutes(event: Event): Promise<void> {
    await this.settingsService.update({
      defaultBreakMinutes: this.safeInteger(event, 1, 120, 10),
    });
    this.breakMinutes.set(this.settingsService.settings().defaultBreakMinutes);
    this.settingsStatus.set('Default break duration updated.');
  }

  async setDefaultReminderRepeat(event: Event): Promise<void> {
    await this.settingsService.update({
      defaultReminderRepeatMinutes: this.safeInteger(event, 1, 240, 5),
    });
    this.resetForm();
    this.settingsStatus.set('Default reminder repeat updated.');
  }

  async setDefaultReminderCount(event: Event): Promise<void> {
    await this.settingsService.update({
      defaultReminderCount: this.safeInteger(event, 1, 20, 3),
    });
    this.resetForm();
    this.settingsStatus.set('Default reminder attempts updated.');
  }

  async setCsvDateTimeFormat(event: Event): Promise<void> {
    await this.settingsService.update({
      csvDateTimeFormat: (event.target as HTMLSelectElement).value,
    });
    this.settingsStatus.set('CSV date/time format updated.');
  }

  openSettings(): void {
    this.settingsOpen.set(true);
  }

  closeSettings(): void {
    this.settingsOpen.set(false);
  }

  openCsv(): void {
    this.csvOpen.set(true);
  }

  closeCsv(): void {
    this.csvOpen.set(false);
  }

  toggleHistory(): void {
    this.historyOpen.update((open) => !open);
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

  async setStickyNoteColor(color: StickyNoteColor): Promise<void> {
    if (this.settingsService.settings().stickyNoteColor === color) {
      return;
    }

    this.suppressStickyResizeUntil = performance.now() + this.stickyColorResizeSuppressMs;
    this.cancelStickyResizeFrames();
    await this.settingsService.update({ stickyNoteColor: color });
    await this.syncStickyWindow();
  }

  async setStickyVisibleNotes(event: Event): Promise<void> {
    await this.settingsService.update({
      stickyVisibleNotes: this.safeInteger(event, 1, 5, 2),
    });
    this.stickyQueueTrim.set(0);
    this.scheduleStickyResize('settings-note-count-change');
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

  async minimizeStickyWindow(): Promise<void> {
    await this.electron.minimizeStickyWindow();
  }

  async openStickyWindow(): Promise<void> {
    await this.settingsService.update({ stickyNoteEnabled: true });
    await this.syncStickyWindow();
  }

  async closeStickyWindow(): Promise<void> {
    if (this.electron.isElectron) {
      await this.electron.closeApp();
      return;
    }

    await this.settingsService.update({ stickyNoteEnabled: false });
  }

  async exportTasksCsv(): Promise<void> {
    await this.saveCsvFile(
      `friendly-task-reminder-tasks-${this.dateStamp()}.csv`,
      this.csv.exportTasks(
        this.taskService.tasks(),
        this.settingsService.settings().csvDateTimeFormat,
      ),
      'Tasks CSV exported.',
    );
  }

  async exportHistoryCsv(): Promise<void> {
    await this.saveCsvFile(
      `friendly-task-reminder-history-${this.dateStamp()}.csv`,
      this.csv.exportHistory(
        this.historyService.events(),
        this.settingsService.settings().csvDateTimeFormat,
      ),
      'History CSV exported.',
    );
  }

  async importTasksCsv(input: HTMLInputElement): Promise<void> {
    this.importStatus.set('');
    this.importErrors.set([]);

    if (!this.electron.isElectron) {
      input.click();
      return;
    }

    const result = await this.electron.openTextFile();
    if (result.canceled) {
      return;
    }

    if (!result.ok || result.content === undefined) {
      this.importStatus.set(result.error ?? 'The CSV file could not be opened.');
      return;
    }

    await this.importTasksFromCsvText(result.content);
  }

  async importTasksCsvFromInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    await this.importTasksFromCsvText(await file.text());
    input.value = '';
  }

  async resetSettings(): Promise<void> {
    await this.settingsService.reset();
    this.breakMinutes.set(this.settingsService.settings().defaultBreakMinutes);
    this.resetForm();
    await this.syncStickyWindow();
    this.settingsStatus.set('Settings reset to defaults.');
  }

  previousHistoryPage(): void {
    this.historyPage.set(Math.max(0, this.currentHistoryPage() - 1));
  }

  nextHistoryPage(): void {
    this.historyPage.set(Math.min(this.historyPageCount() - 1, this.currentHistoryPage() + 1));
  }

  previousPendingPage(): void {
    this.pendingPage.set(Math.max(0, this.currentPendingPage() - 1));
  }

  nextPendingPage(): void {
    this.pendingPage.set(Math.min(this.pendingPageCount() - 1, this.currentPendingPage() + 1));
  }

  controlInvalid(
    name: 'name' | 'reminderAt' | 'reminderCount' | 'reminderIntervalMinutes',
  ): boolean {
    const control = this.taskControl(name);
    return control.invalid && (control.touched || control.dirty);
  }

  controlError(
    name: 'name' | 'reminderAt' | 'reminderCount' | 'reminderIntervalMinutes',
    error: 'required' | 'min' | 'max',
  ): boolean {
    const control = this.taskControl(name);
    return this.controlInvalid(name) && control.hasError(error);
  }

  isPendingFirst(taskId: string): boolean {
    return this.pendingTasks()[0]?.id === taskId;
  }

  isPendingLast(taskId: string): boolean {
    return this.pendingTasks().at(-1)?.id === taskId;
  }

  stickyNoteColorLabel(color: StickyNoteColor): string {
    return `${color.charAt(0).toUpperCase()}${color.slice(1)} note`;
  }

  stickyTaskStateLabel(task: Task): string {
    return task.status === 'paused' ? 'Paused' : 'In focus';
  }

  stickyTaskPositionLabel(index: number): string {
    const total = this.pendingTasks().length + (this.currentTask() ? 1 : 0);
    const offset = this.currentTask() ? 2 : 1;
    return `Task ${index + offset} of ${Math.max(total, index + offset)}`;
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
      settings.stickyNoteColor,
    );
  }

  private scheduleStickyResize(reason: StickyResizeReason): void {
    if (!this.isStickyMode() || !this.electron.isElectron) {
      return;
    }

    if (reason === 'color-change') {
      return;
    }

    this.setupStickyResizeObserver();
    this.cancelStickyResizeFrames();
    this.stickyResizeFrameOne = requestAnimationFrame(() => {
      this.stickyResizeFrameOne = undefined;
      this.stickyResizeFrameTwo = requestAnimationFrame(() => {
        this.stickyResizeFrameTwo = undefined;
        this.measureAndResizeStickyWindow(reason);
      });
    });
  }

  private stickyContentRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-sticky-note-measure-root]');
  }

  private stickyReminderHeight(): number {
    const reminderPanel = document.querySelector<HTMLElement>('.friendly-reminder');
    if (!reminderPanel) {
      return 0;
    }

    const backdrop = reminderPanel.closest<HTMLElement>('.friendly-backdrop');
    const panelHeight = Math.ceil(
      Math.max(reminderPanel.getBoundingClientRect().height, reminderPanel.offsetHeight),
    );
    if (!backdrop) {
      return panelHeight;
    }

    const backdropStyle = getComputedStyle(backdrop);
    const verticalPadding =
      parseFloat(backdropStyle.paddingTop || '0') + parseFloat(backdropStyle.paddingBottom || '0');
    return Math.ceil(panelHeight + verticalPadding);
  }

  private measureAndResizeStickyWindow(reason: StickyResizeReason): void {
    if (reason === 'content-change' && performance.now() < this.suppressStickyResizeUntil) {
      return;
    }

    const stickyContentRoot = this.stickyContentRoot();
    if (!stickyContentRoot) {
      return;
    }

    const stickyHeight = Math.ceil(
      Math.max(stickyContentRoot.getBoundingClientRect().height, stickyContentRoot.offsetHeight),
    );
    const height = Math.max(stickyHeight, this.stickyReminderHeight());
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }

    const maxAllowedHeight = Math.max(
      280,
      window.screen.availHeight - this.stickyWindowVerticalPadding,
    );
    const overflow = Math.max(0, height - maxAllowedHeight);
    const desiredTrim =
      overflow === 0 ? 0 : Math.ceil(overflow / this.stickyQueueNoteEstimatedHeight);
    const maxQueueCards = Math.max(0, this.stickyVisibleNotes() - 1);
    const boundedTrim = Math.min(maxQueueCards, desiredTrim);
    if (boundedTrim !== this.stickyQueueTrim()) {
      this.stickyQueueTrim.set(boundedTrim);
      return;
    }

    const heightDelta = Math.abs(height - this.lastStickyMeasuredHeight);
    if (this.lastStickyMeasuredHeight > 0 && heightDelta <= this.stickyResizeThresholdPx) {
      return;
    }

    this.lastStickyMeasuredHeight = height;
    void this.electron.resizeStickyWindow(height, reason);
  }

  private setupStickyResizeObserver(): void {
    if (!this.isStickyMode() || this.stickyResizeObserver) {
      return;
    }

    const stickyContentRoot = this.stickyContentRoot();
    if (!stickyContentRoot) {
      return;
    }

    this.stickyResizeObserver = new ResizeObserver(() => {
      if (performance.now() < this.suppressStickyResizeUntil) {
        return;
      }

      this.scheduleStickyResize('content-change');
    });
    this.stickyResizeObserver.observe(stickyContentRoot);
  }

  private teardownStickyResizeObserver(): void {
    this.stickyResizeObserver?.disconnect();
    this.stickyResizeObserver = undefined;
    this.cancelStickyResizeFrames();
    this.lastStickyMeasuredHeight = 0;
  }

  private cancelStickyResizeFrames(): void {
    if (this.stickyResizeFrameOne !== undefined) {
      cancelAnimationFrame(this.stickyResizeFrameOne);
      this.stickyResizeFrameOne = undefined;
    }

    if (this.stickyResizeFrameTwo !== undefined) {
      cancelAnimationFrame(this.stickyResizeFrameTwo);
      this.stickyResizeFrameTwo = undefined;
    }
  }

  private async saveCsvFile(
    defaultPath: string,
    content: string,
    successMessage: string,
  ): Promise<void> {
    this.exportStatus.set('');

    if (this.electron.isElectron) {
      const result = await this.electron.saveTextFile(defaultPath, content, [
        { name: 'CSV files', extensions: ['csv'] },
      ]);
      if (result.canceled) {
        return;
      }

      this.exportStatus.set(
        result.ok ? successMessage : (result.error ?? 'CSV could not be saved.'),
      );
      return;
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    link.download = defaultPath;
    link.click();
    URL.revokeObjectURL(link.href);
    this.exportStatus.set(successMessage);
  }

  private async importTasksFromCsvText(content: string): Promise<void> {
    const result = this.csv.importTasks(content, this.taskService.tasks());
    if (result.tasks.length > 0) {
      await this.taskService.importTasks(result.tasks);
    }

    this.importErrors.set(result.errors);
    this.importStatus.set(
      result.errors.length > 0
        ? `Imported ${result.importedCount}; skipped ${result.skippedCount}.`
        : `Imported ${result.importedCount} task${result.importedCount === 1 ? '' : 's'}.`,
    );
  }

  private dateStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private safeInteger(event: Event, min: number, max: number, fallback: number): number {
    const value = Number((event.target as HTMLInputElement | HTMLSelectElement).value);
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.floor(value)));
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

  private taskControl(
    name: 'name' | 'reminderAt' | 'reminderCount' | 'reminderIntervalMinutes',
  ): AbstractControl {
    return this.taskForm.controls[name];
  }

  private withInsightsPalette(
    data: ChartConfiguration<'bar'>['data'],
    backgroundColor: string,
    borderColor: string,
  ): ChartConfiguration<'bar'>['data'] {
    return {
      labels: data.labels,
      datasets: data.datasets.map((dataset) => ({
        ...dataset,
        backgroundColor,
        borderColor,
        hoverBackgroundColor: borderColor,
        hoverBorderColor: borderColor,
        borderWidth: 1,
        borderRadius: 8,
        categoryPercentage: 0.72,
        barPercentage: 0.9,
        maxBarThickness: 74,
      })),
    };
  }
}
