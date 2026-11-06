import { crudView } from '../crud';
import { can, lookup } from '../state';
import { badge, Field, fmt, h, money, Opt, pageHead, segmented } from '../ui';

const opts = (rows: any[], pk: string, label = 'Name'): Opt[] => rows.map((r) => ({ value: r[pk], label: r[label] }));

export async function materials(root: HTMLElement) {
  let type = 0;
  const view = crudView<any>({
    endpoint: '/materials', idKey: 'PK_Material', entity: 'материал', canWrite: can('ref:write'),
    rowLabel: (r) => `${r.Material_code} — ${r.Name}`,
    filter: (r) => !type || r.PK_Type_material === type,
    invalidates: ['/materials'], wide: true,
    columns: [
      { title: 'Код', render: (r) => h('span', { class: 'mono' }, r.Material_code) },
      { title: 'Наименование', render: (r) => h('div', null, h('b', null, r.Name), h('div', { class: 'dim', style: { fontSize: '12px' } }, [r.color_name, r.texture_name].filter(Boolean).join(' · '))) },
      { title: 'Тип', render: (r) => badge(r.type_name ?? '—', 'info') },
      { title: 'Ед.', render: (r) => r.unit_name ?? '—' },
      { title: 'Формат / рулон', render: (r) => r.format_name ?? (r.Roll_length ? `рулон ${r.Roll_length} м` : '—') },
      { title: 'Цена', align: 'r', render: (r) => money(r.Base_price) },
      { title: 'Мин. у поставщиков', align: 'r', render: (r) => (r.min_price != null ? money(r.min_price) : '—') },
      { title: 'Остаток', align: 'r', render: (r) => fmt(r.Current_balance, 0) },
    ],
    fields: async () => {
      const [t, u, c, x, f, e] = await Promise.all(['/dict/material-types', '/dict/units', '/dict/colors', '/dict/textures', '/dict/tile-formats', '/dict/edge-types'].map(lookup));
      return [
        { name: 'Material_code', label: 'Код', required: true, hint: 'Уникальный код, например ЛДСП16Б' },
        { name: 'Name', label: 'Наименование', required: true },
        { name: 'PK_Type_material', label: 'Тип', type: 'select', options: opts(t, 'PK_Type_material'), required: true },
        { name: 'PK_Units_of_measurement', label: 'Единица измерения', type: 'select', options: opts(u, 'PK_Units_of_measurement'), required: true },
        { name: 'PK_Color_of_material', label: 'Цвет', type: 'select', options: opts(c, 'PK_Color_of_material') },
        { name: 'PK_Material_texture', label: 'Текстура', type: 'select', options: opts(x, 'PK_Material_texture') },
        { name: 'PK_Tile_format', label: 'Формат плиты', type: 'select', options: opts(f, 'PK_Tile_format'), hint: 'Для плитных материалов' },
        { name: 'PK_Edge_type', label: 'Тип кромки', type: 'select', options: opts(e, 'PK_Edge_type'), hint: 'Для кромочных материалов' },
        { name: 'Thickness', label: 'Толщина, мм', type: 'number' },
        { name: 'Sheet_area', label: 'Площадь листа, м²', type: 'number' },
        { name: 'Roll_length', label: 'Длина рулона, м', type: 'number' },
        { name: 'Base_price', label: 'Цена за единицу, ₽', type: 'number', step: '0.01' },
        { name: 'Current_balance', label: 'Остаток на складе', type: 'number' },
      ] as Field[];
    },
  });
  const types = await lookup('/dict/material-types');
  root.append(
    pageHead('Материалы', 'Единый справочник: у каждого материала один код и одно наименование для всех подразделений.'),
    h('div', { style: { marginBottom: '14px' } },
      segmented([{ value: 0, label: 'Все' }, ...types.map((t: any) => ({ value: t.PK_Type_material, label: t.Name }))], 0, (v) => { type = v; view.reload(); })),
    view.el,
  );
  await view.reload();
}
