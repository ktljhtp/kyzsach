import { del, get, post, put } from '../api';
import { can, lookup } from '../state';
import { go } from '../router';
import { badge, btn, card, confirmBox, Field, fmt, fmtDate, formSheet, h, iconBtn, MONTHS, pageHead, statusBadge, table, toast } from '../ui';

export async function programs(root: HTMLElement) {
  const write = can('program:edit');
  let list: any[] = await get('/programs');
  let sel: number | null = list[0]?.PK_Production_program ?? null;
  const side = h('div');
  const main = h('div');

  const progForm = async (row?: any) => {
    const st: any[] = await lookup('/dict/statuses');
    const now = new Date();
    formSheet({
      title: row ? 'Изменить программу' : 'Новая программа',
      fields: [
        { name: 'Year', label: 'Год', type: 'number', required: true },
        { name: 'Month', label: 'Месяц', type: 'select', options: MONTHS.map((m, i) => ({ value: i + 1, label: m })), required: true },
        { name: 'PK_Document_status', label: 'Статус', type: 'select', options: st.map((s) => ({ value: s.PK_Document_status, label: s.Name })) },
        { name: 'Program_code', label: 'Код', hint: 'Пусто — присвоится автоматически' },
        { name: 'Description', label: 'Описание', type: 'textarea' },
      ] as Field[],
      values: row ?? { Year: now.getFullYear(), Month: now.getMonth() + 1, PK_Document_status: 1 },
      onSubmit: async (v) => {
        if (row) await put(`/programs/${row.PK_Production_program}`, v);
        else sel = (await post('/programs', v)).id;
        toast('Сохранено');
        await reload();
      },
    });
  };

  const itemForm = async (progId: number, row?: any) => {
    const prods: any[] = await lookup('/products');
    formSheet({
      title: row ? 'Изменить позицию' : 'Позиция программы',
      fields: [
        { name: 'PK_Finished_product', label: 'Изделие', type: 'select', options: prods.map((p) => ({ value: p.PK_Finished_product, label: `${p.Cipher} · ${p.Name}` })), required: true, disabled: !!row },
        { name: 'Release_plan', label: 'План выпуска, шт.', type: 'number', required: true },
        { name: 'Note', label: 'Примечание', type: 'textarea' },
      ],
      values: row ?? {},
      onSubmit: async (v) => {
        if (row) await put(`/program-items/${row.PK_Production_program_item}`, v); else await post(`/programs/${progId}/items`, v);
        toast('Сохранено. Потребность нужно пересчитать.');
        await reload();
      },
    });
  };

  async function drawMain() {
    main.replaceChildren();
    if (!sel) { main.append(card(null, h('div', { class: 'empty' }, h('b', null, 'Программ нет'), write ? 'Создайте производственную программу на месяц.' : ''))); return; }
    const p = await get(`/programs/${sel}`);
    const req: any[] = await get(`/programs/${sel}/requirements`);
    main.append(
      card(`${p.Program_code} · ${MONTHS[p.Month - 1]} ${p.Year}`, [
        table([
          { title: 'Изделие', render: (r) => h('div', null, h('b', null, r.cipher), h('div', { class: 'dim', style: { fontSize: '12px' } }, r.product_name)) },
          { title: 'План, шт.', align: 'r', render: (r) => fmt(r.Release_plan, 0) },
          { title: 'Примечание', render: (r) => r.Note ?? '—', cls: 'dim' },
          ...(write ? [{ title: '', align: 'r' as const, render: (r: any) => h('div', { class: 'row-actions' },
            iconBtn('pencil', 'Изменить', () => itemForm(p.PK_Production_program, r)),
            iconBtn('trash', 'Удалить', async () => {
              if (!(await confirmBox('Убрать позицию?', r.cipher))) return;
              await del(`/program-items/${r.PK_Production_program_item}`); toast('Удалено'); await reload();
            }, 'danger')) }] : []),
        ], p.itemsList, { empty: 'Позиций нет', emptyHint: 'Добавьте изделия и плановый выпуск.' }),
      ], { sub: `${p.status_name} · сформирована ${fmtDate(p.Generation_date)}${p.author ? ' · ' + p.author : ''}`,
        actions: [
          write && btn('Позиция', () => itemForm(p.PK_Production_program), '', 'plus'),
          write && iconBtn('pencil', 'Изменить программу', () => progForm(p)),
          write && iconBtn('trash', 'Удалить программу', async () => {
            if (!(await confirmBox('Удалить программу?', p.Program_code))) return;
            try { await del(`/programs/${p.PK_Production_program}`); sel = null; toast('Удалено'); await reload(); } catch (e: any) { toast(e.message, 'err'); }
          }, 'danger'),
        ] }),
      h('div', { style: { marginTop: '18px' } }, card('Потребность в материалах', [
        table([
          { title: 'Материал', render: (r) => h('div', null, h('b', null, r.material_name), h('div', { class: 'mono dim', style: { fontSize: '12px' } }, r.code)) },
          { title: 'Ед.', render: (r) => r.unit_name },
          { title: 'Потребность', align: 'r', render: (r) => fmt(r.Standard_quantity, 1) },
          { title: 'Остаток', align: 'r', render: (r) => fmt(r.Current_balance, 0) },
          { title: 'Заказать', align: 'r', render: (r) => (r.Required_quantity > 0 ? badge(fmt(r.Required_quantity, 0), 'warn') : badge('хватает', 'ok')) },
        ], req, { empty: 'Потребность не рассчитана', emptyHint: 'Нажмите «Рассчитать потребность» — листы округляются вверх.' }),
      ], { sub: 'Сводная норма × план выпуска, минус остаток на складе.',
        actions: [
          can('requirements:calc') && btn('Рассчитать потребность', async () => {
            if (!p.itemsList.length) return toast('Добавьте позиции в программу', 'err');
            try { await post(`/calc/requirements/${p.PK_Production_program}`); toast('Потребность рассчитана'); await drawMain(); } catch (e: any) { toast(e.message, 'err'); }
          }, 'primary', 'calc'),
          req.length ? btn('Документ', () => go('docs', { doc: 'requirements', program: p.PK_Production_program }), '', 'print') : null,
        ].filter(Boolean) as Node[] })));
  }

  function drawSide() {
    side.replaceChildren(card(null, h('div', { class: 'pick' }, ...list.map((p) =>
      h('button', { 'aria-pressed': String(p.PK_Production_program === sel), onclick: async () => { sel = p.PK_Production_program; drawSide(); await drawMain(); } },
        h('b', null, `${MONTHS[p.Month - 1]} ${p.Year}`), h('small', null, `${p.Program_code} · ${p.items} поз. · ${p.status_name}${p.calculated ? ' · рассчитана' : ''}`))))));
    if (!list.length) side.replaceChildren(card(null, h('div', { class: 'empty' }, 'Нет программ')));
  }
  async function reload() {
    list = await get('/programs');
    if (sel && !list.some((p) => p.PK_Production_program === sel)) sel = list[0]?.PK_Production_program ?? null;
    if (!sel) sel = list[0]?.PK_Production_program ?? null;
    drawSide();
    await drawMain();
  }
  root.append(pageHead('Программы', 'Производственная программа на месяц и расчёт потребности в материалах.', write ? [btn('Новая программа', () => progForm(), 'primary', 'plus')] : []), h('div', { class: 'split' }, side, main));
  drawSide();
  await drawMain();
  void statusBadge;
}
