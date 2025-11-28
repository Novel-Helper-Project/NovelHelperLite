import { storage } from './storage';
import type { ImageViewState, EditorViewState } from 'src/types/editorState';

export interface PersistedOpenFile {
  path: string;
  name: string;
  content?: string | undefined;
  contentKey?: string | undefined;
  savedContent?: string | undefined;
  savedContentKey?: string | undefined;
  mime?: string | undefined;
  isImage?: boolean | undefined;
  imageState?: ImageViewState | undefined;
  viewState?: EditorViewState | undefined;
}

export interface PersistedWorkspaceState {
  openFiles: PersistedOpenFile[];
  currentFilePath: string | null;
}

const WORKSPACE_STATE_PREFIX = 'workspace.state:';

function getKey(workspaceId: string): string {
  return `${WORKSPACE_STATE_PREFIX}${encodeURIComponent(workspaceId)}`;
}

export async function saveWorkspaceState(
  workspaceId: string,
  state: PersistedWorkspaceState,
): Promise<void> {
  await storage.set(getKey(workspaceId), state);
}

export async function readWorkspaceState(
  workspaceId: string,
): Promise<PersistedWorkspaceState | null> {
  try {
    return await storage.get<PersistedWorkspaceState>(getKey(workspaceId));
  } catch (error) {
    console.warn('读取工作区状态失败', error);
    return null;
  }
}

export async function clearWorkspaceState(workspaceId: string): Promise<void> {
  try {
    await storage.remove(getKey(workspaceId));
  } catch (error) {
    console.warn('清除工作区状态失败', error);
  }
}
