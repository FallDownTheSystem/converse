/**
 * Shared streaming helper for the mode engines.
 *
 * Both the parallel and roundtable engines acquire a stream from a provider the
 * same way: providers with a native `stream(messages, options)` method return an
 * async iterator directly; SDK providers (copilot, codex, claude, gemini-cli)
 * instead stream via `invoke(..., { stream: true })`, which may yield an async
 * iterator or, when streaming is unavailable, a plain response object.
 */

/**
 * Acquire a stream (or a plain response) from a provider for the async path.
 * @param {object} providerInstance - Provider implementation
 * @param {Array} messages - Message array
 * @param {object} options - Invocation options
 * @returns {Promise<{ stream: (AsyncIterable|null), response: (object|undefined) }>}
 */
export async function acquireProviderStream(providerInstance, messages, options) {
  if (providerInstance.stream && typeof providerInstance.stream === 'function') {
    return { stream: providerInstance.stream(messages, options), response: undefined };
  }
  // SDK providers (copilot, codex, claude, gemini-cli) stream via invoke
  const streamResult = await providerInstance.invoke(messages, {
    ...options,
    stream: true,
  });
  if (streamResult && typeof streamResult[Symbol.asyncIterator] === 'function') {
    return { stream: streamResult, response: undefined };
  }
  return { stream: null, response: streamResult };
}
