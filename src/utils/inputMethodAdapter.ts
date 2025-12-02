/**
 * 移动端输入法适配工具
 * 处理虚拟键盘、IME 候选框、软键盘高度等问题
 */

export interface InputMethodConfig {
  // 虚拟键盘高度（预设值）
  estimatedKeyboardHeight: number;
  // 是否启用自动滚动
  enableAutoScroll: boolean;
  // 滚动时的额外偏移
  scrollPadding: number;
  // 是否启用视口监听
  enableVisualViewportListener: boolean;
}

export const DEFAULT_CONFIG: InputMethodConfig = {
  estimatedKeyboardHeight: 300,
  enableAutoScroll: true,
  scrollPadding: 100,
  enableVisualViewportListener: true,
};

/**
 * 获取当前设备是否为移动设备
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const hasTouch =
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  return hasTouch && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/**
 * 检测是否为 iOS 设备
 */
export function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '');
}

/**
 * 检测是否为 Android 设备
 */
export function isAndroidDevice(): boolean {
  return /Android/.test(navigator.userAgent || '');
}

/**
 * 检测是否支持 Virtual Keyboard API
 */
export function supportsVirtualKeyboardAPI(): boolean {
  return typeof navigator !== 'undefined' && 'virtualKeyboard' in navigator;
}

/**
 * 初始化 Virtual Keyboard API（方案一）
 * 设置为覆盖模式，并返回清理函数
 */
export function setupVirtualKeyboardAPI(
  callback?: (height: number) => void
): (() => void) | undefined {
  if (!supportsVirtualKeyboardAPI()) return undefined;

  const vk = (navigator as unknown as { virtualKeyboard?: { overlaysContent?: boolean; boundingRect?: DOMRect; addEventListener?: (event: string, handler: () => void) => void; removeEventListener?: (event: string, handler: () => void) => void } }).virtualKeyboard;
  if (!vk) return undefined;

  // 设置为覆盖模式，防止页面被挤压
  try {
    vk.overlaysContent = true;
  } catch (e) {
    console.warn('[IME] Failed to set virtualKeyboard.overlaysContent:', e);
  }

  // 监听几何变化
  const handleGeometryChange = () => {
    const height = vk?.boundingRect?.height || 0;
    if (height >= 0) {
      callback?.(height);
    }
  };

  vk.addEventListener?.('geometrychange', handleGeometryChange);

  return () => {
    vk.removeEventListener?.('geometrychange', handleGeometryChange);
  };
}

/**
 * 获取虚拟键盘的实际高度
 * 按优先级依次尝试：Virtual Keyboard API -> Visual Viewport API -> 估计值
 */
export function getKeyboardHeight(): number {
  if (typeof window === 'undefined') return 0;

  // 方案一：Virtual Keyboard API (最精确)
  if (supportsVirtualKeyboardAPI()) {
    const vk = (navigator as unknown as { virtualKeyboard?: { boundingRect?: DOMRect } })
      .virtualKeyboard;
    if (vk?.boundingRect && vk.boundingRect.height > 0) {
      return Math.max(0, vk.boundingRect.height);
    }
  }

  // 方案二：Visual Viewport API (兼容性最好)
  if (window.visualViewport) {
    const visualViewport = window.visualViewport;
    const keyboardHeight = window.innerHeight - visualViewport.height;
    if (keyboardHeight > 0) {
      return Math.max(0, keyboardHeight);
    }
  }

  // 方案三：Window resize 比较（在 onKeyboardStateChange 中处理）
  return 0;
}
/**
 * 监听虚拟键盘的显示/隐藏
 * 支持方案一(Virtual Keyboard API)、方案二(Visual Viewport API)的优先级逻辑
 */
export function onKeyboardStateChange(
  callback: (isVisible: boolean, height: number) => void,
  config: Partial<InputMethodConfig> = {}
): () => void {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const cleanups: (() => void)[] = [];

  let lastKeyboardHeight = 0;

  // 方案一：Virtual Keyboard API
  const vkCleanup = setupVirtualKeyboardAPI((height) => {
    const isNowVisible = height > 0;
    if (height !== lastKeyboardHeight) {
      lastKeyboardHeight = height;
      callback(isNowVisible, height);
    }
  });
  if (vkCleanup) {
    cleanups.push(vkCleanup);
  }

  // 方案二：Visual Viewport API 监听
  if (window.visualViewport && finalConfig.enableVisualViewportListener) {
    const handleVisualViewportResize = () => {
      const height = getKeyboardHeight();
      const isNowVisible = height > 0;

      if (height !== lastKeyboardHeight) {
        lastKeyboardHeight = height;
        callback(isNowVisible, height);
      }
    };

    window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    cleanups.push(() => {
      window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
    });
  }

  // 返回统一的清理函数
  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

/**
 * 自动滚动编辑器到光标位置，避免被虚拟键盘遮挡
 */
export function scrollToCursorPosition(
  element: HTMLElement,
  cursorRect: DOMRect | { top: number; left: number; height: number; width: number } | undefined,
  config: Partial<InputMethodConfig> = {}
) {
  if (!cursorRect) return;

  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enableAutoScroll) return;

  const keyboardHeight = getKeyboardHeight();
  const scrollPadding = finalConfig.scrollPadding;

  // 计算编辑器容器的可见区域
  const containerRect = element.getBoundingClientRect();
  const availableHeight = window.innerHeight - keyboardHeight;

  // 计算光标距离屏幕底部的距离
  const cursorBottomDistance = window.innerHeight - (cursorRect.top + cursorRect.height);

  // 如果光标在键盘上方但距离太近，需要滚动
  if (cursorBottomDistance < keyboardHeight + scrollPadding) {
    const scrollAmount =
      keyboardHeight + scrollPadding - cursorBottomDistance + (containerRect.top || 0);
    element.scrollBy({
      top: scrollAmount,
      behavior: 'smooth',
    });
  }

  // 确保光标在可见区域内
  const relativeTop = cursorRect.top - containerRect.top;
  if (relativeTop < 0) {
    element.scrollBy({
      top: relativeTop - scrollPadding,
      behavior: 'smooth',
    });
  } else if (relativeTop > availableHeight) {
    element.scrollBy({
      top: relativeTop - availableHeight + scrollPadding,
      behavior: 'smooth',
    });
  }
}

/**
 * 防止输入时页面整体滚动或缩放
 * 解决 iOS Safari 的一些键盘问题
 */
export function preventIOSKeyboardBounce(): (() => void) | undefined {
  if (!isIOSDevice()) return undefined;

  const preventBounce = (e: TouchEvent) => {
    // 允许在可编辑元素上操作
    const target = e.target as HTMLElement;
    const isEditableElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    if (!isEditableElement && e.touches.length > 0) {
      // 在非编辑元素上禁用默认行为，防止页面反弹
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      if (scrollTop === 0 && e.touches[0]!.clientY > 20) {
        e.preventDefault();
      }
    }
  };

  document.addEventListener('touchmove', preventBounce, { passive: false });
  return () => {
    document.removeEventListener('touchmove', preventBounce);
  };
}

/**
 * 处理 IME 输入法的组合字符问题
 * 返回是否处于 IME 组合过程中
 */
export function isIMEComposing(event: Event): boolean {
  // 类型断言到带有 isComposing 属性的对象
  return !!(event as unknown as { isComposing?: boolean }).isComposing;
}

/**
 * 获取 IME 状态的细粒度控制
 */
export interface IMEState {
  isComposing: boolean;
  data: string;
  locale: string;
}

export function getIMEState(event: CompositionEvent): IMEState {
  return {
    isComposing: true,
    data: event.data,
    locale:
      (window.navigator as unknown as { language?: string }).language || 'unknown',
  };
}

/**
 * 优化编辑器的 IME 输入处理
 */
export function setupIMEHandling(element: HTMLElement) {
  let composingState: IMEState | null = null;

  const handleCompositionStart = (e: CompositionEvent) => {
    composingState = getIMEState(e);
    // 触发自定义事件，让编辑器知道正在进行 IME 输入
    element.dispatchEvent(
      new CustomEvent('ime-composing-start', {
        detail: composingState,
        bubbles: true,
      })
    );
  };

  const handleCompositionUpdate = (e: CompositionEvent) => {
    if (composingState) {
      composingState.data = e.data;
    }
  };

  const handleCompositionEnd = (e: CompositionEvent) => {
    element.dispatchEvent(
      new CustomEvent('ime-composing-end', {
        detail: { data: e.data },
        bubbles: true,
      })
    );
    composingState = null;
  };

  element.addEventListener('compositionstart', handleCompositionStart);
  element.addEventListener('compositionupdate', handleCompositionUpdate);
  element.addEventListener('compositionend', handleCompositionEnd);

  return () => {
    element.removeEventListener('compositionstart', handleCompositionStart);
    element.removeEventListener('compositionupdate', handleCompositionUpdate);
    element.removeEventListener('compositionend', handleCompositionEnd);
  };
}

/**
 * 设置完整的移动端输入法适配
 */
export function setupMobileInputMethodAdapter(
  editorElement: HTMLElement,
  config: Partial<InputMethodConfig> = {}
) {
  if (!isMobileDevice()) return () => { };

  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const cleanups: (() => void)[] = [];

  // 设置 IME 处理
  cleanups.push(setupIMEHandling(editorElement));

  // 防止 iOS 键盘反弹
  const iosCleanup = preventIOSKeyboardBounce();
  if (iosCleanup) {
    cleanups.push(iosCleanup);
  }

  // 监听键盘状态变化
  cleanups.push(
    onKeyboardStateChange((isVisible, height) => {
      if (isVisible) {
        // 键盘显示时，添加类名用于 CSS 适配
        editorElement.classList.add('ime-keyboard-visible');
        editorElement.setAttribute('data-keyboard-height', String(height));
      } else {
        editorElement.classList.remove('ime-keyboard-visible');
        editorElement.removeAttribute('data-keyboard-height');
      }
    })
  );

  // 监听编辑器的 focus 事件，滚动到输入位置
  const handleFocus = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();
        if (rects.length > 0) {
          scrollToCursorPosition(editorElement, rects[0], finalConfig);
        }
      }
    }, 100);
  };

  editorElement.addEventListener('focus', handleFocus);
  cleanups.push(() => {
    editorElement.removeEventListener('focus', handleFocus);
  });

  // 返回清理函数
  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
