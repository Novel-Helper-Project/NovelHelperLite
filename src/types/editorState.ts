export type ImageViewState = {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  flipX: boolean;
  flipY: boolean;
};

// 允许存储任意编辑器视图状态（Monaco 等）
export type EditorViewState = unknown;
