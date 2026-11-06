import { del, get, post, put } from '../api';
import { can, invalidate, lookup } from '../state';
import { badge, btn, card, confirmBox, Field, fmt, fmtDate, formSheet, h, icon, iconBtn, Opt, pageHead, toast } from '../ui';

export async function products(root: HTMLElement) {
  const write = can('ref:write');
  let list: any[] = await get('/products');
  let sel: number | null = list[0]?.PK_Finished_product ?? null;
  const side = h('div');
  const main = h('div');

  const matOpts = async (): Promise<Opt[]> => (await lookup('/materials')).map((m: any) => ({ value: m.PK_Material, label: `${m.Material_code} — ${m.Name}` }));

  const productForm = (row?: any) =>
    formSheet({
      title: row ? 'Изменить изделие' : 'Новое изделие',
      fields: [
        { name: 'Cipher', label: 'Шифр', required: true, hint: 'Например СТ-01' },
        { name: 'Name', label: 'Наименование', required: true },
        { name: 'Description', label: 'Описание', type: 'textarea' },
      ],
      values: row ?? {},
      onSubmit: async (v) => {
        const r = row ? await put(`/products/${row.PK_Finished_product}`, v) : await post('/products', v);
        toast('Сохранено');
        sel = row ? sel : r.PK_Finished_product;
        await reload();
      },
    });

  const unitForm = async (productId: number, row?: any, parent?: any) => {
    const all: any[] = await get('/assemblies');
    const parents = all.filter((u) => u.PK_Finished_product === productId && (!row || u.PK_Assembly_unit !== row.PK_Assembly_unit));
    formSheet({
      title: row ? 'Изменить сборочную единицу' : 'Новая сборочная единица',
      wide: true,
      fields: [
        { name: 'Cipher', label: 'Шифр', required: true },
        { name: 'Name', label: 'Наименование', required: true },
        { name: 'FK_PK_Assembly_unit', label: 'Входит в узел', type: 'select', options: parents.map((u) => ({ value: u.PK_Assembly_unit, label: `${u.Cipher} ${u.Name}` })), hint: 'Пусто — входит прямо в изделие' },
        { name: 'Number_of_occurrences', label: 'Вхождений в вышестоящий узел', type: 'number', required: true },
        { name: 'Length', label: 'Длина, мм', type: 'number' },
        { name: 'Width', label: 'Ширина, мм', type: 'number' },
        { name: 'Height', label: 'Высота, мм', type: 'number' },
        { name: 'Description', label: 'Описание', type: 'textarea' },
      ],
      values: row ?? { Number_of_occurrences: 1, FK_PK_Assembly_unit: parent?.PK_Assembly_unit },
      onSubmit: async (v) => {
        if (row) await put(`/assemblies/${row.PK_Assembly_unit}`, v);
        else await post('/assemblies', { ...v, PK_Finished_product: productId });
        toast('Сохранено');
        invalidate('/details');
        await drawMain();
        list = await get('/products');
        drawSide();
      },
    });
  };

  const detailForm = async (unit: any, row?: any) => {
    formSheet({
      title: row ? 'Изменить деталь' : `Новая деталь — ${unit.Name}`,
      wide: true,
      fields: [
        { name: 'Cipher', label: 'Шифр', required: true },
        { name: 'Name', label: 'Наименование', required: true },
        { name: 'PK_Material', label: 'Материал', type: 'select', options: await matOpts(), required: true },
        { name: 'Number_of_occurrences', label: 'Вхождений в узел', type: 'number', required: true },
        { name: 'Length', label: 'Длина, мм', type: 'number', required: true },
        { name: 'Width', label: 'Ширина, мм', type: 'number', required: true },
        { name: 'Height', label: 'Толщина, мм', type: 'number' },
        { name: 'Length_of_edges_to_be_veneered', label: 'Длина кромляемых торцов, мм', type: 'number', hint: 'Нужна для нормы расхода кромки' },
        { name: 'Description', label: 'Описание', type: 'textarea' },
      ],
      values: row ?? { Number_of_occurrences: 1, Height: 16 },
      onSubmit: async (v) => {
        if (row) await put(`/details/${row.PK_Detail}`, { ...v, PK_Assembly_unit: row.PK_Assembly_unit });
        else await post('/details', { ...v, PK_Assembly_unit: unit.PK_Assembly_unit });
        toast(row ? 'Сохранено. Вышестоящие узлы помечены на перерасчёт.' : 'Деталь добавлена');
        invalidate('/details');
        await drawMain();
        list = await get('/products');
        drawSide();
      },
    });
  };

  const node = (u: any, productId: number): HTMLElement => {
    const kids = h('div', { class: 'kids' });
    const chev = h('button', { class: 'chev', 'aria-expanded': 'true', 'aria-label': 'Свернуть', onclick: () => {
      const open = chev.getAttribute('aria-expanded') !== 'true';
      chev.setAttribute('aria-expanded', String(open));
      kids.hidden = !open;
    } }, icon('chevron'));
    const dims = [u.Length, u.Width, u.Height].filter(Boolean).join('×');
    const row = h('div', { class: 'node' }, chev,
      h('span', { class: 'tag' }, 'Узел'),
      h('div', { class: 't' }, h('b', null, u.Name), h('small', null, `${u.Cipher}${dims ? ' · ' + dims + ' мм' : ''} · ×${u.Number_of_occurrences}`)),
      u.Needs_recalc && badge('Перерасчёт', 'warn'),
      write && h('div', { class: 'row-actions' },
        iconBtn('plus', 'Добавить деталь', () => detailForm(u)),
        iconBtn('layers', 'Добавить вложенный узел', () => unitForm(productId, undefined, u)),
        iconBtn('pencil', 'Изменить узел', () => unitForm(productId, u)),
        iconBtn('trash', 'Удалить узел', async () => {
          if (!(await confirmBox('Удалить сборочную единицу?', `«${u.Name}» и её состав. Если у деталей есть нормы или карты раскроя, удаление будет отклонено.`))) return;
          try { await del(`/assemblies/${u.PK_Assembly_unit}`); toast('Удалено'); await drawMain(); } catch (e: any) { toast(e.message, 'err'); }
        }, 'danger')));
    for (const d of u.details)
      kids.append(h('div', { class: 'node detail' }, h('span', { style: { width: '24px' } }), h('span', { class: 'tag' }, 'Деталь'),
        h('div', { class: 't' }, h('b', null, d.Name), h('small', null, `${d.Cipher} · ${d.Length}×${d.Width}×${d.Height ?? '—'} мм · ${d.material_name ?? 'материал не задан'} · кромка ${fmt(d.Length_of_edges_to_be_veneered, 0)} мм · ×${d.Number_of_occurrences}`)),
        write && h('div', { class: 'row-actions' },
          iconBtn('pencil', 'Изменить деталь', () => detailForm(u, d)),
          iconBtn('trash', 'Удалить деталь', async () => {
            if (!(await confirmBox('Удалить деталь?', `«${d.Name}»`))) return;
            try { await del(`/details/${d.PK_Detail}`); toast('Удалено'); await drawMain(); } catch (e: any) { toast(e.message, 'err'); }
          }, 'danger'))));
    for (const c of u.children) kids.append(node(c, productId));
    return h('div', null, row, kids);
  };

  async function drawMain() {
    main.replaceChildren();
    if (!sel) { main.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('b', null, 'Изделий пока нет'), 'Создайте первое изделие.'))); return; }
    const t = await get(`/products/${sel}/tree`);
    const p = t.product;
    const head = h('div', { class: 'card-head' },
      h('div', null, h('h2', null, `${p.Cipher} · ${p.Name}`), h('p', null, `${p.Description ?? ''} Создано ${fmtDate(p.Creation_date)}`)),
      h('div', { class: 'actions' },
        p.Needs_recalc && badge('Нужен перерасчёт', 'warn'),
        write && btn('Узел', () => unitForm(p.PK_Finished_product), '', 'plus'),
        write && iconBtn('pencil', 'Изменить изделие', () => productForm(p)),
        write && iconBtn('trash', 'Удалить изделие', async () => {
          if (!(await confirmBox('Удалить изделие?', `«${p.Name}» со всем составом.`))) return;
          try { await del(`/products/${p.PK_Finished_product}`); sel = null; toast('Удалено'); await reload(); } catch (e: any) { toast(e.message, 'err'); }
        }, 'danger')));
    main.append(h('section', { class: 'card' }, head,
      t.units.length ? h('div', { class: 'tree' }, ...t.units.map((u: any) => node(u, p.PK_Finished_product)))
        : h('div', { class: 'empty' }, h('b', null, 'Состав не задан'), 'Добавьте сборочные единицы и детали.')));
  }

  function drawSide() {
    side.replaceChildren(h('section', { class: 'card' }, h('div', { class: 'pick' },
      ...list.map((p) => h('button', { 'aria-pressed': String(p.PK_Finished_product === sel), onclick: async () => { sel = p.PK_Finished_product; drawSide(); await drawMain(); } },
        h('b', null, `${p.Cipher} · ${p.Name}`), h('small', null, `${p.units} узлов · ${p.details} деталей${p.Needs_recalc ? ' · нужен перерасчёт' : ''}`))))));
  }

  async function reload() {
    list = await get('/products');
    if (sel && !list.some((p) => p.PK_Finished_product === sel)) sel = list[0]?.PK_Finished_product ?? null;
    drawSide();
    await drawMain();
  }

  root.append(
    pageHead('Изделия', 'Дерево входимости: изделие → сборочные единицы → детали. Изменение размеров детали помечает вышестоящие узлы на перерасчёт.',
      write ? [btn('Новое изделие', () => productForm(), 'primary', 'plus')] : []),
    h('div', { class: 'split' }, side, main),
  );
  drawSide();
  await drawMain();
  void card;
}
