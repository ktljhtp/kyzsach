export type Params = Record<string, string | number>;
let handler: (() => void) | null = null;

export function onRoute(fn: () => void) {
  handler = fn;
  window.addEventListener('hashchange', fn);
}
export function go(route: string, params?: Params) {
  const q = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
  const next = `#/${route}${q}`;
  if (location.hash === next) handler?.();
  else location.hash = next;
}
export function current(): { route: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [route, q] = raw.split('?');
  return { route: route || 'dashboard', params: new URLSearchParams(q ?? '') };
}
