<template>
  <div
    v-if="settingsStore.debug.showEditorInfo"
    class="debug-overlay"
    :class="{ minimized: isMinimized }"
    :style="overlayStyle"
    ref="overlayRef"
  >
    <div class="debug-header" @mousedown="startDrag" @touchstart="startDrag">
      <span>🔧 调试信息</span>
      <div class="debug-buttons">
        <button
          class="debug-btn"
          @click.stop="toggleMinimize"
          :title="isMinimized ? '展开' : '最小化'"
        >
          {{ isMinimized ? '+' : '−' }}
        </button>
        <button
          class="debug-btn debug-close"
          @click.stop="settingsStore.setDebugShowEditorInfo(false)"
          title="关闭"
        >
          ×
        </button>
      </div>
    </div>
    <div v-show="!isMinimized" class="debug-content">
      <!-- GC 信息区 -->
      <div class="debug-section">
        <div class="debug-section-title">📊 标签页 GC</div>
        <div class="debug-item">
          <div class="debug-label">GC 状态:</div>
          <div class="debug-value" :class="{ enabled: gcEnabled }">
            {{ gcEnabled ? '已启用 ✓' : '未启用' }}
          </div>
        </div>
        <div class="debug-item">
          <div class="debug-label">总打开数:</div>
          <div class="debug-value">{{ openFilesCount }}</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">活跃数:</div>
          <div class="debug-value active-count">{{ activeTabsCount }}</div>
        </div>
        <div class="debug-item">
          <div class="debug-label">休眠数:</div>
          <div class="debug-value unloaded-count">{{ unloadedTabsCount }}</div>
        </div>
        <div v-if="gcEnabled" class="debug-item">
          <div class="debug-label">最大缓存:</div>
          <div class="debug-value">{{ settingsStore.tabs.maxCachedTabs }}</div>
        </div>
        <div v-if="gcEnabled" class="debug-item">
          <div class="debug-label">空闲阈值:</div>
          <div class="debug-value">{{ settingsStore.tabs.gcIdleMinutes }} 分钟</div>
        </div>
      </div>

      <!-- 文件信息区 -->
      <div class="debug-section">
        <div class="debug-section-title">📄 当前文件</div>
        <div v-if="currentFile" class="debug-item">
          <div class="debug-label">文件名:</div>
          <div class="debug-value">{{ currentFile.name }}</div>
        </div>
        <div v-if="currentFile" class="debug-item">
          <div class="debug-label">路径:</div>
          <div class="debug-value path">{{ currentFile.path }}</div>
        </div>
        <div v-if="currentFile" class="debug-item">
          <div class="debug-label">编辑器 ID:</div>
          <div class="debug-value">{{ currentFile.activeEditorId || '(未设置)' }}</div>
        </div>
        <div v-if="currentFile" class="debug-item">
          <div class="debug-label">编辑器模式:</div>
          <div class="debug-value">{{ currentFile.editorMode || '(默认)' }}</div>
        </div>
        <div v-if="currentFile" class="debug-item">
          <div class="debug-label">MIME:</div>
          <div class="debug-value">{{ currentFile.mime || '(未知)' }}</div>
        </div>
        <div v-if="currentFile" class="debug-item">
          <div class="debug-label">UID:</div>
          <div class="debug-value">{{ currentFile.uid }}</div>
        </div>
        <div v-if="currentFile" class="debug-item">
          <div class="debug-label">状态:</div>
          <div class="debug-value" :class="{ 'unloaded-count': currentFile.isUnloaded }">
            {{ currentFile.isUnloaded ? '已休眠 💤' : '活跃' }}
          </div>
        </div>
        <div v-if="!currentFile" class="debug-item">
          <div class="debug-value empty">无打开的文件</div>
        </div>
      </div>

      <!-- 系统信息区 -->
      <div class="debug-section">
        <div class="debug-section-title">⚙️ 系统</div>
        <div class="debug-item">
          <div class="debug-label">addEventListener:</div>
          <div class="debug-value" :class="{ polluted: isAddEventListenerPolluted }">
            {{ isAddEventListenerPolluted ? '已污染 ⚠️' : '正常 ✓' }}
          </div>
        </div>
      </div>

      <!-- 键盘信息区 -->
      <div class="debug-section">
        <div class="debug-section-title">⌨️ 虚拟键盘</div>
        <div class="debug-item">
          <div class="debug-label">移动设备:</div>
          <div class="debug-value" :class="{ enabled: keyboardState.isMobile }">
            {{ keyboardState.isMobile ? '是 ✓' : '否' }}
          </div>
        </div>
        <div v-if="keyboardState.isMobile" class="debug-item">
          <div class="debug-label">检测方式:</div>
          <div class="debug-value">
            <div v-if="keyboardState.detectionMethods.length > 0">
              <div v-for="(method, idx) in keyboardState.detectionMethods" :key="idx">
                • {{ method }}
              </div>
            </div>
            <div v-else class="empty">无</div>
          </div>
        </div>
        <div v-if="keyboardState.isMobile" class="debug-item">
          <div class="debug-label">Virtual KB API:</div>
          <div class="debug-value" :class="{ enabled: keyboardState.supportsVK }">
            {{ keyboardState.supportsVK ? '支持 ✓' : '不支持' }}
          </div>
        </div>
        <div v-if="keyboardState.isMobile" class="debug-item">
          <div class="debug-label">键盘状态:</div>
          <div class="debug-value" :class="{ enabled: keyboardState.isVisible }">
            {{ keyboardState.isVisible ? '已打开' : '关闭' }}
          </div>
        </div>
        <div v-if="keyboardState.isMobile && keyboardState.isVisible" class="debug-item">
          <div class="debug-label">键盘高度:</div>
          <div class="debug-value keyboard-height">{{ keyboardState.height }}px</div>
        </div>
      </div>

      <!-- 快捷操作区 -->
      <div class="debug-section">
        <div class="debug-section-title">🚀 快捷操作</div>
        <div class="debug-actions">
          <button class="debug-action-btn" @click="openSettingsTab" title="打开设置页面">
            ⚙️ 设置
          </button>
          <button class="debug-action-btn" @click="openSettingsJson" title="打开设置 JSON 文件">
            📝 JSON
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { useWorkspaceStore } from 'src/stores/workspace';
import { storage } from 'src/services/storage';
import {
  isMobileDevice,
  supportsVirtualKeyboardAPI,
  getKeyboardHeight,
  onKeyboardStateChange,
} from 'src/utils/inputMethodAdapter';

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();
const { upsertAndFocus } = workspaceStore;

const currentFile = computed(() => workspaceStore.state.currentFile);
const openFilesCount = computed(() => workspaceStore.state.openFiles.length);

// GC 相关计算属性
const gcEnabled = computed(() => settingsStore.tabs.enableGC);
const unloadedTabsCount = computed(
  () => workspaceStore.state.openFiles.filter((f) => f.isUnloaded).length,
);
const activeTabsCount = computed(
  () => workspaceStore.state.openFiles.filter((f) => !f.isUnloaded).length,
);

// 最小化状态
const isMinimized = ref(false);
const savedSize = ref({ width: 0, height: 0 });

// 计算样式
const overlayStyle = computed(() => {
  const base: Record<string, string> = {
    left: position.value.x + 'px',
    top: position.value.y + 'px',
  };
  // 最小化时清除宽高
  if (isMinimized.value) {
    base.width = 'auto';
    base.height = 'auto';
  }
  return base;
});

function toggleMinimize() {
  if (!isMinimized.value && overlayRef.value) {
    // 保存当前尺寸
    savedSize.value = {
      width: overlayRef.value.offsetWidth,
      height: overlayRef.value.offsetHeight,
    };
  }
  isMinimized.value = !isMinimized.value;

  // 恢复尺寸
  if (!isMinimized.value && overlayRef.value && savedSize.value.width > 0) {
    requestAnimationFrame(() => {
      if (overlayRef.value) {
        overlayRef.value.style.width = savedSize.value.width + 'px';
        overlayRef.value.style.height = savedSize.value.height + 'px';
      }
    });
  }
}

const overlayRef = ref<HTMLDivElement | null>(null);
const isAddEventListenerPolluted = ref(false);

// 键盘检测相关
const keyboardState = ref({
  isMobile: false,
  supportsVK: false,
  isVisible: false,
  height: 0,
  detectionMethods: [] as string[],
});

// 打开设置页面
function openSettingsTab() {
  const settingsFile = {
    path: '__settings__',
    name: '⚙️ 设置',
    content: '',
    handle: null,
    mime: 'application/settings',
    isImage: false,
    isSettings: true,
  };
  upsertAndFocus(settingsFile);
}

// 打开设置 JSON 文件
async function openSettingsJson() {
  try {
    let settingsData = await storage.get<Record<string, unknown>>('settings');
    if (!settingsData) {
      settingsData = {
        imageViewing: settingsStore.$state.imageViewing,
        theme: settingsStore.$state.theme,
        editor: settingsStore.$state.editor,
        tabs: settingsStore.$state.tabs,
      };
    }

    const settingsFile = {
      path: 'settings.json',
      name: 'settings.json',
      content: JSON.stringify(settingsData, null, 2),
      handle: null,
      mime: 'application/json',
      isImage: false,
      onSave: async (content: string) => {
        try {
          const parsed = JSON.parse(content);
          await storage.set('settings', parsed);
          // 应用设置
          if (parsed.imageViewing) {
            settingsStore.setImageViewingShowPinchCenter(
              parsed.imageViewing.showPinchCenter ?? false,
            );
          }
          if (parsed.theme) {
            settingsStore.setThemeMode(parsed.theme.mode ?? 'auto');
          }
          if (parsed.editor) {
            settingsStore.setEditorFontSize(parsed.editor.fontSize ?? 14);
            settingsStore.setEditorFontFamily(parsed.editor.fontFamily ?? '');
            settingsStore.setEditorTabSize(parsed.editor.tabSize ?? 4);
            settingsStore.setEditorWordWrap(parsed.editor.wordWrap ?? true);
          }
          if (parsed.tabs) {
            settingsStore.setTabsEnableGC(parsed.tabs.enableGC ?? false);
            settingsStore.setTabsMaxCached(parsed.tabs.maxCachedTabs ?? 10);
            settingsStore.setTabsGcIdleMinutes(parsed.tabs.gcIdleMinutes ?? 30);
          }
          console.log('✅ 设置已保存');
        } catch (e) {
          console.error('❌ 保存设置失败:', e);
        }
      },
    };
    upsertAndFocus(settingsFile);
  } catch (error) {
    console.error('❌ 打开设置文件失败:', error);
  }
}

// 检测 addEventListener 是否被污染
function checkAddEventListenerPolluted() {
  const BACKUP_KEY = '__umoViewerAddEventListenerBackup__';
  const win = window as unknown as Record<
    string,
    { original?: typeof EventTarget.prototype.addEventListener }
  >;
  const backup = win[BACKUP_KEY];

  // 如果备份存在且原始方法与当前方法不同，则说明被污染了
  if (backup && backup.original && backup.original !== EventTarget.prototype.addEventListener) {
    isAddEventListenerPolluted.value = true;
  } else {
    isAddEventListenerPolluted.value = false;
  }
}

// 位置状态 - 默认在右下角
const position = ref({ x: -1, y: -1 });
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });

// 初始化位置
function initPosition() {
  if (position.value.x === -1 && position.value.y === -1) {
    // 默认位置：右下角
    position.value = {
      x: window.innerWidth - 300,
      y: window.innerHeight - 250,
    };
  }
}

// 开始拖动
function startDrag(e: MouseEvent | TouchEvent) {
  isDragging.value = true;

  const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

  dragOffset.value = {
    x: clientX - position.value.x,
    y: clientY - position.value.y,
  };

  e.preventDefault();
}

// 拖动中
function onDrag(e: MouseEvent | TouchEvent) {
  if (!isDragging.value) return;

  const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;

  let newX = clientX - dragOffset.value.x;
  let newY = clientY - dragOffset.value.y;

  // 边界限制
  const overlayWidth = overlayRef.value?.offsetWidth || 280;
  const overlayHeight = overlayRef.value?.offsetHeight || 200;

  newX = Math.max(0, Math.min(newX, window.innerWidth - overlayWidth));
  newY = Math.max(0, Math.min(newY, window.innerHeight - overlayHeight));

  position.value = { x: newX, y: newY };
}

// 结束拖动
function stopDrag() {
  isDragging.value = false;
}

// 定期检查污染状态
let pollutionCheckInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  initPosition();
  checkAddEventListenerPolluted();

  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchmove', onDrag);
  window.addEventListener('touchend', stopDrag);
  window.addEventListener('resize', initPosition);

  // 每 500ms 检查一次污染状态
  pollutionCheckInterval = setInterval(() => {
    checkAddEventListenerPolluted();
  }, 500);

  // 初始化键盘检测信息
  keyboardState.value.isMobile = isMobileDevice();
  keyboardState.value.supportsVK = supportsVirtualKeyboardAPI();

  // 更新检测方法
  const methods: string[] = [];
  if (supportsVirtualKeyboardAPI()) {
    methods.push('Virtual Keyboard API');
  }
  if (window.visualViewport) {
    methods.push('Visual Viewport API');
  }
  keyboardState.value.detectionMethods = methods;

  // 监听键盘状态变化
  if (isMobileDevice()) {
    const cleanupKeyboardListener = onKeyboardStateChange((isVisible, height) => {
      keyboardState.value.isVisible = isVisible;
      keyboardState.value.height = height;
    });

    onUnmounted(() => {
      cleanupKeyboardListener();
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('touchmove', onDrag);
  window.removeEventListener('touchend', stopDrag);
  window.removeEventListener('resize', initPosition);

  if (pollutionCheckInterval) {
    clearInterval(pollutionCheckInterval);
    pollutionCheckInterval = null;
  }
});
</script>

<style scoped>
.debug-overlay {
  position: fixed;
  background: rgba(0, 0, 0, 0.85);
  color: #e0e0e0;
  border-radius: 8px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  min-width: 200px;
  min-height: 100px;
  max-width: 600px;
  max-height: 80vh;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  user-select: none;
  resize: both;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.debug-overlay.minimized {
  min-width: 140px;
  max-width: 200px;
  min-height: auto !important;
  max-height: none !important;
  height: auto !important;
  resize: none;
  width: auto !important;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px 8px 0 0;
  font-weight: 600;
  cursor: move;
  flex-shrink: 0;
}

.debug-overlay.minimized .debug-header {
  border-radius: 8px;
  border-bottom: none;
}

.debug-buttons {
  display: flex;
  gap: 4px;
}

.debug-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  width: 20px;
  text-align: center;
}

.debug-btn:hover {
  color: #fff;
}

.debug-close:hover {
  color: #ff6b6b;
}

.debug-content {
  padding: 8px 12px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 自定义滚动条样式 */
.debug-content::-webkit-scrollbar {
  width: 6px;
}

.debug-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.debug-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.debug-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.debug-section {
  margin-bottom: 12px;
}

.debug-section:last-child {
  margin-bottom: 0;
}

.debug-section-title {
  font-weight: 600;
  color: #aaa;
  margin-bottom: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.debug-item {
  display: flex;
  margin-bottom: 4px;
  gap: 8px;
}

.debug-item:last-child {
  margin-bottom: 0;
}

.debug-label {
  color: #888;
  white-space: nowrap;
  min-width: 70px;
}

.debug-value {
  color: #4fc3f7;
  word-break: break-all;
}

.debug-value.path {
  color: #81c784;
  font-size: 11px;
}

.debug-value.empty {
  color: #666;
  font-style: italic;
}

.debug-value.enabled {
  color: #81c784;
}

.debug-value.active-count {
  color: #81c784;
}

.debug-value.unloaded-count {
  color: #ffb74d;
}

.debug-value.polluted {
  color: #ff9800;
  font-weight: 600;
  animation: pulse-warn 1s ease-in-out infinite;
}

.debug-value.keyboard-height {
  color: #ce93d8;
}

.debug-value.keyboard-visible {
  color: #81c784;
}

.debug-value.keyboard-hidden {
  color: #999;
}

.debug-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.debug-action-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #e0e0e0;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.debug-action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.debug-action-btn:active {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(0.98);
}

@keyframes pulse-warn {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
