<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from 'src/stores/settings';

// 初始化设置 store
const settingsStore = useSettingsStore();

// 应用启动时加载设置
onMounted(() => {
  settingsStore.loadFromStorage();
});
</script>
