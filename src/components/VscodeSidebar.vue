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
    </nav>

    <section class="sidebar-panel">
      <div class="panel-header">
        <span class="panel-title">{{ activeTabLabel }}</span>
        <span class="panel-subtitle">侧栏</span>
      </div>
      <div class="panel-body">
        <FileExplorer v-if="activeTab === 'explorer'" />
        <PanelPlaceholder v-else :label="activeTabLabel" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue';
import FileExplorer from './FileExplorer.vue';

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

const activeTabLabel = computed(() => tabs.find((tab) => tab.key === activeTab.value)?.label ?? '侧栏');

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
