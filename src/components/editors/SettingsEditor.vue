<template>
  <div class="settings-editor-wrapper">
    <SettingsComponent />
  </div>
</template>

<script setup lang="ts">
import type { OpenFile } from 'src/stores/workspace';
import SettingsComponent from '../SettingsComponent.vue';

defineProps<{
  file: OpenFile;
}>();
</script>

<style scoped>
.settings-editor-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
