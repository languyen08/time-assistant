// Activated only by the Electron profiling query (or a local browser diagnostic URL).
const query = new URLSearchParams(globalThis.location?.search ?? '');
export const startupProfileEnabled = query.get('startupProfile') === '1';
type Checkpoint = { name: string; ms: number; durationMs?: number; count?: number };
const checkpoints: Checkpoint[] = [];
const counters: Record<string, number> = {};
const longTasks: { ms: number; durationMs: number }[] = [];
const longFrames: {
  ms: number;
  durationMs: number;
  blockingDuration: number;
  scripts: unknown[];
}[] = [];
const frames: { ms: number; gapMs: number }[] = [];
const observers: PerformanceObserver[] = [];
let collecting = startupProfileEnabled;
let frameId: number | undefined;
const visibleStart = Number(query.get('shownEpochMs')) - performance.timeOrigin;
const visibleEnd = visibleStart + 5000;
function inVisibleWindow(ms: number, duration = 0): boolean {
  // Retain the full startup recording; runner selects the actual native show interval.
  return ms + duration >= 0;
}
export function startupMark(name: string, count?: number): void {
  if (collecting)
    checkpoints.push({ name, ms: performance.now(), ...(count === undefined ? {} : { count }) });
}
export function startupCount(name: string): void {
  if (collecting) counters[name] = (counters[name] ?? 0) + 1;
}
export function startupSpan(name: string): (count?: number) => void {
  if (!collecting) return () => {};
  const ms = performance.now();
  return (count?: number) => {
    if (collecting)
      checkpoints.push({
        name,
        ms,
        durationMs: performance.now() - ms,
        ...(count === undefined ? {} : { count }),
      });
  };
}
export function startupRendered(): void {
  if (!collecting) return;
  startupMark('initial-render-after-data');
  requestAnimationFrame(() => {
    startupMark('first-rAF-after-data');
    requestAnimationFrame(() => startupMark('second-rAF-after-data'));
  });
}
export function finishStartupProfile(): void {
  if (!startupProfileEnabled) return;
  // Hidden Scheduler has no useful paint. It still reports service timings.
  const mode = query.get('window');
  const deadline = performance.now() + 5500;
  setTimeout(
    () => {
      observers.forEach((observer) => observer.disconnect());
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      const report = {
        mode,
        timeOrigin: performance.timeOrigin,
        checkpoints,
        counters,
        paints: performance
          .getEntriesByType('paint')
          .map(({ name, startTime }) => ({ name, ms: startTime })),
        visibleWindow: {
          startMs: visibleStart,
          endMs: visibleEnd,
          observedFromMs: checkpoints[0]?.ms,
        },
        jank: {
          longTasks,
          longFrames,
          frames,
          frameCount: frames.length,
          gapsOver50Ms: frames.filter((frame) => frame.gapMs > 50),
          maxFrameGapMs: Math.max(0, ...frames.map((frame) => frame.gapMs)),
        },
      };
      collecting = false;
      console.info('[startup-profile]' + JSON.stringify(report));
    },
    Math.max(0, deadline - performance.now()),
  );
}
if (startupProfileEnabled) {
  startupMark('renderer-script-entry');
  for (const type of ['longtask', 'long-animation-frame']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!inVisibleWindow(entry.startTime, entry.duration)) continue;
        if (type === 'longtask')
          longTasks.push({ ms: entry.startTime, durationMs: entry.duration });
        else {
          const frame = entry as PerformanceEntry & {
            blockingDuration: number;
            scripts: {
              sourceFunctionName: string;
              sourceURL: string;
              duration: number;
              forcedStyleAndLayoutDuration: number;
            }[];
          };
          longFrames.push({
            ms: entry.startTime,
            durationMs: entry.duration,
            blockingDuration: frame.blockingDuration,
            scripts: frame.scripts.map(
              ({ sourceFunctionName, sourceURL, duration, forcedStyleAndLayoutDuration }) => ({
                sourceFunctionName,
                sourceURL,
                duration,
                forcedStyleAndLayoutDuration,
              }),
            ),
          });
        }
      }
    });
    observer.observe({ type, buffered: true });
    observers.push(observer);
  }
  if (query.get('window') !== 'scheduler') {
    let previous = performance.now();
    const frame = (ms: number) => {
      if (inVisibleWindow(ms)) frames.push({ ms, gapMs: ms - previous });
      previous = ms;
      if (collecting) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
  }
}
