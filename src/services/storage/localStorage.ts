import type { StorageInterface } from './interface';

/**
 * localStorage 存储实现
 * 适用于Web平台和桌面浏览器环境
 */
export class LocalStorageAdapter implements StorageInterface {
  private readonly prefix: string;

  constructor(prefix = 'novel-helper-') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  set(key: string, data: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const serializedData = JSON.stringify(data);
        localStorage.setItem(this.getKey(key), serializedData);
        resolve();
      } catch (error) {
        reject(new Error(`Failed to save data to localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  get<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      try {
        const serializedData = localStorage.getItem(this.getKey(key));
        if (serializedData === null) {
          resolve(null);
          return;
        }
        const parsed = JSON.parse(serializedData) as T;
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Failed to read data from localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  has(key: string): Promise<boolean> {
    return Promise.resolve(localStorage.getItem(this.getKey(key)) !== null);
  }

  remove(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        localStorage.removeItem(this.getKey(key));
        resolve();
      } catch (error) {
        reject(new Error(`Failed to remove data from localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        resolve();
      } catch (error) {
        reject(new Error(`Failed to clear data from localStorage: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  keys(): Promise<string[]> {
    return new Promise((resolve) => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          // 移除前缀，返回原始键名
          keys.push(key.substring(this.prefix.length));
        }
      }
      resolve(keys);
    });
  }
}