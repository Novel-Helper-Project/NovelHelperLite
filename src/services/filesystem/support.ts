export function checkFileSystemSupport(): {
  supported: boolean;
  browser?: string;
  reason?: string;
  suggestion?: string;
  debug?: { userAgent: string; details: string[] };
} {
  const hasAPI = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const debugInfo: string[] = [];
  debugInfo.push(`User-Agent: ${userAgent}`);
  debugInfo.push(`API 存在: ${hasAPI}`);

  const isEdgeLegacy = /Edge\//.test(userAgent);
  const isEdgeChromium = /Edg\//.test(userAgent);
  const isChrome = /Chrome/.test(userAgent) && !isEdgeLegacy && !isEdgeChromium;
  const isFirefox = /Firefox/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  debugInfo.push(`Edge Legacy: ${isEdgeLegacy}`);
  debugInfo.push(`Edge Chromium: ${isEdgeChromium}`);
  debugInfo.push(`Chrome: ${isChrome}`);
  debugInfo.push(`Firefox: ${isFirefox}`);
  debugInfo.push(`Safari: ${isSafari}`);
  debugInfo.push(`Mobile: ${isMobile}`);

  let chromeVersion = 0;
  let edgeVersion = 0;
  let edgeLegacyVersion = 0;

  if (isChrome) {
    const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
    if (chromeMatch?.[1]) chromeVersion = parseInt(chromeMatch[1], 10);
  }
  if (isEdgeChromium) {
    const edgeMatch = userAgent.match(/Edg\/(\d+)/);
    if (edgeMatch?.[1]) edgeVersion = parseInt(edgeMatch[1], 10);
  }
  if (isEdgeLegacy) {
    const edgeLegacyMatch = userAgent.match(/Edge\/(\d+)/);
    if (edgeLegacyMatch?.[1]) edgeLegacyVersion = parseInt(edgeLegacyMatch[1], 10);
  }

  debugInfo.push(`Chrome Version: ${chromeVersion}`);
  debugInfo.push(`Edge Chromium Version: ${edgeVersion}`);
  debugInfo.push(`Edge Legacy Version: ${edgeLegacyVersion}`);

  if (!hasAPI) {
    if (isMobile) {
      return {
        supported: false,
        browser: 'Mobile Browser',
        reason: '移动端浏览器不支持 File System Access API',
        suggestion: '请使用桌面版 Chrome 或 Edge 浏览器，或者下载我们的移动应用',
        debug: { userAgent, details: debugInfo },
      };
    } else if (isFirefox) {
      return {
        supported: false,
        browser: 'Firefox',
        reason: 'Firefox 浏览器目前不支持 File System Access API',
        suggestion: '请使用 Chrome 86+ 或 Edge 86+ 浏览器来获得完整的文件系统访问功能',
        debug: { userAgent, details: debugInfo },
      };
    } else if (isSafari) {
      return {
        supported: false,
        browser: 'Safari',
        reason: 'Safari 浏览器目前不支持 File System Access API',
        suggestion: '请使用 Chrome 86+ 或 Edge 86+ 浏览器，或者在 Mac 上下载我们的桌面应用',
        debug: { userAgent, details: debugInfo },
      };
    } else if (isEdgeLegacy) {
      return {
        supported: false,
        browser: `Edge (Legacy) ${edgeLegacyVersion}`,
        reason: 'Edge Legacy 浏览器不支持 File System Access API',
        suggestion: '请升级到新版本 Edge 浏览器（基于 Chromium）或使用 Chrome 浏览器',
        debug: { userAgent, details: debugInfo },
      };
    }
    return {
      supported: false,
      browser: 'Unknown',
      reason: '当前浏览器不支持 File System Access API',
      suggestion: '请使用最新版本的 Chrome 或 Edge 浏览器',
      debug: { userAgent, details: debugInfo },
    };
  }

  if (isChrome && chromeVersion < 86) {
    return {
      supported: false,
      browser: `Chrome ${chromeVersion}`,
      reason: 'Chrome 版本过低，File System Access API 需要 Chrome 86+',
      suggestion: '请将 Chrome 浏览器升级到最新版本',
      debug: { userAgent, details: debugInfo },
    };
  }
  if (isEdgeChromium && edgeVersion < 86) {
    return {
      supported: false,
      browser: `Edge ${edgeVersion}`,
      reason: 'Edge 版本过低，File System Access API 需要 Edge 86+',
      suggestion: '请将 Edge 浏览器升级到最新版本',
      debug: { userAgent, details: debugInfo },
    };
  }

  return {
    supported: true,
    debug: { userAgent, details: debugInfo },
  };
}

