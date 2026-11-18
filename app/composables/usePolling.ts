/**
 * Runs fn every ms, scheduling the next run only after the previous one finished. While the document
 * is hidden the loop pauses and runs again as soon as it is visible. Stops on unmount.
 */
export function usePolling(
  fn: () => unknown,
  ms: number,
  { pauseWhenHidden = true, immediate = false }: { pauseWhenHidden?: boolean; immediate?: boolean } = {},
) {
  let active = false;
  // Bumped by start/stop: a run left over from an earlier start never re-arms
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;

  const paused = () => pauseWhenHidden && document.hidden;

  async function run(gen: number) {
    timer = undefined;
    // Paused: onVisible starts the loop again
    if (paused()) return;
    inFlight = true;
    try {
      await fn();
    } catch (e) {
      console.error('Polling run failed:', e);
    } finally {
      if (gen === generation) inFlight = false;
    }
    if (gen === generation && !paused()) timer = setTimeout(() => run(gen), ms);
  }

  function onVisible() {
    if (active && !document.hidden && !timer && !inFlight) run(generation);
  }

  // firstDelayMs: wait before the first run (default: 0 with immediate, else ms)
  function start(firstDelayMs = immediate ? 0 : ms) {
    if (active) return;
    active = true;
    inFlight = false;
    const gen = ++generation;
    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVisible);
    timer = setTimeout(() => run(gen), firstDelayMs);
  }

  function stop() {
    if (!active) return;
    active = false;
    generation++;
    clearTimeout(timer);
    timer = undefined;
    document.removeEventListener('visibilitychange', onVisible);
  }

  onScopeDispose(stop);

  return { start, stop };
}
