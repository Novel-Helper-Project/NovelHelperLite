declare module '@umoteam/viewer' {
  import type { DefineComponent, Plugin } from 'vue';

  export const UmoViewer: DefineComponent<Record<string, unknown>, object, object, object, object, object, object, object, string, object>;
  export const useUmoViewer: Plugin;
  const _default: typeof UmoViewer;
  export default _default;
}
