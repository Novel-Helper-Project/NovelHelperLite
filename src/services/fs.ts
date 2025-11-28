import type { Directory as CapDirectory, FileInfo } from '@capacitor/filesystem';
export type FsPlatform = 'web' | 'node' | 'capacitor';
export type FsEntryKind = 'file' | 'directory';

export type FsEntry = {
  kind: FsEntryKind;
  name: string;
  path?: string;
  webHandle?: FileSystemFileHandle | FileSystemDirectoryHandle;
  capDirectory?: CapDirectory;
};

type FsStat = {
  kind: FsEntryKind;
  size?: number;
  modified?: number;
};

function isWeb(): boolean {
  return typeof window !== 'undefined';
}

function isNode(): boolean {
  const p =
    typeof process !== 'undefined'
      ? (process as unknown as { versions?: { node?: string } })
      : undefined;
  return !!p?.versions?.node;
}

function isCapacitorNative(): boolean {
  const g = globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!g.Capacitor?.isNativePlatform?.();
}

export function getPlatform(): FsPlatform {
  if (isCapacitorNative()) return 'capacitor';
  if (isNode() && !isWeb()) return 'node';
  return 'web';
}

export async function ensureMobilePermissions(): Promise<void> {
  const platform = getPlatform();
  if (platform !== 'capacitor') return;
  try {
    const { FilePicker } = await import('@capawesome/capacitor-file-picker');
    const fp = await FilePicker.checkPermissions();
    const granted =
      (fp as unknown as { status?: string; state?: string }).status === 'granted' ||
      (fp as unknown as { status?: string; state?: string }).state === 'granted';
    if (!granted) {
      await FilePicker.requestPermissions();
    }
  } catch (e) {
    console.warn('FilePicker 权限检查失败', e);
  }
  try {
    const { Filesystem } = await import('@capacitor/filesystem');
    const fsPerm = await Filesystem.checkPermissions();
    const granted =
      (fsPerm as unknown as { publicStorage?: string; status?: string; state?: string })
        .publicStorage === 'granted' ||
      (fsPerm as unknown as { status?: string }).status === 'granted' ||
      (fsPerm as unknown as { state?: string }).state === 'granted';
    if (!granted) {
      await Filesystem.requestPermissions();
    }
  } catch (e) {
    console.warn('Filesystem 权限检查失败', e);
  }
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const AllFilesPermission = registerPlugin<{
      check: () => Promise<{ granted: boolean }>;
      request: () => Promise<{ requested: boolean }>;
    }>('AllFilesPermission');
    const res = await AllFilesPermission.check();
    if (!res.granted) {
      await AllFilesPermission.request();
    }
  } catch (e) {
    console.warn('AllFiles 权限请求失败', e);
  }
}

export async function pickDirectory(dir?: CapDirectory): Promise<FsEntry> {
  const platform = getPlatform();
  if (platform === 'capacitor') {
    const { Directory } = await import('@capacitor/filesystem');
    return {
      kind: 'directory',
      name: '',
      path: '',
      capDirectory: dir ?? Directory.Documents,
    };
  }
  if (platform !== 'web') {
    throw new Error('pickDirectory 仅在支持 File System Access 的浏览器中可用');
  }

  const picker = (
    window as typeof window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  if (!picker) {
    throw new Error('当前环境不支持 File System Access API');
  }

  const handle = await picker();
  return {
    kind: 'directory',
    name: handle.name,
    path: handle.name,
    webHandle: handle,
  };
}

export async function list(dir: FsEntry): Promise<FsEntry[]> {
  const platform = getPlatform();

  if (platform === 'web') {
    const dh = dir.webHandle as FileSystemDirectoryHandle;
    if (!dh || dh.kind !== 'directory') throw new Error('无效的目录句柄');
    const iterableDir = dh as FileSystemDirectoryHandle & {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    const items: FsEntry[] = [];
    for await (const [name, handle] of iterableDir.entries()) {
      items.push({
        kind: handle.kind === 'directory' ? 'directory' : 'file',
        name,
        path: `${dir.path ?? dh.name}/${name}`,
        webHandle:
          handle.kind === 'directory'
            ? (handle as FileSystemDirectoryHandle)
            : (handle as FileSystemFileHandle),
      });
    }
    items.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
    );
    return items;
  }

  if (platform === 'node') {
    const fs = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const base = dir.path ?? process.cwd();
    const names = await fs.readdir(base, { withFileTypes: true });
    const items: FsEntry[] = names.map((d) => ({
      kind: d.isDirectory() ? 'directory' : 'file',
      name: d.name,
      path: pathMod.join(base, d.name),
    }));
    items.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
    );
    return items;
  }

  if (platform === 'capacitor') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const base = dir.path ?? '';
    const directory: CapDirectory = dir.capDirectory ?? Directory.Documents;
    const { files } = await Filesystem.readdir({ path: base, directory });
    const items: FsEntry[] = [];
    for (const fi of files as Array<string | FileInfo>) {
      const name = typeof fi === 'string' ? fi : fi.name;
      const childPath = joinPath(base, name);
      const type = typeof fi === 'string' ? undefined : fi.type;
      let kind: FsEntryKind | undefined = type;
      if (!kind) {
        const s = await Filesystem.stat({ path: childPath, directory });
        kind = s.type === 'directory' ? 'directory' : 'file';
      }
      items.push({ kind: kind, name, path: childPath, capDirectory: directory });
    }
    items.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
    );
    return items;
  }

  throw new Error('list 在当前平台未实现');
}

export async function stat(entry: FsEntry): Promise<FsStat> {
  const platform = getPlatform();
  if (platform === 'web') {
    if (entry.kind === 'file') {
      const fh = entry.webHandle as FileSystemFileHandle;
      const f = await fh.getFile();
      return { kind: 'file', size: f.size, modified: f.lastModified };
    }
    return { kind: 'directory' };
  }
  if (platform === 'node') {
    const fs = await import('node:fs/promises');
    const s = await fs.stat(entry.path!);
    return { kind: s.isDirectory() ? 'directory' : 'file', size: s.size, modified: s.mtimeMs };
  }
  if (platform === 'capacitor') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const directory: CapDirectory = entry.capDirectory ?? Directory.Documents;
    const s = await Filesystem.stat({ path: entry.path ?? '', directory });
    return { kind: s.type === 'directory' ? 'directory' : 'file', size: s.size, modified: s.mtime };
  }
  throw new Error('stat 在当前平台未实现');
}

export async function readText(entry: FsEntry): Promise<string> {
  const platform = getPlatform();
  if (platform === 'web') {
    const fh = entry.webHandle as FileSystemFileHandle;
    const f = await fh.getFile();
    return await f.text();
  }
  if (platform === 'node') {
    const fs = await import('node:fs/promises');
    return await fs.readFile(entry.path!, 'utf-8');
  }
  if (platform === 'capacitor') {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const directory: CapDirectory = entry.capDirectory ?? Directory.Documents;
    const { data } = await Filesystem.readFile({
      path: entry.path ?? '',
      directory,
      encoding: Encoding.UTF8,
    });
    return typeof data === 'string' ? data : await data.text();
  }
  throw new Error('readText 在当前平台未实现');
}

export async function getBlob(entry: FsEntry): Promise<Blob> {
  const platform = getPlatform();
  if (platform === 'web') {
    const fh = entry.webHandle as FileSystemFileHandle;
    const f = await fh.getFile();
    return f;
  }
  if (platform === 'capacitor') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const directory = entry.capDirectory ?? Directory.Documents;
    const { data } = await Filesystem.readFile({ path: entry.path ?? '', directory });
    const base64 = typeof data === 'string' ? data : await data.text();
    const bytes = base64ToUint8Array(base64);
    const mime = mimeFromName(entry.name);
    const buf = bytes.buffer as ArrayBuffer;
    return new Blob([buf], { type: mime });
  }
  throw new Error('getBlob 仅在 Web/Capacitor 平台可用');
}

export async function writeText(
  targetDir: FsEntry,
  name: string,
  content: string,
): Promise<FsEntry> {
  const platform = getPlatform();
  if (platform === 'web') {
    const dh = targetDir.webHandle as FileSystemDirectoryHandle;
    await ensureWebWritePermission(dh);
    const fh = await dh.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
    return { kind: 'file', name, path: `${targetDir.path ?? dh.name}/${name}`, webHandle: fh };
  }
  if (platform === 'node') {
    const fs = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const filePath = targetDir.path ? pathMod.join(targetDir.path, name) : name;
    await fs.writeFile(filePath, content, 'utf-8');
    return { kind: 'file', name, path: filePath };
  }
  if (platform === 'capacitor') {
    const { Filesystem, Encoding, Directory } = await import('@capacitor/filesystem');
    const base = targetDir.path ?? '';
    const directory = targetDir.capDirectory ?? Directory.Documents;
    const filePath = joinPath(base, name);
    await Filesystem.writeFile({
      path: filePath,
      data: content,
      directory,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return { kind: 'file', name, path: filePath, capDirectory: directory };
  }
  throw new Error('writeText 在当前平台未实现');
}

export async function mkdir(targetDir: FsEntry, name: string): Promise<FsEntry> {
  const platform = getPlatform();
  if (platform === 'web') {
    const dh = targetDir.webHandle as FileSystemDirectoryHandle;
    await ensureWebWritePermission(dh);
    const sub = await dh.getDirectoryHandle(name, { create: true });
    return {
      kind: 'directory',
      name,
      path: `${targetDir.path ?? dh.name}/${name}`,
      webHandle: sub,
    };
  }
  if (platform === 'node') {
    const fs = await import('node:fs/promises');
    const pathMod = await import('node:path');
    const dirPath = targetDir.path ? pathMod.join(targetDir.path, name) : name;
    await fs.mkdir(dirPath, { recursive: true });
    return { kind: 'directory', name, path: dirPath };
  }
  if (platform === 'capacitor') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const base = targetDir.path ?? '';
    const directory = targetDir.capDirectory ?? Directory.Documents;
    const dirPath = joinPath(base, name);
    await Filesystem.mkdir({ path: dirPath, directory, recursive: true });
    return { kind: 'directory', name, path: dirPath, capDirectory: directory };
  }
  throw new Error('mkdir 在当前平台未实现');
}

export async function remove(entry: FsEntry, parent?: FsEntry): Promise<void> {
  const platform = getPlatform();
  if (platform === 'web') {
    const dh = parent?.webHandle as FileSystemDirectoryHandle | undefined;
    if (!dh || dh.kind !== 'directory') throw new Error('删除需要父目录句柄');
    await ensureWebWritePermission(dh);
    await dh.removeEntry(entry.name, { recursive: entry.kind === 'directory' });
    return;
  }
  if (platform === 'node') {
    const fs = await import('node:fs/promises');
    const s = await fs.stat(entry.path!);
    if (s.isDirectory()) {
      await fs.rm(entry.path!, { recursive: true, force: true });
    } else {
      await fs.unlink(entry.path!);
    }
    return;
  }
  if (platform === 'capacitor') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const path = entry.path ?? '';
    const dir = entry.capDirectory ?? Directory.Documents;
    if (entry.kind === 'directory') {
      await Filesystem.rmdir({ path, directory: dir, recursive: true });
    } else {
      await Filesystem.deleteFile({ path, directory: dir });
    }
    return;
  }
  throw new Error('remove 在当前平台未实现');
}

export async function buildTree(dir: FsEntry): Promise<Array<FsEntry & { children?: FsEntry[] }>> {
  const rootChildren = await list(dir);
  const result: Array<FsEntry & { children?: FsEntry[] }> = [];
  for (const e of rootChildren) {
    if (e.kind === 'directory') {
      const subtree = await buildTree(e);
      result.push({ ...e, children: subtree });
    } else {
      result.push(e);
    }
  }
  result.sort((a, b) =>
    a.kind === b.kind
      ? (a.name ?? '').localeCompare(b.name ?? '')
      : a.kind === 'directory'
        ? -1
        : 1,
  );
  return result;
}

function joinPath(base: string, name: string): string {
  if (!base) return name;
  if (!name) return base;
  return `${base.replace(/\/+$/u, '')}/${name.replace(/^\/+/, '')}`;
}

async function ensureWebWritePermission(dh: FileSystemDirectoryHandle): Promise<void> {
  const anyDh = dh as unknown as {
    queryPermission?: (opts: {
      mode: 'read' | 'readwrite';
    }) => Promise<'granted' | 'denied' | 'prompt'>;
    requestPermission?: (opts: {
      mode: 'read' | 'readwrite';
    }) => Promise<'granted' | 'denied' | 'prompt'>;
  };
  const state = (await anyDh.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
  if (state !== 'granted') {
    const res = await anyDh.requestPermission?.({ mode: 'readwrite' });
    if (res !== 'granted') throw new Error('写入权限未授予');
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function mimeFromName(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'json':
      return 'application/json';
    case 'md':
    case 'txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

export const Fs = {
  getPlatform,
  ensureMobilePermissions,
  pickDirectory,
  list,
  stat,
  readText,
  getBlob,
  writeText,
  mkdir,
  remove,
  buildTree,
};

export default Fs;
