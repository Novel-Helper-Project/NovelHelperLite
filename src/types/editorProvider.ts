import type { Component } from 'vue';
import type { OpenFile } from 'src/stores/workspace';

/**
 * 文件类型匹配规则
 */
export interface FileTypeRule {
  /**
   * 文件扩展名(如 '.jpg', '.png', '.md')
   */
  extensions?: string[];

  /**
   * MIME 类型(如 'image/*', 'text/markdown')
   */
  mimeTypes?: string[];

  /**
   * 自定义匹配函数
   */
  matcher?: (file: OpenFile) => boolean;

  /**
   * 是否为二级匹配
   * 二级匹配需要用户确认才能打开文件
   * 优先级低于一级匹配
   */
  secondary?: boolean;

  /**
   * 二级匹配的确认消息(可选)
   * 如果不提供,使用默认消息
   */
  confirmMessage?: string;
}

/**
 * 工具栏按钮定义
 */
export interface ToolbarAction {
  /**
   * 按钮唯一标识
   */
  id: string;

  /**
   * 按钮图标 (Quasar icon name)
   */
  icon: string;

  /**
   * 按钮标签文本(可选)
   */
  label?: string;

  /**
   * 鼠标悬停提示
   */
  title: string;

  /**
   * 是否禁用(可以是函数动态计算)
   */
  disabled?: boolean | ((file: OpenFile) => boolean);

  /**
   * 是否可见(可以是函数动态计算)
   */
  visible?: boolean | ((file: OpenFile) => boolean);

  /**
   * 点击处理函数
   */
  onClick: (file: OpenFile) => void | Promise<void>;

  /**
   * 按钮顺序(数字越小越靠前)
   */
  order?: number;
}

/**
 * 编辑器提供器接口
 * 每个编辑器类型都需要实现这个接口
 */
export interface EditorProvider {
  /**
   * 编辑器唯一标识
   */
  id: string;

  /**
   * 编辑器名称
   */
  name: string;

  /**
   * 编辑器描述
   */
  description?: string;

  /**
   * 编辑器组件
   */
  component: Component;

  /**
   * 支持的文件类型规则
   */
  supportedFileTypes: FileTypeRule[];

  /**
   * 优先级,数字越大优先级越高(当多个编辑器都支持时使用)
   */
  priority: number;

  /**
   * 工具栏按钮(可选)
   */
  toolbarActions?: ToolbarAction[];
}

/**
 * 编辑器注册表
 */
class EditorRegistry {
  private providers: EditorProvider[] = [];

  /**
   * 注册编辑器提供器
   */
  register(provider: EditorProvider) {
    this.providers.push(provider);
    // 按优先级排序
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检查编辑器是否支持该文件
   */
  private canHandle(provider: EditorProvider, file: OpenFile, includeSecondary = false): boolean {
    for (const rule of provider.supportedFileTypes) {
      // 如果不包含二级匹配,且当前规则是二级匹配,则跳过
      if (!includeSecondary && rule.secondary) {
        continue;
      }

      // 检查自定义匹配函数
      if (rule.matcher && rule.matcher(file)) {
        return true;
      }

      // 检查扩展名
      if (rule.extensions && rule.extensions.length > 0) {
        const fileName = file.name.toLowerCase();
        if (rule.extensions.some(ext => fileName.endsWith(ext.toLowerCase()))) {
          return true;
        }
      }

      // 检查 MIME 类型
      if (rule.mimeTypes && rule.mimeTypes.length > 0 && file.mime) {
        const fileMime = file.mime.toLowerCase();
        for (const mimePattern of rule.mimeTypes) {
          // 支持通配符,如 'image/*'
          if (mimePattern.endsWith('/*')) {
            const prefix = mimePattern.slice(0, -2);
            if (fileMime.startsWith(prefix + '/')) {
              return true;
            }
          } else if (fileMime === mimePattern.toLowerCase()) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 检查编辑器的二级匹配规则
   */
  private canHandleSecondary(provider: EditorProvider, file: OpenFile): FileTypeRule | null {
    for (const rule of provider.supportedFileTypes) {
      // 只检查二级匹配规则
      if (!rule.secondary) {
        continue;
      }

      // 检查自定义匹配函数
      if (rule.matcher && rule.matcher(file)) {
        return rule;
      }

      // 检查扩展名
      if (rule.extensions && rule.extensions.length > 0) {
        const fileName = file.name.toLowerCase();
        if (rule.extensions.some(ext => fileName.endsWith(ext.toLowerCase()))) {
          return rule;
        }
      }

      // 检查 MIME 类型
      if (rule.mimeTypes && rule.mimeTypes.length > 0 && file.mime) {
        const fileMime = file.mime.toLowerCase();
        for (const mimePattern of rule.mimeTypes) {
          if (mimePattern.endsWith('/*')) {
            const prefix = mimePattern.slice(0, -2);
            if (fileMime.startsWith(prefix + '/')) {
              return rule;
            }
          } else if (fileMime === mimePattern.toLowerCase()) {
            return rule;
          }
        }
      }
    }
    return null;
  }

  /**
   * 获取所有支持该文件的编辑器(按优先级排序,默认不包含二级匹配)
   */
  getCompatibleEditors(file: OpenFile, includeSecondary = false): EditorProvider[] {
    return this.providers.filter(provider => this.canHandle(provider, file, includeSecondary));
  }

  /**
   * 获取所有二级匹配该文件的编辑器及其匹配规则
   */
  getSecondaryEditors(file: OpenFile): Array<{ provider: EditorProvider; rule: FileTypeRule }> {
    const result: Array<{ provider: EditorProvider; rule: FileTypeRule }> = [];
    for (const provider of this.providers) {
      const rule = this.canHandleSecondary(provider, file);
      if (rule) {
        result.push({ provider, rule });
      }
    }
    return result;
  }

  /**
   * 获取最适合处理该文件的编辑器(优先级最高的)
   * @param includeSecondary 是否包含二级匹配
   */
  getEditor(file: OpenFile, includeSecondary = false): EditorProvider | null {
    if (includeSecondary) {
      const secondary = this.getSecondaryEditors(file);
      if (secondary.length) {
        const first = secondary[0];
        if (first?.provider) return first.provider;
      }
    }
    const primary = this.getCompatibleEditors(file);
    return primary[0] || null;
  }

  /**
   * 获取所有已注册的编辑器
   */
  getAllEditors(): EditorProvider[] {
    return [...this.providers];
  }

  /**
   * 获取当前文件的所有工具栏按钮
   */
  getToolbarActions(file: OpenFile): ToolbarAction[] {
    const editor = this.getEditor(file, true);
    if (!editor || !editor.toolbarActions) {
      return [];
    }

    // 过滤可见的按钮并按 order 排序
    return editor.toolbarActions
      .filter(action => {
        if (typeof action.visible === 'function') {
          return action.visible(file);
        }
        return action.visible !== false;
      })
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }
}

export const editorRegistry = new EditorRegistry();
