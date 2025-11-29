import type { StorageInterface } from './interface';

export class CapacitorPreferencesAdapter implements StorageInterface {
  private readonly prefix: string;

  constructor(prefix = 'novel-helper-') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async set(key: string, data: unknown): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    const serialized = JSON.stringify(data);
    await Preferences.set({ key: this.getKey(key), value: serialized });
  }

  async get<T>(key: string): Promise<T | null> {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: this.getKey(key) });
    if (value == null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async has(key: string): Promise<boolean> {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: this.getKey(key) });
    return value != null;
  }

  async remove(key: string): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: this.getKey(key) });
  }

  async clear(): Promise<void> {
    const { Preferences } = await import('@capacitor/preferences');
    const { keys } = await Preferences.keys();
    const toRemove = keys.filter((k) => k.startsWith(this.prefix));
    for (const k of toRemove) {
      await Preferences.remove({ key: k });
    }
  }

  async keys(): Promise<string[]> {
    const { Preferences } = await import('@capacitor/preferences');
    const { keys } = await Preferences.keys();
    return keys
      .filter((k) => k.startsWith(this.prefix))
      .map((k) => k.substring(this.prefix.length));
  }
}
