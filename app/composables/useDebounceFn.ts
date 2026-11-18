/**
 * Calls fn once the calls have stopped for ms; a pending call is dropped on unmount
 */
export function useDebounceFn<A extends unknown[]>(fn: (...args: A) => unknown, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  onScopeDispose(() => clearTimeout(timer));
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
