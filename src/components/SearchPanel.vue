<template>
  <div class="search-panel">
    <div class="search-controls">
      <div class="search-row">
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          placeholder="在工作区中查找..."
          @keydown.enter="startSearch"
        />
        <div class="search-actions">
          <button class="btn primary" type="button" :disabled="!canSearch" @click="startSearch">
            <span class="material-icons">play_arrow</span>
            搜索
          </button>
          <button
            v-if="isSearching"
            class="btn ghost"
            type="button"
            title="停止搜索"
            @click="cancelSearch"
          >
            <span class="material-icons">stop</span>
          </button>
        </div>
      </div>

      <div class="options-row">
        <button
          class="toggle"
          :class="{ active: opts.matchCase }"
          type="button"
          title="区分大小写"
          @click="opts.matchCase = !opts.matchCase"
        >
          Aa
        </button>
        <button
          class="toggle"
          :class="{ active: opts.wholeWord }"
          type="button"
          title="全字匹配"
          @click="opts.wholeWord = !opts.wholeWord"
        >
          Ab|
        </button>
        <button
          class="toggle"
          :class="{ active: opts.useRegex }"
          type="button"
          title="使用正则"
          @click="opts.useRegex = !opts.useRegex"
        >
          .*
        </button>
        <div class="filters">
          <input
            v-model="includeGlob"
            class="filter-input"
            type="text"
            placeholder="包含文件 (如 src/**/*.ts)"
            @keydown.enter="startSearch"
          />
          <input
            v-model="excludeGlob"
            class="filter-input"
            type="text"
            placeholder="排除文件 (如 node_modules,dist)"
            @keydown.enter="startSearch"
          />
        </div>
      </div>

      <div class="status-row">
        <div class="status-left">
          <span class="status-dot" :class="{ active: isSearching }" />
          <span class="status-text">{{ statusMessage }}</span>
        </div>
        <div class="status-meta">
          <template v-if="isSearching">
            <span>已扫描 {{ stats.scanned }} 个文件</span>
          </template>
          <template v-else>
            <span v-if="totalMatches"> {{ totalMatches }} 个结果 · </span>
            <span>{{ results.length }} 个文件</span>
            <span v-if="stats.matched"> · {{ stats.matched }} 个文件匹配</span>
            <span v-if="stats.duration"> · {{ Math.round(stats.duration) }} ms</span>
          </template>
        </div>
      </div>
    </div>

    <div class="results">
      <div v-if="!virtualItems.length && !isSearching" class="empty">
        <div class="empty-title">搜索工作区</div>
        <div class="empty-subtitle">输入关键词并按回车，使用过滤器缩小范围</div>
      </div>

      <n-virtual-list
        v-else
        class="virtual-results"
        :items="virtualItems"
        :item-size="86"
        :style="virtualListStyle"
        key-field="key"
      >
        <template #default="{ item }">
          <div class="match-row" @click="openMatch(item.file, item.match)">
            <div class="row-top">
              <span class="file-path" :title="item.file.relativePath">{{ item.file.relativePath }}</span>
              <span class="badge">{{ item.file.matches.length }}</span>
            </div>
            <div class="row-bottom">
              <span class="line">:{{ item.match.line }}</span>
              <div class="snippet" v-html="renderSnippet(item.match)" />
            </div>
          </div>
        </template>
      </n-virtual-list>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { NVirtualList } from 'naive-ui';
import SearchWorker from 'src/workers/searchWorker?worker';
import Fs, { type FsEntry } from 'src/services/fs';
import { getPersistedDirectoryHandle, loadLastWorkspace } from 'src/services/workspacePersistence';
import { useWorkspaceStore } from 'src/stores/workspace';

type WorkerMatch = {
  line: number;
  start: number;
  length: number;
  preview: string;
};

type WorkerMessage =
  | {
      type: 'file-result';
      id: string;
      entry: FsEntry;
      relativePath: string;
      matches: WorkerMatch[];
    }
  | { type: 'progress'; id: string; scanned: number; elapsed: number }
  | {
      type: 'done';
      id: string;
      scanned: number;
      matched: number;
      duration: number;
      cancelled: boolean;
      limited: boolean;
    }
  | { type: 'error'; id: string; message: string };

type FileResult = {
  relativePath: string;
  entry: FsEntry;
  matches: WorkerMatch[];
};

type VirtualRow = {
  key: string;
  file: FileResult;
  match: WorkerMatch;
};

const { state: workspace, upsertAndFocus } = useWorkspaceStore();

const keyword = ref('');
const includeGlob = ref('');
const excludeGlob = ref('node_modules,.git,.quasar,dist,build');
const opts = reactive({
  matchCase: false,
  wholeWord: false,
  useRegex: false,
});

const results = ref<FileResult[]>([]);
const isSearching = ref(false);
const statusMessage = ref('在当前工作区内搜索文本');
const stats = reactive({ scanned: 0, matched: 0, duration: 0 });

const totalMatches = computed(() =>
  results.value.reduce((sum, file) => sum + file.matches.length, 0),
);
const canSearch = computed(() => !!keyword.value.trim());
const virtualItems = computed<VirtualRow[]>(() =>
  results.value.flatMap((file) =>
    file.matches.map((match, idx) => ({
      key: `${file.relativePath}-${idx}`,
      file,
      match,
    })),
  ),
);
const virtualListStyle = computed(() => ({
  height: '100%',
  maxHeight: '100%',
}));

let worker: Worker | null = null;
let activeSearchId: string | null = null;
let lastRootLabel = '';

onMounted(() => {
  worker = new SearchWorker();
  worker.onmessage = handleWorkerMessage;
});

onBeforeUnmount(() => {
  worker?.terminate();
  worker = null;
});

function handleWorkerMessage(event: MessageEvent<WorkerMessage>) {
  const message = event.data;
  if (!message || message.id !== activeSearchId) return;

  if (message.type === 'file-result') {
    upsertResult(message);
    stats.matched = results.value.length;
    return;
  }

  if (message.type === 'progress') {
    stats.scanned = message.scanned;
    statusMessage.value = `搜索中... 已扫描 ${message.scanned} 个文件`;
    return;
  }

  if (message.type === 'done') {
    isSearching.value = false;
    stats.scanned = message.scanned;
    stats.matched = message.matched;
    stats.duration = message.duration;
    statusMessage.value = message.cancelled
      ? '搜索已取消'
      : message.limited
        ? '达到结果上限，部分结果被截断'
        : `完成，${message.matched} 个文件包含匹配项`;
    return;
  }

  if (message.type === 'error') {
    isSearching.value = false;
    statusMessage.value = `搜索失败：${message.message}`;
  }
}

function upsertResult(payload: Extract<WorkerMessage, { type: 'file-result' }>) {
  const existing = results.value.find((item) => item.relativePath === payload.relativePath);
  const merged: FileResult = {
    relativePath: payload.relativePath || payload.entry.path || payload.entry.name || '',
    entry: payload.entry,
    matches: payload.matches,
  };

  if (existing) {
    existing.entry = merged.entry;
    existing.matches = merged.matches;
  } else {
    results.value.push(merged);
    results.value.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }
}

async function startSearch() {
  const text = keyword.value.trim();
  if (!text) {
    statusMessage.value = '请输入搜索关键词';
    return;
  }

  const root = await resolveWorkspaceRoot();
  if (!root) {
    statusMessage.value = '请先在左侧资源管理器中打开文件夹';
    return;
  }

  if (!worker) {
    worker = new SearchWorker();
    worker.onmessage = handleWorkerMessage;
  }

  const searchId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;

  activeSearchId = searchId;
  lastRootLabel = root.name ?? root.path ?? 'workspace';
  stats.scanned = 0;
  stats.matched = 0;
  stats.duration = 0;
  results.value = [];
  isSearching.value = true;
  statusMessage.value = '正在搜索...';

  worker.postMessage({
    type: 'search',
    id: searchId,
    root,
    query: text,
    options: {
      matchCase: opts.matchCase,
      wholeWord: opts.wholeWord,
      useRegex: opts.useRegex,
      include: parsePatternList(includeGlob.value),
      exclude: parsePatternList(excludeGlob.value),
      maxResults: 1200,
      maxPerFile: 120,
    },
  });
}

function cancelSearch() {
  if (!worker || !activeSearchId) return;
  worker.postMessage({ type: 'cancel', id: activeSearchId });
  statusMessage.value = '正在停止搜索...';
}

function parsePatternList(patterns: string): string[] {
  if (!patterns.trim()) return [];
  return patterns
    .split(/[,;\n]/u)
    .flatMap((chunk) => chunk.split(/\s+/u))
    .map((p) => p.trim())
    .filter(Boolean);
}

function renderSnippet(match: WorkerMatch): string {
  const safe = escapeHtml(match.preview);
  const start = Math.max(0, Math.min(match.start, safe.length));
  const end = Math.max(start, Math.min(start + match.length, safe.length));
  return `${safe.slice(0, start)}<mark>${safe.slice(start, end)}</mark>${safe.slice(end)}`;
}

async function openMatch(file: FileResult, match: WorkerMatch) {
  const path = file.entry.path || `${lastRootLabel}/${file.relativePath}`;
  const name = file.entry.name || file.relativePath.split('/').pop() || 'unknown';

  try {
    const content = await Fs.readText(file.entry);
    upsertAndFocus({
      path,
      name,
      content,
      handle: (file.entry as { webHandle?: FileSystemFileHandle }).webHandle ?? null,
      mime: 'text/plain',
      isImage: false,
    });
    await nextTick();
    const activePath = workspace.currentFile?.path ?? path;
    revealInEditor(activePath, match);
  } catch (error) {
    statusMessage.value = `打开文件失败：${error instanceof Error ? error.message : String(error)}`;
  }
}

function revealInEditor(path: string, match: WorkerMatch) {
  const detail = { path, line: match.line, column: match.start + 1 };
  window.dispatchEvent(new CustomEvent('workspace-reveal', { detail }));
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('workspace-reveal', { detail }));
  }, 60);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolveWorkspaceRoot(): Promise<FsEntry | null> {
  const platform = Fs.getPlatform();

  if (platform === 'web') {
    const handle =
      workspace.rootHandle ??
      (await getPersistedDirectoryHandle().catch(() => null));
    if (!handle) return null;
    return {
      kind: 'directory',
      name: workspace.workspacePath ?? handle.name,
      path: workspace.workspacePath ?? handle.name,
      webHandle: handle,
    };
  }

  const persisted = await loadLastWorkspace().catch(() => null);
  const path = workspace.workspacePath ?? persisted?.path;
  if (!path) return null;

  const entry: FsEntry = {
    kind: 'directory',
    name: persisted?.name ?? path,
    path,
  };

  if (platform === 'capacitor' && persisted?.capDirectory) {
    entry.capDirectory = persisted.capDirectory;
  }

  return entry;
}
</script>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--vscode-sideBar-background);
  color: var(--vscode-text, #dfe3ea);
}

.search-controls {
  padding: 12px;
  border-bottom: 1px solid var(--vscode-border);
  background: rgba(255, 255, 255, 0.02);
  gap: 8px;
  display: flex;
  flex-direction: column;
}

.search-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--vscode-border);
  border-radius: 6px;
  background: var(--vscode-input-background, #11141a);
  color: var(--vscode-text, #dfe3ea);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-input:focus {
  border-color: var(--vscode-accent, #4dabf7);
  box-shadow: 0 0 0 1px rgba(77, 171, 247, 0.25);
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn {
  border: 1px solid var(--vscode-border);
  background: transparent;
  color: var(--vscode-text);
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn.primary {
  background: var(--vscode-button-background, #2d3440);
  border-color: var(--vscode-button-border, #2d3440);
}

.btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.btn.primary:hover {
  background: var(--vscode-button-hoverBackground, #3a4251);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.options-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.toggle {
  width: 36px;
  height: 32px;
  border: 1px solid var(--vscode-border);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  color: var(--vscode-text);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.toggle.active {
  background: rgba(77, 171, 247, 0.15);
  border-color: var(--vscode-accent, #4dabf7);
  color: #fff;
}

.filters {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  min-width: 0;
}

.filter-input {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--vscode-border);
  background: var(--vscode-input-background, #11141a);
  color: var(--vscode-text, #dfe3ea);
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--vscode-muted);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vscode-muted);
  opacity: 0.7;
}

.status-dot.active {
  background: var(--vscode-accent, #4dabf7);
  box-shadow: 0 0 0 4px rgba(77, 171, 247, 0.15);
  opacity: 1;
}

.status-text {
  color: var(--vscode-text, #dfe3ea);
}

.status-meta {
  color: var(--vscode-muted);
}

.results {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--vscode-sideBar-background);
}

.empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--vscode-muted);
  text-align: center;
}

.empty-title {
  font-size: 15px;
  color: var(--vscode-text);
}

.empty-subtitle {
  font-size: 12px;
}

.virtual-results {
  padding: 0;
  height: 100%;
  max-height: 100%;
}

.match-row {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.match-row:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(77, 171, 247, 0.3);
}

.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: var(--vscode-muted);
  font-size: 12px;
}

.file-path {
  word-break: break-all;
  padding-right: 8px;
}

.badge {
  background: rgba(77, 171, 247, 0.18);
  color: #dfe8ff;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 11px;
}

.row-bottom {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 8px;
  align-items: start;
}

.line {
  color: var(--vscode-muted);
  font-size: 12px;
}

.snippet {
  color: var(--vscode-text);
  font-size: 13px;
  line-height: 1.4;
}

.snippet mark {
  background: rgba(77, 171, 247, 0.25);
  color: var(--vscode-text);
  padding: 0 1px;
  border-radius: 2px;
}
</style>
