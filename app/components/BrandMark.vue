<template>
  <svg class="brand-logo" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient :id="`${id}-bg`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1e293b" />
        <stop offset="1" stop-color="#0f172a" />
      </linearGradient>
      <linearGradient :id="`${id}-gold`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fde68a" />
        <stop offset="1" stop-color="#f59e0b" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" :fill="`url(#${id}-bg)`" />
    <path d="M8.5 21 7 11.8l4.6 3.4L16 8.6l4.4 6.6 4.6-3.4L23.5 21z" :fill="`url(#${id}-gold)`" stroke="#fbbf24" stroke-width="0.6" stroke-linejoin="round" />
    <rect x="8.5" y="22.4" width="15" height="2.6" rx="1.2" :fill="`url(#${id}-gold)`" />
    <circle cx="7" cy="11.2" r="1.5" fill="#fef3c7" />
    <circle cx="16" cy="7.8" r="1.6" fill="#fef3c7" />
    <circle cx="25" cy="11.2" r="1.5" fill="#fef3c7" />
    <circle cx="16" cy="17.4" r="1.7" fill="#0f172a" opacity="0.35" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 30 });

// Each instance needs its own gradient ids: the admin layout renders two marks and one of them sits
// inside a display:none header, where a shared gradient id would stop painting.
const id = useId();
</script>

<style scoped>
.brand-logo {
  display: block;
  flex-shrink: 0;
}
</style>
