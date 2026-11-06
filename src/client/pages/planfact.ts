import { del, get, post, put, upload, download } from '../api';
import { can, lookup } from '../state';
import { go } from '../router';
import { badge, btn, card, confirmBox, fmt, formSheet, h, iconBtn, pageHead, table, toast } from '../ui';

export async function planfact(root: HTMLElement) {
  const write = can('fact:edit');
  const now = new Date();
  let period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const holder = h('div');

  const reasonForm = (r: any) =>
    formSheet({
      title: `Причина: ${r.cipher}, ${r.material}`,
      fields: [{ name: 'Reason', label: 'Причина перерасхода', type: 'textarea' }],
      values: { Reason: r.reason },
      onSubmit: async (v) => { await put('/fact/reason', { ...v, period, PK_Finished_product: r.product_id, PK_Material: r.material_id }); toast('Сохранено'); await load(); },
    });

  async function outputForm() {
    const prods: any[] = await lookup('/products');
    formSheet({
      title: 'Фактический выпуск',
      fields: [
        { name: 'PK_Finished_product', label: 'Изделие', type: 'select', required: true, options: prods.map((p) => ({ value: p.PK_Finished_product, label: `${p.Cipher} · ${p.Name}` })) },
        { name: 'Quantity', label: 'Выпущено за период, шт.', type: 'number', required: true },
      ],
      onSubmit: async (v) => { await put('/fact/output', { ...v, period }); toast('Сохранено'); await load(); },
    });
  }
  async function consumptionForm(row?: any) {
    const [prods, mats]: any[][] = await Promise.all([lookup('/products'), lookup('/materials')]);
    formSheet({
      title: row ? 'Изменить расход' : 'Фактический расход материала',
      wide: true,
      fields: [
        { name: 'PK_Finished_product', label: 'Изделие', type: 'select', required: true, disabled: !!row, options: prods.map((p) => ({ value: p.PK_Finished_product, label: `${p.Cipher} · ${p.Name}` })) },
        { name: 'PK_Material', label: 'Материал', type: 'select', required: true, disabled: !!row, options: mats.map((m) => ({ value: m.PK_Material, label: `${m.Material_code} — ${m.Name}` })) },
        { name: 'Quantity', label: 'Списано', type: 'number', required: true },
        { name: 'Workshop', label: 'Цех' },
        { name: 'Reason', label: 'Причина (при перерасходе)', type: 'textarea' },
      ],
      values: row ? { ...row, Quantity: row.quantity, Workshop: row.workshop, Reason: row.reason } : { Workshop: 'Мебельный' },
      onSubmit: async (v) => {
        if (row) await put(`/fact/consumption/${row.id}`, v); else await post('/fact/consumption', { ...v, period });
        toast('Сохранено'); await load();
      },
    });
  }

  async function importFile(file: File) {
    try {
      const r = await upload(`/fact/import?period=${period}`, file);
      toast(`Импортировано строк: ${r.imported}${r.errorCount ? `, с ошибками: ${r.errorCount}` : ''}`, r.errorCount ? 'err' : 'ok');
      if (r.errors?.length) {
        const { openSheet } = await import('../ui');
        openSheet({ title: 'Строки, которые не удалось импортировать', body: h('div', null, ...r.errors.map((e: string) => h('div', { class: 'list-row' }, e))) });
      }
      await load();
    } catch (e: any) { toast(e.message, 'err'); }
  }

  async function load() {
    const [doc, fact] = await Promise.all([get(`/docs/plan-fact?period=${period}`), get(`/fact?period=${period}`)]);
    const over = doc.rows.filter((r: any) => r._flag);
    holder.replaceChildren(
      h('div', { class: over.length ? 'banner' : 'banner ok' }, h('div', { class: 'grow' },
        doc.rows.length ? (over.length ? `Перерасход более 5%: ${over.length} поз.` : 'Перерасхода более 5% нет.') : 'За период нет данных — добавьте выпуск и расход или импортируйте Excel.'),
        btn('Открыть отчёт', () => go('docs', { doc: 'plan-fact', period }), '', 'print')),
      card('Отклонения', table([
        { title: 'Шифр', render: (r) => h('b', null, r.cipher) },
        { title: 'Материал', render: (r) => r.material },
        { title: 'План', align: 'r', render: (r) => fmt(r.plan, 2) },
        { title: 'Факт', align: 'r', render: (r) => fmt(r.fact, 2) },
        { title: 'Отклонение', align: 'r', render: (r) => (r.dev === null ? '—' : h('span', { class: r.dev > 5 ? 'dev-over' : r.dev < 0 ? 'dev-save' : '' }, `${r.dev > 0 ? '+' : ''}${fmt(r.dev, 1)}%`)) },
        { title: 'Причина', render: (r) => h('span', { class: 'dim' }, r.reason ?? ''), },
        ...(write ? [{ title: '', align: 'r' as const, render: (r: any) => (r.fact !== null ? iconBtn('pencil', 'Указать причину', () => reasonForm(r)) : null) }] : []),
      ], doc.rows, { rowClass: (r) => (r._flag ? 'flag' : ''), empty: 'Нет данных' }),
        { sub: 'План = сводная норма × фактический выпуск. Перерасход выделяется при отклонении более 5%.' }),
      h('div', { class: 'grid2', style: { marginTop: '18px' } },
        card('Фактический выпуск', table([
          { title: 'Изделие', render: (r) => h('div', null, h('b', null, r.cipher), h('div', { class: 'dim', style: { fontSize: '12px' } }, r.product_name)) },
          { title: 'Выпущено, шт.', align: 'r', render: (r) => fmt(r.quantity, 0) },
          ...(write ? [{ title: '', align: 'r' as const, render: (r: any) => iconBtn('trash', 'Удалить', async () => { await del(`/fact/output/${r.id}`); await load(); }, 'danger') }] : []),
        ], fact.outputs, { empty: 'Нет данных' }), { actions: [write && btn('Добавить', outputForm, 'sm', 'plus')].filter(Boolean) as Node[] }),
        card('Фактический расход', table([
          { title: 'Изделие', render: (r) => r.cipher },
          { title: 'Материал', render: (r) => r.material_name },
          { title: 'Списано', align: 'r', render: (r) => `${fmt(r.quantity, 2)} ${r.unit_name ?? ''}` },
          { title: 'Цех', render: (r) => r.workshop ?? '—', cls: 'dim' },
          ...(write ? [{ title: '', align: 'r' as const, render: (r: any) => h('div', { class: 'row-actions' }, iconBtn('pencil', 'Изменить', () => consumptionForm(r)),
            iconBtn('trash', 'Удалить', async () => { if (await confirmBox('Удалить строку расхода?', `${r.cipher}, ${r.material_name}`)) { await del(`/fact/consumption/${r.id}`); await load(); } }, 'danger')) }] : []),
        ], fact.consumption, { empty: 'Нет данных' }), { actions: [write && btn('Добавить', () => consumptionForm(), 'sm', 'plus')].filter(Boolean) as Node[] })));
  }

  const input = h('input', { class: 'input', type: 'month', value: period, 'aria-label': 'Период', style: { width: 'auto' } });
  input.addEventListener('change', () => { if (input.value) { period = input.value; load(); } });
  const file = h('input', { type: 'file', accept: '.xlsx', hidden: true });
  file.addEventListener('change', async () => { if (file.files?.[0]) await importFile(file.files[0]); file.value = ''; });
  root.append(
    pageHead('План-факт', 'Сравнение фактического расхода материалов с нормативным за месяц.',
      [input, ...(write ? [btn('Импорт из Excel', () => file.click(), '', 'upload'), file] : [])]),
    ...(write ? [h('p', { class: 'dim', style: { margin: '-8px 0 14px', color: 'var(--label-2)', fontSize: '13px' } }, 'Файл .xlsx со столбцами: Шифр изделия, Код (или наименование) материала, Списано, Цех. Первая строка — заголовки.')] : []),
    holder);
  await load();
  void badge; void download;
}
