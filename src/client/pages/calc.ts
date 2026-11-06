import { get, post } from '../api';
import { can, invalidate, lookup } from '../state';
import { current, go } from '../router';
import { productHistorySheet } from '../workflow';
import { badge, btn, card, confirmBox, fmt, h, icon, money, pageHead, statusBadge, table, toast } from '../ui';

export async function calc(root: HTMLElement) {
  const prods: any[] = await lookup('/products');
  let pid = Number(current().params.get('product')) || prods[0]?.PK_Finished_product;
  const holder = h('div');

  async function load() {
    holder.replaceChildren();
    if (!pid) { holder.append(card(null, h('div', { class: 'empty' }, h('b', null, 'Нет изделий'), 'Сначала создайте изделие.'))); return; }
    const [d, miss] = await Promise.all([get(`/calc/summary/${pid}`), get(`/calc/completeness?product=${pid}`)]);
    const p = d.product;
    const consolidate = async () => {
      const r = await post(`/calc/consolidate/${pid}`);
      invalidate('/products', '/norms');
      toast(`Консолидировано норм: ${r.count}. Они сохранены как черновики.`);
      await load();
    };
    holder.append(
      p.Needs_recalc
        ? h('div', { class: 'banner' }, icon('alert'), h('div', { class: 'grow' }, 'С момента последней консолидации размеры деталей, карты раскроя или нормы изменились. Сводные нормы изделия нужно пересчитать.'),
            can('norm:consolidate') && btn('Консолидировать', consolidate, 'primary', 'refresh'))
        : h('div', { class: 'banner ok' }, icon('check'), h('div', { class: 'grow' }, 'Сводные нормы актуальны.'),
            can('norm:consolidate') && btn('Пересчитать', async () => { if (await confirmBox('Пересчитать сводные нормы?', 'Прежние сводные нормы сохранятся в истории, новые станут черновиками.', 'Пересчитать', false)) await consolidate(); }, '', 'refresh')));

    const stored = (r: any) => (r.stored ? h('span', null, statusBadge(r.stored.status_id, r.stored.status_name), ' ', h('span', { class: 'dim' }, `${r.stored.version}`)) : h('span', { class: 'dim' }, 'не сохранена'));
    holder.append(card('Сводная норма на изделие', [
      table([
        { title: 'Материал', render: (r) => h('div', null, h('b', null, r.name), h('div', { class: 'mono dim', style: { fontSize: '12px' } }, r.code)) },
        { title: 'Тип', render: (r) => r.type_name, cls: 'dim' },
        { title: 'Ед.', render: (r) => r.unit },
        { title: 'Норма', align: 'r', render: (r) => fmt(r.norm, 4) },
        { title: 'Цена', align: 'r', render: (r) => h('span', { title: 'Источник цены: ' + r.price_source }, money(r.price)) },
        { title: 'Стоимость', align: 'r', render: (r) => money(r.cost) },
        { title: 'Сохранённая норма', render: stored },
      ], d.rows, { empty: 'Сводная норма не рассчитывается', emptyHint: 'Утвердите карты раскроя и нормы деталей — они попадают в расчёт только в статусе «Утверждён».' }),
      d.rows.length ? h('div', { class: 'list-row', style: { justifyContent: 'flex-end', gap: '24px' } }, h('span', { class: 'dim' }, 'Материальная себестоимость'), h('b', null, money(d.total))) : null,
    ], { sub: 'Расчёт по дереву входимости: подетальная норма × вхождения, суммирование по материалам.',
      actions: [btn('История изменений', () => productHistorySheet(pid, p.Cipher), '', 'clock'), btn('Документы', () => go('docs'), '', 'print')] }));

    holder.append(h('div', { class: 'grid2', style: { marginTop: '18px' } },
      card('Карты раскроя изделия', d.kim.length
        ? table([
            { title: 'Карта', render: (r) => h('b', { class: 'mono' }, r.code) },
            { title: 'Материал', render: (r) => r.material_name },
            { title: 'КИМ', align: 'r', render: (r) => badge(`${fmt(r.kim, 1)}%`, r.kim >= 80 ? 'ok' : r.kim >= 70 ? 'warn' : 'bad') },
          ], d.kim, { onRow: () => go('layouts') })
        : h('div', { class: 'empty' }, h('b', null, 'Утверждённых карт нет'), '')),
      card('Контроль полноты', miss.length
        ? table([
            { title: 'Деталь', render: (r) => h('div', null, h('b', null, r.name), h('div', { class: 'dim', style: { fontSize: '12px' } }, `${r.cipher} · ${r.unit_name}`)) },
            { title: 'Не задано', render: (r) => h('span', null, r.is_sheet && !r.has_layout ? badge('карта раскроя', 'bad') : null, ' ', !r.has_norm ? badge('подетальная норма', 'warn') : null) },
          ], miss)
        : h('div', { class: 'empty' }, h('b', null, 'Всё задано'), 'У каждой детали есть утверждённая норма и (для плит) карта раскроя.'),
        { sub: 'Детали без утверждённой нормы или карты раскроя.' })));
  }

  const picker = h('select', { class: 'input', 'aria-label': 'Изделие', style: { width: 'auto', minWidth: '240px' } },
    ...prods.map((p: any) => h('option', { value: p.PK_Finished_product }, `${p.Cipher} · ${p.Name}${p.Needs_recalc ? ' •' : ''}`)));
  if (pid) picker.value = String(pid);
  picker.addEventListener('change', async () => { pid = Number(picker.value); await load(); });
  root.append(pageHead('Расчёт норм', 'Консолидация сводных норм по дереву изделия и материальная себестоимость.', [picker]), holder);
  await load();
}
