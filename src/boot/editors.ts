import { boot } from 'quasar/wrappers';
import { editorRegistry } from 'src/types/editorProvider';
import type { EditorProvider } from 'src/types/editorProvider';
import MonacoEditor from 'src/components/editors/MonacoEditor.vue';
import ImageEditor from 'src/components/editors/ImageEditor.vue';
import SettingsEditor from 'src/components/editors/SettingsEditor.vue';
import MilkdownEditorWrapper from 'src/components/editors/MilkdownEditorWrapper.vue';
import { saveFile } from 'src/services/fileSaver';
import { useWorkspaceStore } from 'src/stores/workspace';

/**
 * 设置编辑器提供器
 */
const settingsEditorProvider: EditorProvider = {
  id: 'settings',
  name: '设置',
  description: '应用程序设置界面',
  component: SettingsEditor,
  supportedFileTypes: [
    {
      matcher: (file) => !!file.isSettings,
    },
  ],
  priority: 100, // 最高优先级
};

/**
 * 图片编辑器提供器
 */
const imageEditorProvider: EditorProvider = {
  id: 'image',
  name: '图片查看器',
  description: '查看和预览图片文件',
  component: ImageEditor,
  supportedFileTypes: [
    {
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'],
      mimeTypes: ['image/*'],
    },
  ],
  priority: 90,
};

/**
 * Milkdown 编辑器提供器 (Markdown 文件)
 */
const milkdownEditorProvider: EditorProvider = {
  id: 'milkdown',
  name: 'Milkdown 编辑器',
  description: '所见即所得的 Markdown 编辑器',
  component: MilkdownEditorWrapper,
  supportedFileTypes: [
    {
      // 只通过 matcher 匹配,不使用扩展名自动匹配
      // 这样只有明确设置 editorMode 为 'milkdown' 时才会使用此编辑器
      matcher: (file) => {
        // 必须是 Markdown 文件且明确指定了 milkdown 模式
        const ext = file.name.toLowerCase();
        const isMd = ext.endsWith('.md') || ext.endsWith('.markdown');
        return isMd && file.editorMode === 'milkdown';
      },
    },
  ],
  priority: 50,
  toolbarActions: [
    {
      id: 'save',
      icon: 'save',
      title: '保存文件',
      order: 100,
      disabled: (file) => {
        // 检查是否有可写目标
        if (file.handle && file.handle.kind === 'file') return false;
        if (file.fsEntry && file.fsEntry.kind === 'file') return false;
        return true;
      },
      onClick: async (file) => {
        await saveFile(file);
      },
    },
    {
      id: 'switch-to-monaco',
      icon: 'code',
      title: '切换到 Monaco 编辑器',
      order: 200,
      onClick: (file) => {
        const { setEditorMode } = useWorkspaceStore();
        setEditorMode(file.path, 'monaco');
      },
    },
  ],
};

/**
 * Monaco 编辑器提供器 (默认文本编辑器)
 */
const monacoEditorProvider: EditorProvider = {
  id: 'monaco',
  name: 'Monaco 编辑器',
  description: '强大的代码编辑器,支持语法高亮和智能提示',
  component: MonacoEditor,
  supportedFileTypes: [
    {
      // 一级匹配:明确支持的文本文件扩展名
      extensions: [
        '.txt', '.md', '.markdown',
        '.js', '.jsx', '.ts', '.tsx',
        '.json', '.jsonc',
        '.html', '.htm', '.xml',
        '.css', '.scss', '.less',
        '.vue', '.svelte',
        '.py', '.java', '.c', '.cpp', '.h', '.hpp',
        '.rs', '.go', '.rb', '.php',
        '.sh', '.bash', '.zsh',
        '.yaml', '.yml', '.toml', '.ini', '.conf',
        '.log', '.gitignore', '.env',
      ],
      mimeTypes: ['text/*', 'application/json', 'application/javascript'],
    },
    {
      // 二级匹配:未知文件类型的兜底处理(需要用户确认)
      secondary: true,
      confirmMessage: `<div style="color: var(--vscode-text);">
        <p>此文件的类型未知,可能是二进制文件或不适合文本编辑的文件。</p>
        <p style="margin-top: 8px;"><strong>强制使用文本编辑器打开可能会:</strong></p>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li>显示乱码</li>
          <li>损坏文件内容</li>
          <li>导致文件无法正常使用</li>
        </ul>
        <p style="margin-top: 8px;">是否仍要强制打开?</p>
      </div>`,
      matcher: (file) => {
        // 不处理图片和设置
        if (file.isImage || file.isSettings) return false;
        // 如果明确指定了 milkdown 模式则不处理
        if (file.editorMode === 'milkdown') return false;
        // 其他未知类型的文件,作为二级匹配候选
        return true;
      },
    },
  ],
  priority: 10, // 默认编辑器,最低优先级
  toolbarActions: [
    {
      id: 'save',
      icon: 'save',
      title: '保存文件',
      order: 100,
      disabled: (file) => {
        // 检查是否有可写目标
        if (file.handle && file.handle.kind === 'file') return false;
        if (file.fsEntry && file.fsEntry.kind === 'file') return false;
        return true;
      },
      onClick: async (file) => {
        await saveFile(file);
      },
    },
    {
      id: 'switch-to-milkdown',
      icon: 'wysiwyg',
      title: '切换到 Milkdown 编辑器',
      order: 200,
      visible: (file) => {
        // 仅对 Markdown 文件显示此按钮
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ext === 'md' || ext === 'markdown';
      },
      onClick: (file) => {
        const { setEditorMode } = useWorkspaceStore();
        setEditorMode(file.path, 'milkdown');
      },
    },
  ],
};

/**
 * 注册所有编辑器提供器
 */
export function registerEditors() {
  editorRegistry.register(settingsEditorProvider);
  editorRegistry.register(imageEditorProvider);
  editorRegistry.register(milkdownEditorProvider);
  editorRegistry.register(monacoEditorProvider);
}

// Quasar boot 文件导出
export default boot(() => {
  registerEditors();
});
