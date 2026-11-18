<template>
  <div v-if="flash" class="result-banner" :class="flash.success ? 'result-success' : 'result-error'">
    {{ flash.message }}
    <button class="dismiss-btn" @click="emit('dismiss')">&times;</button>
  </div>
</template>

<script setup lang="ts">
import type { Flash } from '~/composables/useFlash';

defineProps<{ flash: Flash | null }>();
const emit = defineEmits<{ dismiss: [] }>();
</script>
