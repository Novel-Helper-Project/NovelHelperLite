import type { FsEntry, FsStat } from '../types';
import { checkFileSystemSupport } from '../support';

export async function pickDirectory(): Promise<FsEntry> {
  const support = checkFileSystemSupport();
  if (!support.supported) {
    let message = `❌ 文件系统访问不可用\n\n`;
    message += `🔍 检测结果：${support.browser || '未知浏览器'}\n`;
    message += `❓ 原因：${support.reason || '未知原因'}\n\n`;
    message += `💡 建议解决方案：\n${support.suggestion || '请使用支持的浏览器'}`;
    throw new Error(message);
  }

  const picker = (window as typeof window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;
  if (!picker) {
    const support2 = checkFileSystemSupport();
    throw new Error(`❌ 文件系统访问不可用\n\n🔍 检测结果：${support2.browser || '未知浏览器'}\n❓ 原因：API 检测失败\n\n💡 建议：${support2.suggestion || '请刷新页面重试'}`);
  }

  const handle = await picker();
  return { kind: 'directory', name: handle.name, path: handle.name, webHandle: handle };
}

export async function list(dir: FsEntry): Promise<FsEntry[]> {
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
      webHandle: handle.kind === 'directory' ? (handle as FileSystemDirectoryHandle) : (handle as FileSystemFileHandle),
    });
  }
  items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
  return items;
}

export async function stat(entry: FsEntry): Promise<FsStat> {
  if (entry.kind === 'file') {
    const fh = entry.webHandle as FileSystemFileHandle;
    const f = await fh.getFile();
    return { kind: 'file', size: f.size, modified: f.lastModified };
  }
  return { kind: 'directory' };
}

export async function readText(entry: FsEntry): Promise<string> {
  const fh = entry.webHandle as FileSystemFileHandle;
  const f = await fh.getFile();
  return await f.text();
}

export async function getBlob(entry: FsEntry): Promise<Blob> {
  const fh = entry.webHandle as FileSystemFileHandle;
  const f = await fh.getFile();
  return f;
}

export async function writeText(targetDir: FsEntry, name: string, content: string): Promise<FsEntry> {
  const dh = targetDir.webHandle as FileSystemDirectoryHandle;
  await ensureWebWritePermission(dh);
  const fh = await dh.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(content);
  await writable.close();
  return { kind: 'file', name, path: `${targetDir.path ?? dh.name}/${name}`, webHandle: fh };
}

export async function mkdir(targetDir: FsEntry, name: string): Promise<FsEntry> {
  const dh = targetDir.webHandle as FileSystemDirectoryHandle;
  await ensureWebWritePermission(dh);
  const sub = await dh.getDirectoryHandle(name, { create: true });
  return { kind: 'directory', name, path: `${targetDir.path ?? dh.name}/${name}`, webHandle: sub };
}

export async function remove(entry: FsEntry, parent?: FsEntry): Promise<void> {
  const dh = parent?.webHandle as FileSystemDirectoryHandle | undefined;
  if (!dh || dh.kind !== 'directory') throw new Error('删除需要父目录句柄');
  await ensureWebWritePermission(dh);
  await dh.removeEntry(entry.name, { recursive: entry.kind === 'directory' });
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
  result.sort((a, b) => (a.kind === b.kind ? (a.name ?? '').localeCompare(b.name ?? '') : a.kind === 'directory' ? -1 : 1));
  return result;
}

async function ensureWebWritePermission(dh: FileSystemDirectoryHandle): Promise<void> {
  const anyDh = dh as unknown as {
    queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
    requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  };
  const state = (await anyDh.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
  if (state !== 'granted') {
    const res = await anyDh.requestPermission?.({ mode: 'readwrite' });
    if (res !== 'granted') throw new Error('写入权限未授予');
  }
}

