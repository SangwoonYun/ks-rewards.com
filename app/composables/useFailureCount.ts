// The badge runs on its own, apart from page loads: a first fetch once the page had time to load its own data,
// then a poll. The server returns a cached count (see server/utils/failureCount), so a poll is cheap.
const FIRST_FETCH_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 60000;

/**
 * Number of users on the redemption failures page, shared by the sidebar badge and the page itself
 */
export function useFailureCount() {
  const count = useState<number>('redemption-failure-count', () => 0);

  let inFlight = false;
  async function refresh() {
    // A slow query must not pile up requests; a hidden tab has no badge to show
    if (inFlight || document.hidden) return;
    inFlight = true;
    try {
      const res = await $fetch<{ total: number }>('/api/admin/users/redemption-failures-count');
      count.value = res.total;
    } catch {
      // Keep the last known count; the badge is only a hint
    } finally {
      inFlight = false;
    }
  }

  /**
   * Start the background refresh; returns a function that stops it
   */
  function startPolling(): () => void {
    const firstFetch = setTimeout(refresh, FIRST_FETCH_DELAY_MS);
    const poll = setInterval(refresh, POLL_INTERVAL_MS);
    // Back on the tab: catch up right away instead of waiting for the next tick
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(firstFetch);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  return { count, startPolling };
}
