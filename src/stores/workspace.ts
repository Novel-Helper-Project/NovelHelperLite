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
  editorMode?: EditorMode; // 编辑器模式
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
  if (idx >= 0) {
    const existing = state.openFiles[idx];
    if (!existing) return;
    const savedContent = file.savedContent ?? existing.savedContent ?? existing.content;
    const merged: OpenFile = { ...existing, ...file, savedContent, uid: existing.uid };
    state.openFiles[idx] = merged;
    state.currentFile = merged;
  } else {
    const savedContent = file.savedContent ?? file.content;
    const newFile: OpenFile = { uid: nextFileUid++, ...file, savedContent };
    state.openFiles.push(newFile);
    state.currentFile = newFile;
  }
  schedulePersist();
}

function setActiveFile(path: string) {
  const target = state.openFiles.find((f) => f.path === path) || null;
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
  };
}
