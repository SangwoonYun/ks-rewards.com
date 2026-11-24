<template>
  <div class="legal-page">
    <header class="legal-topbar">
      <div class="legal-topbar-inner">
        <NuxtLinkLocale to="/" class="legal-brand">
          <BrandMark />
          <span>Kingshot Rewards</span>
        </NuxtLinkLocale>
        <LanguageSwitcher />
      </div>
    </header>

    <main class="legal">
      <h1 class="legal-title">{{ title }}</h1>
      <p class="legal-meta">
        {{ t('legal.effectiveDate', { date: formatLegalDate(effectiveDate) }) }} ·
        {{ t('legal.updatedDate', { date: formatLegalDate(updatedDate) }) }}
      </p>
      <!-- The Korean text is the original; every other language is a machine translation of it -->
      <div v-if="locale !== 'ko'" class="legal-mt-notice" role="note">
        <svg class="legal-mt-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
        </svg>
        <p>
          {{ t('legal.machineTranslation') }}
          <NuxtLink :to="switchLocalePath('ko')" lang="ko">{{ t('legal.viewOriginal') }}</NuxtLink>
        </p>
      </div>
      <article class="legal-body">
        <component :is="content" />
      </article>
      <NuxtLinkLocale to="/" class="legal-back">{{ t('legal.back') }}</NuxtLinkLocale>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue'
import { useHead, useI18n, useSwitchLocalePath } from '#imports'

type LegalDoc = 'privacy' | 'terms'

// Dates as YYYY-MM-DD
const props = defineProps<{ doc: LegalDoc; effectiveDate: string; updatedDate: string }>()

const { t, locale, localeProperties } = useI18n()
const switchLocalePath = useSwitchLocalePath()

// One body per document and language: ~/legal/<doc>/<locale>.vue (ko is the original)
const bodies = import.meta.glob<Component>('../legal/*/*.vue', { import: 'default' })

const content = computed(() => {
  const load = bodies[`../legal/${props.doc}/${locale.value}.vue`] ?? bodies[`../legal/${props.doc}/ko.vue`]!
  return defineAsyncComponent(load)
})

const title = computed(() => t(props.doc === 'privacy' ? 'legal.privacyTitle' : 'legal.termsTitle'))

function formatLegalDate(date: string) {
  // Noon UTC so the date is the same in every time zone
  return new Intl.DateTimeFormat(localeProperties.value.language, { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`))
}

useLocaleSeo()
useHead(() => ({ title: `${title.value} — Kingshot Rewards` }))
</script>

<style>
.legal-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
}

.legal-topbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.legal-topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 800px;
  height: 60px;
  margin: 0 auto;
  padding: 0 20px;
}

.legal-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
}

.legal {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 20px 64px;
}

.legal-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.legal-meta {
  margin: 8px 0 32px;
  font-size: 0.875rem;
  color: var(--text-3);
}

.legal-mt-notice {
  display: flex;
  gap: 10px;
  margin: -16px 0 32px;
  padding: 12px 14px;
  border: 1px solid var(--warning);
  border-radius: var(--radius);
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.875rem;
  line-height: 1.6;
}

.legal-mt-notice p {
  margin: 0;
}

.legal-mt-notice a {
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.legal-mt-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.legal-body {
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--text-2);
  word-break: keep-all;
}

.legal-body h2 {
  margin: 36px 0 10px;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text);
}

.legal-body p,
.legal-body ul,
.legal-body ol {
  margin: 0 0 10px;
}

.legal-body ul,
.legal-body ol {
  padding-left: 1.25em;
}

.legal-body a {
  color: var(--primary-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.legal-table-wrap {
  margin: 10px 0 14px;
  overflow-x: auto;
}

.legal-body table {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.legal-body th,
.legal-body td {
  padding: 8px 10px;
  border: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.legal-body th {
  background: var(--surface-2);
  font-weight: 600;
  color: var(--text);
}

.legal-back {
  display: inline-block;
  margin-top: 40px;
  font-size: 0.875rem;
  color: var(--text-3);
  text-decoration: none;
}

.legal-back:hover {
  color: var(--text);
}

@media (max-width: 640px) {
  .legal-topbar-inner {
    height: 56px;
    padding: 0 16px;
  }

  .legal {
    padding: 28px 16px 48px;
  }

  .legal-title {
    font-size: 1.5rem;
  }
}
</style>
