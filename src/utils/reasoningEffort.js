/**
 * Reasoning Effort Ladder
 *
 * The tool-level `reasoning_effort` vocabulary is the union of the tiers the
 * providers expose, ordered weakest to strongest. Every provider declares the
 * subset its model accepts and clamps the request onto it here, so the same
 * word means the same tier everywhere and a provider never re-derives the
 * ordering on its own.
 */

/**
 * Every tool-level reasoning_effort value, weakest first. Doubles as the
 * `enum` of the chat tool's `reasoning_effort` parameter.
 * @type {string[]}
 */
export const EFFORT_LADDER = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

/**
 * Effort applied when the caller leaves reasoning_effort unset or sends a
 * value outside the ladder.
 */
export const DEFAULT_EFFORT = 'medium';

/**
 * Clamp a requested effort onto the tiers a model accepts.
 *
 * The requested tier wins when the model accepts it. Otherwise the nearest
 * *stronger* accepted tier wins: nudging 'minimal' up to 'low' keeps reasoning
 * on, where falling back to 'none' would silently switch it off. Only when
 * nothing stronger exists does the nearest weaker tier apply (e.g. 'max' on a
 * model that tops out at 'xhigh').
 *
 * Tiers in `supported` that are not on the ladder are ignored for ranking but
 * the first of them is used as a last resort when nothing on the ladder
 * matches, so a provider-declared list is never answered with a tier it
 * doesn't contain. An empty list is invalid capability data and throws rather
 * than inventing a tier the model may reject.
 *
 * @param {string|undefined} effort - Tool-level reasoning_effort value
 * @param {string[]} supported - Tiers the model accepts (any order)
 * @returns {string} A tier from `supported`
 */
export function clampReasoningEffort(effort, supported) {
  if (!Array.isArray(supported) || supported.length === 0) {
    throw new TypeError(
      'clampReasoningEffort requires a non-empty list of supported tiers',
    );
  }

  const desired = EFFORT_LADDER.includes(effort) ? effort : DEFAULT_EFFORT;
  if (supported.includes(desired)) {
    return desired;
  }

  const rank = EFFORT_LADDER.indexOf(desired);
  const stronger = EFFORT_LADDER.slice(rank + 1).find((tier) =>
    supported.includes(tier),
  );
  if (stronger) {
    return stronger;
  }

  const weaker = EFFORT_LADDER.slice(0, rank)
    .reverse()
    .find((tier) => supported.includes(tier));
  return weaker || supported[0];
}
