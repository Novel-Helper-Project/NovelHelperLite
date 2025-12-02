<template>
  <div class="vscode-explorer">
    <div class="explorer-toolbar">
      <div class="explorer-title">
        文件资源管理器
        <span
          v-if="!fileSystemSupport.supported"
          class="compatibility-indicator clickable"
          :title="fileSystemSupport.reason"
          @click="showFileAccessError"
        >
          ⚠️
        </span>
      </div>
      <div class="explorer-actions">
        <button class="ghost-btn" type="button" title="打开文件夹" @click="pickWorkspace">
          <span class="material-icons">folder_open</span>
        </button>
        <button
          v-if="isCapacitor"
          class="ghost-btn"
          type="button"
          title="打开应用私有工作区"
          @click="openPrivateWorkspace"
        >
          <span class="material-icons">inventory_2</span>
        </button>
        <!-- <button
          v-if="isCapacitor"
          class="ghost-btn"
          type="button"
          title="选择移动端根目录"
          @click="openCapRootMenu($event)"
        >
          <span class="material-icons">drive_file_move</span>
        </button> -->
        <button
          v-if="!fileSystemSupport.supported && !isCapacitor"
          class="ghost-btn help-btn"
          type="button"
          title="查看兼容性问题"
          @click="showCompatibilityHelp"
        >
          <span class="material-icons">help</span>
        </button>
        <button
          class="ghost-btn"
          type="button"
          title="新建文件"
          @click="createSiblingOrChild('file')"
        >
          <span class="material-icons">note_add</span>
        </button>
        <button
          class="ghost-btn"
          type="button"
          title="新建文件夹"
          @click="createSiblingOrChild('folder')"
        >
          <span class="material-icons">create_new_folder</span>
        </button>
      </div>
    </div>

    <n-dropdown
      trigger="manual"
      placement="bottom-start"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :options="contextMenuOptions"
      :show="contextMenu.show"
      @select="handleMenuSelect"
      @update:show="contextMenu.show = $event"
    />

    <q-dialog v-model="propertyDialog.show" persistent>
      <q-card class="prop-card">
        <q-card-section class="prop-header row items-center">
          <div class="text-h6">属性</div>
          <q-space />
          <q-btn dense round flat icon="close" @click="propertyDialog.show = false" />
        </q-card-section>
        <q-separator />
        <q-card-section class="prop-body">
          <div class="prop-row">
            <span class="prop-label">名称</span>
            <span class="prop-value">{{ propertyDialog.name }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">类型</span>
            <span class="prop-value">{{ propertyDialog.type }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">路径</span>
            <span class="prop-value prop-path">{{ propertyDialog.path }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">大小</span>
            <span class="prop-value">{{ propertyDialog.size }}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">修改时间</span>
            <span class="prop-value">{{ propertyDialog.modified }}</span>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <div class="explorer-trees">
      <TreePanel
        v-if="openFiles.length"
        class="tree-section"
        title="已打开的编辑器"
        :count="openFiles.length"
        v-model="openedExpanded"
        :resizable="true"
        :height="openedHeight"
        :min-height="MIN_OPENED_HEIGHT"
        :max-height="MAX_OPENED_HEIGHT"
        @update:height="openedHeight = $event"
      >
        <n-scrollbar class="tree-scroll" style="height: 100%">
          <n-tree
            block-line
            :data="openedTreeData"
            :selected-keys="openedSelected"
            :render-prefix="renderOpenedPrefix"
            :render-suffix="renderOpenedSuffix"
            :style="{ minHeight: '100%' }"
            @update:selected-keys="handleOpenedSelect"
          />
        </n-scrollbar>
      </TreePanel>

      <TreePanel
        class="tree-section explorer-tree"
        title="文件资源管理器"
        v-model="explorerExpanded"
        :collapsible="true"
      >
        <n-scrollbar class="explorer-scroll tree-scroll">
          <n-tree
            class="vscode-tree"
            block-line
            draggable
            cascade
            selectable
            :data="explorerData"
            :expanded-keys="expandedKeys"
            :selected-keys="selectedKeys"
            :allow-drop="allowDrop"
            :render-prefix="renderPrefix"
            :node-props="nodeProps"
            :style="{ minHeight: '100%' }"
            @update:expanded-keys="expandedKeys = $event"
            @update:selected-keys="handleSelect"
            @drop="handleDrop"
            @node-contextmenu="handleContextMenu"
          />
        </n-scrollbar>
      </TreePanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, reactive, ref, onMounted, onBeforeUnmount } from 'vue';

// 添加 Capacitor 全局类型声明
declare global {
  interface Window {
    Capacitor?: {
      getPlatform(): string;
      isNative?: boolean;
      isPluginAvailable?(pluginName: string): boolean;
      [key: string]: unknown;
    };
  }
}
import { NDropdown, NScrollbar, NTree } from 'naive-ui';
import type { TreeDropInfo, TreeOption } from 'naive-ui';
import { useWorkspaceStore, type OpenFile } from 'src/stores/workspace';
import Fs, { type FsEntry, checkFileSystemSupport } from 'src/services/filesystem';
import {
  persistLastWorkspace,
  loadLastWorkspace,
  getPersistedDirectoryHandle,
} from 'src/services/workspacePersistence';
// import type { Directory as CapDirectory } from '@capacitor/filesystem';
import TreePanel from './TreePanel.vue';

type ExplorerNode = TreeOption & {
  key: string;
  label: string;
  type: 'file' | 'folder';
  children?: ExplorerNode[];
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  path?: string;
  fsEntry?: FsEntry;
};

type ClipboardItem = {
  entry: FsEntry;
  type: ExplorerNode['type'];
  name: string;
  path?: string;
  mode: 'copy' | 'cut';
  parentKey?: string;
  parentEntry?: FsEntry;
};

function normalizeSeparator(value: string, separator: '/' | '\\') {
  if (separator === '\\') return value.replace(/\//g, '\\');
  return value.replace(/\\/g, '/');
}

function joinPaths(base: string | undefined, name: string) {
  if (!base) return name;
  const separator: '/' | '\\' = base.includes('\\') ? '\\' : '/';
  const cleanedBase = base.replace(/[\\/]+$/u, '');
  const cleanedName = name.replace(/^[\\/]+/u, '');
  return normalizeSeparator(`${cleanedBase}${separator}${cleanedName}`, separator);
}

function replacePathBase(
  path: string | undefined,
  oldBase: string,
  newBase: string,
): string | undefined {
  if (!path) return path;
  const separator: '/' | '\\' = path.includes('\\') ? '\\' : '/';
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedOld = oldBase.replace(/\\/g, '/');
  const normalizedNew = newBase.replace(/\\/g, '/');

  if (normalizedPath === normalizedOld) {
    return normalizeSeparator(normalizedNew, separator);
  }
  if (normalizedPath.startsWith(`${normalizedOld}/`)) {
    const rest = normalizedPath.slice(normalizedOld.length);
    return normalizeSeparator(`${normalizedNew}${rest}`, separator);
  }
  return path;
}

const explorerData = ref<ExplorerNode[]>([]);
const explorerExpanded = ref(true);
const currentRootEntry = ref<FsEntry | null>(null);
const stopWatcher = ref<(() => void) | null>(null);
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const isCapacitor = Fs.getPlatform() === 'capacitor';

// 检查文件系统支持情况
const fileSystemSupport = checkFileSystemSupport();

const expandedKeys = ref<string[]>([]);
const selectedKeys = ref<string[]>([]);

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  node: null as ExplorerNode | null,
});
const clipboard = reactive<{ item: ClipboardItem | null }>({
  item: null,
});
const propertyDialog = reactive({
  show: false,
  name: '',
  type: '',
  path: '',
  size: '-',
  modified: '-',
});
const globalListeners = {
  click: (e: MouseEvent) => {
    if (!contextMenu.show) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.n-dropdown')) return;
    contextMenu.show = false;
  },
  contextmenu: (e: MouseEvent) => {
    if (!contextMenu.show) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.n-dropdown')) return;
    contextMenu.show = false;
  },
};

const {
  state: workspace,
  upsertAndFocus,
  setRootHandle,
  switchWorkspace,
  closeFile,
} = useWorkspaceStore();

const contextMenuOptions = computed(() => {
  const node = contextMenu.node;
  const pasteTarget =
    node?.type === 'folder'
      ? node
      : node
        ? findParentNode(node.key)
        : (explorerData.value[0] ?? null);
  const hasClipboard = !!clipboard.item;

  return [
    { label: '新建文件', key: 'new-file' },
    { label: '新建文件夹', key: 'new-folder' },
    { label: '剪切', key: 'cut', disabled: !node },
    { label: '复制', key: 'copy', disabled: !node },
    { label: '粘贴', key: 'paste', disabled: !hasClipboard || !pasteTarget },
    { label: '重命名', key: 'rename', disabled: !node },
    { label: '删除', key: 'delete', disabled: !node },
    { label: '属性', key: 'info', disabled: !node },
  ];
});

const openFiles = computed(() => workspace.openFiles);
const openedExpanded = ref(true);
const openedSelected = computed(() => (workspace.currentFile ? [workspace.currentFile.path] : []));
const openedHeight = ref(220);
const longPressTimer = ref<number | null>(null);
const MIN_OPENED_HEIGHT = 80;
const MAX_OPENED_HEIGHT = 400;
const openedTreeData = computed<TreeOption[]>(() =>
  openFiles.value.map((file) => ({
    key: file.path,
    label: file.name,
    path: file.path,
    isDirty: isDirty(file),
  })),
);

onMounted(() => {
  void restoreLastWorkspace();
  window.addEventListener('click', globalListeners.click);
  window.addEventListener('contextmenu', globalListeners.contextmenu);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', globalListeners.click);
  window.removeEventListener('contextmenu', globalListeners.contextmenu);
  stopFileWatcher();
});

const fileIconMap: Record<string, string> = {
  md: 'description',
  markdown: 'description',
  txt: 'article',
  json: 'data_object',
  yml: 'data_object',
  yaml: 'data_object',
  ts: 'code',
  tsx: 'code',
  js: 'javascript',
  jsx: 'javascript',
  vue: 'filter_none',
  html: 'language',
  css: 'palette',
  scss: 'palette',
  less: 'palette',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  mp4: 'movie',
  mp3: 'music_note',
  wav: 'music_note',
  flac: 'music_note',
  pdf: 'picture_as_pdf',
  zip: 'folder_zip',
  rar: 'folder_zip',
  '7z': 'folder_zip',
  exe: 'memory',
  dll: 'memory',
  obj: 'architecture',
  cpp: 'code',
  h: 'code',
  hpp: 'code',
  c: 'code',
  rs: 'code',
  go: 'code',
  py: 'code',
  sh: 'terminal',
  bat: 'terminal',
  ps1: 'terminal',
};

function pickIcon(node: ExplorerNode) {
  if (node.type === 'folder') {
    return expandedKeys.value.includes(node.key) ? 'folder_open' : 'folder';
  }
  const label = node.label || '';
  const match = /\.([^.]+)$/.exec(label);
  if (match) {
    const ext = match[1]?.toLowerCase();
    if (ext && fileIconMap[ext]) return fileIconMap[ext];
  }
  return 'insert_drive_file';
}

function renderPrefix({ option }: { option: TreeOption }) {
  const node = option as ExplorerNode;
  return h('span', { class: 'material-icons tree-icon' }, pickIcon(node));
}

function isDirty(file: OpenFile) {
  return file.content !== (file.savedContent ?? '');
}

function closeTab(path: string) {
  // 触发关闭标签页事件，让标签栏处理关闭逻辑（包括未保存提示）
  window.dispatchEvent(new CustomEvent('editor-close-tab', { detail: { path } }));
}

function renderOpenedPrefix({ option }: { option: TreeOption }) {
  const isActive = option.key === workspace.currentFile?.path;
  const dirty = (option as unknown as { isDirty?: boolean }).isDirty;
  return h('span', { class: ['opened-dot', { dirty, active: isActive }] });
}

function renderOpenedSuffix({ option }: { option: TreeOption }) {
  const path = option.key as string;
  return h(
    'button',
    {
      class: 'opened-close',
      type: 'button',
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        closeTab(path);
      },
    },
    '×',
  );
}

function handleOpenedSelect(keys: (string | number)[]) {
  if (!keys.length) return;
  const path = keys[0] as string;
  // 触发标签页激活事件，让标签栏滚动到目标标签并激活
  window.dispatchEvent(new CustomEvent('editor-activate-tab', { detail: { path } }));
}

type AllowDropInfo = {
  dropPosition: 'before' | 'inside' | 'after';
  node: TreeOption;
  phase: 'drag' | 'drop';
  event?: DragEvent;
};

function allowDrop(info: AllowDropInfo) {
  const node = info.node as ExplorerNode;
  if (info.dropPosition === 'inside') {
    return node.type === 'folder';
  }
  return true;
}

function clearLongPressTimer() {
  if (longPressTimer.value) {
    window.clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
}

function handlePressStart(node: ExplorerNode, e: PointerEvent) {
  clearLongPressTimer();
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  longPressTimer.value = window.setTimeout(() => {
    handleContextMenu(node, e as unknown as MouseEvent);
  }, 600);
}

function nodeProps({ option }: { option: TreeOption }) {
  const node = option as ExplorerNode;
  return {
    onPointerdown: (e: PointerEvent) => handlePressStart(node, e),
    onPointerup: clearLongPressTimer,
    onPointerleave: clearLongPressTimer,
    onPointercancel: clearLongPressTimer,
    onContextmenu: (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleContextMenu(node, e);
    },
  };
}

async function restoreLastWorkspace() {
  try {
    const persisted = await loadLastWorkspace();
    if (!persisted || persisted.platform !== Fs.getPlatform()) {
      return;
    }

    let rootEntry: FsEntry | null = null;

    if (persisted.platform === 'web') {
      const handle = await getPersistedDirectoryHandle();
      if (!handle) return;
      const granted = await ensureDirectoryPermission(handle);
      if (!granted) return;
      rootEntry = {
        kind: 'directory',
        name: persisted.name || handle.name,
        path: persisted.path || handle.name,
        webHandle: handle,
      };
      setRootHandle(handle);
    } else if (persisted.platform === 'node') {
      if (!persisted.path) return;
      rootEntry = {
        kind: 'directory',
        name: persisted.name || persisted.path,
        path: persisted.path,
      };
    } else if (persisted.platform === 'capacitor') {
      const { Directory } = await import('@capacitor/filesystem');
      const dir = persisted.capDirectory ?? Directory.Documents;
      const displayName = persisted.name || basename(persisted.path || '') || String(dir);
      rootEntry = {
        kind: 'directory',
        name: displayName,
        path: persisted.path ?? '',
        capDirectory: dir,
      };
    }

    if (!rootEntry) return;

    const treeEntries = await Fs.buildTree(rootEntry);
    const rootKey = rootEntry.path?.trim() || rootEntry.name || 'workspace';
    const normalizedPath = rootEntry.path ?? rootKey;
    explorerData.value = [
      {
        key: rootKey,
        label: rootEntry.name || '工作区',
        type: 'folder',
        path: normalizedPath,
        fsEntry: rootEntry,
        children: convertFsTreeToExplorer(treeEntries, rootKey),
        ...(rootEntry.webHandle
          ? { handle: rootEntry.webHandle as FileSystemDirectoryHandle }
          : {}),
      },
    ];
    expandedKeys.value = [rootKey];
    selectedKeys.value = [];
    contextMenu.node = null;
    currentRootEntry.value = rootEntry;
    await restartWatcher();
    await switchWorkspace(rootKey, normalizedPath, rootEntry.capDirectory);
  } catch (error) {
    console.warn('恢复最近打开的文件夹失败', error);
  }
}

async function ensureDirectoryPermission(handle: FileSystemDirectoryHandle) {
  const permissionable = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  const state = (await permissionable.queryPermission?.({ mode: 'read' })) ?? 'prompt';
  if (state === 'granted') return true;
  const request = (await permissionable.requestPermission?.({ mode: 'read' })) ?? 'denied';
  return request === 'granted';
}

function handleContextMenu(payload: unknown, maybeEvent?: MouseEvent) {
  clearLongPressTimer();
  const info = normalizeContextPayload(payload, maybeEvent);
  if (!info) return;

  const { node, event } = info;
  event.preventDefault();
  contextMenu.node = node;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.show = true;
  selectedKeys.value = [node.key];
}

function normalizeContextPayload(
  payload: unknown,
  maybeEvent?: MouseEvent,
): { node: ExplorerNode; event: MouseEvent } | null {
  if (payload && maybeEvent) {
    return { node: payload as ExplorerNode, event: maybeEvent };
  }

  const candidate = payload as { option?: ExplorerNode; node?: ExplorerNode; event?: MouseEvent };
  if (candidate && candidate.event && (candidate.option || candidate.node)) {
    return { node: (candidate.option ?? candidate.node) as ExplorerNode, event: candidate.event };
  }

  return null;
}

function findNode(tree: ExplorerNode[], key: string): ExplorerNode | null {
  for (const item of tree) {
    if (item.key === key) return item;
    if (item.children) {
      const found = findNode(item.children, key);
      if (found) return found;
    }
  }
  return null;
}

function findParentList(
  targetKey: string,
  tree: ExplorerNode[] = explorerData.value,
): ExplorerNode[] | null {
  for (const node of tree) {
    if (node.key === targetKey) {
      return tree;
    }
    if (node.children) {
      const result = findParentList(targetKey, node.children);
      if (result) return result;
    }
  }
  return null;
}

function extractNode(
  targetKey: string,
  list = explorerData.value,
): { node: ExplorerNode; list: ExplorerNode[] } | null {
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item) continue;
    if (item.key === targetKey) {
      const spliced = list.splice(i, 1)[0];
      if (!spliced) return null;
      return { node: spliced, list };
    }
    if (item.children) {
      const result = extractNode(targetKey, item.children);
      if (result) return result;
    }
  }
  return null;
}

function containsKey(list: ExplorerNode[], targetKey: string): boolean {
  for (const item of list) {
    if (item.key === targetKey) return true;
    if (item.children && containsKey(item.children, targetKey)) return true;
  }
  return false;
}

function isDescendant(rootKey: string, maybeChildKey: string) {
  const rootNode = findNode(explorerData.value, rootKey);
  if (!rootNode?.children) return false;
  return containsKey(rootNode.children, maybeChildKey);
}

async function restartWatcher() {
  stopFileWatcher();
  if (Fs.getPlatform() !== 'node') return;
  const root = currentRootEntry.value;
  if (!root?.path) return;
  try {
    const fs = await import('node:fs');
    const watcher = fs.watch(root.path, { recursive: true }, () => {
      scheduleRefresh();
    });
    stopWatcher.value = () => watcher.close();
  } catch (err) {
    console.warn('文件监听失败', err);
  }
}

function stopFileWatcher() {
  if (stopWatcher.value) {
    stopWatcher.value();
    stopWatcher.value = null;
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshExplorerTree();
  }, 200);
}

async function refreshExplorerTree() {
  const root = currentRootEntry.value;
  if (!root) return;
  try {
    const treeEntries = await Fs.buildTree(root);
    const rootKey = root.path?.trim() || root.name || 'workspace';
    const prevExpanded = [...expandedKeys.value];
    const prevSelected = [...selectedKeys.value];
    explorerData.value = [
      {
        key: rootKey,
        label: root.name || '工作区',
        type: 'folder',
        path: root.path ?? rootKey,
        fsEntry: root,
        children: convertFsTreeToExplorer(treeEntries, rootKey),
        ...(root.webHandle ? { handle: root.webHandle as FileSystemDirectoryHandle } : {}),
      },
    ];
    expandedKeys.value = prevExpanded.filter((k) => containsKey(explorerData.value, k));
    selectedKeys.value = prevSelected.filter((k) => containsKey(explorerData.value, k));
  } catch (e) {
    console.warn('刷新文件树失败', e);
  }
}

async function handleDrop(info: TreeDropInfo) {
  const node = info.node as ExplorerNode;
  const dragNode = info.dragNode as ExplorerNode | undefined;

  if (!dragNode || dragNode.key === node.key) return;
  if (info.dropPosition === 'inside' && isDescendant(dragNode.key, node.key)) return;
  if (!dragNode.fsEntry) return;

  const sourceParentNode = findParentNode(dragNode.key);
  const sourceParentFs = sourceParentNode?.fsEntry;
  if (!sourceParentFs) {
    window.alert('无法移动根目录');
    return;
  }

  const targetDirNode = info.dropPosition === 'inside' ? node : (findParentNode(node.key) ?? null);
  if (!targetDirNode || targetDirNode.type !== 'folder' || !targetDirNode.fsEntry) {
    window.alert('无效的目标位置');
    return;
  }
  const targetFs = targetDirNode.fsEntry;

  const name = validatePasteName(targetDirNode, dragNode.label, dragNode.key);
  if (!name) return;

  try {
    const sameDirectory =
      !!sourceParentFs &&
      !!targetFs &&
      (sourceParentFs === targetFs ||
        (sourceParentFs.path &&
          targetFs.path &&
          normalizePathForCompare(sourceParentFs.path) === normalizePathForCompare(targetFs.path)));
    const sameName = dragNode.label === name;
    const moveOptions = sourceParentFs
      ? { newName: name, sourceParent: sourceParentFs }
      : { newName: name };
    const moved =
      sameDirectory && sameName
        ? dragNode.fsEntry
        : await Fs.move(dragNode.fsEntry, targetFs, moveOptions);
    const newPath =
      moved.path ?? dragNode.path ?? joinPaths(targetDirNode.path ?? targetDirNode.label, name);
    const removed = extractNode(dragNode.key);
    const movingNode = removed?.node ?? null;
    if (!movingNode) return;
    rebaseNodePaths(movingNode, dragNode.key, newPath, moved, name);

    const parentList =
      info.dropPosition === 'inside'
        ? ensureChildren(targetDirNode)
        : (findParentList(node.key) ?? ensureChildren(targetDirNode));
    if (!parentList) return;

    let insertIndex = parentList.length;
    if (info.dropPosition === 'before' || info.dropPosition === 'after') {
      const targetIndex = parentList.findIndex((item) => item.key === node.key);
      if (targetIndex >= 0) {
        insertIndex = info.dropPosition === 'before' ? targetIndex : targetIndex + 1;
      }
    }
    parentList.splice(insertIndex, 0, movingNode);
    remapKeyList(expandedKeys.value, dragNode.key, newPath);
    remapKeyList(selectedKeys.value, dragNode.key, newPath);
    updateOpenFilesAfterMove(dragNode.key, newPath, movingNode.type);
    if (info.dropPosition === 'inside' && !expandedKeys.value.includes(targetDirNode.key)) {
      expandedKeys.value.push(targetDirNode.key);
    }
    selectedKeys.value = [movingNode.key];
  } catch (e) {
    console.error('拖拽移动失败', e);
    window.alert('移动失败: ' + (e as Error).message);
  }
}

async function createSiblingOrChild(type: ExplorerNode['type']) {
  const target = contextMenu.node ?? explorerData.value[0];
  if (!target) return;

  const name = window.prompt(type === 'file' ? '新文件名称' : '新文件夹名称');
  const trimmedName = name?.trim();
  if (!trimmedName) return;

  const parentDirNode =
    target.type === 'folder' ? target : (findParentNode(target.key) ?? explorerData.value[0]);
  if (!parentDirNode) return;
  if (hasNameConflict(parentDirNode, trimmedName)) {
    window.alert('同级已存在同名项目');
    return;
  }
  const parentList = ensureChildren(parentDirNode);

  try {
    let created: FsEntry;
    if (type === 'folder') {
      const dirFs = parentDirNode.fsEntry;
      if (!dirFs || dirFs.kind !== 'directory') throw new Error('缺少目标目录');
      created = await Fs.mkdir(dirFs, trimmedName);
    } else {
      const dirFs = parentDirNode.fsEntry;
      if (!dirFs || dirFs.kind !== 'directory') throw new Error('缺少目标目录');
      created = await Fs.writeText(dirFs, trimmedName, '');
    }

    const newPath =
      created.path ?? joinPaths(parentDirNode.path ?? parentDirNode.label, trimmedName);
    const newNode: ExplorerNode =
      type === 'folder'
        ? {
            key: newPath,
            label: trimmedName,
            type,
            children: [],
            ...(created.webHandle
              ? { handle: created.webHandle as FileSystemDirectoryHandle }
              : {}),
            path: newPath,
            fsEntry: created,
          }
        : {
            key: newPath,
            label: trimmedName,
            type,
            ...(created.webHandle ? { handle: created.webHandle as FileSystemFileHandle } : {}),
            path: newPath,
            fsEntry: created,
          };

    parentList.push(newNode);
    if (type === 'folder' && !expandedKeys.value.includes(parentDirNode.key)) {
      expandedKeys.value.push(parentDirNode.key);
    }
    selectedKeys.value = [newNode.key];
  } catch (e) {
    console.error('创建失败', e);
    window.alert('创建失败: ' + (e as Error).message);
  }
}

function findParentNode(
  targetKey: string,
  tree: ExplorerNode[] = explorerData.value,
): ExplorerNode | null {
  for (const node of tree) {
    const children = node.children ?? [];
    if (children.some((c) => c.key === targetKey)) return node;
    const nested = findParentNode(targetKey, children);
    if (nested) return nested;
  }
  return null;
}

function hasNameConflict(parent: ExplorerNode, name: string, excludeKey?: string) {
  return (parent.children ?? []).some((c) => c.label === name && c.key !== excludeKey);
}

function ensureChildren(node: ExplorerNode) {
  if (!node.children) {
    node.children = [];
  }
  return node.children;
}

function handleSelect(keys: Array<string | number>) {
  selectedKeys.value = keys.map(String);
  const firstKey = selectedKeys.value[0];
  if (!firstKey) return;
  const node = findNode(explorerData.value, firstKey);
  if (node && node.type === 'file') {
    void openFile(node);
  }
}

async function pickWorkspace() {
  const platform = Fs.getPlatform();
  if (platform === 'capacitor') {
    try {
      // 确保已获得必要权限
      console.log('开始确保权限...');
      await Fs.ensureMobilePermissions();

      // 使用统一的 Fs.pickDirectory API
      console.log('开始选择目录...');
      const rootEntry = await Fs.pickDirectory();
      console.log('选择目录结果:', rootEntry);

      const treeEntries = await Fs.buildTree(rootEntry);
      console.log('构建文件树完成，条目数:', treeEntries.length);

      const rootNode: ExplorerNode = {
        key: rootEntry.path ?? rootEntry.name,
        label: rootEntry.name,
        type: 'folder',
        path: rootEntry.path ?? rootEntry.name,
        fsEntry: rootEntry,
        children: convertFsTreeToExplorer(treeEntries, rootEntry.path ?? rootEntry.name),
      };
      explorerData.value = [rootNode];
      expandedKeys.value = [rootNode.key];
      selectedKeys.value = [];
      contextMenu.node = null;
      currentRootEntry.value = rootEntry;
      await restartWatcher();
      await persistLastWorkspace(rootEntry);
      await switchWorkspace(rootNode.key, rootEntry.path ?? rootNode.key, rootEntry.capDirectory);
      return;
    } catch (error) {
      console.error('选择目录失败:', error);

      // 处理用户取消的情况
      if (error instanceof Error && error.message.includes('用户取消选择')) {
        console.log('用户取消了目录选择');
        return;
      }

      // 处理权限问题
      if (error instanceof Error && error.message.includes('permission')) {
        window.alert('❌ 需要文件访问权限\n\n请在应用设置中授予存储权限');
        return;
      }

      // 显示详细的错误信息，包含调试信息
      let debugInfo = '';
      try {
        const platform = Fs.getPlatform();
        debugInfo = `\n\n📱 平台信息：${platform}`;
        debugInfo += `\n📱 错误类型：${error instanceof Error ? error.constructor.name : 'Error'}`;
        debugInfo += `\n📱 错误信息：${error instanceof Error ? error.message : String(error)}`;
        debugInfo += `\n📱 错误堆栈：${error instanceof Error ? error.stack || '无堆栈信息' : '无堆栈信息'}`;

        if (platform === 'capacitor') {
          debugInfo += `\n📱 是否在 Capacitor 应用中：是`;
          if (typeof window !== 'undefined' && window.Capacitor?.getPlatform) {
            const capacitorPlatform = window.Capacitor.getPlatform();
            debugInfo += `\n📱 Capacitor 平台：${capacitorPlatform}`;
          }
        } else {
          debugInfo += `\n📱 是否在 Capacitor 应用中：否`;
        }

        debugInfo += `\n📱 用户代理：${navigator.userAgent || '未知'}`;
        debugInfo += `\n\n💡 请将此错误信息截图并提供给开发者`;
      } catch (e) {
        debugInfo = `\n\n无法获取调试信息：${e instanceof Error ? e.message : String(e)}`;
      }

      window.alert(`❌ 选择目录失败${debugInfo}`);
      return;
    }
  }
  try {
    const rootEntry = await Fs.pickDirectory();
    if (
      rootEntry.webHandle &&
      (rootEntry.webHandle as FileSystemDirectoryHandle).kind === 'directory'
    ) {
      setRootHandle(rootEntry.webHandle as FileSystemDirectoryHandle);
    }
    const treeEntries = await Fs.buildTree(rootEntry);
    const rootNode: ExplorerNode = {
      key: rootEntry.path ?? rootEntry.name,
      label: rootEntry.name,
      type: 'folder',
      ...(rootEntry.webHandle ? { handle: rootEntry.webHandle as FileSystemDirectoryHandle } : {}),
      path: rootEntry.path ?? rootEntry.name,
      fsEntry: rootEntry,
      children: convertFsTreeToExplorer(treeEntries, rootEntry.path ?? rootEntry.name),
    };
    explorerData.value = [rootNode];
    expandedKeys.value = [rootNode.key];
    selectedKeys.value = [];
    contextMenu.node = null;
    currentRootEntry.value = rootEntry;
    await restartWatcher();
    await persistLastWorkspace(rootEntry);
    await switchWorkspace(rootNode.key, rootEntry.path ?? rootNode.key, rootEntry.capDirectory);
  } catch (error) {
    const errorMessage = (error as Error)?.message;
    if (
      errorMessage?.includes('文件系统访问不可用') ||
      errorMessage?.includes('File System Access')
    ) {
      // 使用新的详细错误信息，直接显示给用户
      window.alert(errorMessage);
      return;
    }
    if ((error as DOMException)?.name !== 'AbortError') {
      console.error('选择目录失败', error);
      // 对于其他错误，显示简化的提示
      window.alert('❌ 选择目录失败\n\n请检查权限设置或重试');
    }
  }
}

async function openPrivateWorkspace() {
  if (!isCapacitor) return;
  try {
    await Fs.ensureMobilePermissions();
    const rootEntry = await Fs.getPrivateWorkspaceRoot();
    const treeEntries = await Fs.buildTree(rootEntry);
    const rootKey = rootEntry.path ?? rootEntry.name;
    const rootNode: ExplorerNode = {
      key: rootKey,
      label: '应用工作区',
      type: 'folder',
      path: rootKey,
      fsEntry: rootEntry,
      children: convertFsTreeToExplorer(treeEntries, rootKey),
    };
    explorerData.value = [rootNode];
    expandedKeys.value = [rootNode.key];
    selectedKeys.value = [];
    contextMenu.node = null;
    currentRootEntry.value = rootEntry;
    await restartWatcher();
    await persistLastWorkspace(rootEntry);
    await switchWorkspace(rootNode.key, rootEntry.path ?? rootNode.key, rootEntry.capDirectory);
  } catch (error) {
    console.error('打开私有工作区失败', error);
    window.alert('❌ 无法打开应用私有工作区\n\n请确认已授权存储权限后重试');
  }
}

// async function handleCapRootSelect(key: string) {
//   const platform = Fs.getPlatform();
//   if (platform !== 'capacitor') return;
//   try {
//     const { Directory } = await import('@capacitor/filesystem');
//     const dirMap = Directory as unknown as Record<string, CapDirectory>;
//     const dir = dirMap[key] ?? Directory.Documents;
//     const rootEntry = await Fs.pickDirectory(dir);
//     const treeEntries = await Fs.buildTree(rootEntry);
//     const rootNode: ExplorerNode = {
//       key: key,
//       label: key,
//       type: 'folder',
//       path: '',
//       fsEntry: { ...rootEntry, name: key },
//       children: convertFsTreeToExplorer(treeEntries, ''),
//     };
//     explorerData.value = [rootNode];
//     expandedKeys.value = [rootNode.key];
//     selectedKeys.value = [];
//     contextMenu.node = null;
//     await persistLastWorkspace(rootEntry);
//     await switchWorkspace(rootNode.key, rootEntry.path ?? rootNode.key, rootEntry.capDirectory);
//   } catch (e) {
//     console.error('选择根目录失败', e);
//   } finally {
//     capRootMenu.show = false;
//   }
// }

function convertFsTreeToExplorer(
  entries: Array<FsEntry & { children?: FsEntry[] }>,
  basePath: string,
): ExplorerNode[] {
  const nodes: ExplorerNode[] = [];
  for (const e of entries) {
    const currentPath = `${basePath}/${e.name}`;
    if (e.kind === 'directory') {
      nodes.push({
        key: currentPath,
        label: e.name,
        type: 'folder',
        ...(e.webHandle ? { handle: e.webHandle as FileSystemDirectoryHandle } : {}),
        path: currentPath,
        fsEntry: e,
        children: convertFsTreeToExplorer(e.children ?? [], currentPath),
      });
    } else {
      nodes.push({
        key: currentPath,
        label: e.name,
        type: 'file',
        ...(e.webHandle ? { handle: e.webHandle as FileSystemFileHandle } : {}),
        path: currentPath,
        fsEntry: e,
      });
    }
  }
  return nodes;
}

function basename(p: string): string {
  const s = p.replace(/\/+$/u, '');
  const colonIdx = s.indexOf(':');
  const withoutPrefix = colonIdx >= 0 ? s.slice(colonIdx + 1) : s;
  const parts = withoutPrefix.split('/');
  return parts[parts.length - 1] || '';
}

// 已由 Fs.buildTree 替代

async function openFile(node: ExplorerNode) {
  if (node.type !== 'file' || !node.fsEntry) return;
  const path = node.path ?? node.key;
  const platform = Fs.getPlatform();

  if (platform === 'web') {
    try {
      const blob = await Fs.getBlob(node.fsEntry);
      const mime = blob.type || 'application/octet-stream';
      if (mime.includes('pdf')) {
        const mediaUrl = URL.createObjectURL(blob);
        upsertAndFocus({
          path,
          name: node.label,
          content: '',
          handle: (node.handle as FileSystemFileHandle) ?? null,
          fsEntry: node.fsEntry,
          mime,
          mediaUrl,
        });
        return;
      }
      if (mime.startsWith('image/')) {
        const mediaUrl = URL.createObjectURL(blob);
        upsertAndFocus({
          path,
          name: node.label,
          content: '',
          handle: (node.handle as FileSystemFileHandle) ?? null,
          fsEntry: node.fsEntry,
          mime,
          mediaUrl,
          isImage: true,
        });
        return;
      }
      const content = await blob.text();
      upsertAndFocus({
        path,
        name: node.label,
        content,
        handle: (node.handle as FileSystemFileHandle) ?? null,
        fsEntry: node.fsEntry,
        mime,
        isImage: false,
      });
      return;
    } catch (e) {
      console.error('读取文件失败', e);
    }
  }

  if (platform === 'capacitor') {
    try {
      const blob = await Fs.getBlob(node.fsEntry);
      const mime = blob.type || 'application/octet-stream';
      if (mime.includes('pdf')) {
        const mediaUrl = URL.createObjectURL(blob);
        upsertAndFocus({
          path,
          name: node.label,
          content: '',
          handle: null,
          fsEntry: node.fsEntry,
          mime,
          mediaUrl,
        });
        return;
      }
      if (mime.startsWith('image/')) {
        const mediaUrl = URL.createObjectURL(blob);
        upsertAndFocus({
          path,
          name: node.label,
          content: '',
          handle: null,
          fsEntry: node.fsEntry,
          mime,
          mediaUrl,
          isImage: true,
        });
        return;
      }
      const content = await blob.text();
      upsertAndFocus({
        path,
        name: node.label,
        content,
        handle: null,
        fsEntry: node.fsEntry,
        mime,
        isImage: false,
      });
      return;
    } catch (e) {
      console.error('读取文件失败', e);
    }
  }

  try {
    const blob = await Fs.getBlob(node.fsEntry);
    const mime = blob.type || 'application/octet-stream';
    if (mime.includes('pdf')) {
      const mediaUrl = URL.createObjectURL(blob);
      upsertAndFocus({
        path,
        name: node.label,
        content: '',
        handle: null,
        fsEntry: node.fsEntry,
        mime,
        mediaUrl,
      });
      return;
    }
    if (mime.startsWith('image/')) {
      const mediaUrl = URL.createObjectURL(blob);
      upsertAndFocus({
        path,
        name: node.label,
        content: '',
        handle: null,
        fsEntry: node.fsEntry,
        mime,
        mediaUrl,
        isImage: true,
      });
      return;
    }
    const content = await blob.text();
    upsertAndFocus({
      path,
      name: node.label,
      content,
      handle: null,
      fsEntry: node.fsEntry,
      mime: mime || 'text/plain',
      isImage: false,
    });
  } catch (e) {
    console.error('读取文件失败', e);
  }
}

async function renameNode(target: ExplorerNode) {
  if (!target.fsEntry) return;
  const parent = findParentNode(target.key);
  const parentFs = parent?.fsEntry;
  if (!parentFs || parentFs.kind !== 'directory') {
    window.alert('无法重命名根目录');
    return;
  }
  const name = window.prompt('重命名', target.label)?.trim();
  if (!name || name === target.label) return;
  if (hasNameConflict(parent, name)) {
    window.alert('同级已存在同名项目');
    return;
  }

  try {
    const updatedEntry = await Fs.move(target.fsEntry, parentFs, {
      newName: name,
      sourceParent: parentFs,
    });
    const oldKey = target.key;
    const newPath = updatedEntry.path ?? joinPaths(parent.path ?? parent.label, name);
    rebaseNodePaths(target, oldKey, newPath, updatedEntry, name);
    remapKeyList(expandedKeys.value, oldKey, newPath);
    remapKeyList(selectedKeys.value, oldKey, newPath);
    updateOpenFilesAfterMove(oldKey, newPath, target.type);
  } catch (e) {
    console.error('重命名失败', e);
    window.alert('重命名失败: ' + (e as Error).message);
  }
}

async function deleteNode(target: ExplorerNode) {
  if (!target.fsEntry) return;
  const parent = findParentNode(target.key);
  const parentFs = parent?.fsEntry;
  if (!parentFs) {
    window.alert('无法删除根目录');
    return;
  }
  const confirmed = window.confirm(`确认删除「${target.label}」吗？`);
  if (!confirmed) return;
  try {
    await Fs.remove(target.fsEntry, parentFs);
    extractNode(target.key);
    closeOpenFilesUnder(target.key, target.type);
    if (clipboard.item && clipboard.item.path === target.path) {
      clipboard.item = null;
    }
    if (selectedKeys.value.includes(target.key)) {
      selectedKeys.value = [];
    }
  } catch (e) {
    console.error('删除失败', e);
    window.alert('删除失败: ' + (e as Error).message);
  }
}

function normalizePathForCompare(path: string) {
  return path.replace(/\\/g, '/');
}

function closeOpenFilesUnder(baseKey: string, type: ExplorerNode['type']) {
  const base = normalizePathForCompare(baseKey);
  const isDir = type === 'folder';
  const open = [...workspace.openFiles];
  for (const file of open) {
    const normalized = normalizePathForCompare(file.path);
    if (normalized === base || (isDir && normalized.startsWith(`${base}/`))) {
      closeFile(file.path);
    }
  }
}

function remapKeyList(list: string[], oldBase: string, newBase: string) {
  list.forEach((key, idx) => {
    const next = replacePathBase(key, oldBase, newBase);
    if (next && next !== key) {
      list[idx] = next;
    }
  });
}

function updateNodePathRecursive(node: ExplorerNode, oldBase: string, newBase: string) {
  const nextKey = replacePathBase(node.key, oldBase, newBase);
  if (nextKey) node.key = nextKey;
  const nextPath = replacePathBase(node.path ?? node.key, oldBase, newBase);
  if (nextPath) node.path = nextPath;
  if (node.fsEntry?.path) {
    const nextFsPath = replacePathBase(node.fsEntry.path, oldBase, newBase);
    if (nextFsPath) node.fsEntry.path = nextFsPath;
  }
  const children = node.children as ExplorerNode[] | undefined;
  if (children) {
    children.forEach((child) => updateNodePathRecursive(child, oldBase, newBase));
  }
}

function rebaseNodePaths(
  node: ExplorerNode,
  oldBase: string,
  newBase: string,
  entry: FsEntry,
  label: string,
) {
  updateNodePathRecursive(node, oldBase, newBase);
  node.label = label;
  node.key = newBase;
  node.path = newBase;
  node.fsEntry = entry;
  if (entry.webHandle) {
    node.handle =
      entry.kind === 'directory'
        ? (entry.webHandle as FileSystemDirectoryHandle)
        : (entry.webHandle as FileSystemFileHandle);
  }
}

function updateOpenFilesAfterMove(oldBase: string, newBase: string, type: ExplorerNode['type']) {
  const isDir = type === 'folder';
  const normalizedOld = normalizePathForCompare(oldBase);

  for (const file of workspace.openFiles) {
    const normalized = normalizePathForCompare(file.path);
    if (normalized === normalizedOld || (isDir && normalized.startsWith(`${normalizedOld}/`))) {
      const nextPath = replacePathBase(file.path, oldBase, newBase);
      if (nextPath) {
        file.path = nextPath;
        file.name = nextPath.split(/[/\\]+/u).pop() || file.name;
      }
    }
  }

  const current = workspace.currentFile;
  if (current) {
    const normalizedCurrent = normalizePathForCompare(current.path);
    if (
      normalizedCurrent === normalizedOld ||
      (isDir && normalizedCurrent.startsWith(`${normalizedOld}/`))
    ) {
      const nextPath = replacePathBase(current.path, oldBase, newBase);
      if (nextPath) {
        current.path = nextPath;
        current.name = nextPath.split(/[/\\]+/u).pop() || current.name;
      }
    }
  }
}

function copyNode(node: ExplorerNode) {
  if (!node.fsEntry) {
    window.alert('无法复制该项：缺少文件信息');
    return;
  }
  const pathValue = node.path ?? node.key;
  clipboard.item = {
    entry: node.fsEntry,
    type: node.type,
    name: node.label,
    path: pathValue,
    mode: 'copy',
  };
}

function cutNode(node: ExplorerNode) {
  if (!node.fsEntry) {
    window.alert('无法剪切该项：缺少文件信息');
    return;
  }
  const pathValue = node.path ?? node.key;
  const parent = findParentNode(pathValue);
  clipboard.item = {
    entry: node.fsEntry,
    type: node.type,
    name: node.label,
    path: pathValue,
    mode: 'cut',
    ...(parent?.fsEntry ? { parentKey: parent.key, parentEntry: parent.fsEntry } : {}),
  };
}

function resolveTargetDirectory(target?: ExplorerNode | null): ExplorerNode | null {
  if (!target) return explorerData.value[0] ?? null;
  if (target.type === 'folder') return target;
  return findParentNode(target.key);
}

function suggestCopyName(base: string) {
  const match = base.match(/^(.*?)(\.[^./\\]+)$/u);
  if (!match) return `${base}-副本`;
  const [, name, ext] = match;
  return `${name}-副本${ext}`;
}

function validatePasteName(
  dirNode: ExplorerNode,
  desired: string,
  excludeKey?: string,
): string | null {
  if (!hasNameConflict(dirNode, desired, excludeKey)) return desired;
  const fallback = suggestCopyName(desired);
  const next = window.prompt('目标目录已存在同名项，请输入新名称', fallback)?.trim();
  if (!next) return null;
  if (hasNameConflict(dirNode, next, excludeKey)) {
    window.alert('仍然存在同名项，请使用其他名称');
    return null;
  }
  return next;
}

async function pasteInto(target?: ExplorerNode | null) {
  const payload = clipboard.item;
  if (!payload) return;
  const dirNode = resolveTargetDirectory(target);
  if (!dirNode || dirNode.type !== 'folder' || !dirNode.fsEntry) {
    window.alert('请选择有效的目标目录');
    return;
  }

  const name = validatePasteName(dirNode, payload.name);
  if (!name) return;

  try {
    let newKeyForSelect: string | null = null;
    if (payload.mode === 'cut') {
      const oldPath = payload.path ?? payload.entry.path;
      const sourceParent =
        payload.parentKey && payload.parentEntry
          ? payload.parentEntry
          : findParentNode(oldPath ?? '')?.fsEntry;
      const moveOptions = sourceParent ? { newName: name, sourceParent } : { newName: name };
      const moved = await Fs.move(payload.entry, dirNode.fsEntry, moveOptions);
      const newPath = moved.path ?? joinPaths(dirNode.path ?? dirNode.label, name);
      const extracted = oldPath ? extractNode(oldPath) : null;
      const movedNode = extracted?.node ?? null;
      if (movedNode) {
        rebaseNodePaths(movedNode, oldPath ?? movedNode.key, newPath, moved, name);
        ensureChildren(dirNode).push(movedNode);
        if (oldPath) {
          updateOpenFilesAfterMove(oldPath, newPath, movedNode.type);
        }
        if (oldPath) {
          remapKeyList(expandedKeys.value, oldPath, newPath);
          remapKeyList(selectedKeys.value, oldPath, newPath);
        }
        newKeyForSelect = movedNode.key;
      } else {
        const fallbackNode: ExplorerNode = {
          key: newPath,
          label: name,
          type: payload.type,
          path: newPath,
          fsEntry: moved,
          ...(payload.type === 'folder'
            ? { children: convertFsTreeToExplorer(await Fs.buildTree(moved), newPath) }
            : {}),
          ...(moved.webHandle
            ? {
                handle:
                  moved.kind === 'directory'
                    ? (moved.webHandle as FileSystemDirectoryHandle)
                    : (moved.webHandle as FileSystemFileHandle),
              }
            : {}),
        };
        ensureChildren(dirNode).push(fallbackNode);
        newKeyForSelect = newPath;
      }
      clipboard.item = null;
    } else {
      const created = await Fs.copy(payload.entry, dirNode.fsEntry, { newName: name });
      const newPath = created.path ?? joinPaths(dirNode.path ?? dirNode.label, name);
      const children =
        payload.type === 'folder'
          ? convertFsTreeToExplorer(await Fs.buildTree(created), newPath)
          : undefined;

      const newNode: ExplorerNode =
        payload.type === 'folder'
          ? {
              key: newPath,
              label: name,
              type: 'folder',
              path: newPath,
              fsEntry: created,
              children: children ?? [],
              ...(created.webHandle
                ? { handle: created.webHandle as FileSystemDirectoryHandle }
                : {}),
            }
          : {
              key: newPath,
              label: name,
              type: 'file',
              path: newPath,
              fsEntry: created,
              ...(created.webHandle ? { handle: created.webHandle as FileSystemFileHandle } : {}),
            };

      ensureChildren(dirNode).push(newNode);
      newKeyForSelect = newNode.key;
    }
    if (!expandedKeys.value.includes(dirNode.key)) {
      expandedKeys.value.push(dirNode.key);
    }
    clipboard.item = payload.mode === 'copy' ? clipboard.item : null;
    selectedKeys.value = newKeyForSelect ? [newKeyForSelect] : [];
  } catch (e) {
    console.error('粘贴失败', e);
    window.alert('粘贴失败: ' + (e as Error).message);
  }
}

function formatBytes(size?: number) {
  if (typeof size !== 'number' || Number.isNaN(size)) return '-';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = size / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(1)} ${units[unitIdx]}`;
}

async function showProperties(node: ExplorerNode) {
  const baseEntry: FsEntry = node.fsEntry ?? {
    kind: node.type === 'folder' ? 'directory' : 'file',
    name: node.label,
    path: node.path ?? node.key,
  };

  let stat: Awaited<ReturnType<typeof Fs.stat>> | null = null;
  try {
    stat = await Fs.stat(baseEntry);
  } catch (e) {
    console.warn('读取属性失败', e);
  }

  propertyDialog.name = node.label;
  propertyDialog.type = node.type === 'folder' ? '文件夹' : '文件';
  propertyDialog.path = node.path ?? baseEntry.path ?? '-';
  propertyDialog.size =
    stat?.size !== undefined ? formatBytes(stat.size) : node.type === 'folder' ? '-' : '未知';
  propertyDialog.modified = stat?.modified ? new Date(stat.modified).toLocaleString() : '未知';
  propertyDialog.show = true;
}

async function handleMenuSelect(key: string) {
  const node = contextMenu.node;
  if (!node && key !== 'new-file' && key !== 'new-folder') return;

  switch (key) {
    case 'new-file':
      void createSiblingOrChild('file');
      break;
    case 'new-folder':
      void createSiblingOrChild('folder');
      break;
    case 'cut':
      if (node) cutNode(node);
      break;
    case 'copy':
      if (node) copyNode(node);
      break;
    case 'paste':
      await pasteInto(node ?? explorerData.value[0]);
      break;
    case 'rename':
      if (node) await renameNode(node);
      break;
    case 'delete':
      if (node) await deleteNode(node);
      break;
    case 'info':
      if (node) await showProperties(node);
      break;
    default:
      break;
  }
  contextMenu.show = false;
}

function showFileAccessError() {
  const support = fileSystemSupport;
  const platform = Fs.getPlatform();

  let message = `❌ 文件系统访问不可用\n\n`;
  message += `🔍 当前环境：${support.browser || '未知'}\n`;
  message += `📱 运行平台：${platform}\n`;

  // 检测是否在 Capacitor 应用内
  const isCapacitorApp =
    platform === 'capacitor' || (typeof window !== 'undefined' && 'Capacitor' in window);
  if (isCapacitorApp) {
    message += `📲 Capacitor 应用：是\n`;
    // 获取 Capacitor 平台信息
    if (typeof window !== 'undefined' && window.Capacitor && 'getPlatform' in window.Capacitor) {
      const capacitorPlatform = window.Capacitor.getPlatform();
      message += `📲 Capacitor 平台：${capacitorPlatform}\n`;
    }
  } else {
    message += `📲 Capacitor 应用：否\n`;
  }

  message += `❓ 不支持原因：${support.reason || '未知'}\n\n`;

  // 添加用户代理信息
  const userAgent = navigator.userAgent;
  if (userAgent) {
    message += `🌐 用户代理：\n${userAgent}\n\n`;
  }

  message += `💡 解决建议：\n${support.suggestion || '请尝试其他浏览器'}`;

  // 如果有调试信息，添加到控制台
  if (support.debug) {
    console.group('🔍 文件系统访问调试信息');
    console.log('User-Agent:', support.debug.userAgent);
    console.log('检测结果详情:', support.debug.details);
    console.log('当前平台:', platform);
    console.log('Capacitor状态:', isCapacitorApp);
    console.groupEnd();

    message += '\n\n📋 详细调试信息已输出到控制台，请按 F12 查看';
  }

  window.alert(message);
}

function showCompatibilityHelp() {
  showFileAccessError();
}
</script>

<style scoped>
/* 兼容性指示器样式 */
.compatibility-indicator {
  margin-left: 8px;
  font-size: 14px;
  opacity: 0.8;
  transition: opacity 0.2s ease;
}

.compatibility-indicator:hover {
  opacity: 1;
}

.compatibility-indicator.clickable {
  cursor: pointer;
}

.compatibility-indicator.clickable:hover {
  transform: scale(1.1);
  opacity: 1;
}

.compatibility-indicator.clickable:active {
  transform: scale(0.95);
}

/* 帮助按钮特殊样式 */
.help-btn {
  background-color: #ff9800 !important;
  color: white !important;
  border: 1px solid #ff9800 !important;
}

.help-btn:hover {
  background-color: #f57c00 !important;
  border-color: #f57c00 !important;
}

.explorer-title {
  display: flex;
  align-items: center;
  font-weight: 600;
  color: var(--vscode-text);
}

.opened-tree {
  height: 100%;
  overflow: hidden;
  padding-right: 2px;
}

.opened-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vscode-muted);
  margin-right: 6px;
}

.opened-dot.dirty {
  background: #e36a76;
}

.opened-dot.active {
  box-shadow: 0 0 0 2px rgba(77, 171, 247, 0.3);
}

.opened-close {
  border: none;
  background: transparent;
  color: var(--vscode-muted);
  cursor: pointer;
  font-size: 13px;
}

.opened-close:hover {
  color: #fff;
}

.explorer-trees {
  display: flex;
  flex-direction: column;
  height: calc(100% - 48px);
  min-height: 0;
}

.explorer-tree {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.tree-section {
  min-height: 0;
}

:deep(.tree-scroll) {
  height: 100%;
}

:deep(.tree-scroll .n-tree) {
  background: transparent;
  color: var(--vscode-foreground, #e8ecf3);
  font-size: 12px;
  --n-node-color-hover: rgba(60, 125, 200, 0.18);
  --n-node-color-pressed: rgba(60, 125, 200, 0.2);
  --n-node-color-active: rgba(77, 171, 247, 0.18);
  --n-node-text-color: var(--vscode-foreground, #e8ecf3);
  --n-node-text-color-disabled: #8a93a3;
  --n-node-text-color-active: #f7fbff;
}

:deep(.tree-scroll .n-tree-node) {
  border-radius: 4px;
}

:deep(.tree-scroll .n-tree-node-wrapper) {
  border-radius: 4px;
  background: transparent !important;
}

:deep(.tree-scroll .n-tree-node-wrapper:hover) {
  background: rgba(60, 125, 200, 0.18) !important;
  color: #e8ecf3;
}

:deep(.tree-scroll .n-tree-node-wrapper::before) {
  background: transparent !important;
}

:deep(.tree-scroll .n-tree-node-wrapper .n-tree-node) {
  background: transparent !important;
}

:deep(.tree-scroll .n-tree-node-wrapper .n-tree-node--selected) {
  background: rgba(62, 148, 110, 0.28) !important; /* green-ish */
  color: #f7fbff !important;
}

:deep(.tree-scroll .n-tree-node-content) {
  padding: 4px 8px;
  border-radius: 4px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
  color: var(--vscode-foreground, #e8ecf3);
}

:deep(.tree-scroll .n-tree-node-content::before),
:deep(.tree-scroll .n-tree-node-content .n-tree-node-content__state-layer) {
  background: transparent !important;
}

:deep(.tree-scroll .n-tree-node-content:hover) {
  background: transparent;
  color: #e8ecf3;
}

:deep(.tree-scroll .n-tree-node--selected .n-tree-node-content) {
  background: transparent !important;
  color: #f7fbff !important;
}

:deep(.tree-scroll .n-tree-node-content .n-tree-node-content__text) {
  color: var(--vscode-foreground, #e8ecf3);
}

:deep(.tree-scroll .n-tree-node-switcher) {
  color: var(--vscode-muted);
}

:deep(.tree-scroll .n-tree-node-content .n-tree-node-content__prefix) {
  color: var(--vscode-muted);
}

:deep(.tree-scroll .n-tree-node--selected .n-tree-node-content .n-tree-node-content__prefix),
:deep(.tree-scroll .n-tree-node-content:hover .n-tree-node-content__prefix) {
  color: #eaf3ff;
}

.opened-close {
  border: none;
  background: transparent;
  color: var(--vscode-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.opened-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

:deep(.opened-close) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--vscode-border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--vscode-foreground, #e8ecf3);
  cursor: pointer;
  font-size: 11px;
  padding: 0;
  border-radius: 4px;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}

:deep(.opened-close:hover) {
  background: rgba(77, 171, 247, 0.2);
  border-color: rgba(77, 171, 247, 0.6);
  color: #fff;
}

/* 浅色模式适配 */
.theme-light :deep(.tree-scroll .n-tree) {
  --n-node-color-hover: rgba(37, 99, 235, 0.08);
  --n-node-color-pressed: rgba(37, 99, 235, 0.12);
  --n-node-color-active: rgba(37, 99, 235, 0.1);
  --n-node-text-color: #1f2937;
  --n-node-text-color-disabled: #9ca3af;
  --n-node-text-color-active: #1f2937;
}

.theme-light :deep(.tree-scroll .n-tree-node-wrapper:hover) {
  background: rgba(37, 99, 235, 0.08) !important;
  color: #1f2937;
}

.theme-light :deep(.tree-scroll .n-tree-node-wrapper .n-tree-node--selected) {
  background: rgba(37, 99, 235, 0.15) !important;
  color: #1f2937 !important;
}

.theme-light :deep(.tree-scroll .n-tree-node-content) {
  color: #1f2937;
}

.theme-light :deep(.tree-scroll .n-tree-node-content:hover) {
  color: #1f2937;
}

.theme-light :deep(.tree-scroll .n-tree-node--selected .n-tree-node-content) {
  color: #1f2937 !important;
}

.theme-light :deep(.tree-scroll .n-tree-node-content .n-tree-node-content__text) {
  color: #1f2937;
}

.theme-light :deep(.tree-scroll .n-tree-node-switcher) {
  color: #6b7280;
}

.theme-light :deep(.tree-scroll .n-tree-node-content .n-tree-node-content__prefix) {
  color: #6b7280;
}

.theme-light
  :deep(.tree-scroll .n-tree-node--selected .n-tree-node-content .n-tree-node-content__prefix),
.theme-light :deep(.tree-scroll .n-tree-node-content:hover .n-tree-node-content__prefix) {
  color: #1f2937;
}

.theme-light .opened-close:hover {
  background: rgba(37, 99, 235, 0.1);
  color: #1f2937;
}

.theme-light :deep(.opened-close) {
  background: rgba(0, 0, 0, 0.02);
  color: #1f2937;
}

.theme-light :deep(.opened-close:hover) {
  background: rgba(37, 99, 235, 0.1);
  border-color: rgba(37, 99, 235, 0.3);
  color: #1f2937;
}

.theme-light .opened-dot.dirty {
  background: #dc2626;
}

.prop-card {
  width: 360px;
  max-width: 90vw;
}

.prop-header {
  padding: 12px 16px;
}

.prop-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prop-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.prop-label {
  color: var(--vscode-muted, #9ca3af);
  min-width: 72px;
}

.prop-value {
  color: var(--vscode-foreground, #e8ecf3);
  text-align: right;
  flex: 1;
}

.theme-light .prop-value {
  color: #111827;
}

.prop-path {
  text-align: left;
  word-break: break-all;
  white-space: normal;
}
</style>
