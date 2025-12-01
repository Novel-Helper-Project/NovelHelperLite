import type { Directory as CapDirectory } from '@capacitor/filesystem';
import type { FilesystemInterface, FsStat } from './interface';
import { getPlatform } from './platform';
import type { FsEntry, FsPlatform } from './types';
import * as WebAdapter from './adapters/web';
import * as NodeAdapter from './adapters/node';
import * as CapAdapter from './adapters/capacitor';
import { checkFileSystemSupport as checkFileSystemSupportImpl } from './support';

class UnifiedFilesystem implements FilesystemInterface {
  getPlatform(): FsPlatform {
    return getPlatform();
  }
  async ensureMobilePermissions(): Promise<void> {
    if (this.getPlatform() === 'capacitor') await CapAdapter.ensureMobilePermissions();
  }
  async pickDirectory(dir?: CapDirectory): Promise<FsEntry> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.pickDirectory();
    if (p === 'capacitor') return CapAdapter.pickDirectory(dir);
    throw new Error('Node 平台未实现目录选择');
  }
  async list(dir: FsEntry): Promise<FsEntry[]> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.list(dir);
    if (p === 'node') return NodeAdapter.list(dir);
    return CapAdapter.list(dir);
  }
  async stat(entry: FsEntry): Promise<FsStat> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.stat(entry);
    if (p === 'node') return NodeAdapter.stat(entry);
    return CapAdapter.stat(entry);
  }
  async readText(entry: FsEntry): Promise<string> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.readText(entry);
    if (p === 'node') return NodeAdapter.readText(entry);
    return CapAdapter.readText(entry);
  }
  async getBlob(entry: FsEntry): Promise<Blob> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.getBlob(entry);
    if (p === 'node') return NodeAdapter.getBlob(entry);
    return CapAdapter.getBlob(entry);
  }
  async writeText(targetDir: FsEntry, name: string, content: string): Promise<FsEntry> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.writeText(targetDir, name, content);
    if (p === 'node') return NodeAdapter.writeText(targetDir, name, content);
    return CapAdapter.writeText(targetDir, name, content);
  }
  async mkdir(targetDir: FsEntry, name: string): Promise<FsEntry> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.mkdir(targetDir, name);
    if (p === 'node') return NodeAdapter.mkdir(targetDir, name);
    return CapAdapter.mkdir(targetDir, name);
  }
  async remove(entry: FsEntry, parent?: FsEntry): Promise<void> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.remove(entry, parent);
    if (p === 'node') return NodeAdapter.remove(entry);
    return CapAdapter.remove(entry);
  }
  async copy(entry: FsEntry, targetDir: FsEntry, options?: { newName?: string }): Promise<FsEntry> {
    const p = this.getPlatform();
    if (p === 'web') return await WebAdapter.copy(entry, targetDir, options);
    if (p === 'node') return await NodeAdapter.copy(entry, targetDir, options);
    return await CapAdapter.copy(entry, targetDir, options);
  }
  async move(
    entry: FsEntry,
    targetDir: FsEntry,
    options?: { newName?: string; sourceParent?: FsEntry },
  ): Promise<FsEntry> {
    const p = this.getPlatform();
    if (p === 'web') return await WebAdapter.move(entry, targetDir, options);
    if (p === 'node') return await NodeAdapter.move(entry, targetDir, options);
    return await CapAdapter.move(entry, targetDir, options);
  }
  async getPrivateWorkspaceRoot(): Promise<FsEntry> {
    if (this.getPlatform() !== 'capacitor') {
      throw new Error('私有工作区仅在移动端可用');
    }
    return CapAdapter.getPrivateWorkspaceRoot();
  }
  async buildTree(dir: FsEntry): Promise<Array<FsEntry & { children?: FsEntry[] }>> {
    const p = this.getPlatform();
    if (p === 'web') return WebAdapter.buildTree(dir);
    if (p === 'node') return NodeAdapter.buildTree(dir);
    return CapAdapter.buildTree(dir);
  }
  checkFileSystemSupport(): {
    supported: boolean;
    browser?: string;
    reason?: string;
    suggestion?: string;
    debug?: { userAgent: string; details: string[] };
  } {
    return checkFileSystemSupportImpl();
  }
}

export class FilesystemService {
  private static instance: UnifiedFilesystem | null = null;
  static getInstance(): UnifiedFilesystem {
    if (!this.instance) this.instance = new UnifiedFilesystem();
    return this.instance;
  }
  static resetInstance(): void {
    this.instance = null;
  }
}

export const filesystem = FilesystemService.getInstance();

const Fs = {
  getPlatform: () => filesystem.getPlatform(),
  ensureMobilePermissions: () => filesystem.ensureMobilePermissions(),
  pickDirectory: (dir?: CapDirectory) => filesystem.pickDirectory(dir),
  list: (dir: FsEntry) => filesystem.list(dir),
  stat: (entry: FsEntry) => filesystem.stat(entry),
  readText: (entry: FsEntry) => filesystem.readText(entry),
  getBlob: (entry: FsEntry) => filesystem.getBlob(entry),
  writeText: (targetDir: FsEntry, name: string, content: string) =>
    filesystem.writeText(targetDir, name, content),
  mkdir: (targetDir: FsEntry, name: string) => filesystem.mkdir(targetDir, name),
  remove: (entry: FsEntry, parent?: FsEntry) => filesystem.remove(entry, parent),
  copy: (entry: FsEntry, targetDir: FsEntry, options?: { newName?: string }) =>
    filesystem.copy(entry, targetDir, options),
  move: (
    entry: FsEntry,
    targetDir: FsEntry,
    options?: { newName?: string; sourceParent?: FsEntry },
  ) => filesystem.move(entry, targetDir, options),
  buildTree: (dir: FsEntry) => filesystem.buildTree(dir),
  getPrivateWorkspaceRoot: () => filesystem.getPrivateWorkspaceRoot(),
  checkFileSystemSupport: () => filesystem.checkFileSystemSupport(),
};

export default Fs;
export type { FsEntry, FsPlatform };
export type { FilesystemInterface, FsStat };
export const checkFileSystemSupport = Fs.checkFileSystemSupport;
