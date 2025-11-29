/// <reference lib="webworker" />

import Fs, { type FsEntry } from '../services/filesystem';

type SearchOptions = {
  matchCase: boolean;
  useRegex: boolean;
  wholeWord: boolean;
  include: string[];
  exclude: string[];
  maxResults?: number;
  maxPerFile?: number;
};

type SearchRequest = {
  type: 'search';
  id: string;
  root: FsEntry;
  query: string;
  options: SearchOptions;
};

type CancelRequest = {
  type: 'cancel';
  id?: string;
};

type WorkerRequest = SearchRequest | CancelRequest;

type SearchMatch = {
  line: number;
  start: number;
  length: number;
  preview: string;
};

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const DEFAULT_EXCLUDES = [
  'node_modules/**',
  '**/node_modules/**',
  '.git/**',
  '**/.git/**',
  'dist/**',
  '**/dist/**',
  '.quasar/**',
  '**/.quasar/**',
  'build/**',
  '**/build/**',
];
const DEFAULT_MAX_TOTAL = 1200;
const DEFAULT_MAX_PER_FILE = 120;
let currentSearchId: string | null = null;
let stopReason: 'user' | 'limit' | null = null;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    if (message.id && message.id !== currentSearchId) return;
    stopReason = 'user';
    return;
  }

  if (message.type === 'search') {
    void handleSearch(message);
  }
};

async function handleSearch(request: SearchRequest) {
  currentSearchId = request.id;
  stopReason = null;

  const startedAt = performance.now();
  const maxTotal = request.options.maxResults ?? DEFAULT_MAX_TOTAL;
  const maxPerFile = request.options.maxPerFile ?? DEFAULT_MAX_PER_FILE;

  const matcher = buildMatcher(request.query, request.options);
  if (!matcher.regex) {
    postMessage({ type: 'error', id: request.id, message: matcher.error ?? '无效的搜索表达式' });
    return;
  }
  const regex: RegExp = matcher.regex;

  const includeRules = compileGlobs(request.options.include);
  const excludeRules = compileGlobs([...DEFAULT_EXCLUDES, ...request.options.exclude]);
  const rootPath = normalizePath(request.root.path ?? request.root.name ?? '');

  let scanned = 0;
  let matched = 0;
  let totalHits = 0;

  try {
    await walkDirectory(request.root, '', async (entry, relativePath) => {
      if (shouldStop()) return;

      const normalizedPath = normalizePath(relativePath || entry.path || entry.name || '');
      const pathForRules = entry.kind === 'directory' ? `${normalizedPath}/` : normalizedPath;

      if (entry.kind === 'directory') {
        if (isExcluded(pathForRules, excludeRules)) return 'skip-children';
        return;
      }

      scanned += 1;
      if (!shouldInclude(pathForRules, includeRules, excludeRules)) return;

      if (isLikelyBinaryPath(pathForRules)) return;

      let content: string;
      try {
        content = await Fs.readText(entry);
      } catch {
        return;
      }

      if (looksLikeBinary(content)) return;

      const matches = findMatches(content, regex, maxPerFile);
      if (!matches.length) return;

      matched += 1;
      totalHits += matches.length;

      const relative = toRelative(normalizedPath, rootPath);
      postMessage({
        type: 'file-result',
        id: request.id,
        entry: { ...entry, path: normalizedPath },
        relativePath: relative,
        matches,
      });

      if (scanned % 20 === 0) {
        postMessage({
          type: 'progress',
          id: request.id,
          scanned,
          elapsed: performance.now() - startedAt,
        });
      }

      if (totalHits >= maxTotal) {
        stopReason = 'limit';
      }
    });
  } catch (error) {
    postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : '搜索过程中发生错误',
    });
    return;
  }

  postMessage({
    type: 'done',
    id: request.id,
    scanned,
    matched,
    duration: performance.now() - startedAt,
    cancelled: stopReason === 'user',
    limited: stopReason === 'limit',
  });
}

function shouldStop(): boolean {
  return stopReason !== null;
}

async function walkDirectory(
  dir: FsEntry,
  currentRelative: string,
  onEntry: (entry: FsEntry, relativePath: string) => Promise<'skip-children' | void>,
) {
  if (shouldStop()) return;
  if (dir.kind !== 'directory') return;

  const children = await Fs.list(dir);
  for (const child of children) {
    if (shouldStop()) break;
    const nextRelative = currentRelative ? `${currentRelative}/${child.name}` : (child.name ?? '');

    const action = await onEntry(child, nextRelative);
    if (child.kind === 'directory' && action !== 'skip-children') {
      await walkDirectory(child, nextRelative, onEntry);
    }
  }
}

function buildMatcher(
  query: string,
  options: SearchOptions,
): { regex: RegExp | null; error?: string } {
  const trimmed = query.trim();
  if (!trimmed) return { regex: null, error: '搜索关键词不能为空' };

  try {
    const escaped = options.useRegex ? trimmed : escapeRegex(trimmed);
    const source = options.wholeWord ? `\\b${escaped}\\b` : escaped;
    const flags = options.matchCase ? 'g' : 'gi';
    const regex = new RegExp(source, flags);
    return { regex };
  } catch (error) {
    return { regex: null, error: error instanceof Error ? error.message : '构建正则失败' };
  }
}

function findMatches(text: string, regex: RegExp, perFileLimit: number): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lineStarts = computeLineStarts(text);
  regex.lastIndex = 0;

  let m: RegExpExecArray | null = regex.exec(text);
  while (m && matches.length < perFileLimit) {
    const matchText = m[0] ?? '';
    const start = m.index;
    const end = start + matchText.length;

    if (end === start) {
      regex.lastIndex += 1;
      m = regex.exec(text);
      continue;
    }

    const lineIdx = locateLine(start, lineStarts);
    const lineStart = lineStarts[lineIdx] ?? 0;
    const nextStart = lineStarts[lineIdx + 1];
    const lineEnd = nextStart != null ? nextStart - 1 : text.length;
    const rawLine = text.slice(lineStart, lineEnd).replace(/\r$/u, '');
    const column = start - lineStart;
    const previewInfo = buildPreview(rawLine, column, matchText.length);

    matches.push({
      line: lineIdx + 1,
      start: previewInfo.start,
      length: matchText.length,
      preview: previewInfo.preview,
    });

    m = regex.exec(text);
  }

  return matches;
}

function buildPreview(
  line: string,
  start: number,
  length: number,
): { preview: string; start: number } {
  const maxLen = 180;
  if (line.length <= maxLen) {
    return { preview: line, start };
  }

  const context = Math.max(20, Math.floor((maxLen - length) / 2));
  const sliceStart = Math.max(0, start - context);
  const sliceEnd = Math.min(line.length, sliceStart + maxLen);
  const preview = line.slice(sliceStart, sliceEnd);
  return { preview, start: start - sliceStart };
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function locateLine(offset: number, lineStarts: number[]): number {
  if (!lineStarts.length) return 0;
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid] ?? 0;
    const next =
      mid + 1 < lineStarts.length
        ? (lineStarts[mid + 1] ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;

    if (offset >= start && offset < next) return mid;
    if (offset < start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return Math.max(0, lineStarts.length - 1);
}

function compileGlobs(globs: string[]): RegExp[] {
  return globs
    .map((g) => g.trim())
    .filter(Boolean)
    .map(globToRegExp);
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/');
  let pattern = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  pattern = pattern.replace(/\*\*/g, '::STAR_ALL::');
  pattern = pattern.replace(/\*/g, '[^/]*');
  pattern = pattern.replace(/::STAR_ALL::/g, '.*');
  pattern = pattern.replace(/\?/g, '[^/]');
  return new RegExp(`^${pattern}$`);
}

function shouldInclude(path: string, includeRules: RegExp[], excludeRules: RegExp[]): boolean {
  if (isExcluded(path, excludeRules)) return false;
  if (includeRules.length === 0) return true;
  return includeRules.some((re) => re.test(path));
}

function isExcluded(path: string, excludeRules: RegExp[]): boolean {
  return excludeRules.some((re) => re.test(path));
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function toRelative(path: string, rootPath: string): string {
  const normalized = normalizePath(path);
  const normalizedRoot = normalizePath(rootPath);
  if (!normalizedRoot) return normalized;
  if (normalized.startsWith(`${normalizedRoot}/`)) {
    return normalized.slice(normalizedRoot.length + 1);
  }
  return normalized;
}

const BINARY_EXTS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.svgz',
  '.psd',
  '.pdf',
  '.zip',
  '.rar',
  '.7z',
  '.gz',
  '.tar',
  '.tgz',
  '.bz2',
  '.xz',
  '.apk',
  '.aab',
  '.jar',
  '.war',
  '.class',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.wasm',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.mp3',
  '.wav',
  '.flac',
  '.aac',
  '.ogg',
  '.mp4',
  '.mkv',
  '.mov',
  '.avi',
  '.webm',
];

function isLikelyBinaryPath(path: string): boolean {
  const lower = path.toLowerCase();
  return BINARY_EXTS.some((ext) => lower.endsWith(ext));
}

function looksLikeBinary(content: string): boolean {
  if (!content) return false;
  const sample = content.slice(0, 2048);
  if (sample.includes('\u0000')) return true;

  let controlCount = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code < 9 || (code > 13 && code < 32)) {
      controlCount += 1;
    }
  }
  return controlCount / sample.length > 0.25;
}
/// <reference lib="webworker" />
