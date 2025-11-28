import { reactive } from 'vue';

export type OpenFile = {
  path: string;
  name: string;
  content: string;
  handle?: FileSystemFileHandle | null;
  mime?: string;
  mediaUrl?: string;
  isImage?: boolean;
};

const state = reactive({
  openFiles: [] as OpenFile[],
  currentFile: null as OpenFile | null,
  rootHandle: null as FileSystemDirectoryHandle | null,
});

function upsertAndFocus(file: OpenFile) {
  const idx = state.openFiles.findIndex((f) => f.path === file.path);
  if (idx >= 0) {
    state.openFiles[idx] = { ...state.openFiles[idx], ...file };
    state.currentFile = state.openFiles[idx];
  } else {
    state.openFiles.push(file);
    state.currentFile = file;
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

function closeFile(path: string) {
  const idx = state.openFiles.findIndex((f) => f.path === path);
  if (idx < 0) return;
  const closing = state.openFiles.splice(idx, 1)[0]!;
  if (state.currentFile?.path === closing.path) {
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
    closeFile,
  };
}
