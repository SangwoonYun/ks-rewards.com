import type { Ref } from 'vue';

/**
 * Set of selected keys (table checkboxes); every change replaces the Set so it stays reactive
 */
export function useSelection<K>() {
  const selected = ref(new Set<K>()) as Ref<Set<K>>;

  const has = (key: K) => selected.value.has(key);

  function toggle(key: K) {
    const next = new Set(selected.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected.value = next;
  }

  // Selects (on) or unselects every key of keys
  function setAll(keys: K[], on: boolean) {
    const next = new Set(selected.value);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    selected.value = next;
  }

  // Keeps only the keys still in keys
  function retain(keys: Iterable<K>) {
    const keep = new Set(keys);
    selected.value = new Set([...selected.value].filter(key => keep.has(key)));
  }

  function clear() {
    selected.value = new Set();
  }

  return { selected, has, toggle, setAll, retain, clear };
}
