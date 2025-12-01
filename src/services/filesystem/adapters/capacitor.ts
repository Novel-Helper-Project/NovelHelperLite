import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem, type FileInfo, type Directory as CapDirectory } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import type { FsEntry, FsStat } from '../types';
import { isFullDevicePath, toRelativeExternalPath } from '../path';

const PRIVATE_ROOT = 'workspace';

type PermissionSnapshot = {
  status?: string;
  state?: string;
  publicStorage?: string;
  granted?: boolean;
};

// Some plugins return string states like 'granted', others return objects
// Normalize a variety of shapes to a boolean.
function isGrantedPermission(p: unknown): boolean {
  if (p === 'granted') return true;
  if (typeof p === 'object' && p !== null) {
    const obj = p as PermissionSnapshot;
    return (
      obj.publicStorage === 'granted' ||
      obj.status === 'granted' ||
      obj.state === 'granted' ||
      obj.granted === true
    );
  }
  return false;
}

async function ensurePrivateRoot(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: PRIVATE_ROOT,
      directory: Directory.External,
      recursive: true,
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (!/exist/i.test(msg)) {
      console.warn('创建私有工作区目录失败', err);
    }
  }
}

export async function getPrivateWorkspaceRoot(): Promise<FsEntry> {
  await ensurePrivateRoot();
  return {
    kind: 'directory',
    name: PRIVATE_ROOT,
    path: PRIVATE_ROOT,
    capDirectory: Directory.External,
  };
}

export async function ensureMobilePermissions(): Promise<void> {
  const missingPermissions: string[] = [];
  let allFilesPlugin:
    | {
        check: () => Promise<{ granted: boolean }>;
        request: () => Promise<void>;
        openAppSettings?: () => Promise<void>;
      }
    | null = null;
  let allFilesGranted = true;

  try {
    console.log('检查 FilePicker 权限...');
    const fp = await FilePicker.checkPermissions();
    console.log('FilePicker 权限状态:', fp);
    const granted = isGrantedPermission(fp);
    if (!granted) {
      console.log('请求 FilePicker 权限...');
      await FilePicker.requestPermissions();
      const after = await FilePicker.checkPermissions();
      if (!isGrantedPermission(after)) missingPermissions.push('文件选择');
    }
  } catch (e) {
    console.warn('FilePicker 权限检查失败', e);
  }
  try {
    console.log('检查 Filesystem 权限...');
    const fsPerm = await Filesystem.checkPermissions();
    console.log('Filesystem 权限状态:', fsPerm);
    const granted = isGrantedPermission(fsPerm);
    if (!granted) {
      console.log('请求 Filesystem 权限...');
      await Filesystem.requestPermissions();
      const after = await Filesystem.checkPermissions();
      if (!isGrantedPermission(after)) missingPermissions.push('文件系统读写');
    }
  } catch (e) {
    console.warn('Filesystem 权限检查失败', e);
  }
  try {
    // 针对 Android 11+ 的“所有文件访问权限”
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      const info = await Device.getInfo();
      const osVersion = info.osVersion ?? '';
      const major = Number.parseInt(osVersion.split('.')[0] ?? '', 10);
      const shouldCheckAllFiles = Number.isFinite(major) ? major >= 11 : true; // Android 11+ 需要
      console.log(`Android 版本: ${osVersion || 'unknown'}，需要所有文件访问: ${shouldCheckAllFiles}`);
      if (shouldCheckAllFiles) {
        const AllFilesPermission = registerPlugin<{
          check: () => Promise<{ granted: boolean }>;
          request: () => Promise<void>; // 通常是打开设置页面
          openAppSettings?: () => Promise<void>; // 设为可选，以防插件没有此方法
        }>('AllFilesPermission');
        allFilesPlugin = AllFilesPermission;

        const permStatus = await AllFilesPermission.check();
        if (!permStatus.granted) {
          // 关键：引导用户去设置页面手动开启
          // 很多插件的 request() 方法就是打开设置页面的实现
          console.log('Android 11+，所有文件访问权限未授予，正在尝试引导用户到设置页面...');
          // 弹出提示，告知用户为何需要此权限以及如何操作
          // 此处用 alert 简化，实际项目中建议使用更友好的 UI 组件
          alert(
            '为了正常读取和管理设备上的文档，需要您授予“所有文件访问权限”。即将跳转到应用设置页面，请找到并开启此权限。',
          );
          await AllFilesPermission.request(); // 大多数插件的 request() 会打开设置
          // 再次检查，若用户未手动开启，给出明确引导
          const afterRequest = await AllFilesPermission.check();
          allFilesGranted = afterRequest.granted;
          if (!afterRequest.granted) {
            console.warn('用户未开启所有文件访问权限，提示其前往系统设置授权');
            alert(
              '您尚未开启“所有文件访问权限”。请在系统设置 > 应用 > 权限管理中，为本应用打开“所有文件访问权限”后再重试。',
            );
            if (typeof AllFilesPermission.openAppSettings === 'function') {
              try {
                await AllFilesPermission.openAppSettings();
              } catch (err) {
                console.warn('打开应用设置失败', err);
              }
            }
          }
        } else {
          allFilesGranted = true;
        }
      } else {
        console.log(`Android 版本 (${osVersion || '未知'}) 低于 11，跳过所有文件访问权限检查。`);
      }
    }
  } catch (e) {
    console.warn('AllFiles 权限请求失败', e);
    allFilesGranted = false;
    missingPermissions.push('所有文件访问');
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    if (!allFilesGranted) missingPermissions.push('所有文件访问');
    if (missingPermissions.length > 0) {
      const msg = `缺少以下权限：${missingPermissions.join('、')}。\n即将打开设置页面，请授权后返回应用。`;
      alert(msg);
      if (allFilesPlugin) {
        try {
          if (typeof allFilesPlugin.openAppSettings === 'function') {
            await allFilesPlugin.openAppSettings();
          } else {
            await allFilesPlugin.request();
          }
        } catch (err) {
          console.warn('尝试打开应用设置失败', err);
        }
      }
    }
  }
}

export async function pickDirectory(dir?: CapDirectory): Promise<FsEntry> {
  const defaultDirectory = dir ?? Directory.ExternalStorage;

  try {
    // 首先确保有权限
    console.log('检查 FilePicker 权限...');
    const permission = await FilePicker.checkPermissions();
    console.log('FilePicker 权限:', permission);
    if (!isGrantedPermission(permission)) {
      console.log('请求 FilePicker 权限...');
      await FilePicker.requestPermissions();
    }

    console.log('启动文件选择器...');
    // 优先使用 FilePicker 让用户选择目录
    const picked = await FilePicker.pickDirectory();
    console.log('FilePicker 选择结果:', picked);

    const dirPath = (picked as unknown as { path?: string }).path ?? '';

    if (dirPath) {
      const { relativePath, displayName } = toRelativeExternalPath(dirPath);
      console.log('用户选择目录:', dirPath, '相对路径:', relativePath);
      return {
        kind: 'directory',
        name: displayName,
        path: relativePath,
        capDirectory: Directory.ExternalStorage,
      };
    } else {
      console.log('用户取消选择或路径为空');
      throw new Error('用户取消选择');
    }
  } catch (error) {
    console.warn('FilePicker.pickDirectory 失败:', error);

    // 检查常见的用户取消错误
    const errorStr = String(error);
    if (errorStr.includes('cancelled') ||
      errorStr.includes('取消') ||
      errorStr.includes('cancel') ||
      errorStr.includes('User cancelled')) {
      console.log('检测到用户取消操作');
      throw new Error('用户取消选择');
    }

    // 检查权限错误
    if (errorStr.includes('permission') ||
      errorStr.includes('denied') ||
      errorStr.includes('权限')) {
      console.log('检测到权限问题');
      throw new Error('需要文件访问权限');
    }

    // 如果文件选择器失败，回退到默认目录
    console.log('回退到默认目录:', defaultDirectory);
    return {
      kind: 'directory',
      name: 'Documents',
      path: '',
      capDirectory: defaultDirectory,
    };
  }
}

export async function list(dir: FsEntry): Promise<FsEntry[]> {
  const rawPath = dir.path ?? '';
  const normalized = isFullDevicePath(rawPath) ? toRelativeExternalPath(rawPath) : null;
  const base = normalized?.relativePath ?? rawPath;
  const directory: CapDirectory = dir.capDirectory ?? Directory.Documents;

  try {
    console.log(`尝试读取目录: ${base}, 目录类型: ${directory}`);

    // 处理 content:// URI 格式的路径
    const { files } = await Filesystem.readdir({ path: base, directory });
    console.log(`读取到 ${files.length} 个文件/目录`);

    const items: FsEntry[] = [];
    const list = files as Array<string | FileInfo>;

    for (const fi of list) {
      const name = typeof fi === 'string' ? fi : fi.name;
      const childPath = joinPath(base, name);
      const entryType = typeof fi === 'string' ? undefined : fi.type;
      let kind: 'file' | 'directory';

      if (entryType) {
        kind = entryType === 'directory' ? 'directory' : 'file';
      } else {
        try {
          const s = await Filesystem.stat({ path: childPath, directory });
          kind = s.type === 'directory' ? 'directory' : 'file';
        } catch (statError) {
          console.warn(`无法获取文件状态: ${childPath}`, statError);
          // 如果无法获取状态，根据名称推断类型
          kind = name.includes('.') ? 'file' : 'directory';
        }
      }

      items.push({ kind, name, path: childPath, capDirectory: directory });
    }

    items.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1,
    );
    console.log(`成功处理 ${items.length} 个文件/目录`);
    return items;
  } catch (error) {
    console.error(`读取目录失败: ${base}`, error);
    console.error('错误详情:', {
      path: base,
      directory,
      error: error instanceof Error ? error.message : String(error)
    });

    // 对于 content URI 错误，提供更友好的错误信息
    throw new Error(`无法读取目录内容: ${rawPath || 'root'}`);
  }
}

export async function stat(entry: FsEntry): Promise<FsStat> {
  const directory: CapDirectory = entry.capDirectory ?? Directory.Documents;
  const s = await Filesystem.stat({ path: entry.path ?? '', directory });
  return { kind: s.type === 'directory' ? 'directory' : 'file', size: s.size, modified: s.mtime };
}

export async function readText(entry: FsEntry): Promise<string> {
  const directory: CapDirectory = entry.capDirectory ?? Directory.Documents;
  const { data } = await Filesystem.readFile({
    path: entry.path ?? '',
    directory,
    encoding: Encoding.UTF8,
  });
  return typeof data === 'string' ? data : await data.text();
}

export async function getBlob(entry: FsEntry): Promise<Blob> {
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
  const base = targetDir.path ?? '';
  const directory = targetDir.capDirectory ?? Directory.Documents;
  const dirPath = joinPath(base, name);
  await Filesystem.mkdir({ path: dirPath, directory, recursive: true });
  return { kind: 'directory', name, path: dirPath, capDirectory: directory };
}

export async function remove(entry: FsEntry): Promise<void> {
  const path = entry.path ?? '';
  const dir = entry.capDirectory ?? Directory.Documents;
  if (entry.kind === 'directory') {
    await Filesystem.rmdir({ path, directory: dir, recursive: true });
  } else {
    await Filesystem.deleteFile({ path, directory: dir });
  }
}

export async function copy(
  entry: FsEntry,
  targetDir: FsEntry,
  options?: { newName?: string },
): Promise<FsEntry> {
  const destName = options?.newName || entry.name;
  const sourceDir = entry.capDirectory ?? Directory.Documents;
  const targetDirectory = targetDir.capDirectory ?? sourceDir;
  const toPath = joinPath(targetDir.path ?? '', destName);
  const fromPath = entry.path ?? '';

  if (sourceDir === targetDirectory) {
    await Filesystem.copy({ from: fromPath, to: toPath, directory: targetDirectory });
    return { kind: entry.kind, name: destName, path: toPath, capDirectory: targetDirectory };
  }

  if (entry.kind === 'directory') {
    await Filesystem.mkdir({ path: toPath, directory: targetDirectory, recursive: true });
    const children = await list(entry);
    for (const child of children) {
      await copy(child, { kind: 'directory', name: destName, path: toPath, capDirectory: targetDirectory });
    }
    return { kind: 'directory', name: destName, path: toPath, capDirectory: targetDirectory };
  }

  const { data } = await Filesystem.readFile({ path: fromPath, directory: sourceDir });
  const base64 = typeof data === 'string' ? data : await data.text();
  await Filesystem.writeFile({
    path: toPath,
    data: base64,
    directory: targetDirectory,
    recursive: true,
  });

  return { kind: 'file', name: destName, path: toPath, capDirectory: targetDirectory };
}

export async function move(
  entry: FsEntry,
  targetDir: FsEntry,
  options?: { newName?: string; sourceParent?: FsEntry },
): Promise<FsEntry> {
  const destName = options?.newName || entry.name;
  const sourceDir = entry.capDirectory ?? Directory.Documents;
  const targetDirectory = targetDir.capDirectory ?? sourceDir;
  const fromPath = entry.path ?? '';
  const toPath = joinPath(targetDir.path ?? '', destName);

  if (sourceDir === targetDirectory) {
    await Filesystem.rename({ from: fromPath, to: toPath, directory: targetDirectory });
    return { kind: entry.kind, name: destName, path: toPath, capDirectory: targetDirectory };
  }

  const copied = await copy(entry, targetDir, { newName: destName });
  await remove(entry);
  return copied;
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
