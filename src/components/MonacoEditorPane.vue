<template>
  <div class="monaco-pane column gap-sm">
    <div class="tabbar row items-center">
      <div
        v-for="file in workspace.openFiles"
        :key="file.path"
        class="tab"
        :class="{ active: file.path === workspace.currentFile?.path }"
        @click="activateTab(file.path)"
      >
        <span class="tab-label">
          {{ file.name }}
          <span v-if="isFileDirty(file)" class="tab-dirty" aria-hidden="true"></span>
        </span>
        <button class="tab-close" type="button" @click.stop="closeTab(file.path)">×</button>
      </div>
      <div v-if="!workspace.openFiles.length" class="tab-placeholder">No Open Files</div>
    </div>

    <div class="row items-center justify-between editor-toolbar">
      <div class="column">
        <div class="text-subtitle2 text-white">
          {{ workspace.currentFile?.name || '未选择文件' }}
        </div>
        <div class="text-caption text-grey-5">
          {{ workspace.currentFile?.path || '请选择左侧文件以打开' }}
        </div>
      </div>
      <div class="row items-center gap-sm">
        <q-btn dense flat icon="save" label="保存" :disable="!canSave" @click="saveCurrentFile" />
      </div>
    </div>

    <div class="editor-body">
      <div v-if="!workspace.currentFile" class="welcome">
        <div class="welcome-title">欢迎使用 Novel Helper Lite</div>
        <div class="welcome-subtitle">在左侧选择文件或打开文件夹以开始</div>
        <div class="welcome-hint">支持文本编辑、图片预览、多标签</div>
      </div>

      <keep-alive>
        <InlineImageViewer
          v-for="file in imageFiles"
          :key="file.path"
          v-show="workspace.currentFile?.path === file.path"
          :src="file.mediaUrl || ''"
          :name="file.name"
          :state="file.imageState || undefined"
          @update:state="(next) => setImageViewState(file.path, next)"
          class="image-viewer"
        />
      </keep-alive>

      <div v-if="currentImage && !currentImage.mediaUrl" class="image-placeholder">
        无法加载图片资源，请检查文件路径或权限
      </div>

      <div v-show="showMonaco" ref="editorEl" class="monaco-host"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as monaco from 'monaco-editor';
import 'monaco-editor/min/vs/editor/editor.main.css';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { useWorkspaceStore } from 'src/stores/workspace';
import type { OpenFile } from 'src/stores/workspace';
import InlineImageViewer from './InlineImageViewer.vue';

const g = self as typeof self & {
  MonacoEnvironment: {
    getWorker(_: unknown, label: string): Worker;
  };
};

g.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

const {
  state: workspace,
  updateCurrentContent,
  markCurrentFileSaved,
  setActiveFile,
  closeFile,
  setImageViewState,
  setEditorViewState,
} = useWorkspaceStore();
const editorEl = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let disposables: monaco.IDisposable[] = [];
const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();

const canSave = computed(
  () =>
    !!workspace.currentFile &&
    !!editor &&
    ((workspace.currentFile.handle && workspace.currentFile.handle.kind === 'file') ||
      workspace.currentFile.onSave),
);
const showMonaco = computed(() => !!workspace.currentFile && !workspace.currentFile.isImage);
const imageFiles = computed(() =>
  workspace.openFiles.filter((f): f is OpenFile & { isImage: true } => !!f.isImage),
);
const currentImage = computed(() =>
  workspace.currentFile && workspace.currentFile.isImage ? workspace.currentFile : null,
);

onMounted(() => {
  void ensureEditor();

  watch(
    () => workspace.currentFile,
    async (file, prev) => {
      // 先保存上一份视图状态，避免切换时丢失光标/滚动位置
      if (prev?.path && editor) {
        const savedState = editor.saveViewState();
        viewStates.set(prev.path, savedState);
        setEditorViewState(prev.path, savedState ?? undefined);
      }

      if (!file) {
        return;
      }

      // 图片标签页不销毁，保持其组件由 keep-alive 管理
      if (file.isImage) {
        return;
      }

      const instance = await ensureEditor();
      if (!instance) return;
      const language = guessLanguage(file.name);
      const uri = monaco.Uri.parse(`inmemory://${file.path}`);
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(file.content ?? '', language, uri);
      } else {
        monaco.editor.setModelLanguage(model, language);
        // 仅当内容不一致时才更新，避免破坏撤销栈与光标
        if (model.getValue() !== (file.content ?? '')) {
          model.setValue(file.content ?? '');
        }
      }
      instance.setModel(model);

      // 恢复该文件的视图状态
      const viewState = viewStates.get(file.path) ?? (file.viewState as monaco.editor.ICodeEditorViewState | null | undefined);
      if (viewState) {
        viewStates.set(file.path, viewState);
        instance.restoreViewState(viewState);
      }
      layoutEditor();
    },
    { immediate: true },
  );

  watch(
    () => showMonaco.value,
    (shouldShow) => {
      if (shouldShow) {
        void ensureEditor();
        layoutEditor();
      }
    },
    { immediate: true },
  );
});

onBeforeUnmount(() => {
  disposeEditor();
});

function guessLanguage(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'c':
    case 'h':
    case 'cpp':
    case 'cxx':
    case 'hpp':
    case 'cc':
      return 'cpp';
    case 'json':
      return 'json';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    case 'vue':
      return 'vue';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

async function saveCurrentFile() {
  if (!workspace.currentFile || !editor) return;

  const content = editor.getValue();

  // 如果有自定义保存回调（例如设置文件），优先使用
  if (workspace.currentFile.onSave) {
    try {
      await workspace.currentFile.onSave(content);
      updateCurrentContent(content);
      markCurrentFileSaved(content);
      return;
    } catch (error) {
      console.error('保存失败:', error);
      return;
    }
  }

  // 原有的文件系统保存逻辑
  if (!workspace.currentFile.handle || workspace.currentFile.handle.kind !== 'file') return;

  try {
    const writable = await workspace.currentFile.handle.createWritable();
    await writable.write(content);
    await writable.close();
    updateCurrentContent(content);
    markCurrentFileSaved(content);
  } catch (error) {
    console.error('保存文件失败:', error);
  }
}

function activateTab(path: string) {
  setActiveFile(path);
}

function closeTab(path: string) {
  closeFile(path);
}

function isFileDirty(file: OpenFile) {
  return file.content !== (file.savedContent ?? '');
}

function ensureEditorSync() {
  if (editor) return editor;
  if (!editorEl.value) return null;
  editor = monaco.editor.create(editorEl.value, {
    value: '选择左侧文件后在此编辑',
    language: 'plaintext',
    theme: 'vs-dark',
    automaticLayout: true,
  });

  disposables.push(
    editor.onDidChangeModelContent(() => {
      const content = editor?.getValue() ?? '';
      updateCurrentContent(content);
    }),
  );
  layoutEditor();
  return editor;
}

async function ensureEditor() {
  await nextTick();
  return ensureEditorSync();
}

function layoutEditor() {
  if (editor && editorEl.value) {
    editor.layout({
      width: editorEl.value.clientWidth,
      height: editorEl.value.clientHeight,
    });
  }
}

function disposeEditor() {
  if (editor && editor.getModel() && workspace.currentFile?.path) {
    const savedState = editor.saveViewState();
    viewStates.set(workspace.currentFile.path, savedState);
    setEditorViewState(workspace.currentFile.path, savedState ?? undefined);
  }
  editor?.dispose();
  disposables.forEach((d) => d.dispose());
  disposables = [];
  editor = null;
}
</script>

<style scoped>
.monaco-pane {
  height: 100%;
  min-height: 400px;
  flex: 1;
  min-width: 0;
}

.tabbar {
  height: 36px;
  border: 1px solid var(--vscode-border);
  border-radius: 6px;
  padding: 0 4px;
  background: #1c222c;
  overflow-x: auto;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  margin-right: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--vscode-muted);
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.tab.active {
  background: #2b3240;
  color: var(--vscode-text);
}

.tab:hover {
  background: #242a35;
  color: var(--vscode-text);
}

.tab-label {
  font-size: 12px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tab-dirty {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vscode-text);
  opacity: 0.75;
}

.tab-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.tab-placeholder {
  color: var(--vscode-muted);
  font-size: 12px;
  padding: 0 8px;
}

.monaco-host {
  flex: 1;
  min-height: 300px;
  width: 100%;
  height: 100%;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #0f1216;
  border: 1px solid var(--vscode-border);
  border-radius: 8px;
  padding: 8px;
  overflow: hidden;
}

.welcome {
  height: 100%;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--vscode-muted);
  gap: 6px;
}

.welcome-title {
  font-size: 18px;
  color: var(--vscode-text);
  font-weight: 700;
}

.welcome-subtitle,
.welcome-hint {
  font-size: 13px;
}

.image-viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.image-placeholder {
  flex: 1;
  display: grid;
  place-items: center;
  border: 1px dashed var(--vscode-border);
  border-radius: 8px;
  color: var(--vscode-muted);
  background: #0f1216;
  font-size: 13px;
}
</style>
