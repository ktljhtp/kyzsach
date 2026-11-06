import { del, get, post, put } from '../api';
import { can, invalidate, lookup } from '../state';
import { STATUS, historySheet, transitionsFrom } from '../workflow';
import { badge, btn, buildForm, card, confirmBox, fmt, fmtDate, h, icon, iconBtn, openSheet, pageHead, SheetHandle, statusBadge, table, toast } from '../ui';

const PALETTE = ['#5ac8fa', '#ffcc00', '#ff9f0a', '#bf5af2', '#30d158', '#ff6482', '#64d2ff', '#ac8e68'];

/** Ориентировочная схема раскроя: детали укладываются «полками» по длине плиты. */
export function cutSvg(sheetL: number, sheetW: number, positions: any[]): SVGSVGElement {
  const L = Math.max(sheetL, sheetW), W = Math.min(sheetL, sheetW);
  const pieces: { w: number; h: number; label: string; color: string }[] = [];
  positions.forEach((p, i) => {
    for (let k = 0; k < (p.Quantity || 0); k++)
      pieces.push({ w: Math.max(p.Length, p.Width), h: Math.min(p.Length, p.Width), label: p.detail_name || p.Description || `поз. ${i + 1}`, color: PALETTE[i % PALETTE.length] });
  });
  pieces.sort((a, b) => b.h - a.h || b.w - a.w);
  const placed: (typeof pieces[number] & { x: number; y: number })[] = [];
  let x = 0, y = 0, shelf = 0, failed = 0;
  for (const p of pieces) {
    if (x + p.w > L) { y += shelf; x = 0; shelf = 0; }
    if (y + p.h > W) { failed++; continue; }
    placed.push({ ...p, x, y });
    x += p.w;
    shelf = Math.max(shelf, p.h);
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `-20 -20 ${L + 40} ${W + 40}`);
  svg.setAttribute('class', 'cut-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Схема раскроя плиты ${sheetL}×${sheetW}`);
  const mk = (tag: string, attrs: Record<string, any>, text?: string) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text) e.textContent = text;
    return e;
  };
  svg.append(mk('rect', { x: 0, y: 0, width: L, height: W, fill: 'var(--surface)', stroke: 'var(--label-3)', 'stroke-width': 4 }));
  const fs = Math.max(L / 70, 14);
  for (const p of placed) {
    svg.append(mk('rect', { x: p.x, y: p.y, width: p.w, height: p.h, fill: p.color, 'fill-opacity': 0.75, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 3, rx: 4 }));
    if (p.w > fs * 5 && p.h > fs * 2.2) {
      svg.append(mk('text', { x: p.x + p.w / 2, y: p.y + p.h / 2 - fs * 0.15, 'text-anchor': 'middle', 'font-size': fs, fill: '#000', 'font-weight': 600 }, p.label.slice(0, 18)));
      svg.append(mk('text', { x: p.x + p.w / 2, y: p.y + p.h / 2 + fs * 1.1, 'text-anchor': 'middle', 'font-size': fs * 0.85, fill: '#000', 'fill-opacity': 0.7 }, `${p.w}×${p.h}`));
    }
  }
  svg.append(mk('text', { x: L / 2, y: -5, 'text-anchor': 'middle', 'font-size': fs, fill: 'var(--label-2)' }, `${L} мм`));
  if (failed) svg.append(mk('text', { x: 10, y: W - 10, 'font-size': fs, fill: 'var(--red)' }, `Не удалось уложить: ${failed} шт.`));
  return svg;
}

const kimBadge = (k: number | null) => (k === null ? '—' : badge(`${fmt(k, 1)}%`, k >= 80 ? 'ok' : k >= 70 ? 'warn' : 'bad'));

export async function layouts(root: HTMLElement) {
  const [mats, fmts, statuses] = await Promise.all([lookup('/materials'), lookup('/dict/tile-formats'), lookup('/dict/statuses')]);
  const plate = mats.filter((m: any) => m.PK_Type_material === 1);
  const filters = { material: '', format: '', status: '' };
  const holder = h('div');

  async function load() {
    const qs = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    const rows: any[] = await get('/layouts' + (qs ? '?' + qs : ''));
    holder.replaceChildren(card(null, table([
      { title: 'Код', render: (r) => h('b', { class: 'mono' }, r.Card_code) },
      { title: 'Материал', render: (r) => r.material_name },
      { title: 'Формат плиты', render: (r) => r.format_name },
      { title: 'Деталей', align: 'r', render: (r) => r.parts },
      { title: 'КИМ', align: 'r', render: (r) => kimBadge(r.kim) },
      { title: 'Статус', render: (r) => statusBadge(r.PK_Document_status, r.status_name) },
      { title: 'Утверждена', render: (r) => fmtDate(r.Date_of_approval), cls: 'dim' },
    ], rows, { onRow: (r) => view(r.PK_Cutting_layout), empty: 'Карт раскроя нет', emptyHint: 'Измените фильтры или создайте карту.' })));
  }

  async function view(id: number) {
    const l = await get(`/layouts/${id}`);
    const body = h('div', null,
      h('div', { class: 'grid2' },
        h('div', null, cutSvg(l.fmt_length, l.fmt_width, l.positions),
          h('p', { class: 'dim', style: { fontSize: '12px', marginTop: '6px', color: 'var(--label-2)' } }, 'Схема ориентировочная: показывает, помещаются ли детали на плите.')),
        h('div', null,
          h('dl', { class: 'kv' },
            h('dt', null, 'Статус'), h('dd', null, statusBadge(l.PK_Document_status, l.status_name)),
            h('dt', null, 'Материал'), h('dd', null, l.material_name),
            h('dt', null, 'Формат плиты'), h('dd', null, `${l.format_name}`),
            h('dt', null, 'Деталей с плиты'), h('dd', null, String(l.parts)),
            h('dt', null, 'КИМ'), h('dd', null, kimBadge(l.kim)),
            h('dt', null, 'Автор'), h('dd', null, l.author ?? '—'),
            h('dt', null, 'Утверждена'), h('dd', null, fmtDate(l.Date_of_approval))),
          l.Description_of_the_diagram && h('p', { style: { marginTop: '12px', color: 'var(--label-2)' } }, l.Description_of_the_diagram))),
      h('div', { class: 'section-title' }, 'Позиции карты'),
      card(null, table([
        { title: '№', render: (p) => p.Item_number },
        { title: 'Деталь', render: (p) => p.detail_name ? `${p.detail_name} (${p.detail_cipher})` : (p.Description ?? '—') },
        { title: 'Размер, мм', render: (p) => `${p.Length}×${p.Width}` },
        { title: 'Кол-во', align: 'r', render: (p) => p.Quantity },
        { title: 'Подетальная норма, листа', align: 'r', render: (p) => fmt(p.norm, 4) },
      ], l.positions)));
    const actions: any[] = [];
    let sh: SheetHandle;
    const refresh = async () => { invalidate('/layouts'); sh?.close(); await load(); };
    if (can('norm:edit')) actions.push({ label: 'Изменить', onClick: async () => {
      if (l.PK_Document_status === 3 && !(await confirmBox('Изменить утверждённую карту?', 'Карта вернётся в черновик и выпадет из расчёта сводных норм до повторного утверждения.', 'Изменить', false))) return false;
      sh.close(); editor(l);
    }, keepOpen: true });
    actions.push({ label: 'История версий', onClick: () => { historySheet('layout', id, l.Card_code, async () => { await refresh(); }); }, keepOpen: true });
    for (const t of transitionsFrom(l.PK_Document_status))
      actions.push({ label: t.label, kind: t.primary ? 'primary' : '', keepOpen: true, onClick: async () => { await post(`/layouts/${id}/status`, { to: t.to }); toast(`Статус: ${STATUS[t.to]}`); await refresh(); } });
    if (can('norm:edit')) actions.unshift({ label: 'Удалить', kind: 'danger', keepOpen: true, onClick: async () => {
      if (!(await confirmBox('Удалить карту раскроя?', `Будут удалены карта ${l.Card_code} и порождённые ею нормы.`))) return false;
      await del(`/layouts/${id}`); toast('Удалено'); await refresh();
    } });
    sh = openSheet({ title: `Карта раскроя ${l.Card_code}`, body, wide: true, actions });
  }

  async function editor(existing?: any) {
    const details: any[] = await lookup('/details');
    const positions: any[] = existing ? existing.positions.map((p: any) => ({ PK_Detail: p.PK_Detail, Length: p.Length, Width: p.Width, Quantity: p.Quantity })) : [{ PK_Detail: null, Length: '', Width: '', Quantity: 1 }];
    const form = buildForm([
      { name: 'Card_code', label: 'Код карты', required: true },
      { name: 'PK_Material', label: 'Материал (плитный)', type: 'select', options: plate.map((m: any) => ({ value: m.PK_Material, label: `${m.Material_code} — ${m.Name}` })) },
      { name: 'PK_Tile_format', label: 'Формат плиты', type: 'select', options: fmts.map((f: any) => ({ value: f.PK_Tile_format, label: f.Name })) },
      { name: 'Description_of_the_diagram', label: 'Описание схемы', type: 'textarea' },
    ], existing ?? { PK_Tile_format: fmts[0]?.PK_Tile_format });
    const summary = h('div', { class: 'banner ok', style: { marginTop: '14px', marginBottom: 0 } });
    const rowsBox = h('div', { class: 'card', style: { boxShadow: 'none', marginTop: '8px' } });

    const recompute = () => {
      const f = fmts.find((x: any) => String(x.PK_Tile_format) === form.get().PK_Tile_format);
      let used = 0, parts = 0;
      for (const p of positions) { used += (Number(p.Length) || 0) * (Number(p.Width) || 0) * (Number(p.Quantity) || 0); parts += Number(p.Quantity) || 0; }
      const sheet = f ? f.Length * f.Width : 0;
      const kim = sheet ? (100 * used) / sheet : 0;
      summary.className = 'banner ' + (kim > 100 ? '' : 'ok');
      summary.replaceChildren(h('div', { class: 'grow' }, `Деталей: ${parts} · площадь деталей ${fmt(used / 1e6, 3)} м² из ${fmt(sheet / 1e6, 3)} м²`), h('b', null, `КИМ ${fmt(kim, 1)}%`));
    };
    const drawRows = () => {
      const matId = Number(form.get().PK_Material);
      const options = details.filter((d) => d.PK_Material === matId);
      rowsBox.replaceChildren();
      positions.forEach((p, i) => {
        const sel = h('select', { class: 'input', 'aria-label': 'Деталь' }, h('option', { value: '' }, '— деталь —'), ...options.map((d) => h('option', { value: d.PK_Detail }, `${d.product_cipher} · ${d.Name} (${d.Length}×${d.Width})`)));
        sel.value = p.PK_Detail ? String(p.PK_Detail) : '';
        const len = h('input', { class: 'input', type: 'number', value: p.Length, placeholder: 'Длина', 'aria-label': 'Длина' });
        const wid = h('input', { class: 'input', type: 'number', value: p.Width, placeholder: 'Ширина', 'aria-label': 'Ширина' });
        const qty = h('input', { class: 'input', type: 'number', min: 1, value: p.Quantity, 'aria-label': 'Количество' });
        sel.addEventListener('change', () => {
          p.PK_Detail = sel.value ? Number(sel.value) : null;
          const d = options.find((x) => x.PK_Detail === p.PK_Detail);
          if (d) { p.Length = d.Length; p.Width = d.Width; len.value = d.Length; wid.value = d.Width; }
          recompute();
        });
        len.addEventListener('input', () => { p.Length = len.value; recompute(); });
        wid.addEventListener('input', () => { p.Width = wid.value; recompute(); });
        qty.addEventListener('input', () => { p.Quantity = qty.value; recompute(); });
        rowsBox.append(h('div', { class: 'list-row', style: { display: 'grid', gridTemplateColumns: 'minmax(0,3fr) 1fr 1fr 0.8fr auto', gap: '8px' } }, sel, len, wid, qty,
          iconBtn('trash', 'Убрать позицию', () => { positions.splice(i, 1); drawRows(); recompute(); }, 'danger')));
      });
      if (!matId) rowsBox.append(h('div', { class: 'empty' }, 'Выберите материал, чтобы подобрать детали.'));
    };
    form.input('PK_Material').addEventListener('change', () => { positions.forEach((p) => (p.PK_Detail = null)); drawRows(); recompute(); });
    form.input('PK_Tile_format').addEventListener('change', recompute);
    drawRows(); recompute();

    const body = h('div', null, form.el,
      h('div', { class: 'section-title', style: { marginTop: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Детали на плите  ·  деталь, длина, ширина, количество'),
        btn('Добавить', () => { positions.push({ PK_Detail: null, Length: '', Width: '', Quantity: 1 }); drawRows(); recompute(); }, 'sm', 'plus')),
      rowsBox, summary,
      h('p', { class: 'dim', style: { fontSize: '12px', marginTop: '10px', color: 'var(--label-2)' } },
        'Подетальная норма рассчитывается автоматически: 1 / количество таких деталей на плите. После сохранения карта — черновик; утвердите её, чтобы она учитывалась в сводных нормах.'));
    openSheet({ title: existing ? `Изменить карту ${existing.Card_code}` : 'Новая карта раскроя', body, wide: true, actions: [
      { label: 'Отмена', onClick: () => undefined },
      { label: 'Сохранить', kind: 'primary', onClick: async () => {
        const v = form.get();
        if (!v.Card_code) throw new Error('Заполните поле «Код карты».');
        const payload = { ...v, positions: positions.map((p) => ({ PK_Detail: p.PK_Detail, Length: p.Length, Width: p.Width, Quantity: p.Quantity })) };
        if (existing) await put(`/layouts/${existing.PK_Cutting_layout}`, payload); else await post('/layouts', payload);
        invalidate('/layouts');
        toast('Карта раскроя сохранена');
        await load();
      } },
    ] });
  }

  const sel = (label: string, key: keyof typeof filters, options: { value: any; label: string }[]) => {
    const s = h('select', { class: 'input', 'aria-label': label, style: { width: 'auto', minWidth: '160px' } }, h('option', { value: '' }, label), ...options.map((o) => h('option', { value: o.value }, o.label)));
    s.addEventListener('change', () => { filters[key] = s.value; load(); });
    return s;
  };
  root.append(
    pageHead('Карты раскроя', 'Схемы раскроя плитных материалов. КИМ и подетальные нормы считаются автоматически.',
      can('norm:edit') ? [btn('Новая карта', () => editor(), 'primary', 'plus')] : []),
    h('div', { class: 'params', style: { marginBottom: '14px' } },
      sel('Все материалы', 'material', plate.map((m: any) => ({ value: m.PK_Material, label: m.Name }))),
      sel('Все форматы', 'format', fmts.map((f: any) => ({ value: f.PK_Tile_format, label: f.Name }))),
      sel('Все статусы', 'status', statuses.map((s: any) => ({ value: s.PK_Document_status, label: s.Name })))),
    holder);
  await load();
  void icon;
}
