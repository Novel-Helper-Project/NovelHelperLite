function isWeb(): boolean {
  return typeof window !== 'undefined';
}

function isNode(): boolean {
  const p = typeof process !== 'undefined' ? (process as unknown as { versions?: { node?: string } }) : undefined;
  return !!p?.versions?.node;
}

function isCapacitorNative(): boolean {
  const g = globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!g.Capacitor?.isNativePlatform?.();
}

export type FsPlatform = 'web' | 'node' | 'capacitor';

export function getPlatform(): FsPlatform {
  if (isCapacitorNative()) return 'capacitor';
  if (isNode() && !isWeb()) return 'node';
  return 'web';
}

