export type EditorCommand = 'cut' | 'copy' | 'paste';

export interface EditorCommandResult {
  ok: boolean;
  reason?: string;
  log?: unknown;
}

export type EditorCommandHandler = () => void | Promise<void>;

export type EditorCommandSet = Partial<Record<EditorCommand, EditorCommandHandler>>;

const commandRegistry = new Map<string, EditorCommandSet>();

export function registerEditorCommands(path: string, commands: EditorCommandSet) {
  if (!path) return;
  commandRegistry.set(path, commands);
}

export function unregisterEditorCommands(path: string) {
  if (!path) return;
  commandRegistry.delete(path);
}

export async function invokeEditorCommand(path: string, command: EditorCommand): Promise<EditorCommandResult> {
  if (!path) {
    return { ok: false, reason: '文件路径为空,无法定位编辑器实例' };
  }

  const commands = commandRegistry.get(path);
  if (!commands) {
    return {
      ok: false,
      reason: '未找到与此文件路径关联的编辑器命令,可能编辑器尚未初始化或已被关闭',
      log: { path, registeredKeys: Array.from(commandRegistry.keys()) },
    };
  }

  const handler = commands[command];
  if (!handler) {
    return {
      ok: false,
      reason: `当前文件未注册 ${command} 命令,可能此编辑器类型不支持该操作`,
      log: { path, availableCommands: Object.keys(commands) },
    };
  }

  try {
    await handler();
    return { ok: true };
  } catch (err) {
    const baseReason = `执行 ${command} 命令时发生错误,通常是浏览器剪贴板权限限制或 Monaco 内部服务不可用所致。请优先使用键盘快捷键(例如 Ctrl+X / Ctrl+C / Ctrl+V)。`;

    const extra = (() => {
      if (err instanceof Error) return ` 具体信息: ${err.message}`;
      if (err !== null && err !== undefined) {
        try {
          return ` 具体信息: ${JSON.stringify(err)}`;
        } catch {
          return ' 具体信息: [无法序列化的错误对象]';
        }
      }
      return '';
    })();

    return {
      ok: false,
      reason: baseReason + extra,
      log: err,
    };
  }
}
