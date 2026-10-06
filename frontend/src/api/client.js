
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL)

const DEFAULT_TIMEOUT = 15000;

export class ApiError extends Error {
  constructor(
    status,
    message,
    {
      code = '',
      details = null,
      requestId = '',
      cause = null,
    } = {},
  ) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.cause = cause;
  }

  get isNetworkError() {
    return this.status === 0;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isValidationError() {
    return (
      this.status === 400 ||
      this.status === 422
    );
  }

  get isServerError() {
    return this.status >= 500;
  }
}

function createRequestId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}/${String(path).replace(
    /^\/+/,
    '',
  )}`;
}

function isFormData(body) {
  return (
    typeof FormData !== 'undefined' &&
    body instanceof FormData
  );
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType =
    response.headers.get('content-type') || '';

  if (
    contentType.includes('application/json')
  ) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => '');

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(data, fallback) {
  if (!data) {
    return fallback;
  }

  if (typeof data === 'string') {
    return data.trim() || fallback;
  }

  if (typeof data === 'object') {
    return (
      data.message ||
      data.error ||
      data.detail ||
      fallback
    );
  }

  return fallback;
}

function getRequestId(response, data) {
  return (
    response.headers.get('x-request-id') ||
    response.headers.get('x-correlation-id') ||
    data?.requestId ||
    ''
  );
}

function createTimeoutController(
  signal,
  timeout,
) {
  const controller = new AbortController();

  let timedOut = false;

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  const abortHandler = () => {
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        'abort',
        abortHandler,
        { once: true },
      );
    }
  }

  return {
    signal: controller.signal,

    get timedOut() {
      return timedOut;
    },

    cleanup() {
      window.clearTimeout(timeoutId);

      if (signal) {
        signal.removeEventListener(
          'abort',
          abortHandler,
        );
      }
    },
  };
}

export async function request(
  path,
  {
    method = 'GET',
    headers: customHeaders,
    body,
    signal,
    timeout = DEFAULT_TIMEOUT,
    ...options
  } = {},
  token = '',
) {
  const headers = new Headers(
    customHeaders || {},
  );

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    );
  }

  /*
   * Do not manually set Content-Type for FormData.
   */
  if (
    body !== undefined &&
    body !== null &&
    !isFormData(body) &&
    !headers.has('Content-Type')
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    );
  }

  headers.set(
    'Accept',
    'application/json',
  );

  const requestId = createRequestId();

  headers.set(
    'X-Request-ID',
    requestId,
  );

  const requestController =
    createTimeoutController(
      signal,
      timeout,
    );

  let response;

  try {
    response = await fetch(
      buildUrl(path),
      {
        ...options,
        method,
        headers,
        body,
        signal:
          requestController.signal,
      },
    );
  } catch (error) {
    requestController.cleanup();

    if (error?.name === 'AbortError') {
      if (requestController.timedOut) {
        throw new ApiError(
          408,
          'Request timed out. Please try again.',
          {
            code: 'REQUEST_TIMEOUT',
            requestId,
            cause: error,
          },
        );
      }

      throw error;
    }

    throw new ApiError(
      0,
      'Unable to connect to the server. Please check your connection.',
      {
        code: 'NETWORK_ERROR',
        requestId,
        cause: error,
      },
    );
  }

  requestController.cleanup();

  const data =
    await parseResponse(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      getErrorMessage(
        data,
        `Request failed with status ${response.status}.`,
      ),
      {
        code:
          typeof data === 'object'
            ? data?.error || ''
            : '',

        details:
          typeof data === 'object'
            ? data?.details || null
            : null,

        requestId:
          getRequestId(
            response,
            data,
          ),
      },
    );
  }

  return data;
}