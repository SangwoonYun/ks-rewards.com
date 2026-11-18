<template>
  <img :src="failed || !src ? DEFAULT_AVATAR : src" :alt="alt" referrerpolicy="no-referrer" @error="failed = true" />
</template>

<script setup lang="ts">
const DEFAULT_AVATAR = '/images/default-avatar.png';

const props = defineProps<{ src?: string | null; alt?: string }>();

// A broken avatar falls back to the default one; a new src gets its own try
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
</script>
