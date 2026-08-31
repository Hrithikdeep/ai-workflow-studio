export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type ApiRequestOptions = Omit<RequestInit, 'body' | 'method'> & {
  body?: unknown
  params?: Record<string, string | number | boolean | undefined | null>
}

export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'

export class ApiError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(
    status: number,
    message: string,
    options?: {
      code?: string
      details?: unknown
    },
  ) {
    super(message)

    this.name = 'ApiError'
    this.status = status
    this.code = options?.code
    this.details = options?.details

    Object.setPrototypeOf(this, ApiError.prototype)
  }

  static fromResponse(
    response: Response,
    payload?: unknown,
  ): ApiError {
    let message = response.statusText || 'Request failed'
    let code: string | undefined

    if (
      typeof payload === 'object' &&
      payload !== null
    ) {
      const data = payload as Record<string, unknown>

      if (typeof data.message === 'string') {
        message = data.message
      }

      if (typeof data.code === 'string') {
        code = data.code
      }

      // NestJS validation errors can sometimes return
      // message as an array.
      if (
        Array.isArray(data.message) &&
        data.message.length > 0
      ) {
        message = data.message
          .map(String)
          .join(', ')
      }
    }

    return new ApiError(
      response.status,
      message,
      {
        code,
        details: payload,
      },
    )
  }
}

function getBaseUrl(): string {
  // Browser: go through the same-origin Next proxy at `/api/*` so the auth
  // cookie stays first-party on the web origin. Every caller in this app is a
  // client component, so this is the normal path.
  if (typeof window !== 'undefined') {
    return '/api'
  }

  // Server-side (rare): talk to the API directly.
  const baseUrl =
    process.env.API_PROXY_TARGET?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim()

  if (!baseUrl) {
    throw new Error(
      'API base URL is not configured (API_PROXY_TARGET / NEXT_PUBLIC_API_URL).',
    )
  }

  return baseUrl.replace(/\/+$/, '')
}

function buildUrl(
  path: string,
  params?: ApiRequestOptions['params'],
): string {
  const isAbsoluteUrl =
    path.startsWith('http://') ||
    path.startsWith('https://')

  const normalizedPath = isAbsoluteUrl
    ? path
    : `${getBaseUrl()}${
        path.startsWith('/') ? path : `/${path}`
      }`

  // `normalizedPath` is relative in the browser (`/api/...`); resolve it
  // against the current origin so `URL` can parse it.
  const url = new URL(
    normalizedPath,
    typeof window !== 'undefined' ? window.location.origin : undefined,
  )

  if (params) {
    Object.entries(params).forEach(
      ([key, value]) => {
        if (
          value !== undefined &&
          value !== null
        ) {
          url.searchParams.set(
            key,
            String(value),
          )
        }
      },
    )
  }

  return url.toString()
}

async function parseJsonResponse(
  response: Response,
): Promise<unknown> {
  if (response.status === 204) {
    return undefined
  }

  const text = await response.text()

  if (!text.trim()) {
    return undefined
  }

  const contentType =
    response.headers.get('content-type') || ''

  if (
    contentType.includes('application/json') ||
    contentType.includes('+json')
  ) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    body,
    params,
    headers,
    ...rest
  } = options

  const requestHeaders = new Headers(headers)

  requestHeaders.set(
    'Accept',
    'application/json',
  )

  // Include credentials (cookies) so auth cookies are sent with requests.
  // Authentication is handled by the API via JWT cookies set on login.
  const fetchOptions: RequestInit = {
    credentials: 'include',
  }

  let requestBody:
    | BodyInit
    | null
    | undefined

  const isFormData =
    typeof FormData !== 'undefined' &&
    body instanceof FormData

  const isURLSearchParams =
    typeof URLSearchParams !== 'undefined' &&
    body instanceof URLSearchParams

  const isBlob =
    typeof Blob !== 'undefined' &&
    body instanceof Blob

  const isArrayBuffer =
    typeof ArrayBuffer !== 'undefined' &&
    body instanceof ArrayBuffer

  const isReadableStream =
    typeof ReadableStream !== 'undefined' &&
    body instanceof ReadableStream

  const shouldSerializeAsJson =
    body !== undefined &&
    body !== null &&
    !isFormData &&
    !isURLSearchParams &&
    !isBlob &&
    !isArrayBuffer &&
    !isReadableStream

  if (shouldSerializeAsJson) {
    requestHeaders.set(
      'Content-Type',
      'application/json',
    )

    requestBody =
      typeof body === 'string'
        ? body
        : JSON.stringify(body)
  } else {
    requestBody =
      body as BodyInit | null | undefined
  }

  let response: Response

  try {
    response = await fetch(buildUrl(path, params), {
      ...rest,
      ...fetchOptions,
      method,
      headers: requestHeaders,
      body:
        method === 'GET' || method === 'DELETE'
          ? undefined
          : requestBody,
    })
  } catch (error) {
    throw new ApiError(
      0,
      error instanceof Error
        ? error.message
        : 'Network request failed',
      {
        code: 'NETWORK_ERROR',
        details: error,
      },
    )
  }

  const payload =
    await parseJsonResponse(response)

  if (!response.ok) {
    throw ApiError.fromResponse(
      response,
      payload,
    )
  }

  return payload as T
}

export const api = {
  get<T>(
    path: string,
    options?: ApiRequestOptions,
  ) {
    return request<T>(
      'GET',
      path,
      options,
    )
  },

  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<
      ApiRequestOptions,
      'body'
    >,
  ) {
    return request<T>(
      'POST',
      path,
      {
        ...options,
        body,
      },
    )
  },

  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<
      ApiRequestOptions,
      'body'
    >,
  ) {
    return request<T>(
      'PATCH',
      path,
      {
        ...options,
        body,
      },
    )
  },

  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<
      ApiRequestOptions,
      'body'
    >,
  ) {
    return request<T>(
      'PUT',
      path,
      {
        ...options,
        body,
      },
    )
  },

  delete<T>(
    path: string,
    options?: ApiRequestOptions,
  ) {
    return request<T>(
      'DELETE',
      path,
      options,
    )
  },
}

export default api