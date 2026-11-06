/* =====================================================================
   Расширения схемы для приложения «Нормы-М» (идемпотентно, безопасно
   запускать повторно). Основной скрипт BDScript.sql не изменяется.
   ===================================================================== */

-- Фактический выпуск и фактический расход (для план-фактного анализа)
CREATE TABLE IF NOT EXISTS "Actual_output" (
  "PK_Actual_output" SERIAL PRIMARY KEY,
  "Period" DATE NOT NULL,                       -- первый день месяца
  "Quantity" NUMERIC NOT NULL CHECK ("Quantity" >= 0),
  "PK_Finished_product" INTEGER NOT NULL REFERENCES "Finished_product" ("PK_Finished_product") ON DELETE CASCADE,
  UNIQUE ("Period", "PK_Finished_product")
);

CREATE TABLE IF NOT EXISTS "Actual_consumption" (
  "PK_Actual_consumption" SERIAL PRIMARY KEY,
  "Period" DATE NOT NULL,                       -- первый день месяца
  "Quantity" NUMERIC NOT NULL CHECK ("Quantity" >= 0),
  "Workshop" VARCHAR(50),
  "Reason" VARCHAR(200),                        -- причина перерасхода
  "PK_Finished_product" INTEGER NOT NULL REFERENCES "Finished_product" ("PK_Finished_product") ON DELETE CASCADE,
  "PK_Material" INTEGER NOT NULL REFERENCES "Material" ("PK_Material") ON DELETE CASCADE
);

-- История версий норм и карт раскроя
CREATE TABLE IF NOT EXISTS "Norm_version" (
  "PK_Norm_version" SERIAL PRIMARY KEY,
  "Entity" VARCHAR(20) NOT NULL,                -- 'norm' | 'layout'
  "Entity_id" INTEGER NOT NULL,
  "Version_no" INTEGER NOT NULL,
  "Action" VARCHAR(60) NOT NULL,
  "Snapshot" JSONB NOT NULL,
  "Changed_at" TIMESTAMP NOT NULL DEFAULT now(),
  "PK_Employee" INTEGER REFERENCES "Employee" ("PK_Employee") ON DELETE SET NULL,
  "PK_Finished_product" INTEGER REFERENCES "Finished_product" ("PK_Finished_product") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "IX_Norm_version_entity" ON "Norm_version" ("Entity", "Entity_id");
CREATE INDEX IF NOT EXISTS "IX_Norm_version_product" ON "Norm_version" ("PK_Finished_product");

-- Журнал аудита
CREATE TABLE IF NOT EXISTS "Audit_log" (
  "PK_Audit_log" SERIAL PRIMARY KEY,
  "At" TIMESTAMP NOT NULL DEFAULT now(),
  "Action" VARCHAR(60) NOT NULL,
  "Object" VARCHAR(100),
  "Details" TEXT,
  "PK_Employee" INTEGER REFERENCES "Employee" ("PK_Employee") ON DELETE SET NULL
);

-- Пометка «требуется перерасчёт»
ALTER TABLE "Assembly_unit"    ADD COLUMN IF NOT EXISTS "Needs_recalc" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Finished_product" ADD COLUMN IF NOT EXISTS "Needs_recalc" BOOLEAN NOT NULL DEFAULT FALSE;

-- В сводную норму попадают только УТВЕРЖДЁННЫЕ карты раскроя
CREATE OR REPLACE VIEW v_detail_norm AS
SELECT p."PK_Cutting_layout_position",
       p."PK_Detail",
       cl."PK_Material",
       cl."PK_Cutting_layout",
       1.0 / NULLIF(p."Quantity", 0) AS norm_sheet
FROM "Cutting_layout_position" p
JOIN "Cutting_layout" cl ON cl."PK_Cutting_layout" = p."PK_Cutting_layout"
WHERE cl."PK_Document_status" = 3;

-- Недостающие роли для демонстрации (администратор, снабженец)
INSERT INTO "Employee" ("Surname","Name","Patronymic","Login","Password","Phone_number","PK_Job_title","PK_Subdivision")
SELECT 'Смирнов','Алексей','Николаевич','admin','admin123','+7 (913) 444-44-44',5,4
WHERE NOT EXISTS (SELECT 1 FROM "Employee" WHERE "Login" = 'admin');
INSERT INTO "Employee" ("Surname","Name","Patronymic","Login","Password","Phone_number","PK_Job_title","PK_Subdivision")
SELECT 'Кузнецова','Ольга','Игоревна','kuznetsova','snab123','+7 (913) 555-55-55',4,3
WHERE NOT EXISTS (SELECT 1 FROM "Employee" WHERE "Login" = 'kuznetsova');

-- Демо-данные факта за февраль 2026 (только если пусто)
INSERT INTO "Actual_output" ("Period","Quantity","PK_Finished_product")
SELECT '2026-02-01', q, p FROM (VALUES (18, 1), (9, 2)) v(q, p)
WHERE NOT EXISTS (SELECT 1 FROM "Actual_output");

INSERT INTO "Actual_consumption" ("Period","Quantity","Workshop","Reason","PK_Finished_product","PK_Material")
SELECT '2026-02-01', q, 'Мебельный', r, p, m
FROM (VALUES
  (78, 'Брак при раскрое', 1, 1),
  (35, NULL, 2, 2),
  (1180, NULL, 1, 5),
  (650, NULL, 1, 6),
  (0.8, NULL, 1, 3)
) v(q, r, p, m)
WHERE NOT EXISTS (SELECT 1 FROM "Actual_consumption");

-- Пароли хранятся хэшем (scrypt) — нужно больше 35 символов
ALTER TABLE "Employee" ALTER COLUMN "Password" TYPE VARCHAR(200);
