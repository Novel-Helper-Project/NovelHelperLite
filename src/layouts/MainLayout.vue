<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="app-header">
      <q-toolbar>
        <!-- 侧边栏切换按钮 -->
        <q-btn
          flat
          round
          dense
          icon="menu"
          class="sidebar-toggle-btn"
          @click="toggleSidebar"
          :title="sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'"
        />

        <q-toolbar-title>Novel Helper Lite</q-toolbar-title>
        <div class="header-meta">Quasar v{{ $q.version }}</div>
      </q-toolbar>
    </q-header>

    <q-page-container class="workspace-shell">
      <div v-show="sidebarVisible">
        <VscodeSidebar />
      </div>
      <div class="workspace-main">
        <router-view />
      </div>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import VscodeSidebar from 'components/VscodeSidebar.vue';
import { useWorkspaceStore } from 'src/stores/workspace';

const $q = useQuasar();
const workspaceStore = useWorkspaceStore();

const sidebarVisible = computed<boolean>({
  get: () => workspaceStore.state.shellVisible,
  set: (value: boolean) => workspaceStore.setShellVisible(value),
});

function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value;
}
</script>

<style scoped>
.sidebar-toggle-btn {
  margin-right: 8px;
}

.workspace-shell {
  display: flex;
  height: 100%;
}

.workspace-main {
  flex: 1;
  overflow: hidden;
}

/* 响应式设计 - 在小屏幕上更突出 */
@media (max-width: 768px) {
  .sidebar-toggle-btn {
    margin-right: 4px;
  }
}
</style>
