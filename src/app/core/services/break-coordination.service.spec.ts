import { BreakCoordinationService } from './break-coordination.service';

class FakeBroadcastChannel {
  static readonly instances: FakeBroadcastChannel[] = [];
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();
  private closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown): void {
    for (const channel of FakeBroadcastChannel.instances) {
      if (channel !== this && !channel.closed && channel.name === this.name) {
        for (const listener of channel.listeners) {
          listener({ data: message } as MessageEvent<unknown>);
        }
      }
    }
  }

  addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.add(listener);
  }

  close(): void {
    this.closed = true;
  }
}

describe('BreakCoordinationService', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  let main: BreakCoordinationService;
  let sticky: BreakCoordinationService;
  let scheduler: BreakCoordinationService;

  beforeEach(() => {
    FakeBroadcastChannel.instances.length = 0;
    globalThis.BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;
    main = new BreakCoordinationService();
    sticky = new BreakCoordinationService();
    scheduler = new BreakCoordinationService();
  });

  afterEach(() => {
    main.stop();
    sticky.stop();
    scheduler.stop();
    globalThis.BroadcastChannel = originalBroadcastChannel;
    vi.useRealTimers();
  });

  function idleSession(sessionId: string) {
    return { sessionId };
  }

  function runningSession(sessionId: string, durationMinutes = 10) {
    return {
      sessionId,
      endsAt: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
    };
  }

  it('reports blocked when Main is idle and Sticky is running', () => {
    main.startVisible('idle', idleSession('main-idle'));
    sticky.startVisible('running', runningSession('sticky-break'));
    scheduler.startScheduler();

    expect(scheduler.blocked()).toBe(true);
  });

  it('reports blocked when Main is prompting and Sticky is idle', () => {
    main.startVisible('prompt', idleSession('main-prompt'));
    sticky.startVisible('idle', idleSession('sticky-idle'));
    scheduler.startScheduler();

    expect(scheduler.blocked()).toBe(true);
  });

  it('reports unblocked when all sources are idle', () => {
    main.startVisible('idle', idleSession('main-idle'));
    sticky.startVisible('idle', idleSession('sticky-idle'));
    scheduler.startScheduler();

    expect(scheduler.blocked()).toBe(false);
  });

  it('becomes unblocked when a source changes from running to complete', () => {
    main.startVisible('running', runningSession('main-break'));
    scheduler.startScheduler();

    main.publish('complete', idleSession('main-break'));

    expect(scheduler.blocked()).toBe(false);
  });

  it('retains a running break when its blocking source releases', () => {
    main.startVisible('running', runningSession('main-break'));
    scheduler.startScheduler();

    main.stop();

    expect(scheduler.blocked()).toBe(true);
  });

  it('requests and receives the current visible state when Scheduler starts later', () => {
    main.startVisible('running', runningSession('main-break'));

    scheduler.startScheduler();

    expect(scheduler.blocked()).toBe(true);
  });

  it('does not let an idle source overwrite another source running state', () => {
    main.startVisible('running', runningSession('main-break'));
    sticky.startVisible('idle', idleSession('sticky-idle'));
    scheduler.startScheduler();

    sticky.publish('idle', idleSession('sticky-idle'));

    expect(scheduler.blocked()).toBe(true);
  });

  it('keeps a running break blocked after its source releases and expires it on time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T10:00:00.000Z'));
    const reevaluate = vi.fn();
    main.startVisible('running', {
      sessionId: 'main-break',
      endsAt: '2026-05-30T10:10:00.000Z',
    });
    scheduler.startScheduler();
    scheduler.subscribe(reevaluate);

    main.stop();
    expect(scheduler.blocked()).toBe(true);

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(scheduler.blocked()).toBe(false);
    expect(reevaluate).toHaveBeenCalledOnce();
  });

  it('does not let a recreated Main idle state clear a retained running break', () => {
    main.startVisible('running', runningSession('main-break'));
    scheduler.startScheduler();
    main.stop();

    sticky.startVisible('idle', idleSession('recreated-main-idle'));

    expect(scheduler.blocked()).toBe(true);
  });

  it('clears a retained running break when the same session explicitly stops early', () => {
    main.startVisible('running', runningSession('main-break'));
    scheduler.startScheduler();
    sticky.startVisible('idle', idleSession('sticky-idle'));

    sticky.publish('idle', idleSession('main-break'));

    expect(scheduler.blocked()).toBe(false);
  });
});
