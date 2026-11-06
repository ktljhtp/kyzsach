type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, any> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && k !== 'form') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}
function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el: Element) => { while (el.firstChild) el.removeChild(el.firstChild); };

// ---------- иконки (линейные, в стиле SF Symbols) ----------
const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  grid: 'M4 4h16v16H4zM4 12h16M12 4v16',
  docCheck: 'M7 3h8l4 4v14H7zM15 3v4h4M10 14l2 2 4-4',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  print: 'M7 3h10v5H7zM5 8h14v8H5zM7 14h10v7H7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  pencil: 'M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3',
  chevron: 'M9 6l6 6-6 6',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-3-6.7M21 4v4h-4',
  play: 'M7 4l13 8-13 8z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  out: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  send: 'M21 3L3 11l7 3 3 7 8-18z',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  alert: 'M12 4l9 16H3L12 4zM12 10v4M12 17h.01',
  logo: 'M5 19V5l7 9 7-9v14',
};
export function icon(name: string): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] ?? ICONS.cube);
  s.appendChild(p);
  return s;
}

// ---------- форматирование ----------
export const fmt = (n: any, d = 2): string =>
  n === null || n === undefined || n === '' || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const money = (n: any) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽');
export const fmtDate = (s: any) => {
  if (!s) return '—';
  const t = String(s).slice(0, 10).split('-');
  return t.length === 3 ? `${t[2]}.${t[1]}.${t[0]}` : String(s);
};
export const fmtDateTime = (s: any) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

// ---------- уведомления ----------
let toasts: HTMLElement | null = null;
export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  if (!toasts) { toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toasts); }
  const t = h('div', { class: 'toast ' + kind }, kind === 'ok' ? icon('check') : icon('alert'), msg);
  toasts.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 5000 : 2600);
}

// ---------- листы ----------
export interface SheetAction {
  label: string;
  kind?: 'primary' | 'danger' | 'plain';
  onClick: (sheet: SheetHandle) => any;
  keepOpen?: boolean;
}
export interface SheetHandle { close(): void; el: HTMLElement; setError(msg: string | null): void; }

export function openSheet(opts: { title: string; body: Node; actions?: SheetAction[]; wide?: boolean; onClose?: () => void }): SheetHandle {
  const prev = document.activeElement as HTMLElement | null;
  const errBox = h('div', { class: 'form-error', hidden: true, role: 'alert' });
  const sheet = h('div', { class: 'sheet' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
  const scrim = h('div', { class: 'scrim' }, sheet);
  const handle: SheetHandle = {
    el: sheet,
    close() {
      document.removeEventListener('keydown', onKey);
      scrim.remove();
      prev?.focus?.();
      opts.onClose?.();
    },
    setError(m) { errBox.hidden = !m; errBox.textContent = m ?? ''; },
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handle.close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) handle.close(); });

  const body = h('div', { class: 'sheet-body' }, opts.body, errBox);
  sheet.append(
    h('div', { class: 'sheet-head' }, h('h2', null, opts.title), h('button', { class: 'btn icon plain', 'aria-label': 'Закрыть', onclick: () => handle.close() }, icon('x'))),
    body,
  );
  if (opts.actions?.length) {
    const foot = h('div', { class: 'sheet-foot' });
    for (const a of opts.actions) {
      const b = h('button', { class: 'btn ' + (a.kind ?? ''), type: 'button' }, a.label);
      b.addEventListener('click', async () => {
        handle.setError(null);
        b.disabled = true;
        try {
          const r = await a.onClick(handle);
          if (r !== false && !a.keepOpen) handle.close();
        } catch (e: any) {
          handle.setError(e?.message ?? 'Ошибка');
        } finally {
          b.disabled = false;
        }
      });
      foot.appendChild(b);
    }
    sheet.appendChild(foot);
  }
  document.body.appendChild(scrim);
  const first = sheet.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea');
  (first ?? sheet.querySelector<HTMLElement>('.btn.primary'))?.focus();
  return handle;
}

export function confirmBox(title: string, message: string, okLabel = 'Удалить', destructive = true): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null;
    const done = (v: boolean) => { scrim.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); };
    const ok = h('button', { class: 'btn' + (destructive ? ' danger' : ''), onclick: () => done(true) }, okLabel);
    const scrim = h('div', { class: 'scrim' },
      h('div', { class: 'sheet alert', role: 'alertdialog', 'aria-modal': 'true' },
        h('div', { class: 'sheet-body' }, h('b', null, title), h('p', null, message)),
        h('div', { class: 'sheet-foot' }, h('button', { class: 'btn', onclick: () => done(false) }, 'Отмена'), ok)));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(scrim);
    ok.focus();
  });
}

// ---------- формы ----------
export interface Opt { value: string | number; label: string }
export interface Field {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'password' | 'month';
  options?: Opt[];
  required?: boolean;
  hint?: string;
  step?: string;
  placeholder?: string;
  span2?: boolean;
  disabled?: boolean;
}
export interface FormHandle { el: HTMLElement; get(): Record<string, any>; input(name: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement; }

export function buildForm(fields: Field[], values: Record<string, any> = {}): FormHandle {
  const inputs = new Map<string, any>();
  const grid = h('div', { class: 'form-grid' });
  for (const f of fields) {
    const id = 'f_' + f.name + Math.random().toString(36).slice(2, 6);
    let input: any;
    const v = values[f.name];
    if (f.type === 'select') {
      input = h('select', { class: 'input', id, disabled: f.disabled }, h('option', { value: '' }, '—'),
        ...(f.options ?? []).map((o) => h('option', { value: String(o.value) }, o.label)));
      input.value = v === null || v === undefined ? '' : String(v);
    } else if (f.type === 'textarea') {
      input = h('textarea', { class: 'input', id, rows: 3, placeholder: f.placeholder, disabled: f.disabled });
      input.value = v ?? '';
    } else {
      input = h('input', { class: 'input', id, type: f.type ?? 'text', step: f.type === 'number' ? f.step ?? 'any' : undefined, placeholder: f.placeholder, disabled: f.disabled, autocomplete: f.type === 'password' ? 'new-password' : 'off' });
      input.value = v === null || v === undefined ? '' : f.type === 'date' ? String(v).slice(0, 10) : String(v);
    }
    inputs.set(f.name, input);
    grid.appendChild(h('div', { class: 'field' + (f.span2 || f.type === 'textarea' ? ' span2' : '') },
      h('label', { for: id }, f.label + (f.required ? ' *' : '')), input, f.hint && h('span', { class: 'hint' }, f.hint)));
  }
  return {
    el: grid,
    input: (n) => inputs.get(n),
    get() {
      const out: Record<string, any> = {};
      for (const f of fields) {
        const raw = (inputs.get(f.name) as HTMLInputElement).value;
        out[f.name] = raw === '' ? null : raw;
      }
      return out;
    },
  };
}

export function formSheet(opts: { title: string; fields: Field[]; values?: Record<string, any>; submit?: string; wide?: boolean; onSubmit: (v: Record<string, any>, form: FormHandle) => Promise<any>; extra?: (form: FormHandle) => Node | null }) {
  const form = buildForm(opts.fields, opts.values);
  const body = h('div', null, form.el, opts.extra?.(form));
  const sh = openSheet({
    title: opts.title, body, wide: opts.wide,
    actions: [
      { label: 'Отмена', onClick: () => undefined },
      { label: opts.submit ?? 'Сохранить', kind: 'primary', onClick: async () => {
        for (const f of opts.fields) if (f.required && !String(form.get()[f.name] ?? '').trim()) throw new Error(`Заполните поле «${f.label}».`);
        await opts.onSubmit(form.get(), form);
      } },
    ],
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); sh.el.querySelector<HTMLButtonElement>('.btn.primary')?.click(); }
  });
  return sh;
}

// ---------- таблицы и мелкие компоненты ----------
export interface Col<T = any> {
  title: string;
  render: (row: T, i: number) => Child;
  align?: 'r' | 'c';
  cls?: string;
  width?: string;
}
export function table(cols: Col<any>[], rows: any[], opts: { empty?: string; emptyHint?: string; onRow?: (r: any) => void; rowClass?: (r: any) => string } = {}): HTMLElement {
  if (!rows.length) return h('div', { class: 'empty' }, h('b', null, opts.empty ?? 'Нет данных'), opts.emptyHint ?? '');
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, ...cols.map((c) => h('th', { class: c.align ?? '', style: c.width ? { width: c.width } : undefined }, c.title)))),
    h('tbody', null, ...rows.map((r, i) => h('tr', { class: [opts.onRow ? 'click' : '', opts.rowClass?.(r) ?? ''].join(' ').trim(), onclick: opts.onRow ? () => opts.onRow!(r) : undefined },
      ...cols.map((c) => h('td', { class: [c.align ?? '', c.cls ?? ''].join(' ').trim() }, c.render(r, i)))))),
  ));
}

export function segmented<T extends string | number>(options: { value: T; label: string }[], value: T, onChange: (v: T) => void): HTMLElement {
  const el = h('div', { class: 'seg', role: 'group' });
  const draw = (cur: T) => {
    clear(el);
    for (const o of options) el.appendChild(h('button', { type: 'button', 'aria-pressed': String(o.value === cur), onclick: () => { draw(o.value); onChange(o.value); } }, o.label));
  };
  draw(value);
  return el;
}

export const badge = (text: string, cls = '') => h('span', { class: 'badge ' + cls }, text);
export const statusBadge = (id: number, name: string) => badge(name, 's' + id);

export function pageHead(title: string, subtitle?: string, actions?: Node[]) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), subtitle && h('p', null, subtitle)), actions?.length ? h('div', { class: 'actions' }, ...actions) : null);
}
export const btn = (label: string, onClick: (e: MouseEvent) => any, kind = '', ic?: string) =>
  h('button', { class: 'btn ' + kind, type: 'button', onclick: onClick }, ic && icon(ic), label);
export const iconBtn = (ic: string, label: string, onClick: (e: MouseEvent) => any, kind = '') =>
  h('button', { class: 'btn icon plain ' + kind, type: 'button', 'aria-label': label, title: label, onclick: (e: MouseEvent) => { e.stopPropagation(); onClick(e); } }, icon(ic));
export const card = (title: string | null, body: Node | null | (Node | null)[], opts: { sub?: string; actions?: (Node | null | false | undefined)[] } = {}) =>
  h('section', { class: 'card' }, title && h('div', { class: 'card-head' }, h('div', null, h('h2', null, title), opts.sub && h('p', null, opts.sub)), opts.actions?.some(Boolean) ? h('div', { class: 'actions' }, ...opts.actions.filter((x): x is Node => !!x)) : null), ...(Array.isArray(body) ? body : [body]).filter((x): x is Node => !!x));
export const searchBox = (onInput: (q: string) => void) => {
  const i = h('input', { class: 'input', type: 'search', placeholder: 'Поиск', 'aria-label': 'Поиск' });
  i.addEventListener('input', () => onInput(i.value.trim().toLowerCase()));
  return h('div', { class: 'search' }, icon('search'), i);
};

export async function guard<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e: any) {
    toast(e?.message ?? 'Ошибка', 'err');
    return undefined;
  }
}
