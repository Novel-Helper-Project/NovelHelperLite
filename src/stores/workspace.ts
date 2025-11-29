import { reactive } from 'vue';
import Fs from 'src/services/filesystem';
import {
  readWorkspaceState,
  saveWorkspaceState,
  type PersistedOpenFile,
  type PersistedWorkspaceState,
} from 'src/services/workspaceState';
import type { EditorViewState, ImageViewState } from 'src/types/editorState';
import { storage } from 'src/services/storage';

const MAX_PERSIST_CONTENT_LENGTH = 400_000; // ~400 KB
const MAX_PERSIST_STATE_SIZE = 900_000; // ~900 KB JSON length safeguard
const CONTENT_KEY_PREFIX = 'workspace.content';

export type OpenFile = {
  path: string;
  name: string;
  content: string;
  handle?: FileSystemFileHandle | null | undefined;
  mime?: string | undefined;
  mediaUrl?: string | undefined;
  isImage?: boolean | undefined;
  onSave?: ((content: string) => Promise<void> | void) | undefined; // 自定义保存回调
  savedContent?: string | undefined;
  imageState?: ImageViewState | undefined;
  viewState?: EditorViewState | undefined;
};

const state = reactive({
  openFiles: [] as OpenFile[],
  currentFile: null as OpenFile | null,
  rootHandle: null as FileSystemDirectoryHandle | null,
  workspaceId: null as string | null,
  workspacePath: null as string | null,
});

function upsertAndFocus(file: OpenFile) {
  const idx = state.openFiles.findIndex((f) => f.path === file.path);
  if (idx >= 0) {
    const existing = state.openFiles[idx];
    if (!existing) return;
    const savedContent = file.savedContent ?? existing.savedContent ?? existing.content;
    const merged: OpenFile = { ...existing, ...file, savedContent };
    state.openFiles[idx] = merged;
    state.currentFile = merged;
  } else {
    const savedContent = file.savedContent ?? file.content;
    const newFile: OpenFile = { ...file, savedContent };
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
  if (closing && state.currentFile?.path === closing.path) {
    state.currentFile = state.openFiles[state.openFiles.length - 1] ?? null;
  }
  schedulePersist();
}

function setImageViewState(path: string, imageState: ImageViewState) {
  const target = state.openFiles.find((f) => f.path === path);
  if (!target) return;
  target.imageState = imageState;
  schedulePersist();
}

function setEditorViewState(path: string, viewState: EditorViewState | null | undefined) {
  const target = state.openFiles.find((f) => f.path === path);
  if (!target) return;
  target.viewState = viewState ?? undefined;
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
  const rawSaved = file.savedContent ?? undefined;

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
    savedContentKey: rawSaved ? savedContentKey : undefined,
    mime: file.mime,
    isImage: file.isImage,
    imageState: file.imageState,
    viewState: file.viewState,
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

async function hydrateOpenFile(file: PersistedOpenFile): Promise<OpenFile> {
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

  const base: OpenFile = {
    path: file.path,
    name: file.name,
    content,
    savedContent,
    mime: file.mime,
    isImage: file.isImage,
    handle: null,
    imageState: file.imageState,
    viewState: file.viewState,
  };

  const platform = Fs.getPlatform();

  if (platform === 'web') {
    const fh = await resolveWebFileHandle(file.path);
    if (fh) {
      try {
        const blob = await fh.getFile();
        const mime = blob.type || file.mime;
        const isImage = !!mime && mime.startsWith('image/');
        const content = isImage ? '' : await blob.text();
        return {
          ...base,
          content,
          savedContent: file.savedContent ?? (isImage ? file.savedContent : content),
          mime,
          handle: fh,
          isImage,
          mediaUrl: isImage ? URL.createObjectURL(blob) : undefined,
          imageState: file.imageState,
          viewState: file.viewState,
        };
      } catch {
        // 回落到本地存储内容
      }
    }
  } else if (platform === 'node') {
    try {
      const content = await Fs.readText({ kind: 'file', name: file.name, path: file.path });
      return {
        ...base,
        content,
        savedContent: file.savedContent ?? content,
        imageState: file.imageState,
        viewState: file.viewState,
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
      hydrated.push(await hydrateOpenFile(file));
    }
    state.openFiles.splice(0, state.openFiles.length, ...hydrated);
    const nextCurrent = persisted.currentFilePath
      ? hydrated.find((f) => f.path === persisted.currentFilePath) ?? null
      : null;
    state.currentFile = nextCurrent ?? hydrated[0] ?? null;
  } catch (error) {
    console.warn('恢复工作区状态失败', error);
  }
}

async function switchWorkspace(workspaceId: string | null, workspacePath?: string | null) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (state.workspaceId) {
    await persistState();
  }
  state.workspaceId = workspaceId;
  state.workspacePath = workspacePath ?? workspaceId;
  state.openFiles.splice(0, state.openFiles.length);
  state.currentFile = null;
  if (!workspaceId) return;
  await restoreWorkspaceState();
}

export function useWorkspaceStore() {
  return {
    state,
    upsertAndFocus,
    setActiveFile,
    setRootHandle,
    updateCurrentContent,
    markCurrentFileSaved,
    closeFile,
    switchWorkspace,
    setImageViewState,
    setEditorViewState,
  };
}
