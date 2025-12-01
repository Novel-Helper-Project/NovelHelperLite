<template>
  <div
    ref="containerRef"
    class="editor-container"
    :style="{ height: computedHeight + 'px', overflow: 'auto' }"
  >
    <div v-if="selectedEditor" class="editor-content">
      <component
        :is="selectedEditor.component"
        :file="file"
        @update:content="handleContentUpdate"
        @update:viewState="handleViewStateUpdate"
        @update:imageState="handleImageStateUpdate"
      />
    </div>
    <div v-else class="no-editor">
      <div class="no-editor-icon">📄</div>
      <div class="no-editor-text">无法打开此文件</div>
      <div class="no-editor-hint">未找到合适的编辑器</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Dialog } from 'quasar';
import type { OpenFile } from 'src/stores/workspace';
import { editorRegistry } from 'src/types/editorProvider';
import type { EditorProvider } from 'src/types/editorProvider';
import type { ImageViewState, EditorViewState } from 'src/types/editorState';

const props = defineProps<{
  file: OpenFile;
}>();

const emit = defineEmits<{
  'update:content': [content: string];
  'update:viewState': [state: EditorViewState];
  'update:imageState': [state: ImageViewState];
}>();

const selectedEditor = ref<EditorProvider | null>(null);
// 存储用户的编辑器偏好(文件扩展名 -> 编辑器ID)
const editorPreferences = ref<Record<string, string>>({});

// 计算容器高度
const computedHeight = ref(0);
const containerRef = ref<HTMLElement | null>(null);

// 计算并更新容器高度
function updateContainerHeight() {
  // 防止无限循环
  if (isUpdatingHeight || !containerRef.value) {
    return;
  }

  isUpdatingHeight = true;

  try {
    const parent = containerRef.value.parentElement;
    if (parent) {
      // 使用 clientHeight 精准获取父容器的内部可用高度
      const newHeight = parent.clientHeight;

      // 只有高度真正变化时才更新
      if (Math.abs(computedHeight.value - newHeight) > 1) {
        computedHeight.value = newHeight;
      }
    }
  } finally {
    // 使用 requestAnimationFrame 确保异步更新
    requestAnimationFrame(() => {
      isUpdatingHeight = false;
    });
  }
}

// 获取所有支持该文件的编辑器
const compatibleEditors = computed(() => {
  return editorRegistry.getCompatibleEditors(props.file);
});

// 获取文件扩展名
function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? '.' + (parts[parts.length - 1] || '').toLowerCase() : '';
}

// 选择编辑器
function selectEditor() {
  const primaryEditors = compatibleEditors.value;

  // 首先检查是否有一级匹配
  if (primaryEditors.length === 0) {
    // 没有一级匹配,检查二级匹配
    checkSecondaryEditors();
    return;
  }

  if (primaryEditors.length === 1) {
    // 只有一个编辑器,直接使用
    selectedEditor.value = primaryEditors[0] || null;
    return;
  }

  // 检查是否有用户偏好
  const ext = getFileExtension(props.file.name);
  const preferredEditorId = editorPreferences.value[ext];
  if (preferredEditorId) {
    const preferred = primaryEditors.find((e) => e.id === preferredEditorId);
    if (preferred) {
      selectedEditor.value = preferred;
      return;
    }
  }

  // 多个编辑器支持,弹出选择对话框
  const defaultEditor = primaryEditors[0];
  if (!defaultEditor) {
    selectedEditor.value = null;
    return;
  }

  Dialog.create({
    title: '选择编辑器',
    message: `有 ${primaryEditors.length} 个编辑器可以打开此文件,请选择一个:`,
    options: {
      type: 'radio',
      model: defaultEditor.id,
      items: primaryEditors.map((editor) => ({
        label: editor.name,
        value: editor.id,
        caption: editor.description,
      })),
    },
    ok: {
      label: '打开',
      color: 'primary',
    },
    cancel: {
      label: '取消',
      flat: true,
    },
    persistent: false,
  })
    .onOk((editorId: string) => {
      const chosen = primaryEditors.find((e) => e.id === editorId);
      if (chosen) {
        // 记住用户的选择
        if (ext) {
          editorPreferences.value[ext] = editorId;
        }
        selectedEditor.value = chosen;
      }
    })
    .onCancel(() => {
      // 用户取消,使用默认编辑器(优先级最高的)
      selectedEditor.value = defaultEditor;
    });
}

// 检查二级匹配编辑器
function checkSecondaryEditors() {
  const secondaryMatches = editorRegistry.getSecondaryEditors(props.file);

  if (secondaryMatches.length === 0) {
    selectedEditor.value = null;
    return;
  }

  // 使用第一个二级匹配
  const { provider, rule } = secondaryMatches[0] || { provider: null, rule: null };
  if (!provider || !rule) {
    selectedEditor.value = null;
    return;
  }

  const confirmMessage =
    rule.confirmMessage ||
    `此文件可能不适合使用 ${provider.name} 打开。\n\n文件: ${props.file.name}\n\n是否仍要打开?`;

  Dialog.create({
    title: '确认打开',
    message: confirmMessage,
    html: true,
    ok: {
      label: '仍要打开',
      color: 'warning',
    },
    cancel: {
      label: '取消',
      flat: true,
    },
    persistent: false,
  })
    .onOk(() => {
      selectedEditor.value = provider;
    })
    .onCancel(() => {
      selectedEditor.value = null;
    });
}

function handleContentUpdate(content: string) {
  emit('update:content', content);
}

function handleViewStateUpdate(state: EditorViewState) {
  emit('update:viewState', state);
}

function handleImageStateUpdate(state: ImageViewState) {
  emit('update:imageState', state);
}

// 监听文件变化,重新选择编辑器
watch(
  () => props.file.path,
  () => {
    selectEditor();
  },
  { immediate: true },
);

// 监听编辑器模式变化,重新选择编辑器
watch(
  () => props.file.editorMode,
  () => {
    selectEditor();
  },
);

// 生命周期钩子
let resizeObserver: ResizeObserver | null = null;
let isUpdatingHeight = false;

onMounted(async () => {
  // 初始化高度
  await nextTick();
  updateContainerHeight();

  // 监听父容器大小变化
  if (containerRef.value && containerRef.value.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      updateContainerHeight();
    });
    resizeObserver.observe(containerRef.value.parentElement);
  }

  // 监听窗口大小变化
  window.addEventListener('resize', updateContainerHeight);
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('resize', updateContainerHeight);
  isUpdatingHeight = false;
});
</script>

<style scoped>
.editor-container {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 改进的滚动条样式 */
.editor-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.editor-container::-webkit-scrollbar-track {
  background: transparent;
}

.editor-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.editor-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.editor-container::-webkit-scrollbar-corner {
  background: transparent;
}

/* 亮色主题适配 */
.theme-light .editor-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.theme-light .editor-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.editor-content {
  width: 100%;
  height: 100%;
  /* display: flex; */
}

.no-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--vscode-muted);
  background: var(--vscode-editor-background);
}

.no-editor-icon {
  font-size: 64px;
  opacity: 0.5;
}

.no-editor-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--vscode-text);
}

.no-editor-hint {
  font-size: 13px;
  opacity: 0.7;
}
</style>
