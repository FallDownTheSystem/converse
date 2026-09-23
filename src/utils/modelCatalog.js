/**
 * Model Catalog Helpers
 *
 * Every provider keeps a catalog keyed by canonical model ID, each entry
 * carrying an `aliases` array. These helpers are the single lookup rule for
 * those catalogs: case-insensitive, canonical ID first, then aliases.
 */

/**
 * Canonical catalog ID for a name, or null.
 * @param {Object<string, {aliases?: string[]}>} catalog
 * @param {string} name - Canonical ID or alias
 * @returns {string|null}
 */
export function findCatalogId(catalog, name) {
  const lower = String(name ?? '').trim().toLowerCase();
  if (!lower || !catalog) return null;
  for (const id of Object.keys(catalog)) {
    if (id.toLowerCase() === lower) return id;
  }
  for (const [id, entry] of Object.entries(catalog)) {
    if (entry?.aliases?.some((alias) => String(alias).toLowerCase() === lower)) {
      return id;
    }
  }
  return null;
}

/**
 * Catalog entry for a name, or null.
 * @param {Object<string, object>} catalog
 * @param {string} name - Canonical ID or alias
 * @returns {object|null}
 */
export function findCatalogEntry(catalog, name) {
  const id = findCatalogId(catalog, name);
  return id ? catalog[id] : null;
}
