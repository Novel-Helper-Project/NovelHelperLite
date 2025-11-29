const ANDROID_TREE_REGEX = /content:\/\/com\.android\.externalstorage\.documents\/tree\/([^/]+)\/document\/([^?#]+)/i;
const CLEAN_LEADING_SLASH = /^\/+|\/+$/g;

export function isFullDevicePath(path?: string): boolean {
  if (!path) return false;
  return path.startsWith('content://') || path.startsWith('file://');
}

export function toRelativeExternalPath(uri?: string): { relativePath: string; displayName: string } {
  if (!uri) {
    return { relativePath: '', displayName: 'ExternalStorage' };
  }

  if (uri.startsWith('content://')) {
    const decoded = decodeURIComponent(uri);
    const match = ANDROID_TREE_REGEX.exec(decoded);
    if (match) {
      const rel = match[2]?.replace(CLEAN_LEADING_SLASH, '') ?? '';
      const display = rel.split('/').pop() || match[1] || 'ExternalStorage';
      return {
        relativePath: rel,
        displayName: display,
      };
    }
    return {
      relativePath: '',
      displayName: decoded.split('/').pop() || 'ExternalStorage',
    };
  }

  return {
    relativePath: uri.replace(CLEAN_LEADING_SLASH, ''),
    displayName: uri.split('/').pop() || uri,
  };
}
