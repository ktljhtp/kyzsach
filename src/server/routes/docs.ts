import { Router } from 'express';
import { docToXlsx, DocDef } from '../export';
import { one, q } from '../db';
import { a, HttpError, int, need, num, round } from '../http';
import { periodDate } from './fact';
import { summaryRows } from './calc';

export const docsRouter = Router();

const ruDate = (d: string | Date | null | undefined) => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const [y, m, dd] = s.split('-');
  return `${dd}.${m}.${y}`;
};
const today = () => ruDate(new Date().toISOString());
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

async function product(id: any) {
  const p = await one(`SELECT * FROM "Finished_product" WHERE "PK_Finished_product" = $1`, [need(int(id), 'Изделие')]);
  if (!p) throw new HttpError(404, 'Изделие не найдено.');
  return p;
}

// 1. Сводная ведомость норм расхода материалов на изделие
async function summarySheet(query: any): Promise<DocDef> {
  const p = await product(query.product);
  const rows = await summaryRows(p.PK_Finished_product);
  const kim = await q(
    `SELECT cl."PK_Material" m, AVG(k.kim_percent) kim
     FROM "Cutting_layout" cl JOIN v_kim k ON k."PK_Cutting_layout" = cl."PK_Cutting_layout"
     WHERE cl."PK_Document_status" = 3 AND EXISTS (
       SELECT 1 FROM "Cutting_layout_position" pos JOIN "Detail" d ON d."PK_Detail" = pos."PK_Detail"
       JOIN "Assembly_unit" au ON au."PK_Assembly_unit" = d."PK_Assembly_unit"
       WHERE pos."PK_Cutting_layout" = cl."PK_Cutting_layout" AND au."PK_Finished_product" = $1)
     GROUP BY cl."PK_Material"`,
    [p.PK_Finished_product],
  );
  const kimBy = new Map(kim.map((k) => [k.m, round(k.kim, 1)]));
  const ver = await one(
    `SELECT MAX("Version") v, MAX("Date") d, MIN("PK_Document_status") s FROM "Consumption_rate"
     WHERE "PK_Finished_product" = $1 AND "PK_Detail" IS NULL AND "PK_Assembly_unit" IS NULL`,
    [p.PK_Finished_product],
  );
  const meta: [string, string][] = [
    ['Изделие', `${p.Name} ${p.Cipher}`],
    ['Версия норм', ver?.v ? `${ver.v} от ${ruDate(ver.d)}` : 'сводная норма не консолидирована'],
  ];
  if (p.Needs_recalc) meta.push(['Внимание', 'после последней консолидации данные изменились — выполните перерасчёт']);
  return {
    type: 'summary-sheet',
    title: 'Сводная ведомость норм расхода материалов на изделие',
    filename: `Сводная ведомость ${p.Cipher}`,
    meta,
    columns: [
      { key: 'n', title: '№', type: 'int', width: 6 },
      { key: 'name', title: 'Материал', width: 34 },
      { key: 'unit', title: 'Ед. изм.', width: 12 },
      { key: 'norm', title: 'Норма на изделие', type: 'num', digits: 4 },
      { key: 'kim', title: 'КИМ, %', type: 'pct', digits: 1 },
    ],
    rows: rows.map((r, i) => ({ n: i + 1, name: r.name, unit: r.unit, norm: r.norm, kim: kimBy.get(r.pk_material) ?? null })),
    signatures: ['Технолог', 'Проверил'],
  };
}

// 2. План потребности в материалах на программу
async function requirements(query: any): Promise<DocDef> {
  const id = need(int(query.program), 'Программа');
  const p = await one(`SELECT * FROM "Production_program" WHERE "PK_Production_program" = $1`, [id]);
  if (!p) throw new HttpError(404, 'Программа не найдена.');
  const items = await q(
    `SELECT f."Cipher" c, i."Release_plan" r FROM "Production_program_item" i JOIN "Finished_product" f ON f."PK_Finished_product" = i."PK_Finished_product"
     WHERE i."PK_Production_program" = $1 ORDER BY i."PK_Production_program_item"`, [id]);
  const rows = await q(
    `SELECT m."Material_code" code, m."Name" name, u."Name" unit, r."Standard_quantity" need, r."Current_balance" bal,
            r."Required_quantity" ord, r."Calculation_date" cd
     FROM "Material_requirements" r JOIN "Material" m ON m."PK_Material" = r."PK_Material"
     LEFT JOIN "Units_of_measurement" u ON u."PK_Units_of_measurement" = m."PK_Units_of_measurement"
     WHERE r."PK_Production_program" = $1 ORDER BY m."PK_Type_material", m."Name"`, [id]);
  return {
    type: 'requirements',
    title: 'План потребности в материалах',
    subtitle: `на ${MONTHS[p.Month - 1]} ${p.Year} г.`,
    filename: `План потребности ${p.Program_code}`,
    meta: [
      ['Программа выпуска', items.map((i) => `${i.c} — ${i.r} шт.`).join('; ') || '—'],
      ['Расчёт от', rows[0] ? ruDate(rows[0].cd) : 'не выполнен'],
    ],
    columns: [
      { key: 'code', title: 'Код', width: 14 },
      { key: 'name', title: 'Материал', width: 30 },
      { key: 'unit', title: 'Ед. изм.', width: 10 },
      { key: 'need', title: 'Потребность на прогр.', type: 'num', digits: 1 },
      { key: 'bal', title: 'Остаток на складе', type: 'int' },
      { key: 'ord', title: 'Итого заказать', type: 'int' },
    ],
    rows,
    notes: rows.length ? [] : ['Потребность ещё не рассчитана — нажмите «Рассчитать потребность» в разделе «Программы».'],
    signatures: ['Начальник ПЭО', 'Начальник ОМТС'],
  };
}

// 3. Лимитно-заборная карта
async function limitCard(query: any): Promise<DocDef> {
  const p = await product(query.product);
  const batch = need(num(query.batch), 'Размер партии');
  if (batch <= 0) throw new HttpError(400, 'Размер партии должен быть больше нуля.');
  const rows = await summaryRows(p.PK_Finished_product);
  const piece = ['лист', 'шт', 'комплект', 'рулон'];
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return {
    type: 'limit-card',
    title: `Лимитно-заборная карта № ЛЗК-${p.Cipher}-${stamp}`,
    filename: `ЛЗК ${p.Cipher} ${batch} шт`,
    meta: [
      ['Цех', String(query.workshop || 'Мебельный')],
      ['Изделие', `${p.Cipher} ${p.Name}`],
      ['Партия', `${batch} шт.`],
      ['Дата выдачи', today()],
    ],
    columns: [
      { key: 'n', title: '№', type: 'int', width: 6 },
      { key: 'name', title: 'Материал', width: 34 },
      { key: 'unit', title: 'Ед. изм.', width: 12 },
      { key: 'limit', title: 'Лимит на партию', type: 'num', digits: 3 },
      { key: 'issued', title: 'Выдано (склад)', width: 18 },
    ],
    rows: rows.map((r, i) => ({
      n: i + 1, name: r.name, unit: r.unit,
      limit: piece.includes(r.unit) ? Math.ceil(r.norm * batch - 1e-9) : round(r.norm * batch, 3),
      issued: '',
    })),
    signatures: ['Мастер цеха', 'Кладовщик'],
  };
}

// 4. Калькуляция материальной себестоимости
async function costing(query: any): Promise<DocDef> {
  const p = await product(query.product);
  const rows = await summaryRows(p.PK_Finished_product);
  const total = round(rows.reduce((s, r) => s + (r.cost ?? 0), 0), 2);
  const ver = await one(
    `SELECT MAX("Version") v, MAX("Date") d FROM "Consumption_rate" WHERE "PK_Finished_product" = $1 AND "PK_Detail" IS NULL AND "PK_Assembly_unit" IS NULL`,
    [p.PK_Finished_product],
  );
  return {
    type: 'costing',
    title: 'Калькуляция материальной себестоимости',
    filename: `Калькуляция ${p.Cipher}`,
    meta: [
      ['Изделие', `${p.Name} ${p.Cipher}`],
      ['Версия норм', ver?.v ? `${ver.v} от ${ruDate(ver.d)}` : 'не консолидирована'],
    ],
    columns: [
      { key: 'n', title: '№', type: 'int', width: 6 },
      { key: 'name', title: 'Материал', width: 32 },
      { key: 'unit', title: 'Ед. изм.', width: 10 },
      { key: 'norm', title: 'Норма', type: 'num', digits: 4 },
      { key: 'price', title: 'Цена, руб.', type: 'num', digits: 2 },
      { key: 'cost', title: 'Сумма, руб.', type: 'num', digits: 2 },
    ],
    rows: rows.map((r, i) => ({ n: i + 1, name: r.name, unit: r.unit, norm: r.norm, price: r.price, cost: r.cost })),
    footer: [['Итого материальная себестоимость, руб.', total.toLocaleString('ru-RU', { minimumFractionDigits: 2 })]],
    notes: ['Цена — минимальная среди поставщиков; при её отсутствии используется базовая цена материала.'],
    signatures: ['Экономист'],
  };
}

// 5. Отчёт план-фактного анализа (запрос 4)
export async function planFactRows(period: string) {
  const rows = await q(
    `WITH out AS (SELECT "PK_Finished_product" p, "Quantity" qty FROM "Actual_output" WHERE "Period" = $1),
          plan AS (SELECT o.p, s.pk_material m, s.norm * o.qty AS plan FROM out o CROSS JOIN LATERAL fn_summary_norm(o.p) s),
          fact AS (SELECT "PK_Finished_product" p, "PK_Material" m, SUM("Quantity") fact,
                          string_agg(DISTINCT "Reason", '; ') reason
                   FROM "Actual_consumption" WHERE "Period" = $1 GROUP BY 1, 2)
     SELECT COALESCE(plan.p, fact.p) product_id, COALESCE(plan.m, fact.m) material_id,
            f."Cipher" cipher, m."Name" material, u."Name" unit, plan.plan, fact.fact, fact.reason
     FROM plan FULL JOIN fact ON fact.p = plan.p AND fact.m = plan.m
     JOIN "Finished_product" f ON f."PK_Finished_product" = COALESCE(plan.p, fact.p)
     JOIN "Material" m ON m."PK_Material" = COALESCE(plan.m, fact.m)
     LEFT JOIN "Units_of_measurement" u ON u."PK_Units_of_measurement" = m."PK_Units_of_measurement"
     ORDER BY f."Cipher", m."PK_Type_material", m."Name"`,
    [period],
  );
  return rows.map((r) => {
    const plan = r.plan === null ? null : round(r.plan, 3);
    const dev = plan && plan > 0 && r.fact !== null ? round((r.fact / plan - 1) * 100, 1) : null;
    return { ...r, plan, dev, _flag: dev !== null && dev > 5 };
  });
}

async function planFact(query: any): Promise<DocDef> {
  const period = periodDate(query.period);
  const rows = await planFactRows(period);
  const [y, m] = period.split('-').map(Number);
  const over = rows.filter((r) => r._flag);
  return {
    type: 'plan-fact',
    title: 'Отчёт план-фактного анализа',
    subtitle: `за ${MONTHS[m - 1]} ${y} г.`,
    filename: `План-факт ${y}-${String(m).padStart(2, '0')}`,
    meta: [['Порог перерасхода', '5%']],
    columns: [
      { key: 'cipher', title: 'Шифр', width: 12 },
      { key: 'material', title: 'Материал', width: 28 },
      { key: 'plan', title: 'Расход плановый', type: 'num', digits: 2 },
      { key: 'fact', title: 'Расход фактический', type: 'num', digits: 2 },
      { key: 'dev', title: 'Отклонение, %', type: 'pct', digits: 1 },
      { key: 'reason', title: 'Причина', width: 28 },
    ],
    rows,
    notes: over.length
      ? ['Перерасход более 5%:', ...over.map((r) => `• ${r.cipher}, ${r.material}: +${r.dev}%${r.reason ? ` (${r.reason})` : ''}`)]
      : rows.length ? ['Перерасхода более 5% нет.'] : ['За выбранный период нет данных о выпуске и расходе.'],
    signatures: ['Начальник ПЭО', 'Главный технолог'],
  };
}

const BUILDERS: Record<string, (q: any) => Promise<DocDef>> = {
  'summary-sheet': summarySheet,
  requirements,
  'limit-card': limitCard,
  costing,
  'plan-fact': planFact,
};

docsRouter.get(
  '/docs/:type',
  a(async (req, res) => {
    const build = BUILDERS[req.params.type];
    if (!build) throw new HttpError(404, 'Неизвестный документ.');
    const doc = await build(req.query);
    if (req.query.format === 'xlsx') {
      const buf = await docToXlsx(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}.xlsx`);
      return void res.send(buf);
    }
    res.json(doc);
  }),
);
