<template>
  <div class="vscode-explorer">
    <div class="explorer-toolbar">
      <div class="explorer-title">文件资源管理器</div>
      <div class="explorer-actions">
        <button class="ghost-btn" type="button" title="打开文件夹" @click="pickWorkspace">
          <span class="material-icons">folder_open</span>
        </button>
        <button
          v-if="isCapacitor"
          class="ghost-btn"
          type="button"
          title="选择移动端根目录"
          @click="openCapRootMenu($event)"
        >
          <span class="material-icons">drive_file_move</span>
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

    <n-dropdown
      v-if="isCapacitor"
      trigger="manual"
      placement="bottom-start"
      :x="capRootMenu.x"
      :y="capRootMenu.y"
      :options="capRootOptions"
      :show="capRootMenu.show"
      @select="handleCapRootSelect"
      @update:show="capRootMenu.show = $event"
    />

    <n-scrollbar class="explorer-scroll">
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
        @update:expanded-keys="expandedKeys = $event"
        @update:selected-keys="handleSelect"
        @drop="handleDrop"
        @node-contextmenu="handleContextMenu"
      />
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, h, reactive, ref } from 'vue';
import { NDropdown, NScrollbar, NTree } from 'naive-ui';
import type { TreeDropInfo, TreeOption } from 'naive-ui';
import { useWorkspaceStore } from 'src/stores/workspace';
import Fs, { type FsEntry } from 'src/services/fs';
import type { Directory as CapDirectory } from '@capacitor/filesystem';

type ExplorerNode = TreeOption & {
  key: string;
  label: string;
  type: 'file' | 'folder';
  children?: ExplorerNode[];
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  path?: string;
  fsEntry?: FsEntry;
};

const explorerData = ref<ExplorerNode[]>([]);

const isCapacitor = Fs.getPlatform() === 'capacitor';

const expandedKeys = ref<string[]>([]);
const selectedKeys = ref<string[]>([]);

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  node: null as ExplorerNode | null,
});

const { upsertAndFocus, setRootHandle } = useWorkspaceStore();

const contextMenuOptions = computed(() => [
  { label: '新建文件', key: 'new-file' },
  { label: '新建文件夹', key: 'new-folder' },
  { label: '重命名', key: 'rename', disabled: !contextMenu.node },
  { label: '删除', key: 'delete', disabled: !contextMenu.node },
]);

const capRootMenu = reactive({ show: false, x: 0, y: 0 });
const capRootOptions = computed(() => [
  { label: 'Documents', key: 'Documents' },
  { label: 'Data', key: 'Data' },
  { label: 'Cache', key: 'Cache' },
  { label: 'External', key: 'External' },
  { label: 'ExternalStorage', key: 'ExternalStorage' },
]);

function renderPrefix({ option }: { option: TreeOption }) {
  const node = option as ExplorerNode;
  const iconName = node.type === 'folder' ? 'folder' : 'insert_drive_file';
  return h('span', { class: 'material-icons tree-icon' }, iconName);
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

function handleContextMenu(payload: unknown, maybeEvent?: MouseEvent) {
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

function openCapRootMenu(event: MouseEvent) {
  event.preventDefault();
  capRootMenu.x = event.clientX;
  capRootMenu.y = event.clientY;
  capRootMenu.show = true;
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

function handleDrop(info: TreeDropInfo) {
  const node = info.node as ExplorerNode;
  const dragNode = info.dragNode as ExplorerNode | undefined;

  if (!dragNode || dragNode.key === node.key) return;
  if (isDescendant(dragNode.key, node.key)) return;

  const removed = extractNode(dragNode.key);
  if (!removed) return;

  if (info.dropPosition === 'inside') {
    const target = findNode(explorerData.value, node.key);
    if (!target) return;
    ensureChildren(target).push(removed.node);
    if (!expandedKeys.value.includes(target.key)) {
      expandedKeys.value.push(target.key);
    }
    return;
  }

  const parentList = findParentList(node.key);
  if (!parentList) return;
  const targetIndex = parentList.findIndex((item) => item.key === node.key);
  const insertIndex = info.dropPosition === 'before' ? targetIndex : targetIndex + 1;
  parentList.splice(insertIndex, 0, removed.node);
}

async function createSiblingOrChild(type: ExplorerNode['type']) {
  const target = contextMenu.node ?? explorerData.value[0];
  if (!target) return;

  const name = window.prompt(type === 'file' ? '新文件名称' : '新文件夹名称');
  if (!name) return;

  const parentDirNode =
    target.type === 'folder' ? target : (findParentNode(target.key) ?? explorerData.value[0]);
  if (!parentDirNode) return;
  const parentList = ensureChildren(parentDirNode);

  try {
    let created: FsEntry;
    if (type === 'folder') {
      const dirFs = parentDirNode.fsEntry;
      if (!dirFs || dirFs.kind !== 'directory') throw new Error('缺少目标目录');
      created = await Fs.mkdir(dirFs, name);
    } else {
      const dirFs = parentDirNode.fsEntry;
      if (!dirFs || dirFs.kind !== 'directory') throw new Error('缺少目标目录');
      created = await Fs.writeText(dirFs, name, '');
    }

    const newPath = `${parentDirNode.path ?? parentDirNode.label}/${name}`;
    const newNode: ExplorerNode =
      type === 'folder'
        ? {
            key: newPath,
            label: name,
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
            label: name,
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
      await Fs.ensureMobilePermissions();
      const { FilePicker } = await import('@capawesome/capacitor-file-picker');
      const picked = await FilePicker.pickDirectory();
      const dirPath = (picked as unknown as { path?: string }).path ?? '';
      const rel = toRelativeExternal(dirPath);
      const { Directory } = await import('@capacitor/filesystem');
      const rootEntry: FsEntry = {
        kind: 'directory',
        name: basename(rel) || 'ExternalStorage',
        path: rel,
        capDirectory: Directory.ExternalStorage,
      };
      const treeEntries = await Fs.buildTree(rootEntry);
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
      return;
    } catch (error) {
      console.error('系统选择目录失败，使用默认目录', error);
      const rootEntry = await Fs.pickDirectory();
      const treeEntries = await Fs.buildTree(rootEntry);
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
  } catch (error) {
    if ((error as Error)?.message?.includes('File System Access')) {
      window.alert('当前环境不支持文件系统访问');
      return;
    }
    if ((error as DOMException)?.name !== 'AbortError') {
      console.error('选择目录失败', error);
    }
  }
}

async function handleCapRootSelect(key: string) {
  const platform = Fs.getPlatform();
  if (platform !== 'capacitor') return;
  try {
    const { Directory } = await import('@capacitor/filesystem');
    const dirMap = Directory as unknown as Record<string, CapDirectory>;
    const dir = dirMap[key] ?? Directory.Documents;
    const rootEntry = await Fs.pickDirectory(dir);
    const treeEntries = await Fs.buildTree(rootEntry);
    const rootNode: ExplorerNode = {
      key: key,
      label: key,
      type: 'folder',
      path: '',
      fsEntry: { ...rootEntry, name: key },
      children: convertFsTreeToExplorer(treeEntries, ''),
    };
    explorerData.value = [rootNode];
    expandedKeys.value = [rootNode.key];
    selectedKeys.value = [];
    contextMenu.node = null;
  } catch (e) {
    console.error('选择根目录失败', e);
  } finally {
    capRootMenu.show = false;
  }
}

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

function toRelativeExternal(abs: string): string {
  const s = (abs || '').trim();
  if (!s) return '';
  if (s.startsWith('content://')) {
    const m = s.match(/\/(?:tree|document)\/([^/?#]+)/i);
    if (m && m[1]) {
      let decoded = '';
      try {
        decoded = decodeURIComponent(m[1]);
      } catch {
        decoded = m[1];
      }
      const colonIdx = decoded.indexOf(':');
      const rel = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded;
      return rel.replace(/^\/+|\/+$/g, '');
    }
    return '';
  }
  const cleaned = s.replace(/^file:\/\//, '').replace(/^\/?storage\/emulated\/0\/?/, '');
  return cleaned.replace(/^\/+|\/+$/g, '');
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
      if (mime.startsWith('image/')) {
        const mediaUrl = URL.createObjectURL(blob);
        upsertAndFocus({
          path,
          name: node.label,
          content: '',
          handle: (node.handle as FileSystemFileHandle) ?? null,
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
      if (mime.startsWith('image/')) {
        const mediaUrl = URL.createObjectURL(blob);
        upsertAndFocus({
          path,
          name: node.label,
          content: '',
          handle: null,
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
        mime,
        isImage: false,
      });
      return;
    } catch (e) {
      console.error('读取文件失败', e);
    }
  }

  try {
    const content = await Fs.readText(node.fsEntry);
    upsertAndFocus({
      path,
      name: node.label,
      content,
      handle: null,
      mime: 'text/plain',
      isImage: false,
    });
  } catch (e) {
    console.error('读取文件失败', e);
  }
}

function renameNode(target: ExplorerNode) {
  const name = window.prompt('重命名', target.label);
  if (!name) return;
  target.label = name;
}

function deleteNode(target: ExplorerNode) {
  if (!target.fsEntry) return;
  const parent = findParentNode(target.key);
  const parentFs = parent?.fsEntry;
  if (!parentFs) {
    window.alert('无法删除根目录');
    return;
  }
  Fs.remove(target.fsEntry, parentFs)
    .then(() => {
      extractNode(target.key);
      if (selectedKeys.value.includes(target.key)) {
        selectedKeys.value = [];
      }
    })
    .catch((e) => {
      console.error('删除失败', e);
      window.alert('删除失败: ' + (e as Error).message);
    });
}

function handleMenuSelect(key: string) {
  const node = contextMenu.node;
  if (!node && key !== 'new-file' && key !== 'new-folder') return;

  switch (key) {
    case 'new-file':
      void createSiblingOrChild('file');
      break;
    case 'new-folder':
      void createSiblingOrChild('folder');
      break;
    case 'rename':
      if (node) renameNode(node);
      break;
    case 'delete':
      if (node) deleteNode(node);
      break;
    default:
      break;
  }
  contextMenu.show = false;
}
</script>
