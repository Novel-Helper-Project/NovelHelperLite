export type ImageViewState = {
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  flipX: boolean;
  flipY: boolean;
};

// Monaco 视图状态（使用宽松结构存储以兼容不同平台）
export type EditorViewState = Record<string, unknown>;
