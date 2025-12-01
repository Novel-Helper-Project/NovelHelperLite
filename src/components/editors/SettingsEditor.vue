<template>
  <TabContentWrapper>
    <SettingsComponent />
  </TabContentWrapper>
</template>

<script setup lang="ts">
import type { OpenFile } from 'src/stores/workspace';
import SettingsComponent from '../SettingsComponent.vue';
import TabContentWrapper from '../TabContentWrapper.vue';

defineProps<{
  file: OpenFile;
}>();
</script>
