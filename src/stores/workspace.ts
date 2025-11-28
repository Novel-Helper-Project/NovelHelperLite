import { reactive } from 'vue';

export type OpenFile = {
  path: string;
  name: string;
  content: string;
  handle?: FileSystemFileHandle | null;
  mime?: string;
  mediaUrl?: string;
  isImage?: boolean;
  onSave?: (content: string) => Promise<void> | void; // 自定义保存回调
  savedContent?: string;
};

const state = reactive({
  openFiles: [] as OpenFile[],
  currentFile: null as OpenFile | null,
  rootHandle: null as FileSystemDirectoryHandle | null,
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
}

function setActiveFile(path: string) {
  const target = state.openFiles.find((f) => f.path === path) || null;
  state.currentFile = target;
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
}

function closeFile(path: string) {
  const idx = state.openFiles.findIndex((f) => f.path === path);
  if (idx < 0) return;
  const closing = state.openFiles.splice(idx, 1)[0];
  if (closing && state.currentFile?.path === closing.path) {
    state.currentFile = state.openFiles[state.openFiles.length - 1] ?? null;
  }
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
  };
}
