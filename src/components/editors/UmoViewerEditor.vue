<template>
  <div class="umo-viewer-wrapper">
    <UmoViewer
      v-if="pdfUrl"
      :pdf="pdfUrl"
      :html="htmlContent"
      :title="file.name"
      :lang="lang"
      :theme="theme"
      :mode="['pdf']"
      :fit-width="true"
      :show-header="true"
      :show-aside="false"
      :printable="true"
      :downloadable="true"
    />
    <div v-else class="umo-viewer-empty">
      <div class="empty-icon">📄</div>
      <div>无法加载 PDF 文件</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { UmoViewer } from '@umoteam/viewer';
import '@umoteam/viewer/style';
import type { OpenFile } from 'src/stores/workspace';
import { useSettingsStore } from 'src/stores/settings';

const props = defineProps<{
  file: OpenFile;
}>();

const pdfUrl = computed(() => props.file.mediaUrl || '');
const htmlContent = computed(() => props.file.content && props.file.content.trim() ? props.file.content : '<div></div>');
const settingsStore = useSettingsStore();
const lang = computed(() => 'zh-CN');
const theme = computed(() => (settingsStore.isDarkMode ? 'dark' : 'light'));
</script>

<style scoped>
.umo-viewer-wrapper {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--vscode-editor-background, #0f172a);
}

.umo-viewer-wrapper :deep(.umo-viewer) {
  height: 100%;
}

.umo-viewer-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--vscode-muted, #94a3b8);
}

.empty-icon {
  font-size: 32px;
}
</style>
