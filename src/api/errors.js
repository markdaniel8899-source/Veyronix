/**
 * Helpers that turn an Axios failure into something we can actually debug in
 * the browser console.
 *
 * The backend always answers with `{ success, data?, error? }`, so the HTTP
 * body of a failed request usually carries the real reason. Network problems
 * and timeouts never reach the backend at all and have to be detected from
 * the Axios error shape.
 */

/** True when the request never got an HTTP response (offline, DNS, CORS...). */
export function isNetworkError(error) {
  if (!error) return false
  return Boolean(error.request) && !error.response
}

/** True when the request was aborted because the timeout elapsed. */
export function isTimeoutError(error) {
  if (!error) return false
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true
  return typeof error.message === 'string' && /timeout/i.test(error.message)
}

/** Pull the human readable reason out of a backend error payload. */
export function extractBackendError(payload) {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (typeof payload.error === 'string' && payload.error) return payload.error
  if (typeof payload.message === 'string' && payload.message) return payload.message
  return ''
}

/**
 * Build a readable, one-line description of a failed request.
 * Used for console output and for the in-app error banner.
 */
export function describeApiError(error) {
  if (!error) return 'Unknown error'

  if (isTimeoutError(error)) {
    const seconds = error.config?.timeout ? Math.round(error.config.timeout / 1000) : null
    return `Request timed out${seconds ? ` after ${seconds}s` : ''}. The model is probably still working - retry or raise the timeout.`
  }

  if (error.response) {
    const { status, statusText, data } = error.response
    const backend = extractBackendError(data)
    const suffix = backend ? ` - ${backend}` : ''
    return `HTTP ${status} ${statusText || ''}`.trim() + suffix
  }

  if (isNetworkError(error)) {
    return `Network error - the request never reached the API. Check the API base URL, the bearer token and CORS settings.`
  }

  if (error instanceof SyntaxError || /JSON/i.test(error.message || '')) {
    return `Response parsing failed - ${error.message}`
  }

  return error.message || 'Unknown error'
}

/**
 * Normalise an Axios error into a plain Error that keeps the useful details
 * around. Existing `catch` blocks read `err.message`, so the message has to
 * stay descriptive.
 */
export function toApiError(error) {
  if (error instanceof Error && !error.isAxiosError) return error

  const wrapped = new Error(describeApiError(error))
  wrapped.isAxiosError = true
  wrapped.originalError = error
  wrapped.status = error?.response?.status ?? null
  wrapped.payload = error?.response?.data ?? null
  wrapped.code = error?.code ?? null
  wrapped.url = error?.config?.url ?? null
  wrapped.method = error?.config?.method?.toUpperCase() ?? null
  wrapped.isTimeout = isTimeoutError(error)
  wrapped.isNetworkError = isNetworkError(error)
  return wrapped
}
