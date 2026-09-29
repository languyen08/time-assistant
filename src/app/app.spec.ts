import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { HistoryEvent } from './core/models/history-event';
import { Task } from './core/models/task';
import { BaseChartDirective } from 'ng2-charts';

function pendingTask(id: string, name: string, order: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name,
    note: '',
    category: '',
    reminderAt: '2026-05-30T10:30:00.000Z',
    reminderCount: 3,
    reminderIntervalMinutes: 5,
    allowConcurrentStart: false,
    order,
    status: 'pending',
    createdAt: '2026-05-30T10:00:00.000Z',
    updatedAt: '2026-05-30T10:00:00.000Z',
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

function createAssistantTimeApi(
  overrides: Partial<NonNullable<Window['assistantTime']>> = {},
): NonNullable<Window['assistantTime']> {
  return {
    platform: 'win32',
    closeMainWindow: vi.fn().mockResolvedValue(true),
    hideStickyWindow: vi.fn().mockResolvedValue(true),
    focusMainWindow: vi.fn().mockResolvedValue(true),
    getMainWindowMaximized: vi.fn().mockResolvedValue(false),
    minimizeStickyWindow: vi.fn().mockResolvedValue(true),
    notify: vi.fn().mockResolvedValue(true),
    openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
    setReminderOverlayState: vi.fn().mockResolvedValue(true),
    saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
    resizeStickyWindow: vi.fn().mockResolvedValue(true),
    setStickyWindow: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('App', () => {
  const originalAssistantTime = window.assistantTime;
  const originalAvailHeight = window.screen.availHeight;
  const originalRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  beforeEach(async () => {
    window.history.replaceState({}, '', '/');
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
    window.history.replaceState({}, '', originalRelativeUrl);
    window.assistantTime = originalAssistantTime;
    Object.defineProperty(window.screen, 'availHeight', {
      configurable: true,
      value: originalAvailHeight,
    });
    document
      .querySelector('[data-sticky-note-measure-root]')
      ?.parentElement?.removeChild(
        document.querySelector('[data-sticky-note-measure-root]') as HTMLElement,
      );
    document
      .querySelector('.friendly-backdrop')
      ?.parentElement?.removeChild(document.querySelector('.friendly-backdrop') as HTMLElement);
    document
      .querySelector('[data-history-body]')
      ?.parentElement?.removeChild(document.querySelector('[data-history-body]') as HTMLElement);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should recognize scheduler mode, render no UI, and initialize only task state', async () => {
    window.history.replaceState({}, '', '/?window=scheduler');
    const assistantTime = createAssistantTimeApi({
      getMainWindowMaximized: vi.fn().mockResolvedValue(false),
      getStartAtLogin: vi.fn().mockResolvedValue(false),
      onMainWindowMaximizedChanged: vi.fn(() => () => undefined),
      setReminderOverlayState: vi.fn().mockResolvedValue(true),
      setStickyWindow: vi.fn().mockResolvedValue(true),
    });
    window.assistantTime = assistantTime;

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const taskLoad = vi.spyOn(app.taskService, 'load').mockResolvedValue();
    const settingsLoad = vi.spyOn(app.settingsService, 'load').mockResolvedValue();
    const historyLoad = vi.spyOn(app.historyService, 'load').mockResolvedValue();
    const timerStart = vi.spyOn(app.timerService, 'start');
    const reminderStart = vi.spyOn(app.reminderScheduler, 'start');
    const automaticStart = vi
      .spyOn(app.automaticTaskScheduler, 'start')
      .mockImplementation(() => undefined);
    const schedulerCoordinationStart = vi.spyOn(app.breakCoordination, 'startScheduler');
    const visibleCoordinationStart = vi.spyOn(app.breakCoordination, 'startVisible');
    const historyMeasurement = vi.spyOn(
      app as unknown as { scheduleHistoryPageSizeMeasurement: () => void },
      'scheduleHistoryPageSizeMeasurement',
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(app.windowMode()).toBe('scheduler');
    expect(app.isSchedulerMode()).toBe(true);
    expect(app.isStickyMode()).toBe(false);
    expect(host.querySelector('main')).toBeNull();
    expect(host.querySelector('.topbar')).toBeNull();
    expect(host.querySelector('.sticky-window')).toBeNull();
    expect(host.querySelector('.settings-modal')).toBeNull();
    expect(host.querySelector('.friendly-reminder')).toBeNull();
    expect(taskLoad).toHaveBeenCalledOnce();
    expect(settingsLoad).not.toHaveBeenCalled();
    expect(historyLoad).not.toHaveBeenCalled();
    expect(timerStart).not.toHaveBeenCalled();
    expect(reminderStart).not.toHaveBeenCalled();
    expect(automaticStart).toHaveBeenCalledOnce();
    expect(schedulerCoordinationStart).toHaveBeenCalledOnce();
    expect(visibleCoordinationStart).not.toHaveBeenCalled();
    expect(historyMeasurement).not.toHaveBeenCalled();
    expect(assistantTime.getMainWindowMaximized).not.toHaveBeenCalled();
    expect(assistantTime.getStartAtLogin).not.toHaveBeenCalled();
    expect(assistantTime.onMainWindowMaximizedChanged).not.toHaveBeenCalled();
    expect(assistantTime.setStickyWindow).not.toHaveBeenCalled();
    expect(assistantTime.setReminderOverlayState).not.toHaveBeenCalled();
    expect(assistantTime.resizeStickyWindow).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it.each(['main', 'sticky'] as const)(
    'should preserve normal %s renderer initialization',
    async (windowMode) => {
      window.history.replaceState({}, '', `/?window=${windowMode}`);
      window.assistantTime = undefined;

      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      const taskLoad = vi.spyOn(app.taskService, 'load').mockResolvedValue();
      const settingsLoad = vi.spyOn(app.settingsService, 'load').mockResolvedValue();
      const historyLoad = vi.spyOn(app.historyService, 'load').mockResolvedValue();
      const timerStart = vi.spyOn(app.timerService, 'start');
      const reminderStart = vi.spyOn(app.reminderScheduler, 'start');
      const automaticStart = vi.spyOn(app.automaticTaskScheduler, 'start');
      const visibleCoordinationStart = vi.spyOn(app.breakCoordination, 'startVisible');

      await app.ngOnInit();

      expect(app.windowMode()).toBe(windowMode);
      expect(taskLoad).toHaveBeenCalledOnce();
      expect(settingsLoad).toHaveBeenCalledOnce();
      expect(historyLoad).toHaveBeenCalledOnce();
      expect(timerStart).toHaveBeenCalledOnce();
      expect(reminderStart).toHaveBeenCalledOnce();
      expect(automaticStart).not.toHaveBeenCalled();
      expect(visibleCoordinationStart).toHaveBeenCalledWith('idle', {
        sessionId: expect.any(String),
      });

      fixture.destroy();
    },
  );

  it('should render the compact app header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#app-title')?.textContent).toContain('Time Assistant');
  });

  it('should present scheduled task language and a deferred retry time', async () => {
    vi.spyOn(BaseChartDirective.prototype, 'render').mockReturnValue({} as never);
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.loading.set(false);
    app.taskService.tasks.set([
      pendingTask('task-1', 'Scheduled task', 0, {
        nextAutoStartAt: '2026-05-30T11:00:00.000Z',
      }),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Start time');
    expect(host.textContent).toContain('Start now');
    expect(host.textContent).toContain('Next auto-start attempt:');
  });

  it('should describe automatic starts in the Sticky empty state', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.windowMode.set('sticky');
    app.loading.set(false);
    app.taskService.tasks.set([]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Tasks will start automatically when scheduled.',
    );
  });

  it('should publish the break prompt before completing the active task', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.taskService.tasks.set([
      pendingTask('task-1', 'Current task', 0, {
        status: 'active',
        activeStartedAt: '2026-05-30T10:00:00.000Z',
      }),
      pendingTask('task-2', 'Next task', 1),
    ]);
    const complete = vi.spyOn(app.taskService, 'complete').mockImplementation(async () => {
      expect(app.breakService.state()).toBe('prompt');
      return true;
    });

    await app.completeTask('task-1');

    expect(complete).toHaveBeenCalledWith('task-1');
    expect(app.breakService.state()).toBe('prompt');
  });

  it('should complete one of multiple current tasks without prompting or dismissing another reminder', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.taskService.tasks.set([
      pendingTask('task-a', 'Task A', 0, {
        status: 'active',
        activeStartedAt: '2026-05-30T10:00:00.000Z',
      }),
      pendingTask('task-b', 'Task B', 1, {
        status: 'active',
        activeStartedAt: '2026-05-30T10:00:00.000Z',
      }),
    ]);
    app.reminderScheduler.activeReminder.set({
      taskId: 'task-b',
      taskName: 'Task B',
      attemptNumber: 1,
      maxAttempts: 3,
      shownAt: '2026-05-30T10:30:00.000Z',
      message: 'A friendly reminder.',
    });
    const prompt = vi.spyOn(app.breakService, 'prompt');
    vi.spyOn(app.taskService, 'complete').mockImplementation(async (taskId) => {
      app.taskService.tasks.update((tasks) =>
        tasks.map((task) => (task.id === taskId ? { ...task, status: 'completed' } : task)),
      );
      return true;
    });

    await app.completeTask('task-a');

    expect(prompt).not.toHaveBeenCalled();
    expect(app.currentTasks().map((task) => task.id)).toEqual(['task-b']);
    expect(app.reminderScheduler.activeReminder()?.taskId).toBe('task-b');
  });

  it('should prompt before completing the final current task and roll back on failure', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.taskService.tasks.set([
      pendingTask('task-b', 'Task B', 0, {
        status: 'paused',
        activeStartedAt: '2026-05-30T10:00:00.000Z',
        pausedAt: '2026-05-30T10:15:00.000Z',
      }),
    ]);
    const complete = vi.spyOn(app.taskService, 'complete').mockImplementation(async () => {
      expect(app.breakService.state()).toBe('prompt');
      return false;
    });

    await app.completeTask('task-b');

    expect(complete).toHaveBeenCalledWith('task-b');
    expect(app.breakService.state()).toBe('idle');
  });

  it('should not prompt when completing an active task while a paused task remains', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.taskService.tasks.set([
      pendingTask('task-a', 'Task A', 0, { status: 'active' }),
      pendingTask('task-b', 'Task B', 1, {
        status: 'paused',
        pausedAt: '2026-05-30T10:10:00.000Z',
      }),
    ]);
    const prompt = vi.spyOn(app.breakService, 'prompt');
    vi.spyOn(app.taskService, 'complete').mockImplementation(async (taskId) => {
      app.taskService.tasks.update((tasks) =>
        tasks.map((task) => (task.id === taskId ? { ...task, status: 'completed' } : task)),
      );
      return true;
    });

    await app.completeTask('task-a');

    expect(prompt).not.toHaveBeenCalled();
    expect(app.currentTasks().map((task) => task.id)).toEqual(['task-b']);
  });

  it('should not prompt for a break when deleting the final current task', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.taskService.tasks.set([
      pendingTask('task-a', 'Task A', 0, {
        status: 'active',
        activeStartedAt: '2026-05-30T10:00:00.000Z',
      }),
    ]);
    const prompt = vi.spyOn(app.breakService, 'prompt');
    vi.spyOn(app.taskService, 'delete').mockImplementation(async (taskId) => {
      app.taskService.tasks.update((tasks) => tasks.filter((task) => task.id !== taskId));
      return true;
    });

    await app.deleteTask('task-a');

    expect(prompt).not.toHaveBeenCalled();
    expect(app.currentTasks()).toEqual([]);
  });

  it('should render every current task in the Main In Focus panel', async () => {
    vi.spyOn(BaseChartDirective.prototype, 'render').mockReturnValue({} as never);
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.loading.set(false);
    app.taskService.tasks.set([
      pendingTask('task-a', 'Task A', 0, {
        status: 'active',
        activeStartedAt: '2026-05-30T10:00:00.000Z',
      }),
      pendingTask('task-b', 'Task B', 1, {
        status: 'paused',
        activeStartedAt: '2026-05-30T10:00:00.000Z',
        pausedAt: '2026-05-30T10:10:00.000Z',
      }),
    ]);

    fixture.detectChanges();
    await fixture.whenStable();

    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.current-task-active-note',
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Task A');
    expect(cards[1].textContent).toContain('Task B');
  });

  it('should prioritize current Sticky cards within the visible-note limit and target the second card', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.windowMode.set('sticky');
    app.loading.set(false);
    app.settingsService.settings.update((settings) => ({
      ...settings,
      stickyVisibleNotes: 3,
    }));
    app.taskService.tasks.set([
      pendingTask('task-a', 'Task A', 0, { status: 'active' }),
      pendingTask('task-b', 'Task B', 1, { status: 'active' }),
      pendingTask('pending-a', 'Pending A', 2),
      pendingTask('pending-b', 'Pending B', 3),
    ]);
    const pauseTask = vi.spyOn(app, 'pauseTask').mockResolvedValue();

    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const currentCards = host.querySelectorAll<HTMLElement>('.sticky-focus-card:not(.empty)');
    expect(currentCards).toHaveLength(2);
    expect(host.querySelectorAll('.sticky-queue-card')).toHaveLength(1);

    currentCards[1].querySelector<HTMLButtonElement>('button')?.click();
    expect(pauseTask).toHaveBeenCalledWith('task-b');

    app.taskService.tasks.update((tasks) => [
      ...tasks.slice(0, 2),
      pendingTask('task-c', 'Task C', 2, { status: 'paused' }),
      pendingTask('pending-a', 'Pending A', 3),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelectorAll('.sticky-focus-card:not(.empty)')).toHaveLength(3);
    expect(host.querySelectorAll('.sticky-queue-card')).toHaveLength(0);
  });

  it('should make break completion informational instead of a manual start gate', async () => {
    vi.spyOn(BaseChartDirective.prototype, 'render').mockReturnValue({} as never);
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.loading.set(false);
    app.taskService.tasks.set([pendingTask('task-2', 'Next task', 0)]);
    app.breakService.session.update((session) => ({ ...session, state: 'complete' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const modal = (fixture.nativeElement as HTMLElement).querySelector('.break-complete-modal');
    expect(modal?.textContent).toContain('Break complete');
    expect(modal?.textContent).toContain('The next task will start automatically when it is due.');
    expect(modal?.textContent).toContain('Close');
    expect(modal?.textContent).not.toContain('Start next task');
  });

  it('should summarize multiple current tasks when a break completes', async () => {
    vi.spyOn(BaseChartDirective.prototype, 'render').mockReturnValue({} as never);
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.loading.set(false);
    app.taskService.tasks.set([
      pendingTask('task-a', 'Task A', 0, { status: 'active' }),
      pendingTask('task-b', 'Task B', 1, { status: 'paused' }),
    ]);
    app.breakService.session.update((session) => ({ ...session, state: 'complete' }));

    fixture.detectChanges();
    await fixture.whenStable();

    const modal = (fixture.nativeElement as HTMLElement).querySelector('.break-complete-modal');
    expect(modal?.textContent).toContain('2 tasks are now in focus.');
  });

  it('should open a confirmation modal and clear history from the header action', async () => {
    vi.spyOn(BaseChartDirective.prototype, 'render').mockReturnValue({} as never);
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.loading.set(false);
    app.historyService.events.set([
      {
        id: 'event_1',
        type: 'task_created',
        occurredAt: '2026-05-30T10:00:00.000Z',
        summary: 'Created first task',
      },
    ]);
    const clearSpy = vi.spyOn(app.historyService, 'clear').mockImplementation(async () => {
      app.historyService.events.set([]);
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const clearButton = host.querySelector<HTMLButtonElement>(
      '[data-testid="history-clear-button"]',
    );

    expect(clearButton).not.toBeNull();
    expect(clearButton?.disabled).toBe(false);

    clearButton!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.textContent).toContain('Clear all events?');

    host.querySelector<HTMLButtonElement>('[data-testid="history-clear-confirm"]')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(app.historyService.events()).toHaveLength(0);
    expect(app.historyClearModalOpen()).toBe(false);
  });

  it('should render maximize between Settings and Close and call the narrow bridge', async () => {
    const toggleMainWindowMaximized = vi.fn().mockResolvedValue(true);
    window.assistantTime = createAssistantTimeApi({ toggleMainWindowMaximized });

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.loading.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.topbar .nav-tabs button'),
    );
    const maximizeButton = host.querySelector<HTMLButtonElement>(
      '[data-testid="main-window-maximize-toggle"]',
    );
    const closeButton = host.querySelector<HTMLButtonElement>(
      '.topbar .nav-tabs button[aria-label="Close main window"]',
    );

    expect(buttons[0]?.textContent?.trim()).toBe('CSV');
    expect(buttons[1]?.textContent?.trim()).toBe('Settings');
    expect(buttons[2]).toBe(maximizeButton);
    expect(buttons[3]).toBe(closeButton);
    expect(maximizeButton?.getAttribute('aria-label')).toBe('Maximize window');

    maximizeButton!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toggleMainWindowMaximized).toHaveBeenCalledOnce();
    expect(maximizeButton?.getAttribute('aria-label')).toBe('Restore window');
  });

  it('should use the narrow close-main-only bridge from the main X', async () => {
    const closeMainWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = createAssistantTimeApi({ closeMainWindow });
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();

    const closeButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.topbar .nav-tabs button[aria-label="Close main window"]',
    );
    closeButton?.click();
    await fixture.whenStable();

    expect(closeMainWindow).toHaveBeenCalledOnce();
  });

  it('should follow maximize state changes reported by Electron', async () => {
    let maximizeListener: ((maximized: boolean) => void) | undefined;
    const removeListener = vi.fn();
    window.assistantTime = createAssistantTimeApi({
      onMainWindowMaximizedChanged: vi.fn((callback) => {
        maximizeListener = callback;
        return removeListener;
      }),
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    maximizeListener?.(true);
    fixture.detectChanges();

    const maximizeButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="main-window-maximize-toggle"]',
    );
    expect(maximizeButton?.getAttribute('aria-label')).toBe('Restore window');

    fixture.destroy();
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('should toggle on title-bar double click but ignore interactive controls', () => {
    window.assistantTime = createAssistantTimeApi();
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const toggleSpy = vi.spyOn(app, 'toggleMainWindowMaximized').mockResolvedValue();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host
      .querySelector<HTMLElement>('.topbar')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    host
      .querySelector<HTMLButtonElement>('.topbar .nav-tabs button')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(toggleSpy).toHaveBeenCalledTimes(1);
  });

  it('should show the confirmed Windows startup state in the Startup card', async () => {
    const getStartAtLogin = vi.fn().mockResolvedValue(true);
    window.assistantTime = createAssistantTimeApi({ getStartAtLogin });

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await app['loadStartAtLogin']();
    app.openSettings();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const startupCard = host.querySelector<HTMLElement>('[data-testid="settings-startup-card"]');
    const checkbox = startupCard?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const stickyCard = host.querySelector<HTMLElement>('.settings-card-sticky');
    const actions = host.querySelector<HTMLElement>('[data-testid="settings-actions"]');

    expect(getStartAtLogin).toHaveBeenCalled();
    expect(checkbox?.checked).toBe(true);
    expect(startupCard?.textContent).toContain('Start app with Windows');
    expect(startupCard?.textContent).toContain(
      'Automatically open Time Assistant when you sign in to Windows.',
    );
    expect(stickyCard?.compareDocumentPosition(startupCard!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(startupCard?.compareDocumentPosition(actions!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('should enable and disable Windows startup through the preload API', async () => {
    const setStartAtLogin = vi.fn(async (enabled: boolean) => enabled);
    window.assistantTime = createAssistantTimeApi({
      getStartAtLogin: vi.fn().mockResolvedValue(false),
      setStartAtLogin,
    });

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await app['loadStartAtLogin']();
    app.openSettings();
    fixture.detectChanges();

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="settings-startup-card"] input[type="checkbox"]',
    )!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setStartAtLogin).toHaveBeenNthCalledWith(1, true);
    expect(app.startAtLoginEnabled()).toBe(true);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(setStartAtLogin).toHaveBeenNthCalledWith(2, false);
    expect(app.startAtLoginEnabled()).toBe(false);
  });

  it('should re-read and restore the actual Windows state when a startup update fails', async () => {
    const getStartAtLogin = vi.fn().mockResolvedValue(true);
    window.assistantTime = createAssistantTimeApi({
      getStartAtLogin,
      setStartAtLogin: vi.fn().mockRejectedValue(new Error('Windows rejected the update.')),
    });

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await app['loadStartAtLogin']();
    app.openSettings();
    fixture.detectChanges();

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="settings-startup-card"] input[type="checkbox"]',
    )!;
    const readsBeforeUpdate = getStartAtLogin.mock.calls.length;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getStartAtLogin).toHaveBeenCalledTimes(readsBeforeUpdate + 1);
    expect(app.startAtLoginEnabled()).toBe(true);
    expect(checkbox.checked).toBe(true);
    expect(app.settingsStatus()).toContain('actual Windows setting was restored');
  });

  it('should size history pages from the available history list height', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const events: HistoryEvent[] = Array.from({ length: 30 }, (_, index) => ({
      id: `event_${index}`,
      type: 'task_created',
      occurredAt: `2026-05-30T10:${String(index % 60).padStart(2, '0')}:00.000Z`,
      summary: `Event ${index}`,
    }));

    app.historyService.events.set(events);

    const historyPanel = document.createElement('article');
    historyPanel.setAttribute('data-history-panel', '');
    const historyHeader = document.createElement('header');
    historyHeader.setAttribute('data-history-header', '');
    const historyBody = document.createElement('div');
    historyBody.setAttribute('data-history-body', '');
    historyBody.style.display = 'grid';
    historyBody.style.gap = '18px';
    historyBody.style.padding = '10px 34px 28px';
    const historyPager = document.createElement('div');
    historyPager.setAttribute('data-history-pager', '');
    const historyList = document.createElement('ol');
    historyList.setAttribute('data-history-list', '');
    for (let index = 0; index < 5; index += 1) {
      const item = document.createElement('li');
      Object.defineProperty(item, 'clientHeight', {
        configurable: true,
        get: () => 78,
      });
      Object.defineProperty(item, 'scrollHeight', {
        configurable: true,
        get: () => 78,
      });
      item.getBoundingClientRect = () =>
        ({
          width: 320,
          height: 78,
          top: 0,
          right: 320,
          bottom: 78,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => '',
        }) as DOMRect;
      historyList.appendChild(item);
    }

    let panelHeight = 782;
    let bodyHeight = 620;
    let clientHeight = 500;
    let scrollHeight = 600;
    Object.defineProperty(historyPanel, 'clientHeight', {
      configurable: true,
      get: () => panelHeight,
    });
    historyPanel.getBoundingClientRect = () =>
      ({
        width: 320,
        height: panelHeight,
        top: 0,
        right: 320,
        bottom: panelHeight,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;
    Object.defineProperty(historyHeader, 'clientHeight', {
      configurable: true,
      get: () => 60,
    });
    historyHeader.getBoundingClientRect = () =>
      ({
        width: 320,
        height: 60,
        top: 0,
        right: 320,
        bottom: 60,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;
    Object.defineProperty(historyBody, 'clientHeight', {
      configurable: true,
      get: () => bodyHeight,
    });
    historyBody.getBoundingClientRect = () =>
      ({
        width: 320,
        height: bodyHeight,
        top: 0,
        right: 320,
        bottom: bodyHeight,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;
    Object.defineProperty(historyPager, 'clientHeight', {
      configurable: true,
      get: () => 42,
    });
    historyPager.getBoundingClientRect = () =>
      ({
        width: 320,
        height: 42,
        top: 0,
        right: 320,
        bottom: 42,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;
    Object.defineProperty(historyList, 'clientHeight', {
      configurable: true,
      get: () => clientHeight,
    });
    Object.defineProperty(historyList, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });
    historyList.getBoundingClientRect = () =>
      ({
        width: 320,
        height: clientHeight,
        top: 0,
        right: 320,
        bottom: clientHeight,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;

    historyBody.appendChild(historyPager);
    historyBody.appendChild(historyList);
    historyPanel.appendChild(historyHeader);
    historyPanel.appendChild(historyBody);
    document.body.appendChild(historyPanel);

    app['measureHistoryPageSize']();

    expect(app.historyPageSize()).toBe(8);
    expect(app.pagedHistory()).toHaveLength(8);
    expect(app.historyPageCount()).toBe(4);

    panelHeight = 470;
    bodyHeight = 420;
    clientHeight = 340;
    app['measureHistoryPageSize']();

    expect(app.historyPageSize()).toBe(4);
    expect(app.pagedHistory()).toHaveLength(4);
    expect(app.historyPageCount()).toBe(8);
  });

  it('should send smaller sticky heights after notes are removed', async () => {
    const resizeStickyWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      hideStickyWindow: vi.fn().mockResolvedValue(true),
      focusMainWindow: vi.fn().mockResolvedValue(true),
      minimizeStickyWindow: vi.fn().mockResolvedValue(true),
      notify: vi.fn().mockResolvedValue(true),
      openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      setReminderOverlayState: vi.fn().mockResolvedValue(true),
      saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      resizeStickyWindow,
      setStickyWindow: vi.fn().mockResolvedValue(true),
    };

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    Object.defineProperty(window.screen, 'availHeight', {
      configurable: true,
      value: 1600,
    });

    let measuredHeight = 612;
    const measureRoot = document.createElement('div');
    measureRoot.setAttribute('data-sticky-note-measure-root', '');
    Object.defineProperty(measureRoot, 'offsetHeight', {
      configurable: true,
      get: () => measuredHeight,
    });
    measureRoot.getBoundingClientRect = () =>
      ({
        width: 320,
        height: measuredHeight,
        top: 0,
        right: 320,
        bottom: measuredHeight,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;

    document.body.appendChild(measureRoot);

    app['measureAndResizeStickyWindow']('task-count-change');
    measuredHeight = 454;
    app['measureAndResizeStickyWindow']('task-count-change');
    measuredHeight = 308;
    app['measureAndResizeStickyWindow']('task-count-change');

    await Promise.resolve();

    expect(resizeStickyWindow).toHaveBeenNthCalledWith(1, {
      height: 612,
      reason: 'task-count-change',
    });
    expect(resizeStickyWindow).toHaveBeenNthCalledWith(2, {
      height: 454,
      reason: 'task-count-change',
    });
    expect(resizeStickyWindow).toHaveBeenNthCalledWith(3, {
      height: 308,
      reason: 'task-count-change',
    });
  });

  it('should ignore tiny sticky height jitter and resize on real height changes', () => {
    const resizeStickyWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      hideStickyWindow: vi.fn().mockResolvedValue(true),
      focusMainWindow: vi.fn().mockResolvedValue(true),
      minimizeStickyWindow: vi.fn().mockResolvedValue(true),
      notify: vi.fn().mockResolvedValue(true),
      openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      setReminderOverlayState: vi.fn().mockResolvedValue(true),
      saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      resizeStickyWindow,
      setStickyWindow: vi.fn().mockResolvedValue(true),
    };

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    Object.defineProperty(window.screen, 'availHeight', {
      configurable: true,
      value: 1600,
    });

    let measuredHeight = 500;
    const measureRoot = document.createElement('div');
    measureRoot.setAttribute('data-sticky-note-measure-root', '');
    Object.defineProperty(measureRoot, 'offsetHeight', {
      configurable: true,
      get: () => measuredHeight,
    });
    measureRoot.getBoundingClientRect = () =>
      ({
        width: 320,
        height: measuredHeight,
        top: 0,
        right: 320,
        bottom: measuredHeight,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;

    document.body.appendChild(measureRoot);

    app['measureAndResizeStickyWindow']('content-change');
    measuredHeight = 499;
    app['measureAndResizeStickyWindow']('content-change');
    measuredHeight = 503;
    app['measureAndResizeStickyWindow']('content-change');

    expect(resizeStickyWindow).toHaveBeenCalledTimes(2);
    expect(resizeStickyWindow).toHaveBeenNthCalledWith(1, {
      height: 500,
      reason: 'content-change',
    });
    expect(resizeStickyWindow).toHaveBeenNthCalledWith(2, {
      height: 503,
      reason: 'content-change',
    });

    measuredHeight = 504;
    app['measureAndResizeStickyWindow']('content-change');

    expect(resizeStickyWindow).toHaveBeenCalledTimes(2);
    expect(resizeStickyWindow).toHaveBeenLastCalledWith({
      height: 503,
      reason: 'content-change',
    });
  });

  it('should not send sticky resize IPC on color changes', async () => {
    const resizeStickyWindow = vi.fn().mockResolvedValue(true);
    const setStickyWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      hideStickyWindow: vi.fn().mockResolvedValue(true),
      focusMainWindow: vi.fn().mockResolvedValue(true),
      minimizeStickyWindow: vi.fn().mockResolvedValue(true),
      notify: vi.fn().mockResolvedValue(true),
      openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      setReminderOverlayState: vi.fn().mockResolvedValue(true),
      saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      resizeStickyWindow,
      setStickyWindow,
    };

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    vi.spyOn(app.settingsService, 'update').mockImplementation(async (changes) => {
      app.settingsService.settings.set({
        ...app.settingsService.settings(),
        ...changes,
      });
    });

    await app.setStickyNoteColor('green');
    await app.setStickyNoteColor('pink');
    await app.setStickyNoteColor('blue');

    expect(setStickyWindow).toHaveBeenCalledTimes(3);
    expect(resizeStickyWindow).not.toHaveBeenCalled();
  });

  it('should notify Electron when reminder overlay becomes active in the main window', async () => {
    const setReminderOverlayState = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      hideStickyWindow: vi.fn().mockResolvedValue(true),
      focusMainWindow: vi.fn().mockResolvedValue(true),
      minimizeStickyWindow: vi.fn().mockResolvedValue(true),
      notify: vi.fn().mockResolvedValue(true),
      openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      setReminderOverlayState,
      saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      resizeStickyWindow: vi.fn().mockResolvedValue(true),
      setStickyWindow: vi.fn().mockResolvedValue(true),
    };

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.reminderScheduler.activeReminder.set({
      taskId: 'task-1',
      taskName: 'Focus block',
      attemptNumber: 1,
      maxAttempts: 3,
      shownAt: new Date().toISOString(),
      message: 'A friendly reminder.',
    });
    await fixture.whenStable();

    expect(setReminderOverlayState).toHaveBeenLastCalledWith({
      active: true,
      stickyAlwaysOnTop: app.settingsService.settings().stickyNoteAlwaysOnTop,
    });
  });

  it('should keep sticky window interactive while reminder is active in sticky mode', async () => {
    const setReminderOverlayState = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      hideStickyWindow: vi.fn().mockResolvedValue(true),
      focusMainWindow: vi.fn().mockResolvedValue(true),
      minimizeStickyWindow: vi.fn().mockResolvedValue(true),
      notify: vi.fn().mockResolvedValue(true),
      openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      setReminderOverlayState,
      saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      resizeStickyWindow: vi.fn().mockResolvedValue(true),
      setStickyWindow: vi.fn().mockResolvedValue(true),
    };

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.windowMode.set('sticky');

    app.reminderScheduler.activeReminder.set({
      taskId: 'task-1',
      taskName: 'Focus block',
      attemptNumber: 1,
      maxAttempts: 3,
      shownAt: new Date().toISOString(),
      message: 'A friendly reminder.',
    });
    await fixture.whenStable();

    expect(setReminderOverlayState).toHaveBeenLastCalledWith({
      active: false,
      stickyAlwaysOnTop: app.settingsService.settings().stickyNoteAlwaysOnTop,
    });
  });

  it('should wire sticky reminder input and action buttons', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.windowMode.set('sticky');

    const addReminderTimeSpy = vi.spyOn(app, 'addReminderTime').mockResolvedValue();
    const pauseTaskSpy = vi.spyOn(app, 'pauseTask').mockResolvedValue();
    const completeTaskSpy = vi.spyOn(app, 'completeTask').mockResolvedValue();
    const dismissSpy = vi.spyOn(app.reminderScheduler, 'dismiss');

    app.reminderScheduler.activeReminder.set({
      taskId: 'task-1',
      taskName: 'Focus block',
      attemptNumber: 1,
      maxAttempts: 3,
      shownAt: new Date().toISOString(),
      message: 'A friendly reminder.',
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const reminderModal = host.querySelector('.friendly-reminder');
    expect(reminderModal).not.toBeNull();

    const input = host.querySelector('.friendly-reminder input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    input!.value = '17';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(app.extensionMinutes()).toBe(17);

    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.friendly-reminder .reminder-actions button'),
    );
    expect(buttons).toHaveLength(3);
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'More time',
      'Pause',
      'Complete',
    ]);

    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    host.querySelector<HTMLButtonElement>('.friendly-reminder .reminder-sheet-close')?.click();
    await fixture.whenStable();

    expect(addReminderTimeSpy).toHaveBeenCalledWith('task-1');
    expect(pauseTaskSpy).toHaveBeenCalledWith('task-1');
    expect(completeTaskSpy).toHaveBeenCalledWith('task-1');
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('should open the user guide from the sticky header info button', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.windowMode.set('sticky');
    const guideSpy = vi.spyOn(app, 'openUserGuide').mockResolvedValue();

    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const guideButton = host.querySelector<HTMLButtonElement>('.sticky-guide-button');

    expect(guideButton).not.toBeNull();
    guideButton!.click();

    expect(guideSpy).toHaveBeenCalledTimes(1);
  });

  it('should hide Sticky Note without changing its enabled setting', async () => {
    const hideStickyWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = createAssistantTimeApi({ hideStickyWindow });
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.settingsService.settings.update((settings) => ({
      ...settings,
      stickyNoteEnabled: true,
    }));

    expect(app.settingsService.settings().stickyNoteEnabled).toBe(true);
    await app.closeStickyWindow();

    expect(hideStickyWindow).toHaveBeenCalledOnce();
    expect(app.settingsService.settings().stickyNoteEnabled).toBe(true);
  });

  it('should keep the full app reminder actions unchanged', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.reminderScheduler.activeReminder.set({
      taskId: 'task-1',
      taskName: 'Focus block',
      attemptNumber: 1,
      maxAttempts: 3,
      shownAt: new Date().toISOString(),
      message: 'A friendly reminder.',
    });

    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('.friendly-reminder .reminder-actions button'),
    );

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Give me more time',
      'Pause task',
      'Task completed',
      'Dismiss for now',
    ]);
  });

  it('should sync the visible timer with the exact add-time click time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T10:10:00.000Z'));

    try {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      const addTimeSpy = vi.spyOn(app.taskService, 'addTime').mockResolvedValue(true);
      const dismissSpy = vi.spyOn(app.reminderScheduler, 'dismiss');

      app.timerService.now.set(new Date('2026-05-30T10:09:58.500Z'));
      app.extensionMinutes.set(1);
      app.reminderScheduler.activeReminder.set({
        taskId: 'task-1',
        taskName: 'Task 1',
        attemptNumber: 1,
        maxAttempts: 3,
        shownAt: '2026-05-30T10:09:59.000Z',
        message: 'A friendly reminder.',
      });

      await app.addReminderTime('task-1');

      const clickTime = new Date('2026-05-30T10:10:00.000Z');
      expect(addTimeSpy).toHaveBeenCalledWith('task-1', 1, clickTime);
      expect(app.timerService.now().toISOString()).toBe(clickTime.toISOString());
      expect(dismissSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should show a break-conflict modal instead of starting a task during a running break', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const startSpy = vi.spyOn(app.taskService, 'start').mockResolvedValue();

    app.taskService.tasks.set([pendingTask('task-2', 'Second task', 0)]);
    app.breakService.session.set({
      id: 'break-1',
      startedAt: '2026-05-30T10:30:00.000Z',
      durationMinutes: 10,
      remainingSeconds: 420,
      state: 'running',
    });

    await app.startTask('task-2');
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(startSpy).not.toHaveBeenCalled();
    expect(app.breakConflictTask()?.id).toBe('task-2');
    expect(host.querySelector('.break-conflict-modal')?.textContent).toContain(
      'Break time is still running',
    );
  });

  it('should keep the break running and preserve the selected next task after keep break', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const startSpy = vi.spyOn(app.taskService, 'start').mockResolvedValue();

    app.taskService.tasks.set([
      pendingTask('task-1', 'First task', 0),
      pendingTask('task-2', 'Second task', 1),
    ]);
    app.breakService.session.set({
      id: 'break-1',
      startedAt: '2026-05-30T10:30:00.000Z',
      durationMinutes: 10,
      remainingSeconds: 420,
      state: 'running',
    });

    await app.startTask('task-2');
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="break-conflict-keep-break"]')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(startSpy).not.toHaveBeenCalled();
    expect(app.breakService.state()).toBe('running');
    expect(app.currentTasks()).toEqual([]);
    expect(app.breakConflictTask()).toBeUndefined();
    expect(app.breakNextTaskCandidate()?.id).toBe('task-2');

    app.breakService.session.update((session) => ({ ...session, state: 'complete' }));
    await app.startNextTask();

    expect(startSpy).toHaveBeenCalledOnce();
    expect(startSpy).toHaveBeenCalledWith('task-2');
  });

  it('should stop the break early and start the selected task when confirmed', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const stopEarlySpy = vi.spyOn(app.breakService, 'stopEarly').mockImplementation(async () => {
      app.breakService.session.update((session) => ({
        ...session,
        state: 'idle',
        remainingSeconds: 0,
      }));
    });
    const startSpy = vi.spyOn(app.taskService, 'start').mockImplementation(async (taskId) => {
      app.taskService.tasks.update((tasks) =>
        tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status: 'active',
                activeStartedAt: '2026-05-30T10:35:00.000Z',
                nextReminderAt: task.reminderAt,
              }
            : task,
        ),
      );
    });

    app.taskService.tasks.set([pendingTask('task-2', 'Second task', 0)]);
    app.breakService.session.set({
      id: 'break-1',
      startedAt: '2026-05-30T10:30:00.000Z',
      durationMinutes: 10,
      remainingSeconds: 420,
      state: 'running',
    });

    await app.startTask('task-2');
    fixture.detectChanges();
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="break-conflict-start-now"]')
      ?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(stopEarlySpy).toHaveBeenCalledOnce();
    expect(startSpy).toHaveBeenCalledWith('task-2');
    expect(app.breakService.state()).toBe('idle');
    expect(app.currentTasks()[0]?.id).toBe('task-2');
    expect(app.deferredBreakTaskId()).toBeUndefined();
  });

  it('should resize sticky window for reminder open and shrink after reminder closes', () => {
    const resizeStickyWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      hideStickyWindow: vi.fn().mockResolvedValue(true),
      focusMainWindow: vi.fn().mockResolvedValue(true),
      minimizeStickyWindow: vi.fn().mockResolvedValue(true),
      notify: vi.fn().mockResolvedValue(true),
      openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      setReminderOverlayState: vi.fn().mockResolvedValue(true),
      saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      resizeStickyWindow,
      setStickyWindow: vi.fn().mockResolvedValue(true),
    };

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    Object.defineProperty(window.screen, 'availHeight', {
      configurable: true,
      value: 1600,
    });

    const measureRoot = document.createElement('div');
    measureRoot.setAttribute('data-sticky-note-measure-root', '');
    Object.defineProperty(measureRoot, 'offsetHeight', {
      configurable: true,
      get: () => 320,
    });
    measureRoot.getBoundingClientRect = () =>
      ({
        width: 320,
        height: 320,
        top: 0,
        right: 320,
        bottom: 320,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;
    document.body.appendChild(measureRoot);

    const backdrop = document.createElement('section');
    backdrop.className = 'friendly-backdrop';
    backdrop.style.padding = '24px';
    const reminder = document.createElement('article');
    reminder.className = 'friendly-reminder';
    Object.defineProperty(reminder, 'offsetHeight', {
      configurable: true,
      get: () => 420,
    });
    reminder.getBoundingClientRect = () =>
      ({
        width: 320,
        height: 420,
        top: 0,
        right: 320,
        bottom: 420,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => '',
      }) as DOMRect;
    backdrop.appendChild(reminder);
    document.body.appendChild(backdrop);

    app['measureAndResizeStickyWindow']('reminder-opened');
    backdrop.remove();
    app['measureAndResizeStickyWindow']('reminder-closed');

    expect(resizeStickyWindow).toHaveBeenNthCalledWith(1, {
      height: 468,
      reason: 'reminder-opened',
    });
    expect(resizeStickyWindow).toHaveBeenNthCalledWith(2, {
      height: 320,
      reason: 'reminder-closed',
    });
  });

  it('should keep pending task rendering bounded for large lists', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const tasks: Task[] = Array.from({ length: 4000 }, (_, index) => ({
      id: `task_${index}`,
      name: `Task ${index}`,
      note: '',
      category: '',
      reminderAt: '2026-05-30T10:30:00.000Z',
      reminderCount: 3,
      reminderIntervalMinutes: 5,
      allowConcurrentStart: false,
      order: index,
      status: 'pending',
      createdAt: '2026-05-30T10:00:00.000Z',
      updatedAt: '2026-05-30T10:00:00.000Z',
      totalPausedSeconds: 0,
      reminderAttemptsShown: 0,
    }));

    app.taskService.tasks.set(tasks);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(app.pendingPageCount()).toBe(1000);
    expect(app.pagedPendingTasks()).toHaveLength(4);
  });

  it('should keep history rendering bounded for large event lists', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const events: HistoryEvent[] = Array.from({ length: 5000 }, (_, index) => ({
      id: `event_${index}`,
      type: 'task_created',
      occurredAt: `2026-05-30T10:${String(index % 60).padStart(2, '0')}:00.000Z`,
      summary: `Event ${index}`,
    }));

    app.historyService.events.set(events);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(app.historyPageCount()).toBe(1000);
    expect(app.pagedHistory()).toHaveLength(5);
  });
});
