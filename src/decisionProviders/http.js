/**
 * Decision API HTTP client
 *
 * One transport for every decision host: retries, timeouts, cancellation, and
 * error mapping. Hosts differ in URL, auth, and wire format; each provider's
 * format (see formats.js) builds the request body and normalizes the response,
 * so this module only moves JSON.
 *
 * Plain fetch rather than vendor SDKs: the schemas are small, the tool needs
 * its own abort signal and error mapping across hosts, and @typesafe-ai/sdk's
 * model listing breaks against OpenRouter.
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5_000;
// A longer server-requested wait is better spent failing over to another host.
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * Error from a decision call. `retryable` marks failures worth repeating or
 * failing over (network, timeout, 408/429/5xx, auth); `terminal` marks request
 * faults that every host of the same model would reject the same way;
 * `notSent` marks a request refused by a local limit check before any network
 * call, so it is not reported as a failed request.
 */
export class DecisionError extends Error {
  constructor(message, { status = null, retryable = false, terminal = false, notSent = false, requestId = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'DecisionError';
    this.status = status;
    this.retryable = retryable;
    this.terminal = terminal;
    this.notSent = notSent;
    this.requestId = requestId;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Render a validation issue list (zod-style `[{path, message}]`) as one line
 * per issue; anything else is returned as-is.
 */
function formatIssues(text) {
  let issues;
  try {
    issues = JSON.parse(text);
  } catch {
    return text;
  }
  if (!Array.isArray(issues) || !issues.every((i) => i && typeof i.message === 'string')) {
    return text;
  }
  return issues
    .map((i) => (Array.isArray(i.path) && i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

/**
 * Workers AI embeds the model's own error as JSON inside its message
 * (`AiError: AiError: {"error":{...,"details":{"fieldErrors":...}}} (id)`);
 * surface the validation details instead of the raw dump.
 */
function describeWorkersAiError(message) {
  const embedded = message.match(/\{.*\}/s)?.[0];
  let inner;
  try {
    inner = JSON.parse(embedded).error;
  } catch {
    return formatIssues(message);
  }
  if (typeof inner?.message !== 'string') return message;
  const fields = Object.entries(inner.details?.fieldErrors ?? {})
    .map(([field, problems]) => `${field}: ${[].concat(problems).join(', ')}`);
  const forms = [].concat(inner.details?.formErrors ?? []);
  const details = [...fields, ...forms];
  return details.length ? `${inner.message} (${details.join('; ')})` : inner.message;
}

/**
 * Extract a readable message from an error body. OpenRouter and OpenAI wrap
 * errors as `{ error: { message } }`; TypeSafe answers
 * `{ detail: { error_type, message } }`, or `{ detail }` as a string or a list
 * of validation issues; Cloudflare answers `{ errors: [{ code, message }] }`.
 */
export function extractErrorMessage(body, rawText) {
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    return body.errors
      .map((e) => (typeof e?.message === 'string' ? describeWorkersAiError(e.message) : JSON.stringify(e)))
      .join('; ');
  }
  if (typeof body?.detail?.message === 'string') {
    const type = body.detail.error_type ? `${body.detail.error_type}: ` : '';
    return `${type}${body.detail.message}`;
  }
  const nested = body?.error?.message ?? body?.error ?? body?.detail ?? body?.message;
  if (typeof nested === 'string') {
    const inner = nested.match(/^HTTP \d+: (\{.*\})$/s);
    if (inner) {
      try {
        return extractErrorMessage(JSON.parse(inner[1]), inner[1]);
      } catch {
        return nested;
      }
    }
    return formatIssues(nested);
  }
  if (Array.isArray(nested)) {
    return nested
      .map((d) => (d?.loc ? `${d.loc.join('.')}: ${d.msg}` : d?.msg || JSON.stringify(d)))
      .join('; ');
  }
  return rawText?.trim() || 'No error details returned';
}

const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Summarize an HTML error page, which arrives raw from TypeSafe's edge and
 * embedded in OpenRouter's JSON error message when it forwards one.
 * Cloudflare's block page means the firewall rejected the request content
 * before any model saw it: typically SQL-injection or shell-command patterns
 * inside state or questions.
 * @returns {{ message: string, firewall: boolean, rayId: string|null }|null}
 *   null when the text is not an HTML page
 */
export function describeHtmlError(text) {
  if (!/<!doctype html|<html[\s>]/i.test(text || '')) return null;
  const rayId = text.match(/Cloudflare Ray ID:\s*<strong[^>]*>([0-9a-f]+)</i)?.[1] ?? null;
  if (/cloudflare/i.test(text) && /you have been blocked|Attention Required/i.test(text)) {
    const host = text.match(/unable to access<\/span>\s*([^<\s]+)/i)?.[1] ?? 'the upstream';
    return {
      firewall: true,
      rayId,
      message:
        `Blocked by ${host}'s Cloudflare firewall before reaching the model${rayId ? ` (Ray ID ${rayId})` : ''}: ` +
        'the request content matched an attack signature, typically SQL-injection or shell-command patterns in state or questions. ' +
        'Retrying the same content will not help; report the Ray ID to the provider.',
    };
  }
  const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  return {
    firewall: false,
    rayId,
    message: `Upstream returned an HTML error page${title ? `: ${title}` : ''}${rayId ? ` (Ray ID ${rayId})` : ''}`,
  };
}

function truncate(text) {
  return text.length > MAX_ERROR_MESSAGE_LENGTH ? `${text.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : text;
}

function parseRetryAfter(headers) {
  const ms = Number(headers.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const value = headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function sendOnce({ url, headers, body, parse, signal, timeoutMs }) {
  const attemptSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: attemptSignal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const timedOut = error?.name === 'TimeoutError';
    throw new DecisionError(
      timedOut ? `Request timed out after ${timeoutMs / 1000}s` : `Connection failed: ${error.message}`,
      { retryable: true },
    );
  }

  const rawText = await response.text();
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const status = response.status;
    const detail = extractErrorMessage(parsed, rawText);
    const html = describeHtmlError(detail);
    // A firewall block repeats on retry, and on failover to any host that
    // forwards to the same upstream.
    const firewall = html?.firewall === true;
    throw new DecisionError(`HTTP ${status}: ${html ? html.message : truncate(detail)}`, {
      status,
      retryable: !firewall && (status === 408 || status === 429 || status >= 500 || status === 401 || status === 403),
      terminal: firewall || status === 400 || status === 422,
      requestId:
        response.headers.get('x-typesafe-request-id') ||
        response.headers.get('x-generation-id') ||
        response.headers.get('x-request-id') ||
        html?.rayId ||
        response.headers.get('cf-ray'),
      retryAfterMs: parseRetryAfter(response.headers),
    });
  }

  const result = parse(parsed);
  if (!result || typeof result.answers !== 'object' || result.answers === null) {
    throw new DecisionError('Malformed response: missing "answers" object', { status: response.status });
  }
  return result;
}

/**
 * POST a decision request, retrying transient failures (except auth, which
 * retrying cannot fix) with exponential backoff that honors Retry-After.
 * @param {object} params
 * @param {string} params.url - Full endpoint URL
 * @param {object} params.headers - Auth and attribution headers
 * @param {object} params.body - Request body in the host's wire format
 * @param {(body: object|null) => object} [params.parse] - Maps the response
 *   body to `{ model, answers, usage, id }` in System One answer shapes
 * @param {AbortSignal} [params.signal] - Caller cancellation
 * @param {number} [params.timeoutMs] - Per-attempt timeout
 * @param {number} [params.maxRetries] - Retries after the first attempt
 * @returns {Promise<object>} Normalized response
 */
export async function callDecisionApi({
  url,
  headers,
  body,
  parse = (parsed) => parsed,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await sendOnce({ url, headers, body, parse, signal, timeoutMs });
    } catch (error) {
      const authFailure = error.status === 401 || error.status === 403;
      if (!(error instanceof DecisionError) || !error.retryable || authFailure || attempt >= maxRetries) {
        throw error;
      }
      if (error.retryAfterMs !== null && error.retryAfterMs > MAX_RETRY_AFTER_MS) {
        throw error;
      }
      const backoff = Math.min(BACKOFF_INITIAL_MS * 2 ** attempt, BACKOFF_MAX_MS);
      await sleep(error.retryAfterMs ?? backoff, signal);
    }
  }
}
