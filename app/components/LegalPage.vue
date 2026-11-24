<template>
  <div class="legal-page">
    <header class="legal-topbar">
      <div class="legal-topbar-inner">
        <a href="/" class="legal-brand">
          <BrandMark />
          <span>Kingshot Rewards</span>
        </a>
      </div>
    </header>

    <main class="legal">
      <h1 class="legal-title">{{ title }}</h1>
      <p class="legal-meta">시행일: {{ effectiveDate }} · 최종 개정일: {{ updatedDate }}</p>
      <article class="legal-body">
        <slot />
      </article>
      <a href="/" class="legal-back">← 메인으로 돌아가기</a>
    </main>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; effectiveDate: string; updatedDate: string }>()
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
