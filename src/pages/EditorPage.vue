<template>
  <q-page class="q-pa-md column no-wrap" style="height: 100%;">
    <q-tabs
      v-model="activeTab"
      dense
      class="text-grey-8"
      active-color="primary"
      active-bg-color="blue-1"
      indicator-color="primary"
      align="justify"
      narrow-indicator
    >
      <q-tab name="editor" label="编辑器" />
      <q-tab name="settings" label="设置" />
    </q-tabs>

    <q-separator />

    <q-tab-panels v-model="activeTab" animated>
      <q-tab-panel name="editor" class="q-pa-none">
        <MonacoEditorPane />
      </q-tab-panel>

      <q-tab-panel name="settings" class="q-pa-none">
        <SettingsComponent />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import MonacoEditorPane from 'components/MonacoEditorPane.vue';
import SettingsComponent from 'components/SettingsComponent.vue';

const activeTab = ref('editor');

// 监听来自侧栏的打开设置标签事件
function handleOpenSettingsTab(event: Event) {
  if (event instanceof CustomEvent) {
    activeTab.value = 'settings';
  }
}

onMounted(() => {
  window.addEventListener('openSettingsTab', handleOpenSettingsTab);
});

onUnmounted(() => {
  window.removeEventListener('openSettingsTab', handleOpenSettingsTab);
});
</script>
