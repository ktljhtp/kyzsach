export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function parse(res: Response) {
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('nm:unauthorized'));
    throw new ApiError(res.status, data?.error ?? 'Не удалось выполнить запрос.');
  }
  return data;
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Нет связи с сервером.');
  }
  return parse(res);
}

export const get = <T = any>(url: string) => api<T>('GET', url);
export const post = <T = any>(url: string, body: unknown = {}) => api<T>('POST', url, body);
export const put = <T = any>(url: string, body: unknown) => api<T>('PUT', url, body);
export const del = <T = any>(url: string) => api<T>('DELETE', url);

export async function download(url: string) {
  const res = await fetch('/api' + url, { credentials: 'same-origin' });
  if (!res.ok) await parse(res);
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : 'document.xlsx';
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function upload(url: string, file: File) {
  const res = await fetch('/api' + url, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' }, credentials: 'same-origin' });
  return parse(res);
}
