import type { Directory as CapDirectory } from '@capacitor/filesystem';

export type FsPlatform = 'web' | 'node' | 'capacitor';
export type FsEntryKind = 'file' | 'directory';

export type FsEntry = {
  kind: FsEntryKind;
  name: string;
  path?: string;
  webHandle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  capDirectory?: CapDirectory;
};

export type FsStat = {
  kind: FsEntryKind;
  size?: number;
  modified?: number;
};

