<template>
  <div class="milkdown-editor-container">
    <MilkdownEditor v-model="content" :readonly="file.handle?.kind !== 'file'" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import type { OpenFile } from 'src/stores/workspace';
import MilkdownEditor from '../MilkdownEditor.vue';
import { saveFile } from 'src/services/fileSaver';

const props = defineProps<{
  file: OpenFile;
}>();

const emit = defineEmits<{
  'update:content': [content: string];
}>();

const content = ref(props.file.content);

// 监听外部文件内容变化
watch(
  () => props.file.content,
  (newContent) => {
    if (newContent !== content.value) {
      content.value = newContent;
    }
  },
);

// 监听内部内容变化
watch(content, (newContent) => {
  emit('update:content', newContent);
});

// 注册保存快捷键
function handleKeydown(e: KeyboardEvent) {
  const isSave =
    (e.ctrlKey || e.metaKey) &&
    !e.shiftKey &&
    !e.altKey &&
    (e.key === 's' || e.key === 'S');
  if (isSave) {
    e.preventDefault();
    void saveFile(props.file, content.value);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleKeydown);
}

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<style scoped>
.milkdown-editor-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

/* 改进的滚动条样式 */
.milkdown-editor-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.milkdown-editor-container::-webkit-scrollbar-track {
  background: transparent;
}

.milkdown-editor-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.milkdown-editor-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.milkdown-editor-container::-webkit-scrollbar-corner {
  background: transparent;
}

/* 亮色主题适配 */
.theme-light .milkdown-editor-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.theme-light .milkdown-editor-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(0, 0, 0, 0.2);
}
</style>
