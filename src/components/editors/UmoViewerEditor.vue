<template>
  <div class="umo-viewer-wrapper" ref="containerRef">
    <div v-if="!pdfUrl" class="umo-viewer-empty">
      <div class="empty-icon">📄</div>
      <div>无法加载 PDF 文件</div>
    </div>
    <div v-else ref="viewerContainer" class="umo-viewer-container"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick, h, type Component } from 'vue';
import type { OpenFile } from 'src/stores/workspace';
import { useSettingsStore } from 'src/stores/settings';
import { useWorkspaceStore } from 'src/stores/workspace';
import { createApp, type App } from 'vue';

const props = defineProps<{
  file: OpenFile;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const viewerContainer = ref<HTMLDivElement | null>(null);
const pdfUrl = computed(() => props.file.mediaUrl || '');
const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const theme = computed(() => (settingsStore.isDarkMode ? 'dark' : 'light'));

let viewerApp: App | null = null;

// 全局备份管理（用于跨组件实例共享）
interface AddEventListenerBackup {
  original: typeof EventTarget.prototype.addEventListener | null; // 原始的 addEventListener
  polluted: typeof EventTarget.prototype.addEventListener | null; // 被 UmoViewer 污染后的 addEventListener
  activePdfFiles: Set<string>; // 当前打开的 PDF 文件路径
}

// 使用 window 对象存储全局状态，确保跨组件实例共享
const BACKUP_KEY = '__umoViewerAddEventListenerBackup__';
function getBackup(): AddEventListenerBackup {
  const win = window as unknown as Record<string, AddEventListenerBackup>;
  if (!win[BACKUP_KEY]) {
    win[BACKUP_KEY] = { original: null, polluted: null, activePdfFiles: new Set() };
  }
  return win[BACKUP_KEY];
}

// 检查当前活跃文件是否是 PDF
function isCurrentFilePdf(): boolean {
  const backup = getBackup();
  const currentFile = workspaceStore.state.currentFile;
  if (!currentFile) return false;
  return backup.activePdfFiles.has(currentFile.path);
}

// 根据当前活跃标签决定是否恢复 addEventListener
function updateAddEventListener() {
  const backup = getBackup();
  if (!backup.original) return;

  if (isCurrentFilePdf()) {
    // 当前是 PDF，恢复污染状态（PDF 需要它）
    if (backup.polluted) {
      EventTarget.prototype.addEventListener = backup.polluted;
    }
  } else {
    // 当前不是 PDF，恢复原始的 addEventListener
    EventTarget.prototype.addEventListener = backup.original;
  }
}

// 注册当前 PDF 文件
function registerPdfFile() {
  const backup = getBackup();
  backup.activePdfFiles.add(props.file.path);
}

// 注销当前 PDF 文件
function unregisterPdfFile() {
  const backup = getBackup();
  backup.activePdfFiles.delete(props.file.path);

  // 如果没有 PDF 文件打开，恢复 addEventListener
  if (backup.activePdfFiles.size === 0 && backup.original) {
    EventTarget.prototype.addEventListener = backup.original;
  }
}

async function mountViewer() {
  if (!viewerContainer.value || !pdfUrl.value) return;

  // 先卸载之前的实例
  if (viewerApp) {
    viewerApp.unmount();
    viewerApp = null;
  }

  try {
    const backup = getBackup();

    // 在首次导入前备份原始的 addEventListener（直接保存引用，不用 bind）
    if (!backup.original) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      backup.original = EventTarget.prototype.addEventListener;
    }

    // 动态导入 UmoViewer
    const { UmoViewer } = await import('@umoteam/viewer');

    // 导入后保存被污染的 addEventListener（如果还没保存）
    if (!backup.polluted) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      backup.polluted = EventTarget.prototype.addEventListener;
    }

    // 创建独立的 Vue 应用来挂载 UmoViewer
    const currentPdfUrl = pdfUrl.value;
    const currentFileName = props.file.name;
    const currentTheme = theme.value;

    viewerApp = createApp({
      render() {
        return h(UmoViewer as Component, {
          pdf: currentPdfUrl,
          html: '<div></div>',
          title: currentFileName,
          lang: 'zh-CN',
          theme: currentTheme,
          mode: ['pdf'],
          fitWidth: true,
          showHeader: true,
          showAside: false,
          printable: true,
          downloadable: true,
        });
      },
    });

    viewerApp.mount(viewerContainer.value);
  } catch (error) {
    console.error('Failed to load UmoViewer:', error);
  }
}

onMounted(() => {
  registerPdfFile();
  void nextTick(() => {
    if (pdfUrl.value) {
      void mountViewer();
    }
  });
});

onUnmounted(() => {
  if (viewerApp) {
    viewerApp.unmount();
    viewerApp = null;
  }
  unregisterPdfFile();
});

// 监听当前活跃文件变化，决定是否恢复 addEventListener
watch(
  () => workspaceStore.state.currentFile?.path,
  () => {
    updateAddEventListener();
  },
);

watch(pdfUrl, (newUrl) => {
  if (newUrl) {
    void nextTick(() => mountViewer());
  }
});

watch(theme, () => {
  if (pdfUrl.value) {
    void nextTick(() => mountViewer());
  }
});
</script>

<style scoped>
.umo-viewer-wrapper {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--vscode-editor-background, #0f172a);
}

.umo-viewer-container {
  height: 100%;
  width: 100%;
}

.umo-viewer-container :deep(.umo-viewer) {
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
