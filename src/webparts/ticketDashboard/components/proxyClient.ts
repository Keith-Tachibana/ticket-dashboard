export interface IProxyConfig {
  functionBaseUrl: string;
  functionKey: string;
}

interface ICallOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

export async function callProxy(config: IProxyConfig, targetPath: string, options: ICallOptions = {}): Promise<unknown> {
  const { functionBaseUrl, functionKey } = config;
  let url = `${functionBaseUrl}?path=${encodeURIComponent(targetPath)}`;

  if (options.query) {
    const query = options.query;
    Object.keys(query).forEach((key) => {
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`;
    });
  }

  const headers: Record<string, string> = { 'x-proxy-key': functionKey || '' };
  let body: string | undefined;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { method: options.method || 'GET', headers, body });

  if (!response.ok) {
    throw new Error(`Request to ${targetPath} failed (status ${response.status})`);
  }

  return response.json();
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
