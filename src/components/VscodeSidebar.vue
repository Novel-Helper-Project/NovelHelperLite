<template>
  <div class="vscode-shell" :class="{ 'sidebar-hidden': !sidebarVisible }" :style="shellStyle">
    <nav class="activity-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="activity-btn"
        :class="{ 'is-active': tab.key === activeTab }"
        type="button"
        :title="tab.label"
        @click="handleTabClick(tab.key)"
        @dblclick="toggleSidebar"
      >
        <span class="material-icons">{{ tab.icon }}</span>
      </button>

      <!-- 底部设置按钮 -->
      <div class="activity-bar-footer">
        <button class="activity-btn settings-btn" type="button" title="设置" @click="openSettings">
          <span class="material-icons">settings</span>
        </button>
      </div>
    </nav>

    <section
      class="sidebar-panel"
      :style="sidebarVisible ? panelStyle : undefined"
    >
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
      v-show="sidebarVisible"
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
const sidebarVisible = ref<boolean>(true);
const isResizing = ref(false);

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 520;
const ACTIVITY_BAR_WIDTH = 56;
const SIDEBAR_WIDTH_KEY = 'sidebarWidth';

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
  width: `${ACTIVITY_BAR_WIDTH + (sidebarVisible.value ? sidebarWidth.value : 0)}px`,
}));

const clampWidth = (value: number) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));

async function loadSidebarWidth() {
  try {
    const stored = await storage.get<number>(SIDEBAR_WIDTH_KEY);
    if (typeof stored === 'number' && !Number.isNaN(stored)) {
      sidebarWidth.value = clampWidth(stored);
    }
  } catch (error) {
    console.warn('读取侧栏宽度失败，将使用默认值', error);
  }
}

async function persistSidebarWidth(width: number) {
  try {
    await storage.set(SIDEBAR_WIDTH_KEY, clampWidth(width));
  } catch (error) {
    console.warn('保存侧栏宽度失败', error);
  }
}

// 处理标签点击
function handleTabClick(tabKey: SidebarTab['key']) {
  if (!sidebarVisible.value) {
    // 如果侧边栏隐藏，先显示它
    sidebarVisible.value = true;
  }
  activeTab.value = tabKey;
}

// 切换侧边栏显示/隐藏
function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value;
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
  if (!sidebarVisible.value) return;
  isResizing.value = true;
  dragStartX = event.clientX;
  dragStartWidth = sidebarWidth.value;
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', stopResizing);
}

const { upsertAndFocus } = useWorkspaceStore();
const settingsStore = useSettingsStore();

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
      onSave: createSaveCallback()
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
      onSave: createSaveCallback()
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

onMounted(loadSidebarWidth);
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', stopResizing);
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
.sidebar-hidden .sidebar-panel {
  width: 0;
  min-width: 0;
  border-right: none;
  overflow: hidden;
  flex-shrink: 0;
}

/* 确保隐藏时内容不可见 */
.sidebar-hidden .sidebar-panel * {
  opacity: 0;
  transition: opacity 0.15s ease-in-out;
}

.sidebar-panel * {
  opacity: 1;
  transition: opacity 0.15s ease-in-out;
}

/* 活动栏底部设置按钮 */
.activity-bar-footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--vscode-border);
  width: 100%;
  display: flex;
  justify-content: center;
}

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
