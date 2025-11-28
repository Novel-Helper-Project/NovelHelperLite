<template>
  <div class="vscode-explorer">
    <div class="explorer-toolbar">
      <div class="explorer-title">文件资源管理器</div>
      <div class="explorer-actions">
        <button class="ghost-btn" type="button" title="打开文件夹" @click="pickWorkspace">
          <span class="material-icons">folder_open</span>
        </button>
        <button class="ghost-btn" type="button" title="新建文件" @click="createSiblingOrChild('file')">
          <span class="material-icons">note_add</span>
        </button>
        <button class="ghost-btn" type="button" title="新建文件夹" @click="createSiblingOrChild('folder')">
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

type ExplorerNode = TreeOption & {
  key: string;
  label: string;
  type: 'file' | 'folder';
  children?: ExplorerNode[];
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  path?: string;
};

const explorerData = ref<ExplorerNode[]>([]);

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

function findParentList(targetKey: string, tree: ExplorerNode[] = explorerData.value): ExplorerNode[] | null {
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

function extractNode(targetKey: string, list = explorerData.value): { node: ExplorerNode; list: ExplorerNode[] } | null {
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

function createSiblingOrChild(type: ExplorerNode['type']) {
  const target = contextMenu.node ?? explorerData.value[0];
  if (!target) return;

  const name = window.prompt(type === 'file' ? '新文件名称' : '新文件夹名称');
  if (!name) return;

  const parentList =
    target.type === 'folder' ? ensureChildren(target) : findParentList(target.key) ?? explorerData.value;
  const newKey = `${type}-${Date.now()}`;

  const newNode: ExplorerNode =
    type === 'folder'
      ? {
          key: newKey,
          label: name,
          type,
          children: [],
        }
      : {
          key: newKey,
          label: name,
          type,
        };

  parentList.push(newNode);

  if (type === 'folder' && !expandedKeys.value.includes(target.key)) {
    expandedKeys.value.push(target.key);
  }

  selectedKeys.value = [newKey];
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
  const picker = (window as typeof window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;

  if (!picker) {
    window.alert('当前浏览器不支持 File System Access API');
    return;
  }

  try {
    const handle = await picker();
    setRootHandle(handle);
    const rootNode = await buildTreeFromHandle(handle, handle.name);
    explorerData.value = [rootNode];
    expandedKeys.value = [rootNode.key];
    selectedKeys.value = [];
    contextMenu.node = null;
  } catch (error) {
    // 用户取消不提示
    if ((error as DOMException)?.name !== 'AbortError') {
      console.error('选择目录失败', error);
    }
  }
}

async function buildTreeFromHandle(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
): Promise<ExplorerNode> {
  const children: ExplorerNode[] = [];

  const iterableDir = dirHandle as FileSystemDirectoryHandle & {
    entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };

  for await (const [name, handle] of iterableDir.entries()) {
    const childPath = `${basePath}/${name}`;
    if (handle.kind === 'directory') {
      const childNode = await buildTreeFromHandle(handle as FileSystemDirectoryHandle, childPath);
      children.push(childNode);
    } else {
      children.push({
        key: childPath,
        label: name,
        type: 'file',
        handle: handle as FileSystemFileHandle,
        path: childPath,
      });
    }
  }

  children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });

  return {
    key: basePath,
    label: dirHandle.name,
    type: 'folder',
    handle: dirHandle,
    path: basePath,
    children,
  };
}

async function openFile(node: ExplorerNode) {
  if (node.type !== 'file' || !node.handle || node.handle.kind !== 'file') return;
  const fileHandle = node.handle;
  const file = await fileHandle.getFile();
  const mime = file.type;
  const path = node.path ?? node.key;

  if (mime.startsWith('image/')) {
    const mediaUrl = URL.createObjectURL(file);
    upsertAndFocus({
      path,
      name: node.label,
      content: '',
      handle: fileHandle,
      mime,
      mediaUrl,
      isImage: true,
    });
    return;
  }

  const content = await file.text();

  upsertAndFocus({
    path,
    name: node.label,
    content,
    handle: fileHandle,
    mime,
    isImage: false,
  });
}

function renameNode(target: ExplorerNode) {
  const name = window.prompt('重命名', target.label);
  if (!name) return;
  target.label = name;
}

function deleteNode(target: ExplorerNode) {
  extractNode(target.key);
  if (selectedKeys.value.includes(target.key)) {
    selectedKeys.value = [];
  }
}

function handleMenuSelect(key: string) {
  const node = contextMenu.node;
  if (!node && key !== 'new-file' && key !== 'new-folder') return;

  switch (key) {
    case 'new-file':
      createSiblingOrChild('file');
      break;
    case 'new-folder':
      createSiblingOrChild('folder');
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
