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
    order,
    status: 'pending',
    createdAt: '2026-05-30T10:00:00.000Z',
    updatedAt: '2026-05-30T10:00:00.000Z',
    totalPausedSeconds: 0,
    reminderAttemptsShown: 0,
    ...overrides,
  };
}

describe('App', () => {
  const originalAssistantTime = window.assistantTime;
  const originalAvailHeight = window.screen.availHeight;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => {
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

  it('should render the compact app header', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#app-title')?.textContent).toContain('Time Assistant');
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

  it('should render a close button beside settings in Electron mode and wire it', async () => {
    const closeMainWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      closeApp: vi.fn().mockResolvedValue(true),
      closeMainWindow,
      focusMainWindow: vi.fn().mockResolvedValue(true),
      minimizeStickyWindow: vi.fn().mockResolvedValue(true),
      notify: vi.fn().mockResolvedValue(true),
      openTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      setReminderOverlayState: vi.fn().mockResolvedValue(true),
      saveTextFile: vi.fn().mockResolvedValue({ ok: false, canceled: true }),
      resizeStickyWindow: vi.fn().mockResolvedValue(true),
      setStickyWindow: vi.fn().mockResolvedValue(true),
    };

    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const closeSpy = vi.spyOn(app, 'closeMainWindow').mockResolvedValue();
    app.loading.set(true);

    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const closeButton = host.querySelector<HTMLButtonElement>(
      '.topbar .nav-tabs button[aria-label="Close main window"]',
    );

    expect(closeButton).not.toBeNull();
    closeButton!.click();

    expect(closeSpy).toHaveBeenCalledTimes(1);
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
      closeApp: vi.fn().mockResolvedValue(true),
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
      closeApp: vi.fn().mockResolvedValue(true),
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
      closeApp: vi.fn().mockResolvedValue(true),
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
      closeApp: vi.fn().mockResolvedValue(true),
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
      closeApp: vi.fn().mockResolvedValue(true),
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
    app.isStickyMode.set(true);

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
    app.isStickyMode.set(true);

    const addReminderTimeSpy = vi.spyOn(app, 'addReminderTime').mockResolvedValue();
    const pauseTaskSpy = vi.spyOn(app, 'pauseTask').mockResolvedValue();
    const completeActiveTaskSpy = vi.spyOn(app, 'completeActiveTask').mockResolvedValue();
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

    expect(addReminderTimeSpy).toHaveBeenCalledTimes(1);
    expect(pauseTaskSpy).toHaveBeenCalledTimes(1);
    expect(completeActiveTaskSpy).toHaveBeenCalledTimes(1);
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });

  it('should open the user guide from the sticky header info button', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.isStickyMode.set(true);
    const guideSpy = vi.spyOn(app, 'openUserGuide').mockResolvedValue();

    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const guideButton = host.querySelector<HTMLButtonElement>('.sticky-guide-button');

    expect(guideButton).not.toBeNull();
    guideButton!.click();

    expect(guideSpy).toHaveBeenCalledTimes(1);
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
      const addTimeSpy = vi.spyOn(app.taskService, 'addTimeToActive').mockResolvedValue();
      const dismissSpy = vi.spyOn(app.reminderScheduler, 'dismiss');

      app.timerService.now.set(new Date('2026-05-30T10:09:58.500Z'));
      app.extensionMinutes.set(1);

      await app.addReminderTime();

      const clickTime = new Date('2026-05-30T10:10:00.000Z');
      expect(addTimeSpy).toHaveBeenCalledWith(1, clickTime);
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
    expect(app.currentTask()).toBeUndefined();
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
    expect(app.currentTask()?.id).toBe('task-2');
    expect(app.deferredBreakTaskId()).toBeUndefined();
  });

  it('should resize sticky window for reminder open and shrink after reminder closes', () => {
    const resizeStickyWindow = vi.fn().mockResolvedValue(true);
    window.assistantTime = {
      platform: 'win32',
      closeApp: vi.fn().mockResolvedValue(true),
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
