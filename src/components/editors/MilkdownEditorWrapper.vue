<template>
  <div class="milkdown-editor-container">
    <MilkdownEditor v-model="content" :readonly="file.handle?.kind !== 'file'" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { OpenFile } from 'src/stores/workspace';
import MilkdownEditor from '../MilkdownEditor.vue';

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
</style>
