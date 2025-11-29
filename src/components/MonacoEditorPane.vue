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
            <button class="tab-close" type="button" @click.stop="closeTab(entry.file.path)">
              ×
            </button>
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
        <q-btn
          dense
          flat
          icon="content_copy"
          title="复制"
          :disable="!canUseClipboard"
          @click="() => handleClipboard('copy')"
        />
        <q-btn
          dense
          flat
          icon="content_paste"
          title="粘贴"
          :disable="!canUseClipboard"
          @click="() => handleClipboard('paste')"
        />
        <q-btn
          dense
          flat
          icon="content_cut"
          title="剪切"
          :disable="!canUseClipboard"
          @click="() => handleClipboard('cut')"
        />
        <q-btn dense flat icon="save" :disable="!canSave" @click="saveCurrentFile" />
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

      <div
        v-show="showMonaco"
        ref="monacoWrapperRef"
        class="monaco-wrapper"
        style="position: relative; flex: 1; min-height: 0; overflow: hidden"
      >
        <div ref="editorEl" class="monaco-host"></div>

        <div
          v-show="selectionHandles.visible"
          class="selection-handle start-handle"
          :style="selectionHandles.startStyle"
          @touchstart.stop.prevent="onHandleTouchStart($event, 'start')"
        ></div>
        <div
          v-show="selectionHandles.visible"
          class="selection-handle end-handle"
          :style="selectionHandles.endStyle"
          @touchstart.stop.prevent="onHandleTouchStart($event, 'end')"
        ></div>
      </div>
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
import type { EditorViewState } from 'src/types/editorState';
import Fs from 'src/services/filesystem';
import type { FsEntry } from 'src/services/filesystem/types';
import { isMobileDevice } from 'src/utils/device';
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
const monacoWrapperRef = ref<HTMLDivElement | null>(null);
const tabbarRef = ref<HTMLDivElement | null>(null);
const tabTrackRef = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
const editorReady = ref(false);
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
let tabTouchStartX: number | null = null;
let tabTouchStartScroll = 0;
const TAB_GAP = 4;
const TAB_OVERSCAN = 120;

// 选择手柄状态管理
const selectionHandles = reactive({
  visible: false,
  startStyle: { top: '0px', left: '0px', height: '0px', display: 'none' },
  endStyle: { top: '0px', left: '0px', height: '0px', display: 'none' },
});

// 拖动状态
let isDraggingHandle = false;
let activeHandleType: 'start' | 'end' | null = null;

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

const canSave = computed(() => {
  const current = workspace.currentFile;
  if (!current) return false;
  if (current.onSave) return true;
  if (!editorReady.value) return false;
  if (current.handle && current.handle.kind === 'file') return true;
  if (current.fsEntry && current.fsEntry.kind === 'file') return true;
  return false;
});
const canUseClipboard = computed(() => editorReady.value && showMonaco.value);
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
  const wrapperEl = monacoWrapperRef.value;
  if ((el || wrapperEl) && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => layoutEditor());
    if (el) resizeObserver.observe(el);
    if (wrapperEl) resizeObserver.observe(wrapperEl);
  }
  window.addEventListener('resize', layoutEditor);
  revealListener = (event: Event) => handleRevealEvent(event);
  window.addEventListener('workspace-reveal', revealListener);
  tabbarWheelListener = (event: WheelEvent) => handleTabbarWheel(event);
  tabbarRef.value?.addEventListener('wheel', tabbarWheelListener, { passive: false });
  if (tabbarRef.value) {
    tabbarRef.value.addEventListener('touchstart', handleTabTouchStart, { passive: true });
    tabbarRef.value.addEventListener('touchmove', handleTabTouchMove, { passive: false });
    tabbarRef.value.addEventListener('touchend', handleTabTouchEnd, { passive: true });
  }
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
        setEditorViewState(prev.path, (savedState as unknown as EditorViewState) ?? undefined);
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
      instance.updateOptions({
        wordWrap: shouldEnableWordWrap(language) ? 'on' : 'off',
      });

      // 恢复该文件的视图状态
      const viewState =
        viewStates.get(file.path) ??
        (file.viewState as monaco.editor.ICodeEditorViewState | null | undefined);
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
  if (tabbarRef.value) {
    tabbarRef.value.removeEventListener('touchstart', handleTabTouchStart);
    tabbarRef.value.removeEventListener('touchmove', handleTabTouchMove);
    tabbarRef.value.removeEventListener('touchend', handleTabTouchEnd);
  }
  if (tabResizeObserver) {
    tabResizeObserver.disconnect();
    tabResizeObserver = null;
  }
  window.removeEventListener('resize', layoutEditor);

  // 清理选择手柄的全局事件监听器
  window.removeEventListener('touchmove', onGlobalTouchMove);
  window.removeEventListener('touchend', onGlobalTouchEnd);
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

function handleTabTouchStart(event: TouchEvent) {
  if (!event.touches?.length) return;
  tabTouchStartX = event.touches[0]?.clientX ?? null;
  tabTouchStartScroll = tabScroll.value;
}

function handleTabTouchMove(event: TouchEvent) {
  if (tabTouchStartX == null) return;
  if (!event.touches?.length) return;
  const currentX = event.touches[0]?.clientX ?? tabTouchStartX;
  const delta = tabTouchStartScroll + (tabTouchStartX - currentX);
  if (Math.abs(tabTouchStartX - currentX) > 2) {
    event.preventDefault();
  }
  updateTabScroll(delta);
}

function handleTabTouchEnd() {
  tabTouchStartX = null;
}

type ClipboardAction = 'copy' | 'paste' | 'cut';
async function handleClipboard(action: ClipboardAction) {
  if (!editor || !showMonaco.value) return;

  const triggerAction = () => {
    const actionId =
      action === 'copy'
        ? 'editor.action.clipboardCopyAction'
        : action === 'paste'
          ? 'editor.action.clipboardPasteAction'
          : 'editor.action.clipboardCutAction';
    editor?.focus();
    editor?.trigger('toolbar', actionId, undefined);
  };

  const getSelections = (): monaco.Selection[] => {
    const sels = editor?.getSelections();
    if (sels && sels.length > 0) return sels;
    const single = editor?.getSelection();
    return single ? [single] : [];
  };

  if (action === 'paste') {
    // 先尝试 Clipboard API，失败再回退到 Monaco 内置
    const selections = getSelections();
    if (selections.length) {
      try {
        const clip = (await navigator.clipboard?.readText?.()) ?? '';
        if (clip) {
          editor.focus();
          editor.executeEdits(
            'paste',
            selections.map((sel) => ({ range: sel, text: clip })),
          );
          return;
        }
      } catch (err) {
        console.warn('Clipboard read failed, fallback to Monaco action', err);
      }
    }
    triggerAction();
    return;
  }

  // copy / cut
  try {
    triggerAction();
    return;
  } catch {
    // fallback below
  }

  const model = editor.getModel();
  const selections = getSelections();
  if (!model || !selections.length) return;

  const texts = selections.map((sel) => model.getValueInRange(sel));
  const joined = texts.join('\n');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(joined);
    } catch (err) {
      console.warn('Clipboard write failed', err);
    }
  }
  if (action === 'cut') {
    editor.executeEdits(
      'cut',
      selections.map((sel) => ({ range: sel, text: '' })),
    );
  }
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

// --- 选择手柄功能函数 ---

// 更新手柄位置的核心函数
function updateSelectionHandles() {
  // 仅在移动端显示拖动手柄，桌面端直接返回
  // console.log('更新选区手柄位置');

  // // 详细调试移动端判断
  // if (typeof navigator !== 'undefined') {
  //   const ua = navigator.userAgent || '';
  //   const hasTouch =
  //     typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  //   const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  //   // console.log('移动端检测详情:', {
  //   //   userAgent: ua,
  //   //   hasTouchSupport: hasTouch,
  //   //   hasWindowTouch: typeof window !== 'undefined' && 'ontouchstart' in window,
  //   //   maxTouchPoints: navigator.maxTouchPoints,
  //   //   isMobileUserAgent: isMobileUA,
  //   //   finalIsMobile: isMobileDevice()
  //   // });
  // }

  if (!isMobileDevice()) {
    // console.log('桌面端不显示选区handle');
    selectionHandles.visible = false;
    return;
  }

  if (!editor) return;

  const selection = editor.getSelection();
  // 如果没有选区或者选区是空的（光标折叠），隐藏手柄
  if (!selection || selection.isEmpty()) {
    // if (selection.isEmpty()) {
    //   console.log('选区为空，隐藏手柄');
    // }
    selectionHandles.visible = false;
    return;
  }

  // if (!selection) {
  //   selectionHandles.visible = false;
  //   return;
  // }

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

function shouldEnableWordWrap(language: string) {
  return language === 'markdown' || language === 'plaintext';
}

function resolveFsTarget(file: OpenFile): { dir: FsEntry; name: string } | null {
  const entry = file.fsEntry;
  if (!entry || entry.kind !== 'file') return null;

  const normalizedPath = (entry.path ?? file.path ?? '').replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  const fileName = entry.name || file.name || parts.pop() || '';
  if (!fileName) return null;
  const dirParts = parts.slice(0, -1); // 去掉文件名，保留目录路径
  const dirPath = dirParts.join('/');
  const dirName = dirParts[dirParts.length - 1] || '';

  const dirEntry: FsEntry = {
    kind: 'directory',
    name: dirName || 'root',
    path: dirPath,
    ...(entry.capDirectory ? { capDirectory: entry.capDirectory } : {}),
  };
  return { dir: dirEntry, name: fileName };
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

  // 优先使用统一的 Fs 封装
  const fsTarget = resolveFsTarget(workspace.currentFile);
  if (fsTarget) {
    try {
      await Fs.writeText(fsTarget.dir, fsTarget.name, content);
      updateCurrentContent(content);
      markCurrentFileSaved(content);
      return;
    } catch (error) {
      console.error('使用 Fs 写入失败，尝试 FileSystemHandle 备用方案:', error);
    }
  }

  // 备用：File System Access API（仅在 web/桌面有 handle 时）
  if (workspace.currentFile.handle && workspace.currentFile.handle.kind === 'file') {
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
  const initialSize = getEditorSize();
  editor = monaco.editor.create(editorEl.value, {
    value: '选择左侧文件后在此编辑',
    language: 'plaintext',
    theme: 'vs-dark',
    automaticLayout: false,
    ...(initialSize ? { dimension: initialSize } : { dimension: { width: 1, height: 1 } }),
  });
  editorReady.value = true;

  disposables.push(
    editor.onDidChangeModelContent(() => {
      const content = editor?.getValue() ?? '';
      updateCurrentContent(content);
      // 内容变化时更新手柄位置
      void nextTick(() => updateSelectionHandles());
    }),
  );

  // 注册选择手柄相关事件监听器

  // 1. 选区改变时更新手柄
  disposables.push(
    editor.onDidChangeCursorSelection(() => {
      if (!isDraggingHandle) {
        updateSelectionHandles();
      }
    }),
  );

  // 2. 滚动时更新手柄位置 (非常重要，否则手柄会浮在文字上方不动)
  disposables.push(
    editor.onDidScrollChange(() => {
      updateSelectionHandles();
    }),
  );

  // 3. 布局变化时更新手柄
  disposables.push(
    editor.onDidLayoutChange(() => {
      updateSelectionHandles();
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
  const size = getEditorSize();
  if (!editor || !size) return;
  layoutRaf = requestAnimationFrame(() => {
    const nextSize = getEditorSize();
    if (nextSize) editor?.layout(nextSize);
    layoutRaf = null;
  });
}

function getEditorSize(): { width: number; height: number } | null {
  const target = monacoWrapperRef.value ?? editorEl.value;
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  const width = Math.max(0, Math.floor(rect.width));
  const height = Math.max(0, Math.floor(rect.height));
  if (!width || !height) return null;
  return { width, height };
}

function disposeEditor() {
  if (editor && editor.getModel() && workspace.currentFile?.path) {
    const savedState = editor.saveViewState();
    viewStates.set(workspace.currentFile.path, savedState);
    setEditorViewState(
      workspace.currentFile.path,
      (savedState as unknown as EditorViewState) ?? undefined,
    );
  }
  editor?.dispose();
  disposables.forEach((d) => d.dispose());
  disposables = [];
  editor = null;
  editorReady.value = false;
}
</script>

<style scoped>
.monaco-pane {
  height: 100%;
  min-height: 400px;
  flex: 1;
  min-width: 0;
  width: 100%;
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
  min-height: 0;
  min-width: 0;
  width: 100%;
  height: 100%;
}

.monaco-wrapper {
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.editor-body {
  flex: 1 1 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
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

/* 选择手柄样式 */
.selection-handle {
  position: absolute;
  width: 4px; /* 增大手柄宽度，更容易触摸 */
  background-color: #007acc; /* VSCode 默认选中色 */
  pointer-events: auto;
  z-index: 100;
  touch-action: none; /* 防止拖动时触发滚动 */
  border-radius: 2px; /* 稍微圆角 */
}

/* 透明扩展区域 - 增大可点击区域 */
.selection-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px; /* 24x24px 的触摸区域 */
  height: 24px;
  /* 透明但可点击 */
  background-color: transparent;
  border-radius: 50%;
  /* 确保在主手柄下面 */
  z-index: -1;
}

/* 圆点头部 - 使用伪元素 */
.selection-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px; /* 调整圆点位置 */
  transform: translateX(-50%); /* 居中 */
  width: 8px; /* 圆点尺寸 */
  height: 8px;
  border-radius: 50%; /* 完全的圆形 */
  background-color: #007acc;
}

/* 圆点中心隐藏的点击扩大区域 */
.selection-handle::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -10px; /* 与圆点对齐 */
  transform: translateX(-50%);
  width: 16px; /* 扩大点击区域 */
  height: 16px;
  border-radius: 50%; /* 圆形 */
  background-color: transparent; /* 透明 */
  pointer-events: auto; /* 确保可点击 */
  z-index: 10; /* 在圆点上方 */
}
</style>
