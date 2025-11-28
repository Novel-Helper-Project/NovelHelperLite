<template>
  <div class="monaco-pane column gap-sm">
    <div ref="tabbarRef" class="tabbar">
      <div ref="tabTrackRef" class="tab-track" :style="tabTrackStyle">
        <div class="tab-spacer" :style="{ width: `${tabLayout.before}px` }" />
        <template v-for="entry in tabLayout.visible" :key="entry.file.path">
          <div
            class="tab"
            :class="{ active: entry.file.path === workspace.currentFile?.path }"
            @click="activateTab(entry.file.path)"
            :ref="(el) => setTabRef(entry.file.path, el as HTMLDivElement | null)"
          >
            <span class="tab-label">
              {{ entry.file.name }}
              <span v-if="isFileDirty(entry.file)" class="tab-dirty" aria-hidden="true"></span>
            </span>
            <button class="tab-close" type="button" @click.stop="closeTab(entry.file.path)">×</button>
          </div>
        </template>
        <div class="tab-spacer" :style="{ width: `${tabLayout.after}px` }" />
        <div v-if="!workspace.openFiles.length" class="tab-placeholder">No Open Files</div>
      </div>
    </div>

    <div class="row items-center justify-between editor-toolbar">
      <div class="column">
        <div class="text-subtitle2 text-white">
          {{ workspace.currentFile?.name || '未选择文件' }}
        </div>
        <div class="text-caption text-grey-5">
          {{ currentPathLabel }}
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
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
const tabbarRef = ref<HTMLDivElement | null>(null);
const tabTrackRef = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let disposables: monaco.IDisposable[] = [];
const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();
let resizeObserver: ResizeObserver | null = null;
let layoutRaf: number | null = null;
let revealListener: ((event: Event) => void) | null = null;
let pendingReveal: RevealDetail | null = null;
let tabbarWheelListener: ((event: WheelEvent) => void) | null = null;
let tabResizeObserver: ResizeObserver | null = null;
const tabRefs = new Map<string, HTMLDivElement>();
const tabScroll = ref(0);
const tabMetrics = reactive({ viewport: 0, content: 0 });
const tabSizes = new Map<string, number>();
const tabSizesVersion = ref(0);
const TAB_GAP = 4;
const TAB_OVERSCAN = 120;

const tabLayout = computed(() => {
  // depend on sizes version
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  tabSizesVersion.value;
  let acc = 0;
  const positions: Array<{
    file: OpenFile;
    start: number;
    end: number;
  }> = [];
  for (const file of workspace.openFiles) {
    const width = tabSizes.get(file.path) ?? 120;
    const start = acc;
    const end = start + width;
    positions.push({ file, start, end });
    acc = end + TAB_GAP;
  }
  const total = acc > 0 ? acc - TAB_GAP : 0;
  const viewport = tabMetrics.viewport || 0;
  const windowStart = Math.max(0, tabScroll.value - TAB_OVERSCAN);
  const windowEnd = tabScroll.value + viewport + TAB_OVERSCAN;
  const visible = positions.filter((pos) => pos.end > windowStart && pos.start < windowEnd);
  const firstVisible = visible[0];
  const lastVisible = visible[visible.length - 1];
  const before = firstVisible ? firstVisible.start : 0;
  const lastEnd = lastVisible ? lastVisible.end : 0;
  const after = Math.max(0, total - lastEnd);
  const visibleWidth = firstVisible && lastVisible ? lastEnd - firstVisible.start : 0;
  return {
    total,
    visible,
    before,
    after,
    visibleWidth,
  };
});

const tabTrackStyle = computed(() => ({
  transform: `translateX(-${tabScroll.value}px)`,
}));

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
const currentPathLabel = computed(() => {
  const path = workspace.currentFile?.path;
  if (!path) return '请选择左侧文件以打开';
  const normalized = path.replace(/^\\+/, '/');
  return normalized.replace(/^\/+/, '/');
});

onMounted(() => {
  void ensureEditor();

  const el = editorEl.value;
  if (el && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => layoutEditor());
    resizeObserver.observe(el);
  }
  window.addEventListener('resize', layoutEditor);
  revealListener = (event: Event) => handleRevealEvent(event);
  window.addEventListener('workspace-reveal', revealListener);
  tabbarWheelListener = (event: WheelEvent) => handleTabbarWheel(event);
  tabbarRef.value?.addEventListener('wheel', tabbarWheelListener, { passive: false });
  measureTabs();
  if ('ResizeObserver' in window) {
    tabResizeObserver = new ResizeObserver(() => measureTabs());
    const host = tabbarRef.value;
    const track = tabTrackRef.value;
    if (host) tabResizeObserver.observe(host);
    if (track) tabResizeObserver.observe(track);
  }

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
      applyPendingReveal();
      ensureActiveTabVisible();
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

  watch(
    () => workspace.openFiles.length,
    () => {
      void nextTick(() => {
        measureTabs();
        ensureActiveTabVisible();
      });
    },
  );

  watch(
    () => workspace.openFiles.map((f) => f.path).join('|'),
    () => {
      void nextTick(() => {
        measureTabs();
        ensureActiveTabVisible();
      });
    },
  );

  watch(
    () => tabLayout.value.total,
    () => {
      clampTabScroll();
    },
  );
});

onBeforeUnmount(() => {
  disposeEditor();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (layoutRaf) {
    cancelAnimationFrame(layoutRaf);
    layoutRaf = null;
  }
  if (revealListener) {
    window.removeEventListener('workspace-reveal', revealListener);
    revealListener = null;
  }
  if (tabbarWheelListener && tabbarRef.value) {
    tabbarRef.value.removeEventListener('wheel', tabbarWheelListener);
  }
  if (tabResizeObserver) {
    tabResizeObserver.disconnect();
    tabResizeObserver = null;
  }
  window.removeEventListener('resize', layoutEditor);
});

type RevealDetail = { path: string; line: number; column?: number };

function handleRevealEvent(event: Event) {
  const detail = (event as CustomEvent<RevealDetail>).detail;
  if (!detail) return;
  pendingReveal = detail;
  applyPendingReveal();
}

function handleTabbarWheel(event: WheelEvent) {
  const host = tabbarRef.value;
  if (!host) return;
  // 将纵向滚动转为横向滚动
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (delta === 0) return;
  event.preventDefault();
  updateTabScroll(tabScroll.value + delta);
}

function applyPendingReveal() {
  if (!pendingReveal) return;
  if (!workspace.currentFile || workspace.currentFile.path !== pendingReveal.path) return;
  if (!editor) return;
  const position = { lineNumber: pendingReveal.line, column: pendingReveal.column ?? 1 };
  editor.revealPositionInCenter(position);
  editor.setPosition(position);
  editor.focus();
  pendingReveal = null;
}

function measureTabs() {
  const host = tabbarRef.value;
  if (!host) return;
  tabMetrics.viewport = host.clientWidth;
  let content = 0;
  for (const file of workspace.openFiles) {
    const width = tabRefs.get(file.path)?.offsetWidth ?? 120;
    tabSizes.set(file.path, width);
    content += width + TAB_GAP;
  }
  tabMetrics.content = content > 0 ? content - TAB_GAP : 0;
  tabSizesVersion.value += 1;
  clampTabScroll();
}

function clampTabScroll() {
  const max = Math.max(0, (tabLayout.value.total || tabMetrics.content) - tabMetrics.viewport);
  tabScroll.value = Math.max(0, Math.min(tabScroll.value, max));
}

function updateTabScroll(next: number) {
  tabScroll.value = next;
  clampTabScroll();
}

function setTabRef(path: string, el: HTMLDivElement | null) {
  if (el) {
    tabRefs.set(path, el);
  } else {
    tabRefs.delete(path);
  }
}

function ensureActiveTabVisible() {
  if (!workspace.currentFile) return;
  const pos = getTabPosition(workspace.currentFile.path);
  if (!pos) return;
  const hostWidth = tabMetrics.viewport;
  const current = tabScroll.value;
  const visibleEnd = current + hostWidth;
  if (pos.start < current) {
    updateTabScroll(pos.start);
  } else if (pos.end > visibleEnd) {
    updateTabScroll(pos.end - hostWidth);
  }
}

function getTabPosition(path: string): { start: number; end: number } | null {
  let acc = 0;
  for (const file of workspace.openFiles) {
    const width = tabSizes.get(file.path) ?? 120;
    const start = acc;
    const end = start + width;
    if (file.path === path) return { start, end };
    acc = end + TAB_GAP;
  }
  return null;
}

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
  void nextTick(() => ensureActiveTabVisible());
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
  if (layoutRaf) {
    cancelAnimationFrame(layoutRaf);
    layoutRaf = null;
  }
  if (editor && editorEl.value) {
    const host = editorEl.value;
    layoutRaf = requestAnimationFrame(() => {
      editor?.layout({
        width: host.clientWidth,
        height: host.clientHeight,
      });
      layoutRaf = null;
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
  border-radius: 0;
  padding: 0 4px;
  background: #1c222c;
  overflow: hidden;
  position: relative;
  min-width: 0;
  width: 100%;
  max-width: 100%;
}

.tab-track {
  display: flex;
  align-items: center;
  gap: 0;
  height: 100%;
  width: 100%;
  max-width: 100%;
  will-change: transform;
  transition: transform 0.08s ease-out;
}

.tab-spacer {
  flex: 0 0 auto;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  flex: 0 0 auto;
  margin-right: 4px;
  border-radius: 0;
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
  flex: 1 1 auto;
  min-height: 300px;
  min-width: 0;
  width: auto;
  height: 100%;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #0f1216;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  padding: 0;
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

.editor-toolbar {
  padding-left: 8px;
  padding-right: 8px;
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
  border-radius: 0;
  color: var(--vscode-muted);
  background: #0f1216;
  font-size: 13px;
}
</style>
