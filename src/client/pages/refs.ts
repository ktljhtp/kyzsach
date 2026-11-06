import { crudView } from '../crud';
import { can, lookup } from '../state';
import { Field, fmt, fmtDate, h, money, Opt, pageHead, segmented } from '../ui';

const opts = (rows: any[], pk: string, label = 'Name'): Opt[] => rows.map((r) => ({ value: r[pk], label: r[label] }));
const nameDesc = (pk: string) => ({
  idKey: pk,
  columns: [
    { title: 'Наименование', render: (r: any) => h('b', null, r.Name) },
    { title: 'Описание', render: (r: any) => r.Description ?? '—', cls: 'dim' },
  ],
  fields: (): Field[] => [
    { name: 'Name', label: 'Наименование', required: true },
    { name: 'Description', label: 'Описание', type: 'textarea' },
  ],
});

interface Section { key: string; label: string; make: () => ReturnType<typeof crudView<any>> }

export async function refs(root: HTMLElement) {
  const w = can('ref:write');
  const sections: Section[] = [
    { key: 'suppliers', label: 'Поставщики', make: () => crudView<any>({
        endpoint: '/dict/suppliers', idKey: 'PK_Supplier', entity: 'поставщик', canWrite: w, invalidates: ['/dict/suppliers'],
        columns: [
          { title: 'Наименование', render: (r) => h('b', null, r.Name) },
          { title: 'ИНН', render: (r) => r.INN ?? '—', cls: 'mono' },
          { title: 'Телефон', render: (r) => r.Phone_number ?? '—' },
          { title: 'Адрес', render: (r) => r.Address ?? '—', cls: 'dim' },
        ],
        fields: () => [
          { name: 'Name', label: 'Наименование', required: true },
          { name: 'INN', label: 'ИНН' },
          { name: 'Phone_number', label: 'Телефон' },
          { name: 'Address', label: 'Адрес', type: 'textarea' },
        ] }) },
    { key: 'prices', label: 'Цены поставщиков', make: () => crudView<any>({
        endpoint: '/prices', idKey: 'id', entity: 'цена', canWrite: w, invalidates: ['/materials', '/prices'], wide: true,
        toValues: (r) => ({ ...r, as_of: r.as_of }),
        columns: [
          { title: 'Материал', render: (r) => h('div', null, h('b', null, r.material_name), h('div', { class: 'mono dim' }, r.Material_code)) },
          { title: 'Поставщик', render: (r) => r.supplier_name },
          { title: 'Цена', align: 'r', render: (r) => money(r.Price) },
          { title: 'На дату', render: (r) => fmtDate(r.as_of) },
          { title: 'Примечание', render: (r) => r.Note ?? '—', cls: 'dim' },
        ],
        fields: async (row) => {
          const [m, s] = await Promise.all([lookup('/materials'), lookup('/dict/suppliers')]);
          return [
            { name: 'PK_Material', label: 'Материал', type: 'select', options: m.map((x: any) => ({ value: x.PK_Material, label: `${x.Material_code} — ${x.Name}` })), required: true, disabled: !!row },
            { name: 'PK_Supplier', label: 'Поставщик', type: 'select', options: opts(s, 'PK_Supplier'), required: true, disabled: !!row },
            { name: 'Price', label: 'Цена, ₽', type: 'number', step: '0.01', required: true },
            { name: 'as_of', label: 'На дату', type: 'date' },
            { name: 'Note', label: 'Примечание', type: 'textarea' },
          ] as Field[];
        } }) },
    { key: 'edge', label: 'Нормы расхода кромки', make: () => crudView<any>({
        endpoint: '/edge-rates', idKey: 'PK_Edge_banding_consumption_rate', entity: 'норматив кромки', canWrite: w, invalidates: ['/edge-rates'],
        columns: [
          { title: 'Тип кромки', render: (r) => h('b', null, r.edge_name ?? '—') },
          { title: 'Расход рулона на 1 пог. м', align: 'r', render: (r) => fmt(r.Roll_consumption_per_linear_meter_of_edge, 4) },
          { title: 'Коэф. потерь', align: 'r', render: (r) => fmt(r.Loss_coefficient, 3) },
          { title: 'Описание', render: (r) => r.Description ?? '—', cls: 'dim' },
        ],
        fields: async () => [
          { name: 'PK_Edge_type', label: 'Тип кромки', type: 'select', options: opts(await lookup('/dict/edge-types'), 'PK_Edge_type'), required: true },
          { name: 'Roll_consumption_per_linear_meter_of_edge', label: 'Расход на 1 пог. м', type: 'number', required: true },
          { name: 'Loss_coefficient', label: 'Коэффициент потерь', type: 'number', required: true, hint: 'Обычно 1,02–1,08' },
          { name: 'Description', label: 'Описание', type: 'textarea' },
        ] as Field[] }) },
    { key: 'edge-types', label: 'Типы кромки', make: () => crudView<any>({
        endpoint: '/dict/edge-types', idKey: 'PK_Edge_type', entity: 'тип кромки', canWrite: w, invalidates: ['/dict/edge-types'],
        columns: [{ title: 'Наименование', render: (r) => h('b', null, r.Name) }, { title: 'Толщина, мм', align: 'r', render: (r) => fmt(r.Thickness) }, { title: 'Описание', render: (r) => r.Description ?? '—', cls: 'dim' }],
        fields: () => [{ name: 'Name', label: 'Наименование', required: true }, { name: 'Thickness', label: 'Толщина, мм', type: 'number' }, { name: 'Description', label: 'Описание', type: 'textarea' }] }) },
    { key: 'formats', label: 'Форматы плит', make: () => crudView<any>({
        endpoint: '/dict/tile-formats', idKey: 'PK_Tile_format', entity: 'формат плиты', canWrite: w, invalidates: ['/dict/tile-formats'],
        columns: [{ title: 'Наименование', render: (r) => h('b', null, r.Name) }, { title: 'Длина, мм', align: 'r', render: (r) => fmt(r.Length, 0) }, { title: 'Ширина, мм', align: 'r', render: (r) => fmt(r.Width, 0) },
          { title: 'Площадь, м²', align: 'r', render: (r) => fmt((r.Length * r.Width) / 1e6, 3) }],
        fields: () => [{ name: 'Name', label: 'Наименование', required: true }, { name: 'Length', label: 'Длина, мм', type: 'number', required: true }, { name: 'Width', label: 'Ширина, мм', type: 'number', required: true }] }) },
    { key: 'units', label: 'Единицы измерения', make: () => crudView<any>({ endpoint: '/dict/units', entity: 'единица', canWrite: w, invalidates: ['/dict/units'], ...nameDesc('PK_Units_of_measurement') }) },
    { key: 'types', label: 'Типы материалов', make: () => crudView<any>({ endpoint: '/dict/material-types', entity: 'тип', canWrite: w, invalidates: ['/dict/material-types'], ...nameDesc('PK_Type_material') }) },
    { key: 'colors', label: 'Цвета', make: () => crudView<any>({ endpoint: '/dict/colors', entity: 'цвет', canWrite: w, invalidates: ['/dict/colors'], ...nameDesc('PK_Color_of_material') }) },
    { key: 'textures', label: 'Текстуры', make: () => crudView<any>({ endpoint: '/dict/textures', entity: 'текстура', canWrite: w, invalidates: ['/dict/textures'], ...nameDesc('PK_Material_texture') }) },
    { key: 'statuses', label: 'Статусы документов', make: () => crudView<any>({ endpoint: '/dict/statuses', entity: 'статус', canWrite: can('admin'), invalidates: ['/dict/statuses'], ...nameDesc('PK_Document_status') }) },
  ];

  const holder = h('div');
  let cur: ReturnType<Section['make']> | null = null;
  const show = async (key: string) => {
    holder.replaceChildren();
    cur = sections.find((s) => s.key === key)!.make();
    holder.append(cur.el);
    await cur.reload();
  };
  root.append(
    pageHead('Справочники', 'Поставщики, цены, нормативы расхода кромки и классификаторы.'),
    h('div', { style: { marginBottom: '14px' } }, segmented(sections.map((s) => ({ value: s.key, label: s.label })), 'suppliers', show)),
    holder,
  );
  await show('suppliers');
}
