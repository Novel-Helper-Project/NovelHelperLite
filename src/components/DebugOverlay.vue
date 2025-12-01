<template>
  <div
    v-if="settingsStore.debug.showEditorInfo"
    class="debug-overlay"
    :style="{ left: position.x + 'px', top: position.y + 'px' }"
    ref="overlayRef"
  >
    <div class="debug-header" @mousedown="startDrag" @touchstart="startDrag">
      <span>🔧 调试信息</span>
      <button class="debug-close" @click.stop="settingsStore.setDebugShowEditorInfo(false)">
        ×
      </button>
    </div>
    <div class="debug-content">
      <div v-if="currentFile" class="debug-item">
        <div class="debug-label">当前文件:</div>
        <div class="debug-value">{{ currentFile.name }}</div>
      </div>
      <div v-if="currentFile" class="debug-item">
        <div class="debug-label">文件路径:</div>
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
        <div class="debug-label">MIME 类型:</div>
        <div class="debug-value">{{ currentFile.mime || '(未知)' }}</div>
      </div>
      <div v-if="currentFile" class="debug-item">
        <div class="debug-label">文件 UID:</div>
        <div class="debug-value">{{ currentFile.uid }}</div>
      </div>
      <div class="debug-item">
        <div class="debug-label">打开文件数:</div>
        <div class="debug-value">{{ openFilesCount }}</div>
      </div>
      <div class="debug-item">
        <div class="debug-label">addEventListener:</div>
        <div class="debug-value" :class="{ polluted: isAddEventListenerPolluted }">
          {{ isAddEventListenerPolluted ? '已污染 ⚠️' : '正常 ✓' }}
        </div>
      </div>
      <div v-if="!currentFile" class="debug-item">
        <div class="debug-value empty">无打开的文件</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { useWorkspaceStore } from 'src/stores/workspace';

const settingsStore = useSettingsStore();
const workspaceStore = useWorkspaceStore();

const currentFile = computed(() => workspaceStore.state.currentFile);
const openFilesCount = computed(() => workspaceStore.state.openFiles.length);

const overlayRef = ref<HTMLDivElement | null>(null);
const isAddEventListenerPolluted = ref(false);

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
  min-width: 280px;
  max-width: 400px;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  user-select: none;
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
}

.debug-close {
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.debug-close:hover {
  color: #fff;
}

.debug-content {
  padding: 8px 12px;
}

.debug-item {
  display: flex;
  margin-bottom: 6px;
  gap: 8px;
}

.debug-item:last-child {
  margin-bottom: 0;
}

.debug-label {
  color: #888;
  white-space: nowrap;
  min-width: 80px;
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

.debug-value.polluted {
  color: #ff9800;
  font-weight: 600;
  animation: pulse-warn 1s ease-in-out infinite;
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
