export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';

  // 更严格的移动端判断：
  // 1. 必须有移动端UserAgent
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // 2. 或者是支持触摸的移动设备（排除Windows touch设备）
  const hasTouch = typeof window !== 'undefined' && (
    'ontouchstart' in window &&
    // 排除Windows设备，即使它们支持触摸
    !/Windows NT/i.test(ua)
  );

  return isMobileUA || hasTouch;
}
