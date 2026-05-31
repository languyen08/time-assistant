import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { HistoryEvent } from './core/models/history-event';
import { Task } from './core/models/task';

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
      host.querySelectorAll<HTMLButtonElement>('.friendly-reminder .button-row button'),
    );
    expect(buttons).toHaveLength(4);

    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    buttons[3].click();
    await fixture.whenStable();

    expect(addReminderTimeSpy).toHaveBeenCalledTimes(1);
    expect(pauseTaskSpy).toHaveBeenCalledTimes(1);
    expect(completeActiveTaskSpy).toHaveBeenCalledTimes(1);
    expect(dismissSpy).toHaveBeenCalledTimes(1);
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
