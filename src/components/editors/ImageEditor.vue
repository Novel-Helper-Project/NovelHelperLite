<template>
  <TabContentWrapper>
    <InlineImageViewer
      :src="file.mediaUrl || ''"
      :name="file.name"
      :state="file.imageState"
      @update:state="(state) => emit('update:imageState', state)"
    />
  </TabContentWrapper>
</template>

<script setup lang="ts">
import type { OpenFile } from 'src/stores/workspace';
import type { ImageViewState } from 'src/types/editorState';
import InlineImageViewer from '../InlineImageViewer.vue';
import TabContentWrapper from '../TabContentWrapper.vue';

defineProps<{
  file: OpenFile;
}>();

const emit = defineEmits<{
  'update:imageState': [state: ImageViewState];
}>();
</script>
