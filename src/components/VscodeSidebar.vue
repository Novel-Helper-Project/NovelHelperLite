<template>
  <div class="vscode-shell">
    <nav class="activity-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="activity-btn"
        :class="{ 'is-active': tab.key === activeTab }"
        type="button"
        :title="tab.label"
        @click="activeTab = tab.key"
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

    <section class="sidebar-panel">
      <div class="panel-header">
        <span class="panel-title">{{ activeTabLabel }}</span>
        <span class="panel-subtitle">侧栏</span>
      </div>
      <div class="panel-body">
        <FileExplorer v-show="activeTab === 'explorer'" />
        <PanelPlaceholder v-show="activeTab !== 'explorer'" :label="activeTabLabel" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue';
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

const activeTabLabel = computed(
  () => tabs.find((tab) => tab.key === activeTab.value)?.label ?? '侧栏',
);

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
</script>

<style scoped>
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
</style>
