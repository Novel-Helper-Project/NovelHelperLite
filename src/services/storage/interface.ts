/**
 * 存储接口定义
 * 提供统一的存储抽象层，支持不同平台的存储实现
 */
export interface StorageInterface {
  /**
   * 保存数据到存储
   * @param key 存储键
   * @param data 要存储的数据
   */
  set(key: string, data: unknown): Promise<void>;

  /**
   * 从存储读取数据
   * @param key 存储键
   * @returns 存储的数据，如果不存在则返回null
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * 检查数据是否存在
   * @param key 存储键
   * @returns 是否存在
   */
  has(key: string): Promise<boolean>;

  /**
   * 删除存储的数据
   * @param key 存储键
   */
  remove(key: string): Promise<void>;

  /**
   * 清空所有存储数据
   */
  clear(): Promise<void>;

  /**
   * 获取所有存储的键
   * @returns 键列表
   */
  keys(): Promise<string[]>;
}