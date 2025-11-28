import type { Directory as CapDirectory } from '@capacitor/filesystem';
import { storage } from './storage';
import Fs, { type FsEntry, type FsPlatform } from './fs';

const LAST_WORKSPACE_KEY = 'workspace.last';
const HANDLE_DB_NAME = 'workspace-handle-store';
const HANDLE_STORE_NAME = 'handles';
const HANDLE_RECORD_KEY = 'workspace-last-handle';
const HANDLE_DB_VERSION = 1;

function canUseIndexedDB(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openHandleDatabase(): Promise<IDBDatabase | null> {
    if (!canUseIndexedDB()) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        const request = window.indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
                db.createObjectStore(HANDLE_STORE_NAME);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => {
            console.warn('IndexedDB 访问被阻塞，无法恢复上次打开的文件夹');
        };
    });
}

async function writeHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
    if (!canUseIndexedDB()) return;

    try {
        const db = await openHandleDatabase();
        if (!db) return;

        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite');
            const store = tx.objectStore(HANDLE_STORE_NAME);
            const request = handle ? store.put(handle, HANDLE_RECORD_KEY) : store.delete(HANDLE_RECORD_KEY);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(request.error?.message ?? 'Database write failed'));

            const close = () => db.close();
            tx.oncomplete = close;
            tx.onabort = close;
            tx.onerror = close;
        });
    } catch (error) {
        console.warn('无法保存文件夹句柄，恢复功能可能受限', error);
    }
}

async function readHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!canUseIndexedDB()) return null;

    try {
        const db = await openHandleDatabase();
        if (!db) return null;

        return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
            const tx = db.transaction(HANDLE_STORE_NAME, 'readonly');
            const store = tx.objectStore(HANDLE_STORE_NAME);
            const request = store.get(HANDLE_RECORD_KEY);

            request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
            request.onerror = () => reject(new Error(request.error?.message ?? 'Database read failed'));

            const close = () => db.close();
            tx.oncomplete = close;
            tx.onabort = close;
            tx.onerror = close;
        });
    } catch (error) {
        console.warn('恢复文件夹句柄失败', error);
        return null;
    }
}

export interface PersistedWorkspaceEntry {
    platform: FsPlatform;
    path: string;
    name: string;
    capDirectory?: CapDirectory;
}

export async function persistLastWorkspace(entry: FsEntry): Promise<void> {
    const payload: PersistedWorkspaceEntry = {
        platform: Fs.getPlatform(),
        path: entry.path ?? entry.name ?? '',
        name: entry.name ?? entry.path ?? 'workspace',
        ...(entry.capDirectory ? { capDirectory: entry.capDirectory } : {}),
    };

    try {
        await storage.set(LAST_WORKSPACE_KEY, payload);
    } catch (error) {
        console.warn('无法保存最近打开的文件夹元数据', error);
    }

    await writeHandle(entry.webHandle && entry.webHandle.kind === 'directory' ? entry.webHandle : null);
}

export async function loadLastWorkspace() {
    try {
        return await storage.get<PersistedWorkspaceEntry>(LAST_WORKSPACE_KEY);
    } catch (error) {
        console.warn('读取最近文件夹信息失败', error);
        return null;
    }
}

export async function getPersistedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    return readHandle();
}

export async function clearPersistedWorkspace(): Promise<void> {
    try {
        await storage.remove(LAST_WORKSPACE_KEY);
    } catch (error) {
        console.warn('清除最近文件夹信息失败', error);
    }
    await writeHandle(null);
}
