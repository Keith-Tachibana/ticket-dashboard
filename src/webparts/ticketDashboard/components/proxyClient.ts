export interface IProxyConfig {
  functionBaseUrl: string;
  functionKey: string;
  userEmail?: string;
}

interface ICallOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  userContext?: boolean;
}

// Thrown when the proxy returns a JSON error body — lets callers check
// .code for specific cases (like "not_connected") instead of just a message.
export class ProxyError extends Error {
  public code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

// Reads the .code off a thrown error without relying on `instanceof`,
// which can fail for Error subclasses when TypeScript compiles down to ES5.
export function proxyErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export async function callProxy(config: IProxyConfig, targetPath: string, options: ICallOptions = {}): Promise<unknown> {
  const { functionBaseUrl, functionKey, userEmail } = config;
  let url = `${functionBaseUrl}?path=${encodeURIComponent(targetPath)}`;

  if (options.userContext) {
    url += '&authMode=user';
    if (userEmail) {
      url += `&userEmail=${encodeURIComponent(userEmail)}`;
    }
  }

  if (options.query) {
    const query = options.query;
    Object.keys(query).forEach((key) => {
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`;
    });
  }

  const headers: Record<string, string> = { 'x-proxy-key': functionKey || '' };
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    // Don't set Content-Type manually — the browser adds the correct
    // multipart boundary itself when the body is a FormData instance.
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { method: options.method || 'GET', headers, body });
  const text = await response.text();

  // An error page (HTML) or empty body shouldn't blow up with a parse error —
  // treat anything that isn't JSON as "no body" and fall back to the status code.
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    // Our proxy returns {error, message}; NinjaOne's own errors use
    // error_description or errorMessage — check all of them so the real
    // reason shows up instead of a bare status code.
    const errorBody = parsed as {
      error?: string;
      message?: string;
      error_description?: string;
      errorMessage?: string;
    } | null;
    const detail = errorBody && (errorBody.message || errorBody.error_description || errorBody.errorMessage);
    throw new ProxyError(
      detail || `Request to ${targetPath} failed (status ${response.status})`,
      errorBody && errorBody.error
    );
  }

  return parsed;
}

// NinjaOne list endpoints return either a bare array or {data: [...]}.
export function toList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }
  if (payload && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as Record<string, unknown>[];
    }
  }
  return [];
}

// Shared field helpers — several NinjaOne fields (status, assignedAppUser) come back
// as objects like {id, displayName} rather than plain strings.
export function renderField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const obj = value as { displayName?: string; name?: string; body?: string; htmlBody?: string };
    return obj.displayName || obj.name || obj.body || obj.htmlBody || JSON.stringify(value);
  }
  return String(value);
}

export function formatTime(value: unknown): string {
  if (typeof value !== 'number') {
    return renderField(value);
  }
  // NinjaOne timestamps are Unix seconds, not milliseconds.
  return new Date(value * 1000).toLocaleString();
}

// For enum-style fields (priority/severity/source) that come back as
// all-caps or all-lowercase codes — first letter up, rest down.
export function toFirstLetterCaps(value: unknown): string {
  const text = renderField(value);
  if (!text) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// "First Last (email)" for a record from /v2/ticketing/app-user-contact.
export function contactLabel(contact: Record<string, unknown>): string {
  const first = typeof contact.firstName === 'string' ? contact.firstName : '';
  const last = typeof contact.lastName === 'string' ? contact.lastName : '';
  const name = `${first} ${last}`.trim();
  const email = typeof contact.email === 'string' ? contact.email : '';
  if (name && email) {
    return `${name} (${email})`;
  }
  return name || email || String(contact.uid || '');
}
