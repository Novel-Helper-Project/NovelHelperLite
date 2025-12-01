<template>
  <div class="milkdown-shell">
    <!-- <div class="milkdown-mode-badge">Milkdown 模式</div> -->
    <div ref="hostRef" class="milkdown-container"></div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { commandsCtx } from '@milkdown/kit/core';
import {
  headingSchema,
  setBlockTypeCommand,
  paragraphSchema,
} from '@milkdown/kit/preset/commonmark';
import '@milkdown/crepe/theme/frame-dark.css';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    readonly?: boolean;
  }>(),
  {
    modelValue: '',
    readonly: false,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'change', value: string): void;
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const editorRef = shallowRef<Crepe | null>(null);
let lastValue = props.modelValue;

const destroyEditor = async () => {
  if (editorRef.value) {
    await editorRef.value.destroy();
    editorRef.value = null;
  }
};

const createEditor = async () => {
  if (!hostRef.value) return;
  await destroyEditor();

  // 仅启用基础工具栏等最小特性，避免下方出现大片菜单/块操作
  const features: Partial<Record<CrepeFeature, boolean>> = {
    [CrepeFeature.Toolbar]: true,
    [CrepeFeature.Placeholder]: true,
    [CrepeFeature.Cursor]: true,
    [CrepeFeature.ListItem]: true,
    [CrepeFeature.CodeMirror]: true,
    [CrepeFeature.BlockEdit]: false,
    [CrepeFeature.ImageBlock]: false,
    [CrepeFeature.Table]: false,
    [CrepeFeature.Latex]: false,
  };

  // H1-H6 图标 (简洁的 SVG)
  const headingIcons = {
    h1: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="4" y="17" font-size="14" font-weight="bold" font-family="sans-serif">H1</text></svg>`,
    h2: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="4" y="17" font-size="14" font-weight="bold" font-family="sans-serif">H2</text></svg>`,
    h3: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="4" y="17" font-size="14" font-weight="bold" font-family="sans-serif">H3</text></svg>`,
    h4: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="4" y="17" font-size="13" font-weight="bold" font-family="sans-serif">H4</text></svg>`,
    h5: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="4" y="17" font-size="13" font-weight="bold" font-family="sans-serif">H5</text></svg>`,
    h6: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="4" y="17" font-size="13" font-weight="bold" font-family="sans-serif">H6</text></svg>`,
    p: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="6" y="17" font-size="14" font-weight="bold" font-family="sans-serif">P</text></svg>`,
  };

  const instance = new Crepe({
    root: hostRef.value,
    defaultValue: props.modelValue ?? '',
    features,
    // 自定义工具栏：添加标题按钮
    featureConfigs: {
      [CrepeFeature.Toolbar]: {
        buildToolbar: (builder) => {
          // 添加标题组
          const headingsGroup = builder.addGroup('headings', 'Headings');

          // 普通文本
          headingsGroup.addItem('paragraph', {
            icon: headingIcons.p,
            active: () => false,
            onRun: (ctx) => {
              const commands = ctx.get(commandsCtx);
              const paragraph = paragraphSchema.type(ctx);
              commands.call(setBlockTypeCommand.key, { nodeType: paragraph });
            },
          });

          // H1-H6
          for (let level = 1; level <= 6; level++) {
            headingsGroup.addItem(`h${level}`, {
              icon: headingIcons[`h${level}` as keyof typeof headingIcons],
              active: () => false,
              onRun: (ctx) => {
                const commands = ctx.get(commandsCtx);
                const heading = headingSchema.type(ctx);
                commands.call(setBlockTypeCommand.key, {
                  nodeType: heading,
                  attrs: { level },
                });
              },
            });
          }
        },
      },
    },
  });

  if (props.readonly) {
    instance.setReadonly(true);
  }

  instance.on((listener) => {
    listener.markdownUpdated((_, markdown) => {
      if (markdown === lastValue) return;
      lastValue = markdown;
      emit('update:modelValue', markdown);
      emit('change', markdown);
    });
  });

  editorRef.value = instance;
  await instance.create();
};

onMounted(() => {
  void createEditor();
});

onBeforeUnmount(() => {
  void destroyEditor();
});
</script>

<style scoped>
/* 根元素：和 Monaco wrapper 完全对齐的布局 */
.milkdown-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.milkdown-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  flex: 1 1 auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.milkdown-mode-badge {
  position: absolute;
  top: 6px;
  right: 10px;
  z-index: 30;
  padding: 2px 8px;
  font-size: 11px;
  letter-spacing: 0.2px;
  color: #cde3ff;
  background: rgba(74, 144, 226, 0.12);
  border: 1px solid rgba(74, 144, 226, 0.35);
  border-radius: 999px;
  pointer-events: none;
}

/* Milkdown 内部容器：强制限制在父容器内 */
:deep(.milkdown) {
  position: absolute !important;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0f1216;
  overflow: hidden;
}

:deep(.milkdown .ProseMirror) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 40px 16px 16px;
  overflow: auto;
  font-size: 15px;
  line-height: 1.65;
  font-family: 'Noto Serif', Georgia, 'Times New Roman', serif;
}

/* 自定义滚动条样式 */
:deep(.milkdown .ProseMirror::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.25);
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-corner) {
  background: transparent;
}

:deep(.milkdown .milkdown-toolbar) {
  position: absolute !important;
  top: 6px;
  left: 8px;
  /* 不设置 right，让宽度由内容撑开 */
  width: auto;
  max-width: calc(100% - 16px);
  transform: none !important;
  padding: 6px 8px;
  display: none; /* 默认隐藏 */
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border: 1px solid #3a4556;
  border-radius: 10px;
  background: #131923;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  z-index: 20;
}

/* 只有在有选区时才显示 toolbar */
:deep(.milkdown .milkdown-toolbar[data-show='true']) {
  display: inline-flex;
}

:deep(.milkdown .milkdown-slash-menu),
:deep(.milkdown .milkdown-block-handle),
:deep(.milkdown .milkdown-link-preview),
:deep(.milkdown .milkdown-link-edit) {
  display: none !important;
}

:deep(.milkdown .crepe-drop-cursor),
:deep(.milkdown .milkdown-drop-indicator) {
  position: absolute !important;
  inset: 0;
  pointer-events: none;
}

:deep(.milkdown .milkdown-toolbar .toolbar-item) {
  background: #202938;
  border: 1px solid #3a4556;
  color: #e7f0ff;
  height: 32px;
  min-width: 32px;
  border-radius: 6px;
}

/* 修复默认图标颜色 */
:deep(.milkdown .milkdown-toolbar .toolbar-item svg) {
  fill: #e7f0ff;
  color: #e7f0ff;
}

:deep(.milkdown .milkdown-toolbar .toolbar-item svg path) {
  fill: #e7f0ff;
}

:deep(.milkdown .milkdown-toolbar .toolbar-item:hover) {
  background: #2a3648;
  border-color: #4c5a72;
}

:deep(.milkdown .milkdown-toolbar .divider) {
  width: 1px;
  height: 18px;
  background: #3a4556;
  margin: 0 4px;
}

:deep(.milkdown .milkdown-slash-menu) {
  width: 320px;
  max-height: 360px;
}

/* 隐藏虚拟光标 */
:deep(.prosemirror-virtual-cursor) {
  display: none !important;
}

/* 确保标题选择器下拉菜单正常显示 */
:deep(.milkdown .milkdown-toolbar select),
:deep(.milkdown .milkdown-toolbar .heading-select),
:deep(.milkdown .milkdown-toolbar [data-type='heading']) {
  background: #202938;
  border: 1px solid #3a4556;
  color: #e7f0ff;
  height: 32px;
  min-width: 32px;
  border-radius: 6px;
  padding: 0 8px;
  cursor: pointer;
}

:deep(.milkdown .milkdown-toolbar select:hover),
:deep(.milkdown .milkdown-toolbar .heading-select:hover),
:deep(.milkdown .milkdown-toolbar [data-type='heading']:hover) {
  background: #2a3648;
  border-color: #4c5a72;
}

/* 标题样式 */
:deep(.milkdown .ProseMirror h1) {
  font-size: 2em;
  font-weight: 700;
  margin: 0.67em 0;
  line-height: 1.3;
}

:deep(.milkdown .ProseMirror h2) {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0.75em 0;
  line-height: 1.35;
}

:deep(.milkdown .ProseMirror h3) {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.8em 0;
  line-height: 1.4;
}

:deep(.milkdown .ProseMirror h4) {
  font-size: 1.1em;
  font-weight: 600;
  margin: 0.85em 0;
  line-height: 1.45;
}

:deep(.milkdown .ProseMirror h5) {
  font-size: 1em;
  font-weight: 600;
  margin: 0.9em 0;
  line-height: 1.5;
}

:deep(.milkdown .ProseMirror h6) {
  font-size: 0.9em;
  font-weight: 600;
  margin: 0.95em 0;
  line-height: 1.55;
  color: #9ca3af;
}
</style>
