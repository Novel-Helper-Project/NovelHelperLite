<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { setupVirtualKeyboardAPI, isMobileDevice } from 'src/utils/inputMethodAdapter';

// 初始化设置 store
const settingsStore = useSettingsStore();

// 应用启动时加载设置
onMounted(() => {
  settingsStore.loadFromStorage();

  // 移动端：初始化虚拟键盘监听
  if (isMobileDevice()) {
    setupVirtualKeyboardAPI();
  }
});
</script>
