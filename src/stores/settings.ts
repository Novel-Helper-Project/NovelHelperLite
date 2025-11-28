import { defineStore } from 'pinia';

interface SettingsState {
  // 图片查看器设置
  imageViewing: {
    showPinchCenter: boolean; // 是否显示双指缩放中心点
  };

  // 主题设置
  theme: {
    mode: 'light' | 'dark' | 'auto';
  };

  // 编辑器设置
  editor: {
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    wordWrap: boolean;
  };
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    imageViewing: {
      showPinchCenter: false, // 默认不显示红点
    },
    theme: {
      mode: 'auto',
    },
    editor: {
      fontSize: 14,
      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
      tabSize: 4,
      wordWrap: true,
    },
  }),

  getters: {
    // 图片查看器相关
    shouldShowPinchCenter: (state) => state.imageViewing.showPinchCenter,

    // 主题相关
    isDarkMode: (state) => {
      if (state.theme.mode === 'dark') return true;
      if (state.theme.mode === 'light') return false;
      // auto 模式：检查系统偏好
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    },
  },

  actions: {
    // 更新图片查看器设置
    setImageViewingShowPinchCenter(value: boolean) {
      this.imageViewing.showPinchCenter = value;
      this.saveToStorage();
    },

    // 更新主题设置
    setThemeMode(mode: 'light' | 'dark' | 'auto') {
      this.theme.mode = mode;
      this.saveToStorage();
    },

    // 更新编辑器设置
    setEditorFontSize(size: number) {
      this.editor.fontSize = size;
      this.saveToStorage();
    },

    setEditorFontFamily(family: string) {
      this.editor.fontFamily = family;
      this.saveToStorage();
    },

    setEditorTabSize(size: number) {
      this.editor.tabSize = size;
      this.saveToStorage();
    },

    setEditorWordWrap(wrap: boolean) {
      this.editor.wordWrap = wrap;
      this.saveToStorage();
    },

    // 重置所有设置
    resetSettings() {
      this.$reset();
      this.saveToStorage();
    },

    // 从本地存储加载设置
    loadFromStorage() {
      try {
        const saved = localStorage.getItem('novel-helper-settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          this.$patch(parsed);
        }
      } catch (error) {
        console.warn('加载设置失败，使用默认设置:', error);
      }
    },

    // 保存设置到本地存储
    saveToStorage() {
      try {
        const settings = this.$state;
        localStorage.setItem('novel-helper-settings', JSON.stringify(settings));
      } catch (error) {
        console.error('保存设置失败:', error);
      }
    },
  },
});

// 类型声明
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $settings: ReturnType<typeof useSettingsStore>;
  }
}