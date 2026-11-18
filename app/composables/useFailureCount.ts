// The badge runs on its own, apart from page loads: a first fetch once the page had time to load its own data,
// then a poll. The server returns a cached count (see server/utils/failureCount), so a poll is cheap.
const FIRST_FETCH_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 60000;

/**
 * Number of users on the redemption failures page, shared by the sidebar badge and the page itself
 */
export function useFailureCount() {
  const count = useState<number>('redemption-failure-count', () => 0);

  async function refresh() {
    try {
      const res = await $fetch<{ total: number }>('/api/admin/users/redemption-failures-count');
      count.value = res.total;
    } catch {
      // Keep the last known count; the badge is only a hint
    }
  }

  // Paused while the tab is hidden (no badge to show), catching up when it is back
  const { start, stop } = usePolling(refresh, POLL_INTERVAL_MS);

  /**
   * Start the background refresh; returns a function that stops it
   */
  function startPolling(): () => void {
    start(FIRST_FETCH_DELAY_MS);
    return stop;
  }

  return { count, startPolling };
}
