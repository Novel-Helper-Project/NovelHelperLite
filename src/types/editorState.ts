import type * as monaco from 'monaco-editor';

export type ImageViewState = {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  flipX: boolean;
  flipY: boolean;
};

// Monaco 视图状态或其它序列化数据
export type EditorViewState = monaco.editor.ICodeEditorViewState | Record<string, unknown>;
