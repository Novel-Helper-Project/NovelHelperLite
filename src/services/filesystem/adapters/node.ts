import type { FsEntry, FsStat } from '../types';

export async function list(dir: FsEntry): Promise<FsEntry[]> {
  const fs = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const base = dir.path ?? process.cwd();
  const names = await fs.readdir(base, { withFileTypes: true });
  const items: FsEntry[] = names.map((d) => ({
    kind: d.isDirectory() ? 'directory' : 'file',
    name: d.name,
    path: pathMod.join(base, d.name),
  }));
  items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
  return items;
}

export async function stat(entry: FsEntry): Promise<FsStat> {
  const fs = await import('node:fs/promises');
  const s = await fs.stat(entry.path!);
  return { kind: s.isDirectory() ? 'directory' : 'file', size: s.size, modified: s.mtimeMs };
}

export async function readText(entry: FsEntry): Promise<string> {
  const fs = await import('node:fs/promises');
  return await fs.readFile(entry.path!, 'utf-8');
}

export async function writeText(targetDir: FsEntry, name: string, content: string): Promise<FsEntry> {
  const fs = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const filePath = targetDir.path ? pathMod.join(targetDir.path, name) : name;
  await fs.writeFile(filePath, content, 'utf-8');
  return { kind: 'file', name, path: filePath };
}

export async function mkdir(targetDir: FsEntry, name: string): Promise<FsEntry> {
  const fs = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const dirPath = targetDir.path ? pathMod.join(targetDir.path, name) : name;
  await fs.mkdir(dirPath, { recursive: true });
  return { kind: 'directory', name, path: dirPath };
}

export async function remove(entry: FsEntry): Promise<void> {
  const fs = await import('node:fs/promises');
  const s = await fs.stat(entry.path!);
  if (s.isDirectory()) {
    await fs.rm(entry.path!, { recursive: true, force: true });
  } else {
    await fs.unlink(entry.path!);
  }
}

export async function copy(entry: FsEntry, targetDir: FsEntry, options?: { newName?: string }): Promise<FsEntry> {
  const fs = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const destName = options?.newName || entry.name;
  const from = entry.path!;
  const to = targetDir.path ? pathMod.join(targetDir.path, destName) : destName;

  if (typeof fs.cp === 'function') {
    await fs.cp(from, to, { recursive: true });
  } else {
    const stat = await fs.stat(from);
    if (stat.isDirectory()) {
      await fs.mkdir(to, { recursive: true });
      const items = await fs.readdir(from, { withFileTypes: true });
      for (const item of items) {
        const childEntry: FsEntry = {
          kind: item.isDirectory() ? 'directory' : 'file',
          name: item.name,
          path: pathMod.join(from, item.name),
        };
        await copy(childEntry, { kind: 'directory', name: targetDir.name, path: to });
      }
    } else {
      await fs.copyFile(from, to);
    }
  }

  return { kind: entry.kind, name: destName, path: to };
}

export async function move(
  entry: FsEntry,
  targetDir: FsEntry,
  options?: { newName?: string; sourceParent?: FsEntry },
): Promise<FsEntry> {
  const fs = await import('node:fs/promises');
  const pathMod = await import('node:path');
  const destName = options?.newName || entry.name;
  const from = entry.path!;
  const to = targetDir.path ? pathMod.join(targetDir.path, destName) : destName;

  try {
    await fs.rename(from, to);
  } catch {
    // fallback for cross-device moves
    await copy(entry, targetDir, { newName: destName });
    await remove(entry);
  }

  return { kind: entry.kind, name: destName, path: to };
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

