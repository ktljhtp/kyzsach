import { del, get, post, put } from '../api';
import { can, invalidate, lookup } from '../state';
import { STATUS, historySheet, transitionsFrom } from '../workflow';
import { btn, buildForm, card, confirmBox, fmt, fmtDate, h, openSheet, Opt, pageHead, segmented, SheetHandle, statusBadge, table, toast, badge } from '../ui';
import { current } from '../router';

export async function norms(root: HTMLElement) {
  const [statuses, prods] = await Promise.all([lookup('/dict/statuses'), lookup('/products')]);
  const f: Record<string, string> = { status: '', kind: '', product: current().params.get('product') ?? '' };
  const holder = h('div');

  async function load() {
    const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    const rows: any[] = await get('/norms' + (qs ? '?' + qs : ''));
    holder.replaceChildren(card(null, table([
      { title: 'Код', render: (r) => h('b', { class: 'mono' }, r.Consumption_code) },
      { title: 'Вид', render: (r) => badge(r.kind, 'info') },
      { title: 'Объект', render: (r) => r.target_name ?? '—' },
      { title: 'Материал', render: (r) => r.material_name },
      { title: 'Норма', align: 'r', render: (r) => `${fmt(r.Significance_of_the_norm, 4)} ${r.unit_name ?? ''}` },
      { title: 'Версия', render: (r) => r.Version, cls: 'dim' },
      { title: 'Статус', render: (r) => statusBadge(r.PK_Document_status, r.status_name) },
      { title: 'Дата', render: (r) => fmtDate(r.Date), cls: 'dim' },
    ], rows, { onRow: (r) => view(r), empty: 'Норм не найдено', emptyHint: 'Измените фильтры или создайте норму.' })));
  }

  function view(n: any) {
    const body = h('dl', { class: 'kv' },
      h('dt', null, 'Код'), h('dd', null, n.Consumption_code),
      h('dt', null, 'Вид нормы'), h('dd', null, n.kind),
      h('dt', null, 'Объект'), h('dd', null, n.target_name ?? '—'),
      h('dt', null, 'Материал'), h('dd', null, n.material_name),
      h('dt', null, 'Значение'), h('dd', null, `${fmt(n.Significance_of_the_norm, 6)} ${n.unit_name ?? ''}`),
      h('dt', null, 'Коэф. потерь'), h('dd', null, fmt(n.Loss_coefficient, 3)),
      h('dt', null, 'Версия'), h('dd', null, `${n.Version} от ${fmtDate(n.Date)}`),
      h('dt', null, 'Статус'), h('dd', null, statusBadge(n.PK_Document_status, n.status_name)),
      h('dt', null, 'Автор'), h('dd', null, n.author ?? '—'),
      h('dt', null, 'Описание'), h('dd', null, n.Description ?? '—'),
      n.PK_Cutting_layout_position ? h('dt', null, 'Источник') : null,
      n.PK_Cutting_layout_position ? h('dd', null, 'Рассчитана по карте раскроя — меняется вместе с картой') : null);
    const byLayout = !!n.PK_Cutting_layout_position;
    const actions: any[] = [];
    let sh: SheetHandle;
    const refresh = async () => { invalidate('/norms'); sh?.close(); await load(); };
    if (can('norm:edit') && !byLayout) {
      actions.push({ label: 'Удалить', kind: 'danger', keepOpen: true, onClick: async () => {
        if (![1, 4].includes(n.PK_Document_status)) throw new Error('Удалять можно только черновики и архивные нормы.');
        if (!(await confirmBox('Удалить норму?', n.Consumption_code))) return false;
        await del(`/norms/${n.PK_Consumption_rate}`); toast('Удалено'); await refresh();
      } });
      actions.push({ label: 'Изменить', keepOpen: true, onClick: async () => {
        if (n.PK_Document_status === 3 && !(await confirmBox('Изменить утверждённую норму?', 'Новая версия станет черновиком и потребует согласования.', 'Изменить', false))) return false;
        sh.close(); form(n);
      } });
    }
    actions.push({ label: 'История версий', keepOpen: true, onClick: () => { historySheet('norm', n.PK_Consumption_rate, n.Consumption_code, refresh); } });
    if (!byLayout)
      for (const t of transitionsFrom(n.PK_Document_status))
        actions.push({ label: t.label, kind: t.primary ? 'primary' : '', keepOpen: true, onClick: async () => { await post(`/norms/${n.PK_Consumption_rate}/status`, { to: t.to }); toast(`Статус: ${STATUS[t.to]}`); await refresh(); } });
    sh = openSheet({ title: `Норма ${n.Consumption_code}`, body, actions });
  }

  async function form(existing?: any) {
    const [mats, details, units] = await Promise.all([lookup('/materials'), lookup('/details'), lookup('/assemblies')]);
    let kind: 'detail' | 'assembly' | 'product' = 'detail';
    let rateId: number | null = existing?.PK_Edge_banding_consumption_rate ?? null;
    const matOpts: Opt[] = mats.map((m: any) => ({ value: m.PK_Material, label: `${m.Material_code} — ${m.Name}` }));
    const targetOpts = (): Opt[] =>
      kind === 'detail' ? details.map((d: any) => ({ value: d.PK_Detail, label: `${d.product_cipher} · ${d.Name} (${d.Cipher})` }))
      : kind === 'assembly' ? units.map((u: any) => ({ value: u.PK_Assembly_unit, label: `${u.product_cipher} · ${u.Name} (${u.Cipher})` }))
      : prods.map((p: any) => ({ value: p.PK_Finished_product, label: `${p.Cipher} · ${p.Name}` }));
    const fm = buildForm([
      ...(existing ? [] : [{ name: 'target', label: 'Объект нормы', type: 'select' as const, options: targetOpts(), required: true, span2: true }]),
      { name: 'PK_Material', label: 'Материал', type: 'select', options: matOpts, required: true, span2: true },
      { name: 'Significance_of_the_norm', label: 'Значение нормы', type: 'number', required: true },
      { name: 'Loss_coefficient', label: 'Коэффициент потерь', type: 'number' },
      { name: 'Consumption_code', label: 'Код нормы', hint: 'Если оставить пустым, код присвоится автоматически' },
      { name: 'Description', label: 'Описание', type: 'textarea' },
    ], existing ? { ...existing, PK_Material: existing.PK_Material } : { Loss_coefficient: 1 });

    const body = h('div');
    if (!existing)
      body.append(h('div', { style: { marginBottom: '14px' } }, segmented<string>([
        { value: 'detail', label: 'Деталь' }, { value: 'assembly', label: 'Сборочная единица' }, { value: 'product', label: 'Изделие' },
      ], 'detail', (v) => {
        kind = v as any;
        const t = fm.input('target') as HTMLSelectElement;
        t.replaceChildren(h('option', { value: '' }, '—'), ...targetOpts().map((o) => h('option', { value: String(o.value) }, o.label)));
      })));
    body.append(fm.el);
    const edgeBtn = btn('Рассчитать норму кромки по детали', async () => {
      const v = fm.get();
      const m = mats.find((x: any) => String(x.PK_Material) === v.PK_Material);
      if (kind !== 'detail' || !v.target) throw new Error('Выберите деталь.');
      if (!m || m.PK_Type_material !== 2) throw new Error('Выберите кромочный материал.');
      const r = await get(`/norms/edge-calc?detail=${v.target}&material=${v.PK_Material}`);
      (fm.input('Significance_of_the_norm') as HTMLInputElement).value = String(r.norm);
      (fm.input('Loss_coefficient') as HTMLInputElement).value = String(r.loss);
      rateId = r.rate_id;
      toast('Норма кромки рассчитана');
    }, 'sm');
    edgeBtn.addEventListener('click', (e) => e.stopPropagation());
    if (!existing) body.append(h('div', { style: { marginTop: '12px' } }, edgeBtn, h('span', { class: 'dim', style: { marginLeft: '10px', fontSize: '12px', color: 'var(--label-2)' } }, 'Длина кромляемых торцов × расход × потери ÷ длина рулона')));
    openSheet({ title: existing ? `Изменить норму ${existing.Consumption_code}` : 'Новая норма', body, wide: true, actions: [
      { label: 'Отмена', onClick: () => undefined },
      { label: 'Сохранить', kind: 'primary', onClick: async () => {
        const v = fm.get();
        if (!v.PK_Material || v.Significance_of_the_norm === null) throw new Error('Укажите материал и значение нормы.');
        const payload: any = { ...v, PK_Edge_banding_consumption_rate: rateId };
        if (existing) await put(`/norms/${existing.PK_Consumption_rate}`, payload);
        else {
          if (!v.target) throw new Error('Выберите объект нормы.');
          payload[kind === 'detail' ? 'PK_Detail' : kind === 'assembly' ? 'PK_Assembly_unit' : 'PK_Finished_product'] = v.target;
          await post('/norms', payload);
        }
        invalidate('/norms');
        toast('Норма сохранена как черновик');
        await load();
      } },
    ] });
  }

  const select = (label: string, key: string, options: Opt[]) => {
    const s = h('select', { class: 'input', 'aria-label': label, style: { width: 'auto', minWidth: '160px' } }, h('option', { value: '' }, label), ...options.map((o) => h('option', { value: String(o.value) }, o.label)));
    s.value = f[key] ?? '';
    s.addEventListener('change', () => { f[key] = s.value; load(); });
    return s;
  };
  root.append(
    pageHead('Нормы расхода', 'Подетальные, специфицированные и сводные нормы. Каждое изменение сохраняется как версия.',
      can('norm:edit') ? [btn('Новая норма', () => form(), 'primary', 'plus')] : []),
    h('div', { class: 'params', style: { marginBottom: '14px' } },
      segmented<string>([{ value: '', label: 'Все' }, { value: 'detail', label: 'Подетальные' }, { value: 'assembly', label: 'Узлов' }, { value: 'product', label: 'Сводные' }], '', (v) => { f.kind = v; load(); }),
      select('Все изделия', 'product', prods.map((p: any) => ({ value: p.PK_Finished_product, label: `${p.Cipher} · ${p.Name}` }))),
      select('Все статусы', 'status', statuses.map((s: any) => ({ value: s.PK_Document_status, label: s.Name })))),
    holder);
  await load();
}
