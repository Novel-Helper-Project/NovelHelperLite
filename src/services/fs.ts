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

export function checkFileSystemSupport(): {
  supported: boolean;
  browser?: string;
  reason?: string;
  suggestion?: string;
  debug?: { userAgent: string; details: string[] };
} {
  // 检测 API 是否存在
  const hasAPI = 'showDirectoryPicker' in window;

  // 检测浏览器类型
  const userAgent = navigator.userAgent;
  const debugInfo: string[] = [];
  debugInfo.push(`User-Agent: ${userAgent}`);
  debugInfo.push(`API 存在: ${hasAPI}`);

  // 更精确的浏览器检测
  const isEdgeLegacy = /Edge\//.test(userAgent);  // Edge Legacy (EdgeHTML)
  const isEdgeChromium = /Edg\//.test(userAgent);  // Edge (Chromium)
  const isChrome = /Chrome/.test(userAgent) && !isEdgeLegacy && !isEdgeChromium;
  const isFirefox = /Firefox/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  debugInfo.push(`Edge Legacy: ${isEdgeLegacy}`);
  debugInfo.push(`Edge Chromium: ${isEdgeChromium}`);
  debugInfo.push(`Chrome: ${isChrome}`);
  debugInfo.push(`Firefox: ${isFirefox}`);
  debugInfo.push(`Safari: ${isSafari}`);
  debugInfo.push(`Mobile: ${isMobile}`);

  // 检测 Chrome/Edge 版本
  let chromeVersion = 0;
  let edgeVersion = 0;
  let edgeLegacyVersion = 0;

  if (isChrome) {
    const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
    if (chromeMatch?.[1]) chromeVersion = parseInt(chromeMatch[1], 10);
  }

  if (isEdgeChromium) {
    const edgeMatch = userAgent.match(/Edg\/(\d+)/);
    if (edgeMatch?.[1]) edgeVersion = parseInt(edgeMatch[1], 10);
  }

  if (isEdgeLegacy) {
    const edgeLegacyMatch = userAgent.match(/Edge\/(\d+)/);
    if (edgeLegacyMatch?.[1]) edgeLegacyVersion = parseInt(edgeLegacyMatch[1], 10);
  }

  debugInfo.push(`Chrome Version: ${chromeVersion}`);
  debugInfo.push(`Edge Chromium Version: ${edgeVersion}`);
  debugInfo.push(`Edge Legacy Version: ${edgeLegacyVersion}`);

  if (!hasAPI) {
    if (isMobile) {
      return {
        supported: false,
        browser: 'Mobile Browser',
        reason: '移动端浏览器不支持 File System Access API',
        suggestion: '请使用桌面版 Chrome 或 Edge 浏览器，或者下载我们的移动应用',
        debug: { userAgent, details: debugInfo }
      };
    } else if (isFirefox) {
      return {
        supported: false,
        browser: 'Firefox',
        reason: 'Firefox 浏览器目前不支持 File System Access API',
        suggestion: '请使用 Chrome 86+ 或 Edge 86+ 浏览器来获得完整的文件系统访问功能',
        debug: { userAgent, details: debugInfo }
      };
    } else if (isSafari) {
      return {
        supported: false,
        browser: 'Safari',
        reason: 'Safari 浏览器目前不支持 File System Access API',
        suggestion: '请使用 Chrome 86+ 或 Edge 86+ 浏览器，或者在 Mac 上下载我们的桌面应用',
        debug: { userAgent, details: debugInfo }
      };
    } else if (isEdgeLegacy) {
      return {
        supported: false,
        browser: `Edge (Legacy) ${edgeLegacyVersion}`,
        reason: 'Edge Legacy 浏览器不支持 File System Access API',
        suggestion: '请升级到新版本 Edge 浏览器（基于 Chromium）或使用 Chrome 浏览器',
        debug: { userAgent, details: debugInfo }
      };
    } else {
      return {
        supported: false,
        browser: 'Unknown',
        reason: '当前浏览器不支持 File System Access API',
        suggestion: '请使用最新版本的 Chrome 或 Edge 浏览器',
        debug: { userAgent, details: debugInfo }
      };
    }
  }

  // 检查版本要求
  if (isChrome && chromeVersion < 86) {
    return {
      supported: false,
      browser: `Chrome ${chromeVersion}`,
      reason: 'Chrome 版本过低，File System Access API 需要 Chrome 86+',
      suggestion: '请将 Chrome 浏览器升级到最新版本',
      debug: { userAgent, details: debugInfo }
    };
  }

  if (isEdgeChromium && edgeVersion < 86) {
    return {
      supported: false,
      browser: `Edge ${edgeVersion}`,
      reason: 'Edge 版本过低，File System Access API 需要 Edge 86+',
      suggestion: '请将 Edge 浏览器升级到最新版本',
      debug: { userAgent, details: debugInfo }
    };
  }

  return {
    supported: true,
    debug: { userAgent, details: debugInfo }
  };
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

  // 使用新的检测函数获取详细信息
  const support = checkFileSystemSupport();
  if (!support.supported) {
    let message = `❌ 文件系统访问不可用\n\n`;
    message += `🔍 检测结果：${support.browser || '未知浏览器'}\n`;
    message += `❓ 原因：${support.reason || '未知原因'}\n\n`;
    message += `💡 建议解决方案：\n${support.suggestion || '请使用支持的浏览器'}`;
    throw new Error(message);
  }

  const picker = (
    window as typeof window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
  ).showDirectoryPicker;

  if (!picker) {
    // 理论上不应该到达这里，因为前面的检测已经确认 API 存在
    const support = checkFileSystemSupport();
    throw new Error(`❌ 文件系统访问不可用\n\n🔍 检测结果：${support.browser || '未知浏览器'}\n❓ 原因：API 检测失败\n\n💡 建议：${support.suggestion || '请刷新页面重试'}`);
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
