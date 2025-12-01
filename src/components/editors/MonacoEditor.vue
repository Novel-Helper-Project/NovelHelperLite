<template>
  <div class="monaco-editor-container">
    <div ref="editorEl" class="monaco-host"></div>
    <!-- 移动端选区手柄 -->
    <div
      v-if="selectionHandles.visible"
      class="selection-handle selection-handle-start"
      :style="selectionHandles.startStyle"
      @touchstart.prevent="(e: TouchEvent) => onHandleTouchStart(e, 'start')"
    ></div>
    <div
      v-if="selectionHandles.visible"
      class="selection-handle selection-handle-end"
      :style="selectionHandles.endStyle"
      @touchstart.prevent="(e: TouchEvent) => onHandleTouchStart(e, 'end')"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import * as monaco from 'monaco-editor';
import type { OpenFile } from 'src/stores/workspace';
import type { EditorViewState } from 'src/types/editorState';
import { useSettingsStore } from 'src/stores/settings';

const props = defineProps<{
  file: OpenFile;
}>();

const emit = defineEmits<{
  'update:content': [content: string];
  'update:viewState': [state: EditorViewState];
}>();

const editorEl = ref<HTMLDivElement | null>(null);
const settingsStore = useSettingsStore();
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

const monacoTheme = settingsStore.isDarkMode ? 'vs-dark' : 'vs';

// 选择手柄状态管理
const selectionHandles = reactive({
  visible: false,
  startStyle: { top: '0px', left: '0px', height: '0px', display: 'none' },
  endStyle: { top: '0px', left: '0px', height: '0px', display: 'none' },
});

// 拖动状态
let isDraggingHandle = false;
let activeHandleType: 'start' | 'end' | null = null;

// 移动端检测
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const hasTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  return hasTouch && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

// 更新手柄位置的核心函数
function updateSelectionHandles() {
  // 仅在移动端显示拖动手柄，桌面端直接返回
  if (!isMobileDevice()) {
    selectionHandles.visible = false;
    return;
  }

  if (!editor) return;

  const selection = editor.getSelection();
  // 如果没有选区或者选区是空的（光标折叠），隐藏手柄
  if (!selection || selection.isEmpty()) {
    selectionHandles.visible = false;
    return;
  }

  // 获取选区开始和结束的位置
  const startPos = selection.getStartPosition();
  const endPos = selection.getEndPosition();

  // 获取这些位置相对于编辑器的坐标 (top, left)
  const startScrolled = editor.getScrolledVisiblePosition(startPos);
  const endScrolled = editor.getScrolledVisiblePosition(endPos);

  if (!startScrolled || !endScrolled) {
    selectionHandles.visible = false;
    return;
  }

  // 获取行高，用于设置手柄的高度
  const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);

  selectionHandles.visible = true;

  // 更新样式
  selectionHandles.startStyle = {
    top: `${startScrolled.top}px`,
    left: `${startScrolled.left}px`,
    height: `${startScrolled.height || lineHeight}px`,
    display: 'block',
  };

  selectionHandles.endStyle = {
    top: `${endScrolled.top}px`,
    left: `${endScrolled.left}px`,
    height: `${endScrolled.height || lineHeight}px`,
    display: 'block',
  };
}

// 处理手柄触摸开始
function onHandleTouchStart(e: TouchEvent, type: 'start' | 'end') {
  if (!editor) return;
  isDraggingHandle = true;
  activeHandleType = type;

  // 添加全局移动和结束监听
  window.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
  window.addEventListener('touchend', onGlobalTouchEnd);
}

// 处理手柄拖动
function onGlobalTouchMove(e: TouchEvent) {
  if (!isDraggingHandle || !editor || !activeHandleType) return;

  // 阻止默认滚动行为，保证拖动流畅
  e.preventDefault();

  if (!e.touches || e.touches.length === 0) return;
  const touch = e.touches[0];
  if (!touch) return;
  const clientX = touch.clientX;
  const clientY = touch.clientY;

  // 使用 Monaco API 将屏幕坐标转换为编辑器中的文本位置
  const target = editor.getTargetAtClientPoint(clientX, clientY);

  if (target && target.position) {
    const currentSelection = editor.getSelection();
    if (!currentSelection) return;

    const newPosition = target.position;

    let newSelection: monaco.Selection;

    if (activeHandleType === 'start') {
      // 拖动开始手柄：保持结束点不变，更新开始点
      const fixedEndLine = currentSelection.endLineNumber;
      const fixedEndCol = currentSelection.endColumn;

      // 处理反向拖动（Start 拖到了 End 后面）
      if (
        newPosition.lineNumber > fixedEndLine ||
        (newPosition.lineNumber === fixedEndLine && newPosition.column >= fixedEndCol)
      ) {
        newSelection = new monaco.Selection(
          fixedEndLine,
          fixedEndCol,
          newPosition.lineNumber,
          newPosition.column,
        );
        activeHandleType = 'end';
      } else {
        newSelection = new monaco.Selection(
          newPosition.lineNumber,
          newPosition.column,
          fixedEndLine,
          fixedEndCol,
        );
      }
    } else {
      // 拖动结束手柄
      const fixedStartLine = currentSelection.startLineNumber;
      const fixedStartCol = currentSelection.startColumn;

      if (
        newPosition.lineNumber < fixedStartLine ||
        (newPosition.lineNumber === fixedStartLine && newPosition.column <= fixedStartCol)
      ) {
        // End 拖到了 Start 前面，交换身份
        newSelection = new monaco.Selection(
          newPosition.lineNumber,
          newPosition.column,
          fixedStartLine,
          fixedStartCol,
        );
        activeHandleType = 'start';
      } else {
        newSelection = new monaco.Selection(
          fixedStartLine,
          fixedStartCol,
          newPosition.lineNumber,
          newPosition.column,
        );
      }
    }

    editor.setSelection(newSelection);
    // 显式调用更新手柄
    updateSelectionHandles();

    // 自动滚动
    editor.revealPosition(newPosition);
  }
}

// 处理拖动结束
function onGlobalTouchEnd() {
  isDraggingHandle = false;
  activeHandleType = null;
  window.removeEventListener('touchmove', onGlobalTouchMove);
  window.removeEventListener('touchend', onGlobalTouchEnd);
}

onMounted(() => {
  if (!editorEl.value) return;

  // 优先根据文件扩展名检测语言,其次使用 MIME 类型
  const language =
    getLanguageFromFileName(props.file.name) || getLanguageFromMime(props.file.mime || '');

  editor = monaco.editor.create(editorEl.value, {
    value: props.file.content,
    language,
    theme: monacoTheme,
    automaticLayout: true,
  });

  // 恢复视图状态
  if (props.file.viewState) {
    editor.restoreViewState(props.file.viewState as unknown as monaco.editor.ICodeEditorViewState);
  }

  // 监听内容变化
  editor.onDidChangeModelContent(() => {
    const content = editor?.getValue() ?? '';
    emit('update:content', content);
  });

  // 监听选区变化，更新手柄位置
  editor.onDidChangeCursorSelection(() => {
    updateSelectionHandles();
  });

  // 监听滚动，更新手柄位置
  editor.onDidScrollChange(() => {
    updateSelectionHandles();
  });

  // 监听主题变化
  watch(
    () => settingsStore.isDarkMode,
    (isDark) => {
      monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    },
  );

  // 监听文件变化,更新编辑器内容和语言
  watch(
    () => props.file,
    (newFile, oldFile) => {
      if (!editor) return;

      // 如果是同一个文件,不需要更新
      if (newFile.path === oldFile?.path) return;

      const model = editor.getModel();
      if (!model) return;

      // 更新语言
      const language =
        getLanguageFromFileName(newFile.name) || getLanguageFromMime(newFile.mime || '');
      monaco.editor.setModelLanguage(model, language);

      // 更新内容(仅在内容不同时更新,避免破坏撤销栈)
      if (model.getValue() !== newFile.content) {
        model.setValue(newFile.content);
      }

      // 恢复视图状态
      if (newFile.viewState) {
        editor.restoreViewState(newFile.viewState as unknown as monaco.editor.ICodeEditorViewState);
      }
    },
    { deep: false },
  );
});

onBeforeUnmount(() => {
  // 清理选择手柄的全局事件监听器
  window.removeEventListener('touchmove', onGlobalTouchMove);
  window.removeEventListener('touchend', onGlobalTouchEnd);

  if (editor) {
    // 保存视图状态
    const viewState = editor.saveViewState();
    if (viewState) {
      emit('update:viewState', viewState as unknown as EditorViewState);
    }
    editor.dispose();
    editor = null;
  }
});

function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return 'plaintext';

  const extMap: Record<string, string> = {
    // TypeScript/JavaScript
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',

    // Data formats
    json: 'json',
    jsonc: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    conf: 'ini',

    // Markdown & Text
    md: 'markdown',
    markdown: 'markdown',
    txt: 'plaintext',
    log: 'plaintext',

    // Programming languages
    vue: 'html', // Vue SFC
    svelte: 'html',
    py: 'python',
    java: 'java',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    cc: 'cpp',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    php: 'php',

    // Shell
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',

    // Others
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
  };

  return extMap[ext] || 'plaintext';
}

function getLanguageFromMime(mime: string): string {
  const mimeMap: Record<string, string> = {
    'text/javascript': 'javascript',
    'application/json': 'json',
    'text/html': 'html',
    'text/css': 'css',
    'text/typescript': 'typescript',
    'text/markdown': 'markdown',
    'text/xml': 'xml',
  };
  return mimeMap[mime] || 'plaintext';
}
</script>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.monaco-host {
  width: 100%;
  height: 100%;
}

/* 移动端选区手柄样式 */
.selection-handle {
  position: absolute;
  width: 12px;
  height: 20px;
  pointer-events: auto;
  touch-action: none;
  z-index: 1000;
}

.selection-handle::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--vscode-editor-selectionBackground, #007acc);
  border: 2px solid var(--vscode-editor-background, #fff);
}

.selection-handle-start::before {
  bottom: 0;
  left: 0;
  transform: translateX(-50%);
}

.selection-handle-end::before {
  bottom: 0;
  right: 0;
  transform: translateX(50%);
}

.selection-handle::after {
  content: '';
  position: absolute;
  width: 2px;
  height: 100%;
  background: var(--vscode-editor-selectionBackground, #007acc);
  bottom: 12px;
}

.selection-handle-start::after {
  left: 50%;
  transform: translateX(-50%);
}

.selection-handle-end::after {
  right: 50%;
  transform: translateX(50%);
}
</style>
