import { reactive } from 'vue';
import Fs from 'src/services/filesystem';
import {
  readWorkspaceState,
  saveWorkspaceState,
  type PersistedOpenFile,
  type PersistedWorkspaceState,
} from 'src/services/workspaceState';
import type { EditorViewState, ImageViewState } from 'src/types/editorState';
import type { FsEntry } from 'src/services/filesystem/types';
import type { Directory as CapDirectory } from '@capacitor/filesystem';
import { storage } from 'src/services/storage';

const MAX_PERSIST_CONTENT_LENGTH = 400_000; // ~400 KB
const MAX_PERSIST_STATE_SIZE = 900_000; // ~900 KB JSON length safeguard
const CONTENT_KEY_PREFIX = 'workspace.content';

let nextFileUid = 1;

export type EditorMode = 'monaco' | 'milkdown';

export type OpenFile = {
  uid: number; // 唯一标识符,用于 keep-alive 的 key
  path: string;
  name: string;
  content: string;
  handle?: FileSystemFileHandle | null;
  fsEntry?: FsEntry;
  mime?: string;
  mediaUrl?: string;
  isImage?: boolean;
  isSettings?: boolean; // 标记为设置页面
  onSave?: (content: string) => Promise<void> | void; // 自定义保存回调
  savedContent?: string;
  imageState?: ImageViewState;
  viewState?: EditorViewState;
  editorMode?: EditorMode; // 编辑器模式 (Monaco/Milkdown 切换用)
  activeEditorId?: string; // 当前实际使用的编辑器 ID
  lastAccessTime?: number; // 最后访问时间戳 (GC 用)
  isUnloaded?: boolean; // 标记是否已卸载 (只保留状态)
};

type WorkspaceState = {
  openFiles: OpenFile[];
  currentFile: OpenFile | null;
  rootHandle: FileSystemDirectoryHandle | null;
  workspaceId: string;
  workspacePath: string;
  workspaceCapDirectory?: CapDirectory | null;
  sidebarPanelVisible: boolean;
  shellVisible: boolean;
};

const state = reactive<WorkspaceState>({
  openFiles: [],
  currentFile: null,
  rootHandle: null,
  workspaceId: '',
  workspacePath: '',
  workspaceCapDirectory: null,
  sidebarPanelVisible: true,
  shellVisible: true,
});

function upsertAndFocus(file: Omit<OpenFile, 'uid'> & { uid?: number }) {
  const idx = state.openFiles.findIndex((f) => f.path === file.path);
  const now = Date.now();
  if (idx >= 0) {
    const existing = state.openFiles[idx];
    if (!existing) return;
    const savedContent = file.savedContent ?? existing.savedContent ?? existing.content;
    const merged: OpenFile = {
      ...existing,
      ...file,
      savedContent,
      uid: existing.uid,
      lastAccessTime: now,
      isUnloaded: false, // 重新加载
    };
    state.openFiles[idx] = merged;
    state.currentFile = merged;
  } else {
    const savedContent = file.savedContent ?? file.content;
    const newFile: OpenFile = {
      uid: nextFileUid++,
      ...file,
      savedContent,
      lastAccessTime: now,
      isUnloaded: false,
    };
    state.openFiles.push(newFile);
    state.currentFile = newFile;
  }
  scheduleGC();
  schedulePersist();
}

function setActiveFile(path: string) {
  const target = state.openFiles.find((f) => f.path === path) || null;
  if (target) {
    target.lastAccessTime = Date.now();
  }
  state.currentFile = target;
  schedulePersist();
}

function setRootHandle(handle: FileSystemDirectoryHandle | null) {
  state.rootHandle = handle;
}

function setSidebarPanelVisible(visible: boolean) {
  state.sidebarPanelVisible = visible;
  schedulePersist();
}

function setShellVisible(visible: boolean) {
  state.shellVisible = visible;
  schedulePersist();
}

function updateCurrentContent(content: string) {
  if (!state.currentFile) return;
  state.currentFile.content = content;
  const activePath = state.currentFile.path;
  const idx = state.openFiles.findIndex((f) => f.path === activePath);
  if (idx >= 0) {
    const target = state.openFiles[idx];
    if (target) target.content = content;
  }
  schedulePersist();
}

function markCurrentFileSaved(content: string) {
  if (!state.currentFile) return;
  const activePath = state.currentFile.path;
  const idx = state.openFiles.findIndex((f) => f.path === activePath);
  const savedContentEntry = idx >= 0 ? state.openFiles[idx] : state.currentFile;
  if (!savedContentEntry) return;
  savedContentEntry.savedContent = content;
  if (state.currentFile.path === savedContentEntry.path) {
    state.currentFile.savedContent = content;
  }
  schedulePersist();
}

function closeFile(path: string) {
  const idx = state.openFiles.findIndex((f) => f.path === path);
  if (idx < 0) return;
  const closing = state.openFiles.splice(idx, 1)[0];

  // 如果关闭的是当前文件,需要选择新的当前文件
  if (closing && state.currentFile?.path === closing.path) {
    if (state.openFiles.length === 0) {
      // 没有文件了,设为 null
      state.currentFile = null;
    } else if (idx < state.openFiles.length) {
      // 优先选择右侧的文件(原来 idx 位置的文件)
      state.currentFile = state.openFiles[idx] ?? null;
    } else {
      // 如果关闭的是最后一个,选择新的最后一个
      state.currentFile = state.openFiles[state.openFiles.length - 1] ?? null;
    }
  }

  schedulePersist();
}

function setImageViewState(path: string, imageState: ImageViewState) {
  const target = state.openFiles.find((f) => f.path === path);
  if (!target) return;
  target.imageState = imageState;
  schedulePersist();
}

function setEditorViewState(path: string, viewState?: EditorViewState) {
  const target = state.openFiles.find((f) => f.path === path);
  if (!target) return;
  if (viewState) {
    target.viewState = viewState;
  } else {
    delete target.viewState;
  }
  schedulePersist();
}

function setEditorMode(path: string, mode: EditorMode) {
  const target = state.openFiles.find((f) => f.path === path);
  if (!target) return;
  target.editorMode = mode;
  if (state.currentFile?.path === path) {
    state.currentFile.editorMode = mode;
  }
  schedulePersist();
}

function setActiveEditorId(path: string, editorId: string) {
  const target = state.openFiles.find((f) => f.path === path);
  if (!target) return;
  target.activeEditorId = editorId;
  if (state.currentFile?.path === path) {
    state.currentFile.activeEditorId = editorId;
  }
}

function buildContentKey(workspaceId: string, path: string, kind: 'content' | 'saved') {
  return `${CONTENT_KEY_PREFIX}:${encodeURIComponent(workspaceId)}:${kind}:${encodeURIComponent(path)}`;
}

async function serializeOpenFile(
  workspaceId: string,
  file: OpenFile,
): Promise<PersistedOpenFile> {
  const rawContent = file.content ?? '';
  const rawSaved = file.savedContent;

  const contentKey = buildContentKey(workspaceId, file.path, 'content');
  const savedContentKey = buildContentKey(workspaceId, file.path, 'saved');

  if (rawContent.length > MAX_PERSIST_CONTENT_LENGTH) {
    console.warn(
      `跳过持久化过大的文件内容: ${file.path} (${rawContent.length} chars > ${MAX_PERSIST_CONTENT_LENGTH})`,
    );
  } else {
    await storage.set(contentKey, rawContent);
  }

  if (rawSaved && rawSaved.length <= MAX_PERSIST_CONTENT_LENGTH) {
    await storage.set(savedContentKey, rawSaved);
  }

  return {
    path: file.path,
    name: file.name,
    contentKey,
    ...(rawSaved ? { savedContentKey } : {}),
    ...(file.mime ? { mime: file.mime } : {}),
    ...(typeof file.isImage === 'boolean' ? { isImage: file.isImage } : {}),
    ...(typeof file.isSettings === 'boolean' ? { isSettings: file.isSettings } : {}),
    ...(file.imageState ? { imageState: file.imageState } : {}),
    ...(file.viewState ? { viewState: file.viewState } : {}),
    ...(file.editorMode ? { editorMode: file.editorMode } : {}),
  };
}

async function serializeState(): Promise<PersistedWorkspaceState> {
  const workspaceId = state.workspaceId;
  if (!workspaceId) {
    return { openFiles: [], currentFilePath: null };
  }
  const serializedFiles: PersistedOpenFile[] = [];
  for (const file of state.openFiles) {
    serializedFiles.push(await serializeOpenFile(workspaceId, file));
  }
  return {
    openFiles: serializedFiles,
    currentFilePath: state.currentFile?.path ?? null,
    sidebarPanelVisible: state.sidebarPanelVisible,
    shellVisible: state.shellVisible,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (!state.workspaceId) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistState();
  }, 150);
}

// ========== 标签页 GC 逻辑 ==========
import { useSettingsStore } from './settings';

let gcTimer: ReturnType<typeof setTimeout> | null = null;

// 获取需要被卸载的标签页
function getTabsToUnload(): OpenFile[] {
  const settings = useSettingsStore();
  if (!settings.tabs.enableGC) return [];

  const now = Date.now();
  const idleThreshold = settings.tabs.gcIdleMinutes * 60 * 1000;
  const maxCached = settings.tabs.maxCachedTabs;

  // 过滤掉当前文件、设置页面、未保存的文件
  const candidates = state.openFiles.filter((f) => {
    if (f.path === state.currentFile?.path) return false; // 当前文件不卸载
    if (f.isSettings) return false; // 设置页面不卸载
    if (f.isUnloaded) return false; // 已卸载的不重复处理
    if (f.content !== f.savedContent) return false; // 未保存的不卸载
    return true;
  });

  const toUnload: OpenFile[] = [];

  // 按最后访问时间排序（越早访问的排前面）
  const sorted = [...candidates].sort((a, b) => {
    const timeA = a.lastAccessTime ?? 0;
    const timeB = b.lastAccessTime ?? 0;
    return timeA - timeB;
  });

  // 计算当前已缓存（未卸载）的数量
  const cachedCount = state.openFiles.filter((f) => !f.isUnloaded).length;

  for (const file of sorted) {
    // 如果已缓存数量超过限制，优先卸载
    if (cachedCount - toUnload.length > maxCached) {
      toUnload.push(file);
      continue;
    }

    // 检查空闲时间
    const lastAccess = file.lastAccessTime ?? 0;
    if (now - lastAccess > idleThreshold) {
      toUnload.push(file);
    }
  }

  return toUnload;
}

// 卸载标签页（只保留状态，释放内容）
function unloadTab(file: OpenFile) {
  // 保存编辑器状态，但清空大量内容以节省内存
  file.isUnloaded = true;
  // 不清空 content 和 savedContent，因为重新加载时需要
  // 但可以清理 mediaUrl 以释放 blob URL
  if (file.mediaUrl) {
    URL.revokeObjectURL(file.mediaUrl);
    delete file.mediaUrl;
  }
  console.log(`[TabGC] 已卸载标签页: ${file.name}`);
}

// 执行 GC
function performGC() {
  const tabsToUnload = getTabsToUnload();
  for (const file of tabsToUnload) {
    unloadTab(file);
  }
  if (tabsToUnload.length > 0) {
    schedulePersist();
  }
}

// 调度 GC（延迟执行，避免频繁触发）
function scheduleGC() {
  const settings = useSettingsStore();
  if (!settings.tabs.enableGC) return;

  if (gcTimer) clearTimeout(gcTimer);
  gcTimer = setTimeout(() => {
    gcTimer = null;
    performGC();
  }, 5000); // 5秒后执行 GC
}

// 获取当前缓存的标签页数量（用于 keep-alive 的 max 属性）
function getCachedTabCount(): number {
  return state.openFiles.filter((f) => !f.isUnloaded).length;
}

// 检查文件是否已卸载
function isFileUnloaded(path: string): boolean {
  const file = state.openFiles.find((f) => f.path === path);
  return file?.isUnloaded ?? false;
}

// 重新加载已卸载的文件（当用户点击时调用）
async function reloadUnloadedFile(path: string): Promise<void> {
  const file = state.openFiles.find((f) => f.path === path);
  if (!file || !file.isUnloaded) return;

  // 标记为加载中
  file.isUnloaded = false;
  file.lastAccessTime = Date.now();

  // 如果是图片，需要重新创建 mediaUrl
  if (file.isImage && file.fsEntry) {
    try {
      const blob = await Fs.getBlob(file.fsEntry);
      file.mediaUrl = URL.createObjectURL(blob);
    } catch (e) {
      console.warn('重新加载图片失败', e);
    }
  }

  console.log(`[TabGC] 已重新加载标签页: ${file.name}`);

  // 唤醒后立即检查是否需要卸载其他标签页以保持在缓存限制内
  performGCAfterReload(path);

  schedulePersist();
}

// 唤醒后执行的 GC，排除刚唤醒的文件
function performGCAfterReload(excludePath: string) {
  const settings = useSettingsStore();
  if (!settings.tabs.enableGC) return;

  const maxCached = settings.tabs.maxCachedTabs;
  const cachedCount = state.openFiles.filter((f) => !f.isUnloaded).length;

  // 如果没超过限制，不需要 GC
  if (cachedCount <= maxCached) return;

  // 需要卸载的数量
  const needToUnload = cachedCount - maxCached;

  // 获取可卸载的候选（排除当前文件、刚唤醒的文件、设置页面、未保存的）
  const candidates = state.openFiles.filter((f) => {
    if (f.path === state.currentFile?.path) return false;
    if (f.path === excludePath) return false; // 排除刚唤醒的
    if (f.isSettings) return false;
    if (f.isUnloaded) return false;
    if (f.content !== f.savedContent) return false;
    return true;
  });

  // 按最后访问时间排序（最久未访问的优先卸载）
  const sorted = [...candidates].sort((a, b) => {
    const timeA = a.lastAccessTime ?? 0;
    const timeB = b.lastAccessTime ?? 0;
    return timeA - timeB;
  });

  // 卸载需要的数量
  for (let i = 0; i < needToUnload && i < sorted.length; i++) {
    const file = sorted[i];
    if (file) {
      unloadTab(file);
    }
  }
}

async function persistState() {
  if (!state.workspaceId) return;
  const payload = await serializeState();
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PERSIST_STATE_SIZE) {
    console.warn(
      `工作区状态过大，已跳过保存 (约 ${serialized.length} chars > ${MAX_PERSIST_STATE_SIZE})`,
    );
    return;
  }
  try {
    await saveWorkspaceState(state.workspaceId, payload);
  } catch (error) {
    console.warn('保存工作区状态失败', error);
  }
}

function normalizeRelativePath(fullPath: string): string {
  const base = state.workspacePath ?? '';
  if (base && fullPath.startsWith(base)) {
    const trimmed = fullPath.slice(base.length).replace(/^[\\/]/u, '');
    if (trimmed) return trimmed;
  }
  const segments = fullPath.split(/[/\\]+/u).filter(Boolean);
  segments.shift();
  return segments.join('/');
}

async function resolveWebFileHandle(fullPath: string): Promise<FileSystemFileHandle | null> {
  if (!state.rootHandle) return null;
  const relative = normalizeRelativePath(fullPath);
  if (!relative) return null;
  const parts = relative.split(/[/\\]+/u).filter(Boolean);
  if (!parts.length) return null;
  const fileName = parts.pop();
  if (!fileName) return null;
  try {
    let current: FileSystemDirectoryHandle = state.rootHandle;
    for (const dir of parts) {
      current = await current.getDirectoryHandle(dir);
    }
    return await current.getFileHandle(fileName);
  } catch {
    return null;
  }
}

async function hydrateOpenFile(file: PersistedOpenFile): Promise<Omit<OpenFile, 'uid'>> {
  const workspaceId = state.workspaceId;
  let content = file.content ?? '';
  let savedContent = file.savedContent;

  if (workspaceId && file.contentKey) {
    try {
      const stored = await storage.get<string>(file.contentKey);
      if (typeof stored === 'string') {
        content = stored;
      }
    } catch (e) {
      console.warn('读取文件内容失败，使用回退内容', e);
    }
  }

  if (workspaceId && file.savedContentKey) {
    try {
      const stored = await storage.get<string>(file.savedContentKey);
      if (typeof stored === 'string') {
        savedContent = stored;
      }
    } catch {
      // ignore
    }
  }

  const base: Omit<OpenFile, 'uid'> = {
    path: file.path,
    name: file.name,
    content,
    handle: null,
    fsEntry: {
      kind: 'file',
      name: file.name,
      path: file.path,
      ...(state.workspaceCapDirectory ? { capDirectory: state.workspaceCapDirectory } : {}),
    },
    ...(savedContent !== undefined ? { savedContent } : {}),
    ...(file.mime ? { mime: file.mime } : {}),
    ...(typeof file.isImage === 'boolean' ? { isImage: file.isImage } : {}),
    ...(typeof file.isSettings === 'boolean' ? { isSettings: file.isSettings } : {}),
    ...(file.imageState ? { imageState: file.imageState } : {}),
    ...(file.viewState ? { viewState: file.viewState } : {}),
    ...(file.editorMode ? { editorMode: file.editorMode } : {}),
  };

  const platform = Fs.getPlatform();

  if (platform === 'web') {
    const fh = await resolveWebFileHandle(file.path);
    if (fh) {
      try {
        const blob = await fh.getFile();
        const mime = blob.type || file.mime;
        const isImage = !!mime && mime.startsWith('image/');
        const isPdf = !!mime && mime.includes('pdf');
        const content = isImage || isPdf ? '' : await blob.text();
        const nextSavedContent =
          file.savedContent ?? (isImage || isPdf ? file.savedContent ?? '' : content);
        const mediaUrl = isImage || isPdf ? URL.createObjectURL(blob) : undefined;
        return {
          ...base,
          content,
          ...(nextSavedContent !== undefined ? { savedContent: nextSavedContent } : {}),
          ...(mime ? { mime } : {}),
          handle: fh,
          ...(typeof isImage === 'boolean' ? { isImage } : {}),
          ...(mediaUrl ? { mediaUrl } : {}),
          ...(file.imageState ? { imageState: file.imageState } : {}),
          ...(file.viewState ? { viewState: file.viewState } : {}),
        };
      } catch {
        // 回落到本地存储内容
      }
    }
  } else if (platform === 'node') {
    try {
      const entry: FsEntry = { kind: 'file', name: file.name, path: file.path };
      const content = await Fs.readText(entry);
      const nextSavedContent = file.savedContent ?? content;
      return {
        ...base,
        content,
        ...(nextSavedContent !== undefined ? { savedContent: nextSavedContent } : {}),
        ...(file.imageState ? { imageState: file.imageState } : {}),
        ...(file.viewState ? { viewState: file.viewState } : {}),
      };
    } catch {
      // ignore, fallback
    }
  } else if (platform === 'capacitor') {
    const capDirectory = state.workspaceCapDirectory;
    try {
      const entry: FsEntry = {
        kind: 'file',
        name: file.name,
        path: file.path,
        ...(capDirectory ? { capDirectory } : {}),
      };
      const blob = await Fs.getBlob(entry);
      const mime = blob.type || file.mime;
      const isImage = mime ? mime.startsWith('image/') : !!file.isImage;
      const isPdf = mime ? mime.includes('pdf') : false;

      if (isImage) {
        const mediaUrl = URL.createObjectURL(blob);
        const nextSavedContent = file.savedContent ?? '';
        return {
          ...base,
          content: '',
          ...(nextSavedContent !== undefined ? { savedContent: nextSavedContent } : {}),
          ...(mime ? { mime } : {}),
          isImage: true,
          mediaUrl,
          ...(file.imageState ? { imageState: file.imageState } : {}),
          ...(file.viewState ? { viewState: file.viewState } : {}),
        };
      }

      if (isPdf) {
        const mediaUrl = URL.createObjectURL(blob);
        const nextSavedContent = file.savedContent ?? '';
        return {
          ...base,
          content: '',
          ...(nextSavedContent !== undefined ? { savedContent: nextSavedContent } : {}),
          ...(mime ? { mime } : {}),
          mediaUrl,
          ...(file.imageState ? { imageState: file.imageState } : {}),
          ...(file.viewState ? { viewState: file.viewState } : {}),
        };
      }

      const content = await blob.text();
      const nextSavedContent = file.savedContent ?? content;
      return {
        ...base,
        content,
        ...(nextSavedContent !== undefined ? { savedContent: nextSavedContent } : {}),
        ...(mime ? { mime } : {}),
        ...(file.imageState ? { imageState: file.imageState } : {}),
        ...(file.viewState ? { viewState: file.viewState } : {}),
      };
    } catch {
      // ignore, fallback
    }
  }

  return base;
}

async function restoreWorkspaceState() {
  if (!state.workspaceId) return;
  try {
    const persisted = await readWorkspaceState(state.workspaceId);
    if (!persisted) return;
    const hydrated: OpenFile[] = [];
    for (const file of persisted.openFiles) {
      const hydratedFile = await hydrateOpenFile(file);
      hydrated.push({ uid: nextFileUid++, ...hydratedFile });
    }
    state.openFiles.splice(0, state.openFiles.length, ...hydrated);
    const nextCurrent = persisted.currentFilePath
      ? hydrated.find((f) => f.path === persisted.currentFilePath) ?? null
      : null;
    state.currentFile = nextCurrent ?? hydrated[0] ?? null;
    if (typeof persisted.sidebarPanelVisible === 'boolean') {
      state.sidebarPanelVisible = persisted.sidebarPanelVisible;
    }
    if (typeof persisted.shellVisible === 'boolean') {
      state.shellVisible = persisted.shellVisible;
    }
  } catch (error) {
    console.warn('恢复工作区状态失败', error);
  }
}

async function switchWorkspace(
  workspaceId: string,
  workspacePath?: string,
  workspaceCapDirectory?: CapDirectory,
) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (state.workspaceId) {
    await persistState();
  }
  const nextWorkspaceId = workspaceId || '';
  const nextWorkspacePath = workspacePath ?? nextWorkspaceId;
  const nextCapDirectory = workspaceCapDirectory ?? null;
  state.workspaceId = nextWorkspaceId;
  state.workspacePath = nextWorkspacePath;
  state.workspaceCapDirectory = nextCapDirectory;
  state.openFiles.splice(0, state.openFiles.length);
  state.currentFile = null;
  state.sidebarPanelVisible = true;
  state.shellVisible = true;
  if (!nextWorkspaceId) return;
  await restoreWorkspaceState();
}

export function useWorkspaceStore() {
  return {
    state,
    upsertAndFocus,
    setActiveFile,
    setRootHandle,
    setSidebarPanelVisible,
    setShellVisible,
    updateCurrentContent,
    markCurrentFileSaved,
    closeFile,
    switchWorkspace,
    setImageViewState,
    setEditorViewState,
    setEditorMode,
    setActiveEditorId,
    // GC 相关
    getCachedTabCount,
    isFileUnloaded,
    reloadUnloadedFile,
    performGC,
  };
}
