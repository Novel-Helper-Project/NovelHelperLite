import type { StorageInterface } from './interface';
import { LocalStorageAdapter } from './localStorage';

/**
 * 存储服务工厂
 * 根据平台和环境自动选择合适的存储实现
 */
export class StorageService {
  private static instance: StorageInterface | null = null;

  /**
   * 获取存储实例（单例模式）
   */
  static getInstance(): StorageInterface {
    if (!this.instance) {
      this.instance = this.createStorageInstance();
    }
    return this.instance;
  }

  /**
   * 根据用户代理和环境创建存储实例
   */
  private static createStorageInstance(): StorageInterface {
    // Web平台检测
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      console.log('🔧 Storage: Using LocalStorage adapter');
      return new LocalStorageAdapter();
    }

    // 默认使用localStorage（适用于大多数情况）
    console.log('🔧 Storage: Using LocalStorage adapter (fallback)');
    return new LocalStorageAdapter();
  }

  /**
   * 重置存储实例（用于测试或特殊场景）
   */
  static resetInstance(): void {
    this.instance = null;
  }
}

// 导出便捷方法
export const storage = StorageService.getInstance();

// 导出类型和实现类，供需要时使用
export type { StorageInterface };
export { LocalStorageAdapter };
