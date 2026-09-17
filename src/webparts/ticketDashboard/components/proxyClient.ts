import { values } from "@fluentui/react";

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
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorBody = parsed as { error?: string; message?: string } | undefined;
    throw new ProxyError(
      (errorBody && errorBody.message) || `Request to ${targetPath} failed (status ${response.status})`,
      errorBody && errorBody.error
    );
  }

  return parsed;
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

export function omitQuotations(value: unknown): string {
  const name = renderField(value);
  if (!name) {
    return name;
  }
  if (name.includes('"')) {
    const splitName = name.split('"');
    return splitName[1].trim();
  }
  return name;
}
