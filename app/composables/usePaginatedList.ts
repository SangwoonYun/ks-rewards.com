import type { Ref } from 'vue';

interface PaginatedListOptions {
  // Key of the item array in the response
  itemsKey: string;
  pageSize?: number;
  // Filters and sort sent with every page
  params?: () => Record<string, any>;
  // Endpoints with their own pagination names (the priority queue)
  limitParam?: string;
  offsetParam?: string;
  totalKey?: string;
  hasMoreKey?: string;
  // Every applied page, for the extra fields of the response (stats, counts)
  onResponse?: (res: any) => void;
}

/**
 * Infinite-scroll list: refresh() loads the first page, loadMore() appends the next one; rendering the
 * sentinel element (inside rootRef, the scroll box) at the end of the list triggers loadMore().
 * A response of a list that was reset since (refresh) is dropped, so an older response never wins.
 */
export function usePaginatedList<T>(url: string, options: PaginatedListOptions) {
  const {
    itemsKey,
    pageSize = 50,
    params = () => ({}),
    limitParam = 'limit',
    offsetParam = 'offset',
    totalKey = 'total',
    hasMoreKey = 'hasMore',
    onResponse,
  } = options;

  const items = ref([]) as Ref<T[]>;
  const total = ref(0);
  const hasMore = ref(false);
  // Pages call refresh() on mount: no empty-list message before the first page
  const loading = ref(true);
  const rootRef = ref<HTMLElement | null>(null);
  const sentinelRef = ref<HTMLElement | null>(null);

  // Bumped by every refresh: a response of an older generation is dropped
  let generation = 0;

  async function load(reset: boolean) {
    if (reset) {
      generation++;
      items.value = [];
    }
    const gen = generation;
    const offset = items.value.length;
    loading.value = true;
    try {
      const res: any = await $fetch(url, {
        params: { ...params(), [limitParam]: String(pageSize), [offsetParam]: String(offset) },
      });
      if (gen !== generation) return;
      if (reset) items.value = res[itemsKey];
      else items.value.push(...res[itemsKey]);
      total.value = res[totalKey];
      hasMore.value = res[hasMoreKey];
      onResponse?.(res);
    } catch (e) {
      if (gen === generation) console.error(`Failed to fetch ${url}:`, e);
    } finally {
      if (gen === generation) loading.value = false;
    }
  }

  const refresh = () => load(true);

  function loadMore() {
    if (loading.value || !hasMore.value) return;
    return load(false);
  }

  let observer: IntersectionObserver | null = null;
  watch(sentinelRef, (el) => {
    observer?.disconnect();
    observer = null;
    if (!el || !rootRef.value) return;
    observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { root: rootRef.value, threshold: 0 });
    observer.observe(el);
  });
  onScopeDispose(() => observer?.disconnect());

  return { items, total, hasMore, loading, refresh, loadMore, rootRef, sentinelRef };
}
