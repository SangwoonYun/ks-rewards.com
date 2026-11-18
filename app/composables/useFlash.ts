export interface Flash {
  success: boolean;
  message: string;
}

/**
 * A result message (see ResultBanner), optionally dismissed after ttlMs. A newer message replaces the
 * older one along with its timer.
 */
export function useFlash() {
  const flash = ref<Flash | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clear() {
    clearTimeout(timer);
    flash.value = null;
  }

  function show(success: boolean, message: string, ttlMs?: number) {
    clearTimeout(timer);
    flash.value = { success, message };
    if (ttlMs) timer = setTimeout(() => { flash.value = null; }, ttlMs);
  }

  onScopeDispose(() => clearTimeout(timer));

  return { flash, show, clear };
}
