import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { StickyNoteColor } from './core/models/app-settings';
import { ReminderPresenter, StickyResizeReason } from './core/models/electron-api';
import { RecurrenceEditScope, RecurrenceRule, Task, TaskDraft } from './core/models/task';
import { localDate, onOccurrenceDate, recurrenceErrors } from './core/utils/recurrence.util';
import { BreakService } from './core/services/break.service';
import { BreakCoordinationService } from './core/services/break-coordination.service';
import { AutomaticTaskSchedulerService } from './core/services/automatic-task-scheduler.service';
import { ChartSummaryService } from './core/services/chart-summary.service';
import { CsvService } from './core/services/csv.service';
import { DeadlineSchedulerService } from './core/services/deadline-scheduler.service';
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

export type AppWindowMode = 'main' | 'sticky' | 'scheduler';

export function appWindowMode(search: string): AppWindowMode {
  const mode = new URLSearchParams(search).get('window');
  return mode === 'sticky' || mode === 'scheduler' ? mode : 'main';
}

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
export class App implements OnInit, OnDestroy, AfterViewInit {
  private readonly stickyQueueNoteEstimatedHeight = 94;
  private readonly stickyWindowVerticalPadding = 16;
  private readonly stickyResizeThresholdPx = 2;
  private readonly stickyColorResizeSuppressMs = 250;
  private readonly defaultHistoryPageSize = 5;
  private readonly pendingPageSize = 4;
  private historyMeasureFrameOne: number | undefined;
  private historyMeasureFrameTwo: number | undefined;
  private historyResizeObserver: ResizeObserver | undefined;
  private stickyResizeFrameOne: number | undefined;
  private stickyResizeFrameTwo: number | undefined;
  private stickyResizeObserver: ResizeObserver | undefined;
  private removeMainWindowMaximizedListener: (() => void) | undefined;
  private removeReminderPresenterListener: (() => void) | undefined;
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
  readonly breakCoordination = inject(BreakCoordinationService);
  readonly automaticTaskScheduler = inject(AutomaticTaskSchedulerService);
  readonly deadlineScheduler = inject(DeadlineSchedulerService);
  readonly notificationService = inject(NotificationService);
  private readonly chartSummary = inject(ChartSummaryService);
  private readonly csv = inject(CsvService);
  readonly electron = inject(ElectronBridgeService);

  readonly loading = signal(true);
  readonly editingTaskId = signal<string | undefined>(undefined);
  readonly editingRecurringTask = computed(
    () =>
      this.taskService.tasks().find((task) => task.id === this.editingTaskId())?.recurrenceSeriesId,
  );
  readonly weekdays = [
    { day: 1, label: 'Mon' },
    { day: 2, label: 'Tue' },
    { day: 3, label: 'Wed' },
    { day: 4, label: 'Thu' },
    { day: 5, label: 'Fri' },
    { day: 6, label: 'Sat' },
    { day: 0, label: 'Sun' },
  ];
  readonly exportStatus = signal('');
  readonly importStatus = signal('');
  readonly importErrors = signal<string[]>([]);
  readonly settingsStatus = signal('');
  readonly startAtLoginEnabled = signal(false);
  readonly startAtLoginBusy = signal(true);
  readonly startAtLoginSupported = signal(false);
  readonly startAtLoginMessage = signal('');
  readonly settingsOpen = signal(false);
  readonly csvOpen = signal(false);
  readonly historyOpen = signal(true);
  readonly historyClearModalOpen = signal(false);
  readonly clearingHistory = signal(false);
  readonly historyPage = signal(0);
  readonly historyPageSize = signal(this.defaultHistoryPageSize);
  readonly pendingPage = signal(0);
  readonly stickyQueueTrim = signal(0);
  readonly extensionMinutes = signal(10);
  readonly breakMinutes = signal(10);
  readonly breakConflictTaskId = signal<string | undefined>(undefined);
  readonly deferredBreakTaskId = signal<string | undefined>(undefined);
  readonly windowMode = signal<AppWindowMode>(appWindowMode(window.location.search));
  readonly isStickyMode = computed(() => this.windowMode() === 'sticky');
  readonly isSchedulerMode = computed(() => this.windowMode() === 'scheduler');
  readonly reminderPresenter = signal<ReminderPresenter>(
    this.windowMode() === 'sticky' ? 'sticky' : this.windowMode() === 'scheduler' ? 'none' : 'main',
  );
  readonly isReminderPresenter = computed(() => this.reminderPresenter() === this.windowMode());
  readonly visibleReminder = computed(() =>
    this.isReminderPresenter() ? this.reminderScheduler.activeReminder() : undefined,
  );
  readonly isMainWindowMaximized = signal(false);
  readonly stickyNoteColor = computed(() => this.settingsService.settings().stickyNoteColor);
  readonly stickyVisibleNotes = computed(() =>
    Math.min(5, Math.max(1, this.settingsService.settings().stickyVisibleNotes)),
  );
  readonly activeTasks = this.taskService.activeTasks;
  readonly currentTasks = this.taskService.currentTasks;
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
    Math.max(1, Math.ceil(this.historyService.events().length / this.historyPageSize())),
  );
  readonly pagedHistory = computed(() => {
    const page = this.currentHistoryPage();
    const pageSize = this.historyPageSize();
    const start = page * pageSize;
    return this.historyService.events().slice(start, start + pageSize);
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
  readonly stickyVisibleCurrentTasks = computed(() =>
    this.currentTasks().slice(0, this.stickyVisibleNotes()),
  );
  readonly stickyVisibleQueueTasks = computed(() =>
    this.pendingTasks().slice(
      0,
      Math.max(
        0,
        this.stickyVisibleNotes() -
          this.stickyVisibleCurrentTasks().length -
          this.stickyQueueTrim(),
      ),
    ),
  );
  readonly breakConflictTask = computed(() => {
    const taskId = this.breakConflictTaskId();
    return taskId ? this.pendingTasks().find((task) => task.id === taskId) : undefined;
  });
  readonly breakNextTaskCandidate = computed(() => {
    const deferredTaskId = this.deferredBreakTaskId();
    if (deferredTaskId) {
      const deferredTask = this.pendingTasks().find((task) => task.id === deferredTaskId);
      if (deferredTask) {
        return deferredTask;
      }
    }

    return this.nextTaskCandidate();
  });
  readonly deadlineAlertTask = computed(() =>
    this.taskService
      .tasks()
      .find(
        (task) =>
          task.status !== 'completed' &&
          Boolean(task.deadlineNotifiedAt) &&
          !task.deadlineAcknowledgedAt,
      ),
  );
  readonly visibleDeadlineAlert = computed(() => {
    if (
      this.reminderScheduler.activeReminder() ||
      this.breakService.state() === 'prompt' ||
      this.breakService.state() === 'complete' ||
      this.breakConflictTask() ||
      this.settingsOpen() ||
      this.csvOpen() ||
      this.historyClearModalOpen()
    ) {
      return undefined;
    }

    return this.deadlineAlertTask();
  });
  readonly taskForm = this.formBuilder.nonNullable.group({
    repeatEnabled: [false],
    repeatType: ['daily' as RecurrenceRule['type']],
    repeatDays: [[] as number[]],
    repeatStart: [localDate()],
    repeatEnd: [''],
    editScope: ['occurrence' as RecurrenceEditScope],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    reminderEnabled: [true],
    reminderAt: [toDatetimeLocalValue(addMinutes(new Date(), 30)), Validators.required],
    reminderCount: [3, [Validators.required, Validators.min(1), Validators.max(20)]],
    reminderIntervalMinutes: [5, [Validators.required, Validators.min(1), Validators.max(240)]],
    allowConcurrentStart: [false],
    deadlineEnabled: [false],
    deadlineAt: [''],
    deadlineMessage: ['', Validators.maxLength(240)],
    category: ['', Validators.maxLength(80)],
    note: ['', Validators.maxLength(400)],
  });

  constructor() {
    effect(() => {
      if (this.isSchedulerMode()) {
        return;
      }

      const historyOpen = this.historyOpen();
      this.historyService.events().length;
      this.currentHistoryPage();

      if (!historyOpen) {
        this.teardownHistoryResizeObserver();
        this.cancelHistoryMeasurementFrames();
        return;
      }

      this.scheduleHistoryPageSizeMeasurement();
    });

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
      if (this.isSchedulerMode()) {
        return;
      }

      const reminder = this.visibleReminder();
      const settings = this.settingsService.settings();
      if (this.electron.isElectron) {
        const stickyMode = this.isStickyMode();
        void this.electron.setReminderOverlayState(
          stickyMode ? false : Boolean(reminder),
          settings.stickyNoteAlwaysOnTop,
        );
      }
    });

    effect(() => {
      if (!this.isStickyMode()) {
        return;
      }

      for (const task of this.currentTasks()) {
        task.id;
        task.status;
        task.name;
        task.category;
        task.note;
      }
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
      const reminderVisible = Boolean(this.visibleReminder() || this.visibleDeadlineAlert());
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
      if (this.isSchedulerMode()) {
        await Promise.all([this.taskService.load(), this.settingsService.load()]);
        this.breakCoordination.startScheduler();
        this.automaticTaskScheduler.start();
        this.deadlineScheduler.start();
        this.reminderScheduler.start();
        return;
      }

      this.breakCoordination.startVisible(this.breakService.state(), {
        sessionId: this.breakService.session().id,
      });

      if (this.electron.isElectron) {
        this.removeReminderPresenterListener = this.electron.onReminderPresenterChanged(
          (presenter) => this.reminderPresenter.set(presenter),
        );
        this.reminderPresenter.set(await this.electron.getReminderPresenter());
      }

      if (!this.isStickyMode() && this.electron.isElectron) {
        this.removeMainWindowMaximizedListener = this.electron.onMainWindowMaximizedChanged(
          (maximized) => this.isMainWindowMaximized.set(maximized),
        );
        this.isMainWindowMaximized.set(await this.electron.getMainWindowMaximized());
      }

      await Promise.all([
        this.settingsService.load(),
        this.historyService.load(),
        this.taskService.load(),
      ]);
      await this.loadStartAtLogin();
      if (this.isStickyMode() && this.electron.isElectron) {
        await this.settingsService.update({ stickyNoteEnabled: true });
      }
      this.breakMinutes.set(this.settingsService.settings().defaultBreakMinutes);
      await this.syncStickyWindow();
      this.resetForm();
      this.timerService.start();
      this.scheduleStickyResize('initial-open');
    } catch (error) {
      this.taskService.errorMessage.set(
        error instanceof Error ? error.message : 'The app could not load local data.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  ngAfterViewInit(): void {
    if (this.isSchedulerMode()) {
      return;
    }

    this.scheduleHistoryPageSizeMeasurement();
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove('sticky-mode');
    document.body.classList.remove('sticky-mode');
    this.teardownHistoryResizeObserver();
    this.cancelHistoryMeasurementFrames();
    this.teardownStickyResizeObserver();
    this.timerService.stop();
    this.reminderScheduler.stop();
    this.automaticTaskScheduler.stop();
    this.deadlineScheduler.stop();
    this.breakCoordination.stop();
    this.cancelStickyResizeFrames();
    this.removeMainWindowMaximizedListener?.();
    this.removeMainWindowMaximizedListener = undefined;
    this.removeReminderPresenterListener?.();
    this.removeReminderPresenterListener = undefined;
  }

  async saveTask(): Promise<void> {
    this.onReminderEnabledChanged();
    this.taskForm.markAllAsTouched();
    if (this.taskForm.invalid) {
      this.taskService.errorMessage.set('Please check the highlighted fields.');
      return;
    }

    const draft = this.formToDraft();
    if (draft.recurrence) {
      const errors = recurrenceErrors(draft.recurrence);
      if (errors.length) {
        this.taskService.errorMessage.set(errors[0]);
        return;
      }
    }
    const editingTaskId = this.editingTaskId();
    const saved = editingTaskId
      ? this.editingRecurringTask()
        ? await this.taskService.update(
            editingTaskId,
            draft,
            this.taskForm.controls.editScope.value,
          )
        : await this.taskService.update(editingTaskId, draft)
      : await this.taskService.create(draft);

    if (saved) {
      this.resetForm();
    }
  }

  editTask(task: Task): void {
    this.editingTaskId.set(task.id);
    this.taskService.clearError();
    this.taskForm.setValue({
      repeatEnabled: Boolean(task.recurrence),
      repeatType: task.recurrence?.type ?? 'daily',
      repeatDays: task.recurrence?.daysOfWeek ?? [],
      repeatStart: task.recurrence?.rangeStart ?? localDate(),
      repeatEnd: task.recurrence?.rangeEnd ?? '',
      editScope: 'occurrence',
      name: task.name,
      reminderEnabled: task.reminderEnabled !== false,
      reminderAt: toDatetimeLocalValue(new Date(task.reminderAt)),
      reminderCount:
        task.reminderEnabled === false
          ? this.settingsService.settings().defaultReminderCount
          : task.reminderCount,
      reminderIntervalMinutes:
        task.reminderEnabled === false
          ? this.settingsService.settings().defaultReminderRepeatMinutes
          : task.reminderIntervalMinutes,
      allowConcurrentStart: task.allowConcurrentStart,
      deadlineEnabled: Boolean(task.deadlineAt),
      deadlineAt: task.deadlineAt ? toDatetimeLocalValue(new Date(task.deadlineAt)) : '',
      deadlineMessage: task.deadlineMessage ?? '',
      category: task.category,
      note: task.note,
    });
    this.onDeadlineEnabledChanged();
    this.onReminderEnabledChanged();
  }

  resetForm(): void {
    this.editingTaskId.set(undefined);
    this.taskForm.reset({
      repeatEnabled: false,
      repeatType: 'daily',
      repeatDays: [],
      repeatStart: localDate(),
      repeatEnd: '',
      editScope: 'occurrence',
      name: '',
      reminderEnabled: true,
      reminderAt: toDatetimeLocalValue(addMinutes(new Date(), 30)),
      reminderCount: this.settingsService.settings().defaultReminderCount,
      reminderIntervalMinutes: this.settingsService.settings().defaultReminderRepeatMinutes,
      allowConcurrentStart: false,
      deadlineEnabled: false,
      deadlineAt: '',
      deadlineMessage: '',
      category: '',
      note: '',
    });
    this.onDeadlineEnabledChanged();
    this.onReminderEnabledChanged();
  }

  async startTask(taskId: string): Promise<void> {
    if (this.breakService.state() === 'running') {
      this.deferredBreakTaskId.set(taskId);
      this.breakConflictTaskId.set(taskId);
      return;
    }

    this.breakConflictTaskId.set(undefined);
    await this.beginTask(taskId);
  }

  toggleRepeatDay(day: number): void {
    const control = this.taskForm.controls.repeatDays;
    control.setValue(
      control.value.includes(day)
        ? control.value.filter((item) => item !== day)
        : [...control.value, day],
    );
  }

  onEditScopeChanged(): void {
    const task = this.taskService.tasks().find((item) => item.id === this.editingTaskId());
    if (!task) return;
    const scope = this.taskForm.controls.editScope.value;
    const template =
      scope === 'future'
        ? this.taskService
            .recurrenceTemplates()
            .find((item) => item.recurrenceSeriesId === task.recurrenceSeriesId)
        : task;
    if (!template) return;
    // Future edits start from the series defaults, never an occurrence-only override.
    this.editTask({
      ...template,
      id: task.id,
      recurrenceTemplate: undefined,
      reminderAt: onOccurrenceDate(template.reminderAt, task.occurrenceDate!),
      deadlineAt: template.deadlineAt
        ? onOccurrenceDate(
            template.deadlineAt,
            task.occurrenceDate!,
            localDate(new Date(template.reminderAt)),
          )
        : undefined,
    });
    this.taskForm.controls.editScope.setValue(scope);
    if (
      scope === 'future' &&
      task.occurrenceDate &&
      this.taskForm.controls.repeatStart.value < task.occurrenceDate
    ) {
      this.taskForm.controls.repeatStart.setValue(task.occurrenceDate);
    }
  }

  async completeTask(taskId: string): Promise<void> {
    const task = this.currentTasks().find((candidate) => candidate.id === taskId);
    if (!task) {
      return;
    }

    const defaultBreakMinutes = this.settingsService.settings().defaultBreakMinutes;
    const shouldPromptBreak = this.currentTasks().length === 1;
    if (shouldPromptBreak) {
      this.breakService.prompt(defaultBreakMinutes);
    }

    const completed = await this.taskService.complete(taskId);
    if (!completed) {
      if (shouldPromptBreak) {
        this.breakService.reset();
      }
      return;
    }

    if (shouldPromptBreak) {
      this.breakMinutes.set(defaultBreakMinutes);
    }
  }

  async addReminderTime(taskId: string): Promise<void> {
    const now = new Date();
    this.timerService.now.set(now);
    await this.taskService.addTime(taskId, this.extensionMinutes(), now);
  }

  setExtensionMinutes(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.extensionMinutes.set(Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 10);
  }

  async pauseTask(taskId: string): Promise<void> {
    await this.taskService.pause(taskId);
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.taskService.resume(taskId);
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.taskService.delete(taskId);
  }

  async dismissReminder(taskId: string): Promise<void> {
    await this.reminderScheduler.dismiss(taskId);
  }

  onReminderEnabledChanged(): void {
    const enabled = this.taskForm.controls.reminderEnabled.value;
    const start = this.taskForm.controls.reminderAt;
    start.setValidators(enabled ? Validators.required : []);
    start.updateValueAndValidity();
    for (const control of [
      this.taskForm.controls.reminderCount,
      this.taskForm.controls.reminderIntervalMinutes,
    ]) {
      if (enabled) {
        control.enable();
      } else {
        control.disable();
      }
    }
  }

  onDeadlineEnabledChanged(): void {
    const enabled = this.taskForm.controls.deadlineEnabled.value;
    const deadlineAt = this.taskForm.controls.deadlineAt;
    const deadlineMessage = this.taskForm.controls.deadlineMessage;
    if (enabled) {
      deadlineAt.setValidators(Validators.required);
      deadlineMessage.setValidators([Validators.required, Validators.maxLength(240)]);
    } else {
      deadlineAt.clearValidators();
      deadlineMessage.setValidators(Validators.maxLength(240));
      deadlineAt.setValue('');
      deadlineMessage.setValue('');
    }
    deadlineAt.updateValueAndValidity();
    deadlineMessage.updateValueAndValidity();
  }

  async acknowledgeDeadline(taskId: string): Promise<void> {
    await this.taskService.acknowledgeDeadline(taskId);
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

  async setStartAtLogin(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const requestedState = checkbox.checked;
    checkbox.checked = this.startAtLoginEnabled();
    this.startAtLoginBusy.set(true);

    try {
      const result = await this.electron.setStartAtLogin(requestedState);
      if (result.enabled !== null) this.startAtLoginEnabled.set(result.enabled);
      this.startAtLoginSupported.set(result.supported);
      checkbox.checked = this.startAtLoginEnabled();
      this.settingsStatus.set(
        result.ok
          ? result.enabled
            ? 'Time Assistant will start when you sign in to Windows.'
            : 'Time Assistant will no longer start with Windows.'
          : (result.message ?? 'Windows startup could not be changed. Please try again.'),
      );
    } catch (error) {
      console.error('Windows startup IPC failed', error);
      try {
        const result = await this.electron.getStartAtLogin();
        if (result.enabled !== null) this.startAtLoginEnabled.set(result.enabled);
      } catch (readError) {
        console.error('Windows startup recovery read failed', readError);
        // Keep the last confirmed value when Windows cannot be queried either.
      }
      checkbox.checked = this.startAtLoginEnabled();
      this.settingsStatus.set('Windows startup could not be changed. Please try again.');
    } finally {
      this.startAtLoginBusy.set(false);
    }
  }

  openSettings(): void {
    this.settingsOpen.set(true);
    void this.loadStartAtLogin();
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

  openHistoryClearModal(): void {
    if (this.historyService.events().length === 0 || this.clearingHistory()) {
      return;
    }

    this.historyClearModalOpen.set(true);
  }

  closeHistoryClearModal(): void {
    if (this.clearingHistory()) {
      return;
    }

    this.historyClearModalOpen.set(false);
  }

  toggleHistory(): void {
    this.historyOpen.update((open) => !open);
  }

  async clearHistory(): Promise<void> {
    if (this.clearingHistory() || this.historyService.events().length === 0) {
      return;
    }

    this.clearingHistory.set(true);
    try {
      await this.historyService.clear();
      this.historyPage.set(0);
      this.historyClearModalOpen.set(false);
    } finally {
      this.clearingHistory.set(false);
    }
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
    const nextTask = this.breakNextTaskCandidate();
    if (!nextTask) {
      this.breakConflictTaskId.set(undefined);
      this.deferredBreakTaskId.set(undefined);
      this.breakService.reset();
      return;
    }

    this.breakConflictTaskId.set(undefined);
    this.breakService.reset();
    await this.beginTask(nextTask.id);
  }

  keepBreakRunning(): void {
    this.breakConflictTaskId.set(undefined);
  }

  async startTaskNow(): Promise<void> {
    const taskId = this.breakConflictTaskId();
    if (!taskId) {
      return;
    }

    this.breakConflictTaskId.set(undefined);
    this.deferredBreakTaskId.set(undefined);
    await this.breakService.stopEarly();
    await this.beginTask(taskId);
  }

  async focusMainWindow(): Promise<void> {
    await this.electron.focusMainWindow();
  }

  async openUserGuide(): Promise<void> {
    if (this.electron.isElectron) {
      await this.electron.openUserGuide();
      return;
    }

    window.open('user-guide.html', '_blank', 'noopener,noreferrer');
  }

  async closeMainWindow(): Promise<void> {
    if (!this.electron.isElectron) {
      return;
    }

    await this.electron.closeMainWindow();
  }

  async toggleMainWindowMaximized(): Promise<void> {
    if (!this.electron.isElectron) {
      return;
    }

    this.isMainWindowMaximized.set(await this.electron.toggleMainWindowMaximized());
  }

  onMainTitleBarDoubleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest('button, a, input, select, textarea, [role="button"]')) {
      return;
    }

    void this.toggleMainWindowMaximized();
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
      await this.electron.hideStickyWindow();
      return;
    }

    await this.settingsService.update({ stickyNoteEnabled: false });
  }

  async exportTasksCsv(): Promise<void> {
    await this.saveCsvFile(
      `friendly-task-reminder-tasks-${this.dateStamp()}.csv`,
      this.csv.exportTasks(
        [...this.taskService.recurrenceTemplates(), ...this.taskService.tasks()],
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
    name:
      | 'name'
      | 'reminderAt'
      | 'reminderCount'
      | 'reminderIntervalMinutes'
      | 'deadlineAt'
      | 'deadlineMessage',
  ): boolean {
    const control = this.taskControl(name);
    return control.invalid && (control.touched || control.dirty);
  }

  controlError(
    name:
      | 'name'
      | 'reminderAt'
      | 'reminderCount'
      | 'reminderIntervalMinutes'
      | 'deadlineAt'
      | 'deadlineMessage',
    error: 'required' | 'min' | 'max' | 'maxlength',
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
    const total = this.pendingTasks().length + this.currentTasks().length;
    const offset = this.currentTasks().length + 1;
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

  private async beginTask(taskId: string): Promise<void> {
    await this.taskService.start(taskId);
    if (!this.currentTasks().some((task) => task.id === taskId)) {
      return;
    }

    this.breakConflictTaskId.set(undefined);
    if (this.deferredBreakTaskId() === taskId) {
      this.deferredBreakTaskId.set(undefined);
    }
  }

  private syncStickyWindow(): Promise<boolean> {
    const settings = this.settingsService.settings();
    return this.electron.setStickyWindow(
      settings.stickyNoteEnabled,
      settings.stickyNoteAlwaysOnTop,
      settings.stickyNoteColor,
    );
  }

  private async loadStartAtLogin(): Promise<void> {
    this.startAtLoginBusy.set(true);
    try {
      const result = await this.electron.getStartAtLogin();
      if (result.enabled !== null) this.startAtLoginEnabled.set(result.enabled);
      this.startAtLoginSupported.set(result.supported);
      this.startAtLoginMessage.set(
        result.ok ? '' : (result.message ?? 'Windows startup status could not be read.'),
      );
    } catch (error) {
      console.error('Windows startup IPC read failed', error);
      this.settingsStatus.set('Windows startup status could not be read.');
    } finally {
      this.startAtLoginBusy.set(false);
    }
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

  private historyPanelBody(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-history-body]');
  }

  private historyPanel(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-history-panel]');
  }

  private historyHeader(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-history-header]');
  }

  private historyList(): HTMLOListElement | null {
    return document.querySelector<HTMLOListElement>('[data-history-list]');
  }

  private historyPager(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-history-pager]');
  }

  private scheduleHistoryPageSizeMeasurement(): void {
    this.cancelHistoryMeasurementFrames();
    this.historyMeasureFrameOne = requestAnimationFrame(() => {
      this.historyMeasureFrameOne = undefined;
      this.historyMeasureFrameTwo = requestAnimationFrame(() => {
        this.historyMeasureFrameTwo = undefined;
        this.setupHistoryResizeObserver();
        this.measureHistoryPageSize();
      });
    });
  }

  private measureHistoryPageSize(): void {
    const historyPanel = this.historyPanel();
    const historyBody = this.historyPanelBody();
    const historyList = this.historyList();
    if (!historyPanel || !historyBody || !historyList) {
      return;
    }

    const renderedItems = Array.from(historyList.querySelectorAll('li'));
    if (renderedItems.length === 0) {
      return;
    }

    const historyHeader = this.historyHeader();
    const historyPager = this.historyPager();
    const panelHeight = Math.floor(
      historyPanel.getBoundingClientRect().height || historyPanel.clientHeight,
    );
    const headerHeight = historyHeader
      ? Math.ceil(historyHeader.getBoundingClientRect().height || historyHeader.clientHeight)
      : 0;
    const bodyStyles = getComputedStyle(historyBody);
    const rowGap = parseFloat(bodyStyles.rowGap || bodyStyles.gap || '0') || 0;
    const bodyPadding =
      (parseFloat(bodyStyles.paddingTop || '0') || 0) +
      (parseFloat(bodyStyles.paddingBottom || '0') || 0);
    const pagerHeight = historyPager
      ? Math.ceil(historyPager.getBoundingClientRect().height || historyPager.clientHeight)
      : 0;
    const listHeight = Math.floor(
      historyList.clientHeight || historyList.getBoundingClientRect().height,
    );
    const availableHeight =
      Math.max(0, panelHeight - headerHeight - bodyPadding - pagerHeight - rowGap) || listHeight;
    const contentHeight = renderedItems.reduce(
      (total, item) =>
        total +
        Math.ceil(item.getBoundingClientRect().height || item.scrollHeight || item.clientHeight),
      0,
    );
    if (availableHeight <= 0 || contentHeight <= 0) {
      return;
    }

    const averageItemHeight = contentHeight / renderedItems.length;
    const nextPageSize = Math.max(
      1,
      Math.min(
        this.historyService.events().length,
        Math.floor(availableHeight / averageItemHeight),
      ),
    );
    if (nextPageSize !== this.historyPageSize()) {
      this.historyPageSize.set(nextPageSize);
      this.scheduleHistoryPageSizeMeasurement();
    }
  }

  private setupHistoryResizeObserver(): void {
    if (
      this.historyResizeObserver ||
      !this.historyOpen() ||
      typeof ResizeObserver === 'undefined'
    ) {
      return;
    }

    const historyBody = this.historyPanelBody();
    const historyPanel = this.historyPanel();
    if (!historyBody || !historyPanel) {
      return;
    }

    this.historyResizeObserver = new ResizeObserver(() => {
      this.scheduleHistoryPageSizeMeasurement();
    });
    this.historyResizeObserver.observe(historyBody);
    this.historyResizeObserver.observe(historyPanel);
  }

  private teardownHistoryResizeObserver(): void {
    this.historyResizeObserver?.disconnect();
    this.historyResizeObserver = undefined;
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
    const maxQueueCards = Math.max(
      0,
      this.stickyVisibleNotes() - this.stickyVisibleCurrentTasks().length,
    );
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
    if (
      !this.isStickyMode() ||
      this.stickyResizeObserver ||
      typeof ResizeObserver === 'undefined'
    ) {
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

  private cancelHistoryMeasurementFrames(): void {
    if (this.historyMeasureFrameOne !== undefined) {
      cancelAnimationFrame(this.historyMeasureFrameOne);
      this.historyMeasureFrameOne = undefined;
    }

    if (this.historyMeasureFrameTwo !== undefined) {
      cancelAnimationFrame(this.historyMeasureFrameTwo);
      this.historyMeasureFrameTwo = undefined;
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
    const result = this.csv.importTasks(content, [
      ...this.taskService.recurrenceTemplates(),
      ...this.taskService.tasks(),
    ]);
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
    const editingTask = this.taskService.tasks().find((task) => task.id === this.editingTaskId());
    // Ready-now tasks carry seconds that the datetime-local input cannot display.
    const unchangedStart =
      editingTask && value.reminderAt === toDatetimeLocalValue(new Date(editingTask.reminderAt));
    return {
      recurrence: value.repeatEnabled
        ? {
            type: value.repeatType,
            daysOfWeek: value.repeatType === 'custom' ? value.repeatDays : undefined,
            rangeStart: value.repeatStart,
            rangeEnd: value.repeatEnd || undefined,
          }
        : undefined,
      name: value.name,
      reminderEnabled: value.reminderEnabled,
      reminderAt: unchangedStart
        ? editingTask.reminderAt
        : value.reminderAt
          ? fromDatetimeLocalValue(value.reminderAt)
          : '',
      reminderCount: Number(value.reminderCount),
      reminderIntervalMinutes: Number(value.reminderIntervalMinutes),
      allowConcurrentStart: value.allowConcurrentStart,
      deadlineAt:
        value.deadlineEnabled && value.deadlineAt
          ? fromDatetimeLocalValue(value.deadlineAt)
          : undefined,
      deadlineMessage: value.deadlineEnabled ? value.deadlineMessage : undefined,
      category: value.category,
      note: value.note,
    };
  }

  private taskControl(
    name:
      | 'name'
      | 'reminderAt'
      | 'reminderCount'
      | 'reminderIntervalMinutes'
      | 'deadlineAt'
      | 'deadlineMessage',
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
