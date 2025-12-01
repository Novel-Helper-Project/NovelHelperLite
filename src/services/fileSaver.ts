/**
 * 文件保存工具函数
 * 处理不同平台的文件保存逻辑
 */

import Fs from './filesystem';
import type { FsEntry } from './filesystem/types';
import type { OpenFile } from 'src/stores/workspace';
import { useWorkspaceStore } from 'src/stores/workspace';

function resolveFsTarget(file: OpenFile): { dir: FsEntry; name: string } | null {
  const entry = file.fsEntry;
  if (!entry || entry.kind !== 'file') return null;

  const normalizedPath = (entry.path ?? file.path ?? '').replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  const fileName = entry.name || file.name || parts.pop() || '';
  if (!fileName) return null;
  const dirParts = parts.slice(0, -1); // 去掉文件名,保留目录路径
  const dirPath = dirParts.join('/');
  const dirName = dirParts[dirParts.length - 1] || '';

  const dirEntry: FsEntry = {
    kind: 'directory',
    name: dirName || 'root',
    path: dirPath,
    // 保留原始的 handle/目录信息,否则 Web 模式无法写入
    ...(entry.capDirectory ? { capDirectory: entry.capDirectory } : {}),
    ...(entry.webHandle ? { webHandle: entry.webHandle } : {}),
    ...(file.handle ? { webHandle: file.handle } : {}),
  };
  return { dir: dirEntry, name: fileName };
}

/**
 * 保存文件
 * @param file 要保存的文件对象
 * @param content 文件内容,如果不提供则使用 file.content
 */
export async function saveFile(file: OpenFile, content?: string): Promise<void> {
  const { updateCurrentContent, markCurrentFileSaved } = useWorkspaceStore();
  const contentToSave = content ?? file.content;

  // 如果有自定义保存回调(例如设置文件),优先使用
  if (file.onSave) {
    try {
      await file.onSave(contentToSave);
      updateCurrentContent(contentToSave);
      markCurrentFileSaved(contentToSave);
      return;
    } catch (error) {
      console.error('保存失败:', error);
      throw error;
    }
  }

  // 优先使用 File System Access API(Web 模式下有 handle 时直接用)
  if (file.handle && file.handle.kind === 'file') {
    try {
      const writable = await file.handle.createWritable();
      await writable.write(contentToSave);
      await writable.close();
      updateCurrentContent(contentToSave);
      markCurrentFileSaved(contentToSave);
      return;
    } catch (error) {
      console.error('使用 FileSystemHandle 保存失败:', error);
      throw error;
    }
  }

  // 备用:使用统一的 Fs 封装(Capacitor 等平台)
  const fsTarget = resolveFsTarget(file);
  if (fsTarget) {
    try {
      await Fs.writeText(fsTarget.dir, fsTarget.name, contentToSave);
      updateCurrentContent(contentToSave);
      markCurrentFileSaved(contentToSave);
      return;
    } catch (error) {
      console.error('使用 Fs 写入失败:', error);
      throw error;
    }
  }

  throw new Error('无法保存文件:没有可用的保存目标');
}
