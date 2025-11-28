<template>
  <div class="vscode-shell" :style="shellStyle">
    <nav class="activity-bar">
      <!-- 标签按钮 -->
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="activity-btn"
        :class="{ 'is-active': tab.key === activeTab }"
        type="button"
        :title="tab.label"
        @click="handleTabClick(tab.key)"
      >
        <span class="material-icons">{{ tab.icon }}</span>
      </button>

      <!-- 底部按钮组 -->
      <div class="activity-bar-footer">
        <!-- 侧边栏面板切换按钮 -->
        <button
          class="activity-btn toggle-btn"
          type="button"
          :title="sidebarPanelVisible ? '隐藏侧边栏面板' : '显示侧边栏面板'"
          @click="toggleSidebarPanel"
        >
          <span class="material-icons">{{
            sidebarPanelVisible ? 'chevron_left' : 'chevron_right'
          }}</span>
        </button>

        <!-- 设置按钮 -->
        <button class="activity-btn settings-btn" type="button" title="设置" @click="openSettings">
          <span class="material-icons">settings</span>
        </button>
      </div>
    </nav>

    <section v-show="sidebarPanelVisible" class="sidebar-panel" :style="panelStyle">
      <div class="panel-header">
        <span class="panel-title">{{ activeTabLabel }}</span>
        <span class="panel-subtitle">侧栏</span>
      </div>
      <div class="panel-body">
        <FileExplorer v-show="activeTab === 'explorer'" />
        <PanelPlaceholder v-show="activeTab !== 'explorer'" :label="activeTabLabel" />
      </div>
    </section>

    <div
      v-show="sidebarPanelVisible"
      class="sidebar-resizer"
      :class="{ 'is-dragging': isResizing }"
      @mousedown.prevent="startResizing"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue';
import FileExplorer from './FileExplorer.vue';
import { useWorkspaceStore } from 'src/stores/workspace';
import { useSettingsStore } from 'src/stores/settings';
import { storage } from 'src/services/storage';

type SidebarTab = {
  key: string;
  label: string;
  icon: string;
};

const tabs: SidebarTab[] = [
  { key: 'explorer', label: '资源管理器', icon: 'folder' },
  { key: 'search', label: '搜索', icon: 'search' },
  { key: 'git', label: '源代码管理', icon: 'fork_right' },
  { key: 'debug', label: '运行调试', icon: 'bug_report' },
];

const activeTab = ref<SidebarTab['key']>('explorer');
const isResizing = ref(false);
const sidebarPanelVisible = ref<boolean>(true);

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 520;
const ACTIVITY_BAR_WIDTH = 56;
const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
const SIDEBAR_PANEL_VISIBLE_KEY = 'sidebarPanelVisible';

const sidebarWidth = ref<number>(DEFAULT_SIDEBAR_WIDTH);
let dragStartX = 0;
let dragStartWidth = DEFAULT_SIDEBAR_WIDTH;

const activeTabLabel = computed(
  () => tabs.find((tab) => tab.key === activeTab.value)?.label ?? '侧栏',
);

const panelStyle = computed(() => ({
  width: `${sidebarWidth.value}px`,
  minWidth: `${sidebarWidth.value}px`,
}));

const shellStyle = computed(() => ({
  width: `${ACTIVITY_BAR_WIDTH + (sidebarPanelVisible.value ? sidebarWidth.value : 0)}px`,
}));

const clampWidth = (value: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));

async function loadSidebarWidth() {
  try {
    const [width, panelVisible] = await Promise.all([
      storage.get<number>(SIDEBAR_WIDTH_KEY),
      storage.get<boolean>(SIDEBAR_PANEL_VISIBLE_KEY),
    ]);

    if (typeof width === 'number' && !Number.isNaN(width)) {
      sidebarWidth.value = clampWidth(width);
    }

    if (typeof panelVisible === 'boolean') {
      sidebarPanelVisible.value = panelVisible;
    }
  } catch (error) {
    console.warn('读取侧栏设置失败，将使用默认值', error);
  }
}

async function persistSidebarWidth(width: number) {
  try {
    await Promise.all([
      storage.set(SIDEBAR_WIDTH_KEY, clampWidth(width)),
      storage.set(SIDEBAR_PANEL_VISIBLE_KEY, sidebarPanelVisible.value),
    ]);
  } catch (error) {
    console.warn('保存侧栏设置失败', error);
  }
}

// 处理标签点击
function handleTabClick(tabKey: SidebarTab['key']) {
  if (!sidebarPanelVisible.value) {
    // 如果面板隐藏，先显示它并切换到对应标签
    sidebarPanelVisible.value = true;
    // 短暂延迟确保面板先显示再切换标签
    setTimeout(() => {
      activeTab.value = tabKey;
    }, 50);
  } else {
    // 如果面板已显示且点击的是当前活动标签，则隐藏面板
    if (activeTab.value === tabKey) {
      sidebarPanelVisible.value = false;
    } else {
      // 否则切换到对应标签
      activeTab.value = tabKey;
    }
  }
}

// 切换侧边栏面板显示/隐藏
function toggleSidebarPanel() {
  sidebarPanelVisible.value = !sidebarPanelVisible.value;
  void persistSidebarPanelVisibility();
}

function handleMouseMove(event: MouseEvent) {
  if (!isResizing.value) return;
  const delta = event.clientX - dragStartX;
  const nextWidth = clampWidth(dragStartWidth + delta);
  sidebarWidth.value = nextWidth;
}

function stopResizing() {
  if (!isResizing.value) return;
  isResizing.value = false;
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', stopResizing);
  document.body.style.userSelect = '';
  void persistSidebarWidth(sidebarWidth.value);
}

function startResizing(event: MouseEvent) {
  if (!sidebarPanelVisible.value) return;
  isResizing.value = true;
  dragStartX = event.clientX;
  dragStartWidth = sidebarWidth.value;
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', stopResizing);
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent) {
  // 快捷键支持 (Escape 键隐藏面板)
  if (event.key === 'Escape' && sidebarPanelVisible.value) {
    sidebarPanelVisible.value = false;
    return;
  }
}

const { upsertAndFocus } = useWorkspaceStore();
const settingsStore = useSettingsStore();

// 持久化面板可见性状态
async function persistSidebarPanelVisibility() {
  try {
    await storage.set(SIDEBAR_PANEL_VISIBLE_KEY, sidebarPanelVisible.value);
  } catch (error) {
    console.warn('保存面板可见性设置失败', error);
  }
}

// 定义设置数据类型
interface SettingsData {
  imageViewing: {
    showPinchCenter: boolean;
  };
  theme: {
    mode: 'light' | 'dark' | 'auto';
  };
  editor: {
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    wordWrap: boolean;
  };
}

// 创建保存回调函数，避免重复代码
function createSaveCallback() {
  return async (content: string) => {
    try {
      const parsedSettings = JSON.parse(content) as SettingsData;

      // 保存到存储层
      await storage.set('settings', parsedSettings);

      // 同步到settings store
      if (parsedSettings.imageViewing) {
        settingsStore.setImageViewingShowPinchCenter(parsedSettings.imageViewing.showPinchCenter);
      }
      if (parsedSettings.theme) {
        settingsStore.setThemeMode(parsedSettings.theme.mode);
      }
      if (parsedSettings.editor) {
        settingsStore.setEditorFontSize(parsedSettings.editor.fontSize);
        settingsStore.setEditorFontFamily(parsedSettings.editor.fontFamily);
        settingsStore.setEditorTabSize(parsedSettings.editor.tabSize);
        settingsStore.setEditorWordWrap(parsedSettings.editor.wordWrap);
      }

      console.log('✅ 设置已保存并同步到应用');
    } catch (error) {
      console.error('❌ 保存设置失败:', error);
      throw error;
    }
  };
}

// 打开设置文件标签页
async function openSettings() {
  try {
    // 从存储层读取设置，如果没有则使用默认设置
    let settingsData = await storage.get<SettingsData>('settings');

    // 如果没有存储的设置，使用当前settings store的设置
    if (!settingsData) {
      settingsData = {
        imageViewing: settingsStore.$state.imageViewing,
        theme: settingsStore.$state.theme,
        editor: settingsStore.$state.editor,
      };
    }

    // 创建设置文件对象
    const settingsFile = {
      path: 'settings.json',
      name: 'settings.json',
      content: JSON.stringify(settingsData, null, 2),
      handle: null,
      mime: 'application/json',
      isImage: false,
      onSave: createSaveCallback(),
    };

    // 通过workspace store打开设置文件
    upsertAndFocus(settingsFile);
  } catch (error) {
    console.error('❌ 打开设置文件失败:', error);
    // 回退到当前settings store的设置
    const currentSettings = {
      imageViewing: settingsStore.$state.imageViewing,
      theme: settingsStore.$state.theme,
      editor: settingsStore.$state.editor,
    };

    const settingsFile = {
      path: 'settings.json',
      name: 'settings.json',
      content: JSON.stringify(currentSettings, null, 2),
      handle: null,
      mime: 'application/json',
      isImage: false,
      onSave: createSaveCallback(),
    };

    upsertAndFocus(settingsFile);
  }
}

const PanelPlaceholder = defineComponent({
  name: 'PanelPlaceholder',
  props: {
    label: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h('div', { class: 'panel-placeholder' }, [
        h('p', { class: 'placeholder-title' }, props.label),
        h('p', { class: 'placeholder-desc' }, '这里可以挂载其他侧栏页，比如搜索、Git 或调试。'),
      ]);
  },
});

onMounted(async () => {
  try {
    await loadSidebarWidth();
  } catch (error) {
    console.warn('初始化侧边栏失败，将使用默认值', error);
  }
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown);
});
onBeforeUnmount(() => {
  if (isResizing.value) {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResizing);
  }
  window.removeEventListener('keydown', handleKeyDown);
  document.body.style.userSelect = '';
});
</script>

<style scoped>
/* 侧边栏容器 */
.vscode-shell {
  display: flex;
  height: 100%;
  position: relative;
}

/* 侧边栏面板显示/隐藏动画 */
.sidebar-panel {
  width: 240px;
  min-width: 240px;
  background-color: var(--vscode-sideBar-background);
  border-right: 1px solid var(--vscode-sideBar-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.2s ease-in-out;
  flex-shrink: 0;
  position: relative;
}

/* 隐藏状态下的侧边栏面板 */
.sidebar-panel[style*='width: 0px'],
.sidebar-panel[style*='width: 0'] {
  min-width: 0;
  border-right: none;
  overflow: hidden;
}

.sidebar-panel * {
  opacity: 1;
  transition: opacity 0.15s ease-in-out;
}

/* 活动栏底部按钮组 */
.activity-bar-footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--vscode-border);
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* 侧边栏切换按钮 */
.toggle-btn {
  background-color: var(--vscode-button-secondaryBackground);
  border: 1px solid var(--vscode-button-secondaryBorder);
  margin-bottom: 4px;
}

.toggle-btn:hover {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

.toggle-btn .material-icons {
  font-size: 16px;
}

/* 设置按钮 */
.activity-bar-footer .settings-btn .material-icons {
  font-size: 18px;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: -2px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  transition: background-color 0.15s ease;
}

.sidebar-resizer:hover,
.sidebar-resizer.is-dragging {
  background: rgba(255, 255, 255, 0.08);
}
</style>
