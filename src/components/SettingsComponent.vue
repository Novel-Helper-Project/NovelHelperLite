<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1 class="page-title">设置</h1>
      <div class="header-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'settings' }"
          type="button"
          @click="activeTab = 'settings'"
        >
          设置
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'about' }"
          type="button"
          @click="activeTab = 'about'"
        >
          关于
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'settings'" class="settings-content">
      <!-- 图片查看器设置 -->
      <div class="settings-section">
        <h2 class="section-title">
          <span class="material-icons">image</span>
          图片查看器
        </h2>
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              v-model="localSettings.imageViewing.showPinchCenter"
              @change="onShowPinchCenterChange"
            />
            显示双指缩放中心点
          </label>
          <p class="setting-desc">
            在双指缩放时显示一个红点标记缩放中心位置，有助于调试和了解缩放行为。
          </p>
        </div>
      </div>

      <!-- 主题设置 -->
      <div class="settings-section">
        <h2 class="section-title">
          <span class="material-icons">palette</span>
          主题
        </h2>
        <div class="setting-item">
          <label class="setting-label">主题模式</label>
          <div class="theme-options">
            <label class="theme-option">
              <input
                type="radio"
                v-model="localSettings.theme.mode"
                value="light"
                @change="onThemeModeChange"
              />
              <span class="theme-label">浅色</span>
            </label>
            <label class="theme-option">
              <input
                type="radio"
                v-model="localSettings.theme.mode"
                value="dark"
                @change="onThemeModeChange"
              />
              <span class="theme-label">深色</span>
            </label>
            <label class="theme-option">
              <input
                type="radio"
                v-model="localSettings.theme.mode"
                value="auto"
                @change="onThemeModeChange"
              />
              <span class="theme-label">跟随系统</span>
            </label>
          </div>
          <p class="setting-desc">
            选择应用的显示主题。"跟随系统"会根据操作系统的深色/浅色模式自动切换。
          </p>
        </div>
      </div>

      <!-- 编辑器设置 -->
      <div class="settings-section">
        <h2 class="section-title">
          <span class="material-icons">code</span>
          编辑器
        </h2>
        <div class="setting-item">
          <label class="setting-label">字体大小</label>
          <div class="control-group">
            <input
              type="range"
              v-model="localSettings.editor.fontSize"
              :min="12"
              :max="24"
              @input="onEditorFontSizeChange"
            />
            <span class="control-value">{{ localSettings.editor.fontSize }}px</span>
          </div>
          <p class="setting-desc">编辑器文字的显示大小。</p>
        </div>
        <div class="setting-item">
          <label class="setting-label">字体族列</label>
          <div class="control-group">
            <input
              type="text"
              v-model="localSettings.editor.fontFamily"
              @input="onEditorFontFamilyChange"
              placeholder="Monaco, Consolas, monospace"
            />
          </div>
          <p class="setting-desc">编辑器使用的字体家族。</p>
        </div>
        <div class="setting-item">
          <label class="setting-label">制表符大小</label>
          <div class="control-group">
            <input
              type="range"
              v-model="localSettings.editor.tabSize"
              :min="2"
              :max="8"
              @input="onEditorTabSizeChange"
            />
            <span class="control-value">{{ localSettings.editor.tabSize }}</span>
          </div>
          <p class="setting-desc">制表符对应的空格数量。</p>
        </div>
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              v-model="localSettings.editor.wordWrap"
              @change="onEditorWordWrapChange"
            />
            自动换行
          </label>
          <p class="setting-desc">超过编辑器宽度的长行是否自动换行显示。</p>
        </div>
      </div>

      <!-- 标签页设置 -->
      <div class="settings-section">
        <h2 class="section-title">
          <span class="material-icons">tab</span>
          标签页
        </h2>
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              v-model="localSettings.tabs.enableGC"
              @change="onTabsEnableGCChange"
            />
            启用自动卸载
          </label>
          <p class="setting-desc">
            当打开过多标签页时，自动卸载长时间未使用的标签页以节省内存。
            卸载后仅保留状态，重新点击时会从保存的状态恢复。
          </p>
        </div>
        <div class="setting-item" v-if="localSettings.tabs.enableGC">
          <label class="setting-label">最大缓存标签数</label>
          <div class="control-group">
            <input
              type="range"
              v-model="localSettings.tabs.maxCachedTabs"
              :min="3"
              :max="30"
              @input="onTabsMaxCachedChange"
            />
            <span class="control-value">{{ localSettings.tabs.maxCachedTabs }}</span>
          </div>
          <p class="setting-desc">超过此数量的标签页会被自动卸载（从最久未使用的开始）。</p>
        </div>
        <div class="setting-item" v-if="localSettings.tabs.enableGC">
          <label class="setting-label">空闲卸载时间</label>
          <div class="control-group">
            <input
              type="range"
              v-model="localSettings.tabs.gcIdleMinutes"
              :min="5"
              :max="120"
              :step="5"
              @input="onTabsGcIdleMinutesChange"
            />
            <span class="control-value">{{ localSettings.tabs.gcIdleMinutes }} 分钟</span>
          </div>
          <p class="setting-desc">标签页超过此时间未使用将被卸载。</p>
        </div>
      </div>

      <!-- 调试设置 -->
      <div class="settings-section">
        <h2 class="section-title">
          <span class="material-icons">bug_report</span>
          调试
        </h2>
        <div class="setting-item">
          <label class="setting-label">
            <input
              type="checkbox"
              v-model="localSettings.debug.showEditorInfo"
              @change="onDebugShowEditorInfoChange"
            />
            显示编辑器调试信息
          </label>
          <p class="setting-desc">
            在屏幕右下角显示一个悬浮窗，显示当前打开的文件和编辑器信息，用于调试。
          </p>
        </div>
      </div>

      <!-- 重置按钮 -->
      <div class="settings-section">
        <button class="reset-btn" @click="resetAllSettings">
          <span class="material-icons">restore</span>
          重置所有设置
        </button>
        <p class="setting-desc">将所有设置恢复为默认值。此操作不可撤销。</p>
        <div class="about-shortcut">
          <span>想了解更多？</span>
          <button class="link-btn" type="button" @click="activeTab = 'about'">打开关于页</button>
        </div>
      </div>
    </div>

    <AboutCard v-else :version="appVersion" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import AboutCard from './AboutCard.vue';

const settingsStore = useSettingsStore();

// 本地响应式设置
const localSettings = ref({
  imageViewing: {
    showPinchCenter: false,
  },
  theme: {
    mode: 'auto' as 'light' | 'dark' | 'auto',
  },
  editor: {
    fontSize: 14,
    fontFamily: '',
    tabSize: 4,
    wordWrap: true,
  },
  tabs: {
    enableGC: false,
    maxCachedTabs: 10,
    gcIdleMinutes: 30,
  },
  debug: {
    showEditorInfo: false,
  },
});

const activeTab = ref<'settings' | 'about'>('settings');
const appVersion =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ||
  (import.meta.env.PACKAGE_VERSION as string | undefined) ||
  '未设置';

// 初始化设置
onMounted(() => {
  Object.assign(localSettings.value, settingsStore.$state);
});

// 监听设置变化并同步到 store
watch(
  localSettings.value,
  (newSettings) => {
    settingsStore.setImageViewingShowPinchCenter(newSettings.imageViewing.showPinchCenter);
    settingsStore.setThemeMode(newSettings.theme.mode);
    settingsStore.setEditorFontSize(newSettings.editor.fontSize);
    settingsStore.setEditorFontFamily(newSettings.editor.fontFamily);
    settingsStore.setEditorTabSize(newSettings.editor.tabSize);
    settingsStore.setEditorWordWrap(newSettings.editor.wordWrap);
  },
  { deep: true },
);

// 设置变更处理函数
function onShowPinchCenterChange() {
  settingsStore.setImageViewingShowPinchCenter(localSettings.value.imageViewing.showPinchCenter);
}

function onThemeModeChange() {
  settingsStore.setThemeMode(localSettings.value.theme.mode);
}

function onEditorFontSizeChange() {
  settingsStore.setEditorFontSize(localSettings.value.editor.fontSize);
}

function onEditorFontFamilyChange() {
  settingsStore.setEditorFontFamily(localSettings.value.editor.fontFamily);
}

function onEditorTabSizeChange() {
  settingsStore.setEditorTabSize(localSettings.value.editor.tabSize);
}

function onEditorWordWrapChange() {
  settingsStore.setEditorWordWrap(localSettings.value.editor.wordWrap);
}

function onDebugShowEditorInfoChange() {
  settingsStore.setDebugShowEditorInfo(localSettings.value.debug.showEditorInfo);
}

function onTabsEnableGCChange() {
  settingsStore.setTabsEnableGC(localSettings.value.tabs.enableGC);
}

function onTabsMaxCachedChange() {
  settingsStore.setTabsMaxCached(localSettings.value.tabs.maxCachedTabs);
}

function onTabsGcIdleMinutesChange() {
  settingsStore.setTabsGcIdleMinutes(localSettings.value.tabs.gcIdleMinutes);
}

function resetAllSettings() {
  if (confirm('确定要重置所有设置吗？此操作不可撤销。')) {
    settingsStore.resetSettings();
    Object.assign(localSettings.value, settingsStore.$state);
  }
}
</script>

<style scoped>
.settings-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

.settings-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--vscode-border);
  background: var(--vscode-sideBar-background);
  justify-content: space-between;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: var(--vscode-sideBar-foreground);
}

.header-tabs {
  display: flex;
  gap: 8px;
}

.tab-btn {
  padding: 6px 12px;
  border: 1px solid var(--vscode-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-border);
}

.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.settings-section {
  margin-bottom: 24px;
  background: var(--vscode-editor-background);
  /* border-radius: 8px; */
  /* border: 1px solid var(--vscode-border); */
  overflow: hidden;
  /* box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); */
}

/* .theme-light .settings-section {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
} */

.section-title {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  padding: 16px;
  background: var(--vscode-sideBar-background);
  border-bottom: 1px solid var(--vscode-border);
  color: var(--vscode-sideBar-foreground);
}

.section-title .material-icons {
  margin-right: 8px;
  font-size: 20px;
}

.setting-item {
  padding: 16px;
  border-bottom: 1px solid var(--vscode-border);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--vscode-editor-foreground);
}

.setting-label input[type='checkbox'] {
  margin-right: 8px;
}

.setting-desc {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  margin: 8px 0 0 0;
  line-height: 1.4;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-value {
  min-width: 60px;
  text-align: center;
  font-size: 14px;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 4px 8px;
}

input[type='text'] {
  flex: 1;
  font-size: 14px;
  color: var(--vscode-input-foreground);
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 6px 8px;
  outline: none;
}

input[type='text']:focus {
  border-color: var(--vscode-focusBorder);
}

input[type='range'] {
  flex: 1;
  height: 4px;
  background: var(--vscode-slider-background);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--vscode-button-background);
  border: 1px solid var(--vscode-button-border);
  border-radius: 50%;
  cursor: pointer;
}

input[type='range']::-webkit-slider-thumb:hover {
  background: var(--vscode-button-hoverBackground);
}

.theme-options {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.theme-option {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.theme-option input[type='radio'] {
  margin-right: 6px;
}

.theme-label {
  font-size: 14px;
  color: var(--vscode-editor-foreground);
}

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px 16px;
  background: var(--vscode-button-background);
  border: 1px solid var(--vscode-button-border);
  border-radius: 6px;
  color: var(--vscode-button-foreground);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 16px;
}

.about-shortcut {
  padding: 0 16px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vscode-descriptionForeground);
}

.link-btn {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-text);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.link-btn:hover {
  background: var(--vscode-list-hoverBackground);
}
.reset-btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.reset-btn .material-icons {
  margin-right: 8px;
  font-size: 18px;
}
</style>
