<template>
  <div class="tab-content-wrapper">
    <slot />
  </div>
</template>

<script setup lang="ts">
// 标签页内容包装器
// 提供统一的滚动容器和布局约束
</script>

<style scoped>
.tab-content-wrapper {
  height: 100%;
  width: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 滚动条样式 */
.tab-content-wrapper::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.tab-content-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.tab-content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

.theme-light .tab-content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

.tab-content-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}

.theme-light .tab-content-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.tab-content-wrapper::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
