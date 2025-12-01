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
import '@milkdown/crepe/theme/common/style.css';
/**
 * Available themes:
 * frame, classic, nord
 * frame-dark, classic-dark, nord-dark
 */
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

  // H1-H6 图标 (简洁的 SVG，使用 CSS 控制颜色)
  const headingIcons = {
    p: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><text x="6" y="17" font-size="12" font-weight="bold" font-family="sans-serif" fill="currentColor">P</text></svg>`,
    h1: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><text x="4" y="17" font-size="12" font-weight="bold" font-family="sans-serif" fill="currentColor">H1</text></svg>`,
    h2: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><text x="4" y="17" font-size="12" font-weight="bold" font-family="sans-serif" fill="currentColor">H2</text></svg>`,
    h3: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><text x="4" y="17" font-size="12" font-weight="bold" font-family="sans-serif" fill="currentColor">H3</text></svg>`,
    h4: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><text x="4" y="17" font-size="11" font-weight="bold" font-family="sans-serif" fill="currentColor">H4</text></svg>`,
    h5: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><text x="4" y="17" font-size="11" font-weight="bold" font-family="sans-serif" fill="currentColor">H5</text></svg>`,
    h6: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><text x="4" y="17" font-size="11" font-weight="bold" font-family="sans-serif" fill="currentColor">H6</text></svg>`,
  };

  // 启用工具栏功能
  const features: Partial<Record<CrepeFeature, boolean>> = {
    [CrepeFeature.Toolbar]: true,
    [CrepeFeature.Placeholder]: true,
    [CrepeFeature.Cursor]: true,
    [CrepeFeature.BlockEdit]: true,
    [CrepeFeature.ImageBlock]: true,
    [CrepeFeature.Table]: true,
    [CrepeFeature.Latex]: true,
  };

  // 带自定义工具栏的编辑器创建
  const instance = new Crepe({
    root: hostRef.value,
    defaultValue: props.modelValue ?? '',
    features,
    featureConfigs: {
      [CrepeFeature.Toolbar]: {
        buildToolbar: (builder) => {
          // 添加标题组
          const headingsGroup = builder.addGroup('headings', 'Headings');

          // 段落按钮
          headingsGroup.addItem('paragraph', {
            icon: headingIcons.p,
            active: () => false,
            onRun: (ctx) => {
              const commands = ctx.get(commandsCtx);
              commands.call(setBlockTypeCommand.key, {
                nodeType: paragraphSchema.type(ctx),
              });
            },
          });

          // H1-H6 按钮
          for (let level = 1; level <= 6; level++) {
            headingsGroup.addItem(`h${level}`, {
              icon: headingIcons[`h${level}` as keyof typeof headingIcons],
              active: () => false,
              onRun: (ctx) => {
                const commands = ctx.get(commandsCtx);
                commands.call(setBlockTypeCommand.key, {
                  nodeType: headingSchema.type(ctx),
                  attrs: { level },
                });
              },
            });
          }
        },
      },
    },
  });

  // 设置只读模式
  if (props.readonly) {
    instance.setReadonly(true);
  }

  // 监听内容变化
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

  console.log('Milkdown Editor created with H1-H6 toolbar');
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

/* Milkdown 内部容器：强制限制在父容器内 */
:deep(.milkdown) {
  position: absolute !important;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  overflow: hidden;
}

:deep(.milkdown .ProseMirror) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 20px 16px;
  overflow: auto;
  font-size: 15px;
  line-height: 1.65;
  font-family: 'Noto Serif', Georgia, 'Times New Roman', serif;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}

/* 自定义滚动条样式 - 自动适应主题 */
:deep(.milkdown .ProseMirror::-webkit-scrollbar) {
  width: 8px;
  height: 8px;
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-track) {
  background: var(--vscode-scrollbar-background);
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-thumb) {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 4px;
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-thumb:hover) {
  background: var(--vscode-scrollbarSlider-hoverBackground);
}

:deep(.milkdown .ProseMirror::-webkit-scrollbar-corner) {
  background: var(--vscode-editor-background);
}

/* 标题样式 - 自动适应主题 */
:deep(.milkdown .ProseMirror h1) {
  font-size: 2em;
  font-weight: 700;
  margin: 0.67em 0;
  line-height: 1.3;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror h2) {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0.75em 0;
  line-height: 1.35;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror h3) {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.8em 0;
  line-height: 1.4;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror h4) {
  font-size: 1.1em;
  font-weight: 600;
  margin: 0.85em 0;
  line-height: 1.45;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror h5) {
  font-size: 1em;
  font-weight: 600;
  margin: 0.9em 0;
  line-height: 1.5;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror h6) {
  font-size: 0.9em;
  font-weight: 600;
  margin: 0.95em 0;
  line-height: 1.55;
  color: var(--vscode-descriptionForeground);
}

/* 其他文本元素样式 - 自动适应主题 */
:deep(.milkdown .ProseMirror p) {
  margin: 1em 0;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror a) {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
}

:deep(.milkdown .ProseMirror a:hover) {
  color: var(--vscode-textLink-activeForeground);
  text-decoration: underline;
}

:deep(.milkdown .ProseMirror code) {
  background: var(--vscode-textCodeBlock-background);
  color: var(--vscode-textLink-foreground);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
}

:deep(.milkdown .ProseMirror pre) {
  background: var(--vscode-textCodeBlock-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  padding: 1em;
  overflow-x: auto;
  margin: 1em 0;
}

:deep(.milkdown .ProseMirror pre code) {
  background: none;
  padding: 0;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror blockquote) {
  border-left: 4px solid var(--vscode-textSeparator-foreground);
  margin: 1em 0;
  padding-left: 1em;
  color: var(--vscode-descriptionForeground);
}

:deep(.milkdown .ProseMirror ul),
:deep(.milkdown .ProseMirror ol) {
  margin: 1em 0;
  padding-left: 2em;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror li) {
  margin: 0.5em 0;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror strong) {
  font-weight: 700;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror em) {
  font-style: italic;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .ProseMirror hr) {
  border: none;
  border-top: 1px solid var(--vscode-textSeparator-foreground);
  margin: 2em 0;
}

:deep(.milkdown .ProseMirror table) {
  border-collapse: collapse;
  margin: 1em 0;
  width: 100%;
}

:deep(.milkdown .ProseMirror th),
:deep(.milkdown .ProseMirror td) {
  border: 1px solid var(--vscode-input-border);
  padding: 0.5em 1em;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editor-background);
}

:deep(.milkdown .ProseMirror th) {
  background: var(--vscode-button-background);
  font-weight: 600;
}

/* 选中文本样式 */
:deep(.milkdown .ProseMirror ::selection) {
  background: var(--vscode-editor-selectionBackground, #264f78);
  color: var(--vscode-editor-selectionForeground, #ffffff);
}

:deep(.milkdown .ProseMirror ::-moz-selection) {
  background: var(--vscode-editor-selectionBackground, #264f78);
  color: var(--vscode-editor-selectionForeground, #ffffff);
}

/* ProseMirror 选区样式 */
:deep(.milkdown .ProseMirror .ProseMirror-selectednode) {
  outline: 2px solid var(--vscode-editor-selectionBackground, #264f78);
  outline-offset: 2px;
}

/* 占位符样式 */
:deep(.milkdown .ProseMirror .placeholder) {
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
  position: absolute;
}

/* 光标样式 */
:deep(.milkdown .ProseMirror .ProseMirror-cursor) {
  border-left: 2px solid var(--vscode-editorCursor-foreground);
  margin-left: -2px;
}

/* 工具条样式 - 自动适应主题 */
:deep(.milkdown .milkdown-toolbar) {
  position: absolute !important;
  top: 6px;
  left: 8px;
  width: auto;
  max-width: calc(100% - 16px);
  transform: none !important;
  padding: 6px 8px;
  display: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  box-shadow: 0 2px 8px var(--vscode-widget-shadow);
  z-index: 20;
}

/* 有选区时显示工具条 */
:deep(.milkdown .milkdown-toolbar[data-show='true']) {
  display: inline-flex;
}

/* 工具条按钮样式 */
:deep(.milkdown .milkdown-toolbar .toolbar-item) {
  background: var(--vscode-button-background);
  border: 1px solid var(--vscode-button-border);
  color: var(--vscode-button-foreground);
  height: 28px;
  min-width: 28px;
  border-radius: 4px;
  padding: 0 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.1s ease;
}

:deep(.milkdown .milkdown-toolbar .toolbar-item:hover) {
  background: var(--vscode-button-hoverBackground);
  border-color: var(--vscode-button-hoverBorder);
  color: var(--vscode-button-hoverForeground);
}

:deep(.milkdown .milkdown-toolbar .toolbar-item.active) {
  background: var(--vscode-button-secondaryBackground);
  border-color: var(--vscode-button-secondaryBorder);
  color: var(--vscode-button-secondaryForeground);
}

/* 工具条分割线 */
:deep(.milkdown .milkdown-toolbar .divider) {
  width: 1px;
  height: 16px;
  background: var(--vscode-input-border);
  margin: 0 4px;
}

/* 工具条图标 - 确保在所有主题下都可见 */
:deep(.milkdown .milkdown-toolbar .toolbar-item svg) {
  width: 16px;
  height: 16px;
  fill: var(--vscode-button-foreground);
  color: var(--vscode-button-foreground);
  display: block;
}

:deep(.milkdown .milkdown-toolbar .toolbar-item:hover svg) {
  fill: var(--vscode-button-hoverForeground);
  color: var(--vscode-button-hoverForeground);
}

/* 确保 SVG text 元素也能正确适应主题 */
:deep(.milkdown .milkdown-toolbar .toolbar-item svg text) {
  fill: var(--vscode-button-foreground);
  color: var(--vscode-button-foreground);
}

:deep(.milkdown .milkdown-toolbar .toolbar-item:hover svg text) {
  fill: var(--vscode-button-hoverForeground);
  color: var(--vscode-button-hoverForeground);
}

/* 斜杠菜单样式 - 自动适应主题 */
:deep(.milkdown .milkdown-slash-menu) {
  position: absolute;
  width: 320px;
  max-height: 360px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  box-shadow: 0 4px 12px var(--vscode-widget-shadow);
  overflow-y: auto;
  z-index: 100;
}

:deep(.milkdown .milkdown-slash-menu .menu-item) {
  padding: 8px 12px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--vscode-editor-foreground);
  text-align: left;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  transition: background-color 0.1s ease;
}

:deep(.milkdown .milkdown-slash-menu .menu-item:hover),
:deep(.milkdown .milkdown-slash-menu .menu-item.selected) {
  background: var(--vscode-list-hoverBackground);
}

:deep(.milkdown .milkdown-slash-menu .menu-item-title) {
  font-weight: 500;
  color: var(--vscode-editor-foreground);
}

:deep(.milkdown .milkdown-slash-menu .menu-item-description) {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 2px;
}

/* 链接预览和编辑样式 */
:deep(.milkdown .milkdown-link-preview),
:deep(.milkdown .milkdown-link-edit) {
  position: absolute;
  border: 1px solid var(--vscode-input-border);
  border-radius: 6px;
  background: var(--vscode-editor-background);
  box-shadow: 0 4px 12px var(--vscode-widget-shadow);
  padding: 8px 12px;
  z-index: 100;
  max-width: 320px;
}

:deep(.milkdown .milkdown-link-preview a) {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
  word-break: break-all;
}

:deep(.milkdown .milkdown-link-preview a:hover) {
  color: var(--vscode-textLink-activeForeground);
  text-decoration: underline;
}

/* 输入框样式 */
:deep(.milkdown input[type='text']),
:deep(.milkdown input[type='url']) {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  color: var(--vscode-input-foreground);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
}

:deep(.milkdown input[type='text']:focus),
:deep(.milkdown input[type='url']:focus) {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

/* 下拉菜单样式 */
:deep(.milkdown select) {
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  color: var(--vscode-dropdown-foreground);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

:deep(.milkdown select:focus) {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}
</style>
