const CLEAN_SLASH = /^\/+|\/+$/g;

export type ExternalPathInfo = {
  relativePath: string;
  displayName: string;
  volume: string;
};

function normalizePathSegment(segment: string): string {
  return segment.replace(CLEAN_SLASH, '');
}

function extractEncodedId(uri: string, key: 'tree' | 'document'): string | null {
  const marker = `/${key}/`;
  const idx = uri.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length;
  const end = uri.indexOf('/', start);
  const encoded = end === -1 ? uri.slice(start) : uri.slice(start, end);
  return encoded ? decodeURIComponent(encoded) : null;
}

function parseDocumentId(docId: string): ExternalPathInfo {
  const [volume = 'primary', ...rest] = docId.split(':');
  const rawPath = rest.join(':');
  const relativePath = normalizePathSegment(rawPath);
  const displayName = relativePath.split('/').filter(Boolean).pop() || volume || 'ExternalStorage';

  return {
    volume: volume || 'primary',
    relativePath,
    displayName,
  };
}

function parseTreeUri(uri: string): ExternalPathInfo {
  const documentId = extractEncodedId(uri, 'document') ?? extractEncodedId(uri, 'tree') ?? '';
  return parseDocumentId(documentId);
}

export function isFullDevicePath(path?: string): boolean {
  if (!path) return false;
  return path.startsWith('content://') || path.startsWith('file://');
}

export function toRelativeExternalPath(path?: string): ExternalPathInfo {
  if (!path) {
    return { volume: 'primary', relativePath: '', displayName: 'ExternalStorage' };
  }

  if (path.startsWith('content://')) {
    return parseTreeUri(path);
  }

  if (path.startsWith('file://')) {
    const cleaned = normalizePathSegment(path.replace(/^file:\/\//, ''));
    return {
      volume: 'primary',
      relativePath: cleaned,
      displayName: cleaned.split('/').pop() || cleaned || 'ExternalStorage',
    };
  }

  const relativePath = normalizePathSegment(path);
  return {
    volume: 'primary',
    relativePath,
    displayName: relativePath.split('/').pop() || relativePath || 'ExternalStorage',
  };
}
