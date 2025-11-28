<template>
  <div class="tree-panel" :class="{ 'is-resizable': resizable }" :style="panelStyle">
    <button class="tree-panel__header" type="button" @click="toggle" :disabled="!collapsible">
      <div class="tree-panel__left">
        <span class="material-icons caret">{{ expanded ? 'expand_more' : 'chevron_right' }}</span>
        <span class="tree-panel__title">{{ title }}</span>
      </div>
      <span v-if="count !== undefined" class="tree-panel__badge">{{ count }}</span>
    </button>

    <div v-show="expanded" class="tree-panel__body">
      <slot />
    </div>

    <div
      v-if="resizable"
      class="tree-panel__resizer"
      :class="{ dragging }"
      @mousedown.prevent="startResize"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps<{
  title: string;
  count?: number;
  modelValue?: boolean;
  resizable?: boolean;
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  collapsible?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
  'update:height': [number];
}>();

const expanded = computed({
  get: () => props.modelValue ?? true,
  set: (val: boolean) => emit('update:modelValue', val),
});

const dragging = ref(false);

const panelStyle = computed(() => {
  if (props.resizable && props.height) {
    return { height: `${props.height}px` };
  }
  return {};
});

function clampHeight(next: number): number {
  const min = props.minHeight ?? 80;
  const max = props.maxHeight ?? 400;
  return Math.min(max, Math.max(min, next));
}

function toggle() {
  if (props.collapsible === false) return;
  expanded.value = !expanded.value;
}

function startResize(event: MouseEvent) {
  if (!props.resizable) return;
  dragging.value = true;
  const startY = event.clientY;
  const startHeight = props.height ?? 200;

  const onMove = (e: MouseEvent) => {
    if (!dragging.value) return;
    const delta = e.clientY - startY;
    emit('update:height', clampHeight(startHeight + delta));
  };

  const onUp = () => {
    dragging.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

onBeforeUnmount(() => {
  dragging.value = false;
});
</script>

<style scoped>
.tree-panel {
  display: flex;
  flex-direction: column;
  background: transparent;
  border-bottom: 1px solid var(--vscode-border);
  min-height: 0;
}

.tree-panel__header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.02);
  color: var(--vscode-text);
  border: none;
  padding: 4px 10px;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}

.tree-panel__left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.caret {
  font-size: 16px;
  color: var(--vscode-muted);
}

.tree-panel__title {
  font-weight: 600;
  color: var(--vscode-text);
}

.tree-panel__badge {
  background: rgba(77, 171, 247, 0.16);
  color: #dfe8ff;
  border-radius: 10px;
  padding: 0 6px;
  font-size: 10px;
}

.tree-panel__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tree-panel__resizer {
  height: 6px;
  cursor: row-resize;
  background: transparent;
  transition: background 0.1s ease;
}

.tree-panel__resizer:hover,
.tree-panel__resizer.dragging {
  background: rgba(255, 255, 255, 0.08);
}
</style>
