import type { Directory as CapDirectory, FileInfo } from '@capacitor/filesystem';
import type { FsEntry, FsStat } from '../types';

export async function ensureMobilePermissions(): Promise<void> {
  try {
    const { FilePicker } = await import('@capawesome/capacitor-file-picker');
    const fp = await FilePicker.checkPermissions();
    const granted =
      (fp as unknown as { status?: string; state?: string }).status === 'granted' ||
      (fp as unknown as { status?: string; state?: string }).state === 'granted';
    if (!granted) await FilePicker.requestPermissions();
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
    if (!granted) await Filesystem.requestPermissions();
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
    if (!res.granted) await AllFilesPermission.request();
  } catch (e) {
    console.warn('AllFiles 权限请求失败', e);
  }
}

export async function pickDirectory(dir?: CapDirectory): Promise<FsEntry> {
  const { Directory } = await import('@capacitor/filesystem');
  return { kind: 'directory', name: '', path: '', capDirectory: dir ?? Directory.Documents };
}

export async function list(dir: FsEntry): Promise<FsEntry[]> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const base = dir.path ?? '';
  const directory: CapDirectory = dir.capDirectory ?? Directory.Documents;
  const { files } = await Filesystem.readdir({ path: base, directory });
  const items: FsEntry[] = [];
  const list = files as Array<string | FileInfo>;
  for (const fi of list) {
    const name = typeof fi === 'string' ? fi : fi.name;
    const childPath = joinPath(base, name);
    const type = typeof fi === 'string' ? undefined : fi.type;
    let kind: 'file' | 'directory' | undefined = type;
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

export async function stat(entry: FsEntry): Promise<FsStat> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const directory: CapDirectory = entry.capDirectory ?? Directory.Documents;
  const s = await Filesystem.stat({ path: entry.path ?? '', directory });
  return { kind: s.type === 'directory' ? 'directory' : 'file', size: s.size, modified: s.mtime };
}

export async function readText(entry: FsEntry): Promise<string> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const directory: CapDirectory = entry.capDirectory ?? Directory.Documents;
  const { data } = await Filesystem.readFile({
    path: entry.path ?? '',
    directory,
    encoding: Encoding.UTF8,
  });
  return typeof data === 'string' ? data : await data.text();
}

export async function getBlob(entry: FsEntry): Promise<Blob> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const directory = entry.capDirectory ?? Directory.Documents;
  const { data } = await Filesystem.readFile({ path: entry.path ?? '', directory });
  const base64 = typeof data === 'string' ? data : await data.text();
  const bytes = base64ToUint8Array(base64);
  const mime = mimeFromName(entry.name);
  const buf = bytes.buffer as ArrayBuffer;
  return new Blob([buf], { type: mime });
}

export async function writeText(
  targetDir: FsEntry,
  name: string,
  content: string,
): Promise<FsEntry> {
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

export async function mkdir(targetDir: FsEntry, name: string): Promise<FsEntry> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const base = targetDir.path ?? '';
  const directory = targetDir.capDirectory ?? Directory.Documents;
  const dirPath = joinPath(base, name);
  await Filesystem.mkdir({ path: dirPath, directory, recursive: true });
  return { kind: 'directory', name, path: dirPath, capDirectory: directory };
}

export async function remove(entry: FsEntry): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const path = entry.path ?? '';
  const dir = entry.capDirectory ?? Directory.Documents;
  if (entry.kind === 'directory') {
    await Filesystem.rmdir({ path, directory: dir, recursive: true });
  } else {
    await Filesystem.deleteFile({ path, directory: dir });
  }
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
