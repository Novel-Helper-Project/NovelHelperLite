<template>
  <div class="monaco-pane">
    <!-- 隐藏的测量容器，只渲染未测量的标签，测量后自动移除 -->
    <div ref="tabMeasureRef" class="tab-measure-container" aria-hidden="true">
      <div
        v-for="file in unmeasuredFiles"
        :key="'measure-' + file.uid"
        class="tab"
        :class="{ unloaded: file.isUnloaded }"
        :ref="(el) => setMeasureRef(file.path, el as HTMLDivElement | null)"
      >
        <span class="tab-label">
          {{ file.name }}
          <span v-if="isFileDirty(file)" class="tab-dirty"></span>
          <span v-if="file.isUnloaded" class="tab-unloaded-icon">💤</span>
        </span>
        <button class="tab-close" type="button">×</button>
      </div>
    </div>

    <div ref="tabbarRef" class="tabbar">
      <div ref="tabTrackRef" class="tab-track" :style="tabTrackStyle">
        <div class="tab-spacer" :style="{ width: `${tabLayout.before}px` }" />
        <template v-for="entry in tabLayout.visible" :key="entry.file.uid">
          <div
            class="tab"
            :class="{
              active: entry.file.uid === workspace.currentFile?.uid,
              unloaded: entry.file.isUnloaded,
            }"
            @click="activateTab(entry.file.path)"
            :ref="(el) => setTabRef(entry.file.path, el as HTMLDivElement | null)"
            :title="
              entry.file.isUnloaded ? `${entry.file.name} (已卸载，点击重新加载)` : entry.file.name
            "
          >
            <span class="tab-label">
              {{ entry.file.name }}
              <span v-if="isFileDirty(entry.file)" class="tab-dirty" aria-hidden="true"></span>
              <span v-if="entry.file.isUnloaded" class="tab-unloaded-icon" aria-hidden="true"
                >💤</span
              >
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
      <div v-if="workspace.currentFile" class="row items-center gap-sm">
        <q-btn
          v-for="action in toolbarActions"
          :key="action.id"
          dense
          flat
          :icon="action.icon"
          :label="action.label"
          :title="action.title"
          :disable="isActionDisabled(action)"
          @click="() => handleToolbarAction(action)"
        />
      </div>
    </div>

    <div ref="editorBodyRef" class="editor-body">
      <!-- 欢迎页面 -->
      <div v-if="!workspace.currentFile" class="welcome">
        <div class="welcome-title">欢迎使用 Novel Helper Lite</div>
        <div class="welcome-subtitle">
          在左侧选择文件或打开文件夹以开始 <br />
          Novel Helper Lite 是 Novel
          Helper(ANH)的姊妹项目，提供跨平台轻量化，模块化，本地化的小说和文本编辑器<br />Lite项目和ANH项目均由同一团队维护，致力于为用户提供最佳的阅读和写作体验。<br />如果需要更全面的功能，请使用
          Novel Helper (ANH)。ANH是一个Vscode扩展，提供更丰富的功能和更强大的编辑体验。<br />官网：https://anh.sirrus.cc
        </div>
        <div class="welcome-hint">支持文本编辑、图片预览、多标签</div>
      </div>

      <!-- 统一的编辑器容器 - 自动选择合适的编辑器 -->
      <keep-alive v-else :max="keepAliveMax">
        <EditorContainer
          :key="workspace.currentFile.uid"
          :file="workspace.currentFile"
          @update:content="updateCurrentContent"
          @update:viewState="
            (state) =>
              workspace.currentFile && setEditorViewState(workspace.currentFile.path, state)
          "
          @update:imageState="
            (state) => workspace.currentFile && setImageViewState(workspace.currentFile.path, state)
          "
        />
      </keep-alive>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Dialog } from 'quasar';

import { useWorkspaceStore } from 'src/stores/workspace';
import type { OpenFile } from 'src/stores/workspace';
import { useSettingsStore } from 'src/stores/settings';

import { editorRegistry } from 'src/types/editorProvider';
import type { ToolbarAction } from 'src/types/editorProvider';
import EditorContainer from './EditorContainer.vue';
import { saveFile } from 'src/services/fileSaver';

const {
  state: workspace,
  updateCurrentContent,

  setActiveFile,
  closeFile,
  setImageViewState,
  setEditorViewState,
  reloadUnloadedFile,
} = useWorkspaceStore();

const settingsStore = useSettingsStore();

// 动态计算 keep-alive 的 max 值
const keepAliveMax = computed(() => {
  if (settingsStore.tabs.enableGC) {
    return settingsStore.tabs.maxCachedTabs;
  }
  return 20; // 默认值
});

// 计算当前文件的工具栏按钮
const toolbarActions = computed(() => {
  if (!workspace.currentFile) return [];
  // 显式依赖 activeEditorId 以确保响应式更新
  const _activeEditorId = workspace.currentFile.activeEditorId;
  void _activeEditorId; // 触发响应式依赖
  return editorRegistry.getToolbarActions(workspace.currentFile);
});

// 判断按钮是否禁用
function isActionDisabled(action: ToolbarAction): boolean {
  if (!workspace.currentFile) return true;
  if (typeof action.disabled === 'function') {
    return action.disabled(workspace.currentFile);
  }
  return action.disabled ?? false;
}

// 处理工具栏按钮点击
async function handleToolbarAction(action: ToolbarAction) {
  if (!workspace.currentFile) return;
  await action.onClick(workspace.currentFile);
}

const editorBodyRef = ref<HTMLDivElement | null>(null);
const tabbarRef = ref<HTMLDivElement | null>(null);
const tabTrackRef = ref<HTMLDivElement | null>(null);
const tabMeasureRef = ref<HTMLDivElement | null>(null);
const measureRefs = new Map<string, HTMLDivElement>();
const measuredPaths = ref(new Set<string>()); // 已测量的文件路径
// 记录每个文件测量时的休眠状态，用于检测状态变化
const measuredUnloadedState = new Map<string, boolean>();

// 计算未测量的文件列表（包括状态变化的文件）
const unmeasuredFiles = computed(() => {
  return workspace.openFiles.filter((file) => {
    // 如果从未测量过，需要测量
    if (!measuredPaths.value.has(file.path)) return true;
    // 如果状态发生变化，需要重新测量
    const prevState = measuredUnloadedState.get(file.path);
    if (prevState !== undefined && prevState !== !!file.isUnloaded) {
      // 状态变化，清除旧测量数据
      measuredPaths.value.delete(file.path);
      tabSizes.delete(file.path);
      return true;
    }
    return false;
  });
});
let resizeObserver: ResizeObserver | null = null;
let revealListener: ((event: Event) => void) | null = null;
let activateTabListener: ((event: Event) => void) | null = null;
let closeTabListener: ((event: Event) => void) | null = null;
let pendingReveal: RevealDetail | null = null;
let tabbarWheelListener: ((event: WheelEvent) => void) | null = null;
let tabResizeObserver: ResizeObserver | null = null;
const tabRefs = new Map<string, HTMLDivElement>();
const tabScroll = ref(0);
const tabMetrics = reactive({ viewport: 0 });
const tabSizes = new Map<string, number>();
const tabSizesVersion = ref(0);
let tabTouchStartX: number | null = null;
let tabTouchStartScroll = 0;
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

const currentPathLabel = computed(() => {
  const path = workspace.currentFile?.path;
  if (!path) return '请选择左侧文件以打开';
  const normalized = path.replace(/^\\+/, '/');
  return normalized.replace(/^\/+/, '/');
});

onMounted(() => {
  revealListener = (event: Event) => handleRevealEvent(event);
  window.addEventListener('workspace-reveal', revealListener);

  // 监听激活标签页事件（供外部调用）
  activateTabListener = (event: Event) => {
    const detail = (event as CustomEvent<{ path: string }>).detail;
    if (detail?.path) {
      void activateTab(detail.path);
    }
  };
  window.addEventListener('editor-activate-tab', activateTabListener);

  // 监听关闭标签页事件（供外部调用）
  closeTabListener = (event: Event) => {
    const detail = (event as CustomEvent<{ path: string }>).detail;
    if (detail?.path) {
      closeTab(detail.path);
    }
  };
  window.addEventListener('editor-close-tab', closeTabListener);

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

  // 监听标签页休眠状态变化，触发重新测量
  watch(
    () => workspace.openFiles.map((f) => `${f.path}:${f.isUnloaded ? '1' : '0'}`).join('|'),
    () => {
      void nextTick(() => {
        measureTabs();
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
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (revealListener) {
    window.removeEventListener('workspace-reveal', revealListener);
    revealListener = null;
  }
  if (activateTabListener) {
    window.removeEventListener('editor-activate-tab', activateTabListener);
    activateTabListener = null;
  }
  if (closeTabListener) {
    window.removeEventListener('editor-close-tab', closeTabListener);
    closeTabListener = null;
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

function applyPendingReveal() {
  if (!pendingReveal) return;
  if (!workspace.currentFile || workspace.currentFile.path !== pendingReveal.path) return;
  // Monaco 编辑器现在由 EditorContainer 管理,reveal 功能已废弃
  pendingReveal = null;
}

function measureTabs() {
  const host = tabbarRef.value;
  if (!host) return;
  tabMetrics.viewport = host.clientWidth;

  // 从测量容器获取未测量标签的宽度
  for (const file of workspace.openFiles) {
    if (measuredPaths.value.has(file.path)) {
      // 已经测量过，跳过
      continue;
    }

    const measureEl = measureRefs.get(file.path);
    if (measureEl) {
      // 测量并缓存宽度
      tabSizes.set(file.path, measureEl.offsetWidth);
      // 记录测量时的休眠状态
      measuredUnloadedState.set(file.path, !!file.isUnloaded);
      // 标记为已测量，下次渲染时将从测量容器中移除
      measuredPaths.value.add(file.path);
    } else {
      // 如果测量元素不存在，尝试从可见元素获取
      const visibleEl = tabRefs.get(file.path);
      if (visibleEl) {
        tabSizes.set(file.path, visibleEl.offsetWidth);
        measuredUnloadedState.set(file.path, !!file.isUnloaded);
        measuredPaths.value.add(file.path);
      } else if (!tabSizes.has(file.path)) {
        // 最后才使用默认值（不标记为已测量，等待下次测量）
        tabSizes.set(file.path, 120);
      }
    }
  }

  // 清理已关闭文件的测量记录
  const openPaths = new Set(workspace.openFiles.map((f) => f.path));
  for (const path of measuredPaths.value) {
    if (!openPaths.has(path)) {
      measuredPaths.value.delete(path);
      measuredUnloadedState.delete(path);
      tabSizes.delete(path);
    }
  }

  tabSizesVersion.value += 1;
  clampTabScroll();
}

function setMeasureRef(path: string, el: HTMLDivElement | null) {
  if (el) {
    measureRefs.set(path, el);
  } else {
    measureRefs.delete(path);
  }
}

function clampTabScroll() {
  // 使用 tabLayout.total，它基于所有标签的缓存宽度计算
  const totalWidth = tabLayout.value.total;
  const max = Math.max(0, totalWidth - tabMetrics.viewport);
  tabScroll.value = Math.max(0, Math.min(tabScroll.value, max));
}

function updateTabScroll(next: number) {
  // 使用 tabLayout.total，它基于所有标签的缓存宽度计算
  const totalWidth = tabLayout.value.total;
  const max = Math.max(0, totalWidth - tabMetrics.viewport);
  const clampedValue = Math.max(0, Math.min(next, max));
  tabScroll.value = clampedValue;
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

// 方案 B：Milkdown 完全使用 flex 布局填满 editor-body，不再单独计算高度

async function activateTab(path: string) {
  // 检查文件是否已卸载，如果是则先重新加载
  const file = workspace.openFiles.find((f) => f.path === path);
  if (file?.isUnloaded) {
    await reloadUnloadedFile(path);
  }

  setActiveFile(path);
  void nextTick(() => ensureActiveTabVisible());
}

function closeTab(path: string) {
  // 查找要关闭的文件
  const file = workspace.openFiles.find((f) => f.path === path);
  if (!file) {
    closeFile(path);
    return;
  }

  // 检查是否有未保存的更改
  if (isFileDirty(file)) {
    Dialog.create({
      title: '未保存的更改',
      message: `文件 "${file.name}" 有未保存的更改。是否要保存？`,
      cancel: {
        label: '不保存',
        flat: true,
        color: 'negative',
      },
      ok: {
        label: '保存',
        color: 'primary',
      },
      persistent: true,
    })
      .onOk(() => {
        // 用户选择保存
        saveFile(file, file.content)
          .then(() => {
            closeFile(path);
          })
          .catch((error) => {
            console.error('保存文件失败:', error);
            // 保存失败，询问是否仍要关闭
            Dialog.create({
              title: '保存失败',
              message: '文件保存失败，是否仍要关闭（将丢失更改）？',
              cancel: {
                label: '取消',
                flat: true,
              },
              ok: {
                label: '仍要关闭',
                color: 'negative',
              },
            }).onOk(() => {
              closeFile(path);
            });
          });
      })
      .onCancel(() => {
        // 用户选择不保存，直接关闭
        closeFile(path);
      });
  } else {
    // 没有未保存的更改，直接关闭
    closeFile(path);
  }
}

function isFileDirty(file: OpenFile) {
  return file.content !== (file.savedContent ?? '');
}
</script>

<style scoped>
/* 隐藏的测量容器，用于预先计算所有标签宽度 */
.tab-measure-container {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  height: 0;
  overflow: hidden;
  display: flex;
  gap: 4px;
}

.monaco-pane {
  height: 100%;
  max-height: 100%;
  flex: 1;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.tabbar {
  height: 38px;
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

.theme-light .tabbar {
  background: #e8eaed;
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

.theme-light .tab.active {
  background: #ffffff;
  color: #1f2937;
}

.theme-light .tab:hover {
  background: #f3f4f6;
  color: #1f2937;
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

.tab-unloaded-icon {
  font-size: 10px;
  margin-left: 2px;
  opacity: 0.7;
}

.tab.unloaded {
  opacity: 0.6;
}

.tab.unloaded .tab-label {
  font-style: italic;
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

.milkdown-wrapper {
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-body {
  flex: 1 1 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background: #0f1216;
  border: 1px solid var(--vscode-border);
  border-radius: 0;
  padding: 0;
  overflow: hidden;
}

.theme-light .editor-body {
  background: #ffffff;
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

.theme-light .image-placeholder {
  background: #ffffff;
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
