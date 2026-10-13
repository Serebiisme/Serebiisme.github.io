export function readProgress(raw, validIds) {
  try {
    const stored = JSON.parse(raw ?? '[]');
    if (!Array.isArray(stored)) return new Set();
    const valid = new Set(validIds);
    return new Set(stored.filter((id) => typeof id === 'string' && valid.has(id)));
  } catch { return new Set(); }
}
