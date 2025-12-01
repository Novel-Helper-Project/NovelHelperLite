import type { Directory as CapDirectory } from '@capacitor/filesystem';
import type { FsEntry, FsPlatform } from './types';

export type FsStat = {
  kind: 'file' | 'directory';
  size?: number;
  modified?: number;
};

export interface FilesystemInterface {
  getPlatform(): FsPlatform;
  ensureMobilePermissions(): Promise<void>;
  pickDirectory(dir?: CapDirectory): Promise<FsEntry>;
  list(dir: FsEntry): Promise<FsEntry[]>;
  stat(entry: FsEntry): Promise<FsStat>;
  readText(entry: FsEntry): Promise<string>;
  getBlob(entry: FsEntry): Promise<Blob>;
  writeText(targetDir: FsEntry, name: string, content: string): Promise<FsEntry>;
  mkdir(targetDir: FsEntry, name: string): Promise<FsEntry>;
  remove(entry: FsEntry, parent?: FsEntry): Promise<void>;
  copy(entry: FsEntry, targetDir: FsEntry, options?: { newName?: string }): Promise<FsEntry>;
  move(
    entry: FsEntry,
    targetDir: FsEntry,
    options?: { newName?: string; sourceParent?: FsEntry },
  ): Promise<FsEntry>;
  buildTree(dir: FsEntry): Promise<Array<FsEntry & { children?: FsEntry[] }>>;
  getPrivateWorkspaceRoot?(): Promise<FsEntry>;
  checkFileSystemSupport(): {
    supported: boolean;
    browser?: string;
    reason?: string;
    suggestion?: string;
    debug?: { userAgent: string; details: string[] };
  };
}
