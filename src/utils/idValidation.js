/**
 * ID validation helpers
 *
 * These are intentionally conservative and are primarily used to ensure IDs that
 * are used as filesystem path segments cannot escape their intended directory.
 */

/**
 * Check whether an ID is safe to use as a single filesystem path segment.
 *
 * Allowed characters: A–Z a–z 0–9 _ -
 * Disallowed: path separators, dots, whitespace, and other punctuation.
 *
 * @param {unknown} id
 * @param {object} [options]
 * @param {number} [options.maxLength]
 * @returns {boolean}
 */
export function isSafeIdSegment(id, options = {}) {
  const { maxLength = 128 } = options;

  if (typeof id !== 'string') {
    return false;
  }

  if (id.length === 0 || id.length > maxLength) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(id);
}

