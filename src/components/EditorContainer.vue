<template>
  <div
    ref="containerRef"
    class="editor-container"
    :style="{ height: adjustedHeight + 'px', overflow: 'auto' }"
  >
    <!-- 内联确认对话框：二级匹配确认 -->
    <div v-if="pendingSecondaryConfirm" class="inline-confirm">
      <div class="inline-confirm-content">
        <div class="inline-confirm-icon">⚠️</div>
        <div class="inline-confirm-title">确认打开</div>
        <div class="inline-confirm-message">{{ pendingSecondaryConfirm.message }}</div>
        <div class="inline-confirm-actions">
          <button class="inline-btn inline-btn-cancel" @click="cancelSecondaryConfirm">取消</button>
          <button class="inline-btn inline-btn-ok" @click="confirmSecondaryConfirm">
            仍要打开
          </button>
        </div>
      </div>
    </div>

    <!-- 内联选择对话框：多编辑器选择 -->
    <div v-else-if="pendingEditorChoice" class="inline-confirm">
      <div class="inline-confirm-content">
        <div class="inline-confirm-icon">📝</div>
        <div class="inline-confirm-title">选择编辑器</div>
        <div class="inline-confirm-message">
          有 {{ pendingEditorChoice.editors.length }} 个编辑器可以打开此文件
        </div>
        <div class="inline-editor-list">
          <label
            v-for="editor in pendingEditorChoice.editors"
            :key="editor.id"
            class="inline-editor-option"
            :class="{ selected: pendingEditorChoice.selectedId === editor.id }"
          >
            <input
              type="radio"
              :value="editor.id"
              v-model="pendingEditorChoice.selectedId"
              name="editor-choice"
            />
            <span class="editor-option-label">{{ editor.name }}</span>
            <span v-if="editor.description" class="editor-option-desc">{{
              editor.description
            }}</span>
          </label>
        </div>
        <div class="inline-confirm-actions">
          <button class="inline-btn inline-btn-cancel" @click="cancelEditorChoice">取消</button>
          <button class="inline-btn inline-btn-ok" @click="confirmEditorChoice">打开</button>
        </div>
      </div>
    </div>

    <!-- 正常编辑器内容 -->
    <div v-else-if="selectedEditor" class="editor-content">
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
import { ref, computed, watch, onMounted, onUnmounted, onActivated, nextTick } from 'vue';
import type { OpenFile } from 'src/stores/workspace';
import { useWorkspaceStore } from 'src/stores/workspace';
import { editorRegistry } from 'src/types/editorProvider';
import type { EditorProvider } from 'src/types/editorProvider';
import type { ImageViewState, EditorViewState } from 'src/types/editorState';

const props = defineProps<{
  file: OpenFile;
}>();

const { setActiveEditorId } = useWorkspaceStore();

const emit = defineEmits<{
  'update:content': [content: string];
  'update:viewState': [state: EditorViewState];
  'update:imageState': [state: ImageViewState];
}>();

const selectedEditor = ref<EditorProvider | null>(null);
// 存储用户的编辑器偏好(文件扩展名 -> 编辑器ID)
const editorPreferences = ref<Record<string, string>>({});

// 内联确认对话框状态
const pendingSecondaryConfirm = ref<{
  message: string;
  provider: EditorProvider;
} | null>(null);

const pendingEditorChoice = ref<{
  editors: EditorProvider[];
  selectedId: string;
  ext: string;
} | null>(null);

// 二级匹配确认操作
function confirmSecondaryConfirm() {
  if (pendingSecondaryConfirm.value) {
    selectedEditor.value = pendingSecondaryConfirm.value.provider;
    pendingSecondaryConfirm.value = null;
  }
}

function cancelSecondaryConfirm() {
  pendingSecondaryConfirm.value = null;
  selectedEditor.value = null;
}

// 多编辑器选择操作
function confirmEditorChoice() {
  if (pendingEditorChoice.value) {
    const chosen = pendingEditorChoice.value.editors.find(
      (e) => e.id === pendingEditorChoice.value!.selectedId,
    );
    if (chosen) {
      const ext = pendingEditorChoice.value.ext;
      if (ext) {
        editorPreferences.value[ext] = chosen.id;
      }
      selectedEditor.value = chosen;
    }
    pendingEditorChoice.value = null;
  }
}

function cancelEditorChoice() {
  if (pendingEditorChoice.value) {
    // 使用默认编辑器（第一个）
    selectedEditor.value = pendingEditorChoice.value.editors[0] || null;
    pendingEditorChoice.value = null;
  }
}

// 计算容器高度
const computedHeight = ref(0);
const keyboardHeight = ref(0);
const containerRef = ref<HTMLElement | null>(null);

// 监听键盘高度变化
onMounted(() => {
  const updateKeyboardHeight = () => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--keyboard-inset-height')
      .trim();
    keyboardHeight.value = parseInt(value) || 0;
  };

  updateKeyboardHeight();
  // 定期检查键盘高度变化
  const interval = setInterval(updateKeyboardHeight, 100);

  onUnmounted(() => {
    clearInterval(interval);
  });
});

// 调整后的高度（减去键盘高度）
const adjustedHeight = computed(() => {
  return Math.max(0, computedHeight.value - keyboardHeight.value);
});

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

  // 多个编辑器支持,使用内联选择
  const defaultEditor = primaryEditors[0];
  if (!defaultEditor) {
    selectedEditor.value = null;
    return;
  }

  // 显示内联编辑器选择
  pendingEditorChoice.value = {
    editors: primaryEditors,
    selectedId: defaultEditor.id,
    ext,
  };
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

  // 显示内联确认
  pendingSecondaryConfirm.value = {
    message: confirmMessage,
    provider,
  };
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

// 当选定的编辑器变化时,同步到文件的 activeEditorId
watch(
  selectedEditor,
  (newEditor) => {
    if (newEditor && props.file.path) {
      setActiveEditorId(props.file.path, newEditor.id);
    }
  },
  { immediate: true },
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

// 处理 keep-alive 激活时的高度重新计算
onActivated(async () => {
  // 从 keep-alive 缓存恢复时，重新计算高度
  await nextTick();
  updateContainerHeight();

  // 如果高度仍然为 0，延迟再次尝试（处理父容器动画/过渡的情况）
  if (computedHeight.value === 0) {
    setTimeout(() => {
      updateContainerHeight();
    }, 50);
  }
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
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
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

/* 内联确认对话框样式 */
.inline-confirm {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vscode-editor-background);
  padding: 20px;
}

.inline-confirm-content {
  max-width: 400px;
  width: 100%;
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.inline-confirm-icon {
  font-size: 36px;
  text-align: center;
  margin-bottom: 12px;
}

.inline-confirm-title {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  color: var(--vscode-text);
  margin-bottom: 12px;
}

.inline-confirm-message {
  font-size: 14px;
  color: var(--vscode-muted);
  text-align: center;
  margin-bottom: 20px;
  white-space: pre-line;
  line-height: 1.5;
}

.inline-confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.inline-btn {
  padding: 8px 20px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.inline-btn-cancel {
  background: transparent;
  color: var(--vscode-muted);
  border: 1px solid var(--vscode-border);
}

.inline-btn-cancel:hover {
  background: var(--vscode-hover-background);
  color: var(--vscode-text);
}

.inline-btn-ok {
  background: var(--vscode-button-background, #0078d4);
  color: var(--vscode-button-foreground, #fff);
}

.inline-btn-ok:hover {
  background: var(--vscode-button-hoverBackground, #106ebe);
}

/* 编辑器选择列表 */
.inline-editor-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.inline-editor-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--vscode-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.inline-editor-option:hover {
  background: var(--vscode-hover-background);
}

.inline-editor-option.selected {
  border-color: var(--vscode-button-background, #0078d4);
  background: rgba(0, 120, 212, 0.1);
}

.inline-editor-option input[type='radio'] {
  margin: 0;
}

.editor-option-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--vscode-text);
}

.editor-option-desc {
  font-size: 12px;
  color: var(--vscode-muted);
  margin-left: auto;
}
</style>
