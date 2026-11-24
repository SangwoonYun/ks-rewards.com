<template>
  <label class="lang-switcher">
    <svg class="lang-switcher-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
    </svg>
    <span class="sr-only">{{ t('common.language') }}</span>
    <select :value="locale" @change="onChange">
      <option v-for="item in locales" :key="item.code" :value="item.code" :lang="item.language">{{ FLAGS[item.code] }} {{ item.name }}</option>
    </select>
  </label>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'

const { t, locale, locales, setLocale } = useI18n()

// A flag for the country most associated with each language (pt: Brazilian usage in the translations)
const FLAGS: Record<string, string> = {
  ko: '🇰🇷', en: '🇺🇸', ja: '🇯🇵', 'zh-tw': '🇹🇼', 'zh-cn': '🇨🇳', de: '🇩🇪', fr: '🇫🇷', ru: '🇷🇺',
  tr: '🇹🇷', es: '🇪🇸', it: '🇮🇹', pl: '🇵🇱', pt: '🇧🇷', th: '🇹🇭', id: '🇮🇩'
}

// setLocale navigates to the same page in the chosen language and remembers the choice in the cookie
function onChange(event: Event) {
  setLocale((event.target as HTMLSelectElement).value as typeof locale.value)
}
</script>

<style scoped>
.lang-switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--text-2);
}

.lang-switcher-icon {
  position: absolute;
  left: 10px;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.lang-switcher select {
  height: 34px;
  padding: 0 10px 0 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.lang-switcher select:hover {
  border-color: var(--border-strong);
}

.lang-switcher select:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
