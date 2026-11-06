/* =====================================================================
   ИС «Нормы-М» — полный скрипт развертывания (PostgreSQL)
   Разделы:
     1) очистка старых объектов
     2) таблицы
     3) индексы и первичные ключи
     4) внешние ключи
     5) данные (справочники → сущности → доп. крепёж)
     6) синхронизация sequence
     7) серверная часть (views, functions, procedures)
     8) демо-прогон
   Запуск: psql -d normy_m -U mkiselyov -f normy_m_full.sql -v ON_ERROR_STOP=1
   ===================================================================== */

-- ============ 1. ОЧИСТКА ============
DROP TABLE IF EXISTS "Material_requirements", "Production_program_item",
"Production_program", "Suppliers_price_for_the_material", "Consumption_rate",
"Cutting_layout_position", "Cutting_layout", "Detail", "Assembly_unit",
"Employee", "Edge_banding_consumption_rate", "Material", "Finished_product",
"Supplier", "Document_status", "Subdivision", "Job_title", "Edge_type",
"Tile_format", "Material_texture", "Color_of_material", "Units_of_measurement",
"Type_material" CASCADE;

-- ============ 2. ТАБЛИЦЫ ============
CREATE TABLE "Type_material" (
  "PK_Type_material" Serial NOT NULL,
  "Name" Character varying(20),
  "Description" Character varying(150)
);

CREATE TABLE "Units_of_measurement" (
  "PK_Units_of_measurement" Serial NOT NULL,
  "Name" Character varying(20),
  "Description" Character varying(150)
);

CREATE TABLE "Color_of_material" (
  "PK_Color_of_material" Serial NOT NULL,
  "Name" Character varying(20),
  "Description" Character varying(150)
);

CREATE TABLE "Material_texture" (
  "PK_Material_texture" Serial NOT NULL,
  "Name" Character varying(20),
  "Description" Character varying(150)
);

CREATE TABLE "Tile_format" (
  "PK_Tile_format" Serial NOT NULL,
  "Name" Character varying(20),
  "Length" Integer,
  "Width" Integer
);

CREATE TABLE "Material" (
  "PK_Material" Serial NOT NULL,
  "Material_code" Character varying(10),
  "Name" Character varying(20),
  "Thickness" Integer,
  "Sheet_area" Integer,
  "Roll_length" Integer,
  "Base_price" Numeric(12,2),
  "Current_balance" Integer,
  "PK_Type_material" Integer,
  "PK_Units_of_measurement" Integer,
  "PK_Color_of_material" Integer,
  "PK_Material_texture" Integer,
  "PK_Tile_format" Integer,
  "PK_Edge_type" Integer
);

CREATE TABLE "Edge_type" (
  "PK_Edge_type" Serial NOT NULL,
  "Name" Character varying(20),
  "Thickness" Integer,
  "Description" Character varying(150)
);

CREATE TABLE "Edge_banding_consumption_rate" (
  "PK_Edge_banding_consumption_rate" Serial NOT NULL,
  "Roll_consumption_per_linear_meter_of_edge" Integer,
  "Loss_coefficient" Numeric,
  "Description" Character varying(150),
  "PK_Edge_type" Integer
);

CREATE TABLE "Finished_product" (
  "PK_Finished_product" Serial NOT NULL,
  "Cipher" Character varying(10),
  "Name" Character varying(20),
  "Description" Character varying(150),
  "Creation_date" Date
);

CREATE TABLE "Assembly_unit" (
  "PK_Assembly_unit" Serial NOT NULL,
  "Cipher" Character varying(10),
  "Name" Character varying(20),
  "Length" Integer,
  "Width" Integer,
  "Height" Integer,
  "Square" Integer,
  "Number_of_occurrences" Integer,
  "Description" Character varying(150),
  "PK_Finished_product" Integer,
  "FK_PK_Assembly_unit" Integer
);

CREATE TABLE "Detail" (
  "PK_Detail" Serial NOT NULL,
  "Cipher" Character varying(10),
  "Name" Character varying(20),
  "Length" Integer,
  "Width" Integer,
  "Height" Integer,
  "Square" Integer,
  "Length_of_edges_to_be_veneered" Integer,
  "Number_of_occurrences" Integer,
  "Creation_date" Date,
  "Description" Character varying(150),
  "PK_Assembly_unit" Integer,
  "PK_Material" Integer
);

CREATE TABLE "Job_title" (
  "PK_Job_title" Serial NOT NULL,
  "Name" Character varying(20),
  "Description" Character varying(150)
);

CREATE TABLE "Subdivision" (
  "PK_Subdivision" Serial NOT NULL,
  "Name" Character varying(20),
  "Description" Character varying(150)
);

CREATE TABLE "Employee" (
  "PK_Employee" Serial NOT NULL,
  "Surname" Character varying(30),
  "Name" Character varying(30),
  "Patronymic" Character varying(30),
  "Login" Character varying(20),
  "Password" Character varying(35),
  "Phone_number" Character varying(20),
  "PK_Job_title" Integer,
  "PK_Subdivision" Integer
);

CREATE TABLE "Document_status" (
  "PK_Document_status" Serial NOT NULL,
  "Name" Character varying(20),
  "Description" Character varying(150)
);

CREATE TABLE "Cutting_layout" (
  "PK_Cutting_layout" Serial NOT NULL,
  "Card_code" Character varying(20),
  "Number_of_parts_from_a_single_sheet" Integer,
  "Material_utilization_factor" Numeric,
  "Date_of_approval" Date,
  "Description_of_the_diagram" Character varying(150),
  "PK_Document_status" Integer,
  "PK_Material" Integer,
  "PK_Tile_format" Integer,
  "PK_Employee" Integer
);

CREATE TABLE "Cutting_layout_position" (
  "PK_Cutting_layout_position" Serial NOT NULL,
  "Item_number" Numeric,
  "Length" Integer,
  "Width" Integer,
  "Quantity" Integer,
  "Description" Character varying(150),
  "PK_Cutting_layout" Integer NOT NULL,
  "PK_Detail" Integer
);

CREATE TABLE "Consumption_rate" (
  "PK_Consumption_rate" Serial NOT NULL,
  "Consumption_code" Character varying(20),
  "Significance_of_the_norm" Numeric,
  "Loss_coefficient" Numeric,
  "Version" Character varying(25),
  "Date" Date,
  "Description" Character varying(150),
  "PK_Document_status" Integer,
  "PK_Detail" Integer,
  "PK_Assembly_unit" Integer,
  "PK_Finished_product" Integer,
  "PK_Material" Integer,
  "PK_Cutting_layout_position" Integer,
  "PK_Edge_banding_consumption_rate" Integer,
  "PK_Employee" Integer,
  "PK_Cutting_layout" Integer
);

CREATE TABLE "Supplier" (
  "PK_Supplier" Serial NOT NULL,
  "Name" Character varying(20),
  "INN" Character varying(20),
  "Phone_number" Character varying(20),
  "Address" Character varying(150)
);

CREATE TABLE "Suppliers_price_for_the_material" (
  "PK_Suppliers_price_for_the_material" Serial NOT NULL,
  "Price" Numeric(12,2),
  "As-of_date" Date,
  "Note" Character varying(150),
  "PK_Supplier" Integer NOT NULL,
  "PK_Material" Integer NOT NULL
);

CREATE TABLE "Production_program" (
  "PK_Production_program" Serial NOT NULL,
  "Program_code" Character varying(20),
  "Year" Integer,
  "Month" Integer,
  "Generation_date" Date,
  "Description" Character varying(150),
  "PK_Document_status" Integer,
  "PK_Employee" Integer
);

CREATE TABLE "Production_program_item" (
  "PK_Production_program_item" Serial NOT NULL,
  "Release_plan" Numeric,
  "Note" Character varying(150),
  "PK_Production_program" Integer NOT NULL,
  "PK_Finished_product" Integer NOT NULL
);

CREATE TABLE "Material_requirements" (
  "PK_Material_requirements" Serial NOT NULL,
  "Standard_quantity" Numeric,
  "Current_balance" Integer,
  "Required_quantity" Integer,
  "Calculation_date" Date,
  "Note" Character varying(150),
  "PK_Material" Integer NOT NULL,
  "PK_Production_program" Integer NOT NULL
);

-- ============ 3. ИНДЕКСЫ И ПЕРВИЧНЫЕ КЛЮЧИ ============
CREATE INDEX "IX_Relationship1" ON "Material" ("PK_Type_material");
CREATE INDEX "IX_Relationship67" ON "Material" ("PK_Units_of_measurement");
CREATE INDEX "IX_Relationship3" ON "Material" ("PK_Color_of_material");
CREATE INDEX "IX_Relationship2" ON "Material" ("PK_Material_texture");
CREATE INDEX "IX_Relationship5" ON "Material" ("PK_Tile_format");
CREATE INDEX "IX_Relationship4" ON "Material" ("PK_Edge_type");
ALTER TABLE "Material" ADD CONSTRAINT "PK_Material" PRIMARY KEY ("PK_Material");

CREATE INDEX "IX_Relationship11" ON "Edge_banding_consumption_rate" ("PK_Edge_type");
ALTER TABLE "Edge_banding_consumption_rate" ADD CONSTRAINT "PK_Edge_banding_consumption_rate" PRIMARY KEY ("PK_Edge_banding_consumption_rate");

ALTER TABLE "Type_material" ADD CONSTRAINT "PK_Type_material" PRIMARY KEY ("PK_Type_material");
ALTER TABLE "Units_of_measurement" ADD CONSTRAINT "PK_Units_of_measurement" PRIMARY KEY ("PK_Units_of_measurement");
ALTER TABLE "Color_of_material" ADD CONSTRAINT "PK_Color_of_material" PRIMARY KEY ("PK_Color_of_material");
ALTER TABLE "Material_texture" ADD CONSTRAINT "PK_Material_texture" PRIMARY KEY ("PK_Material_texture");
ALTER TABLE "Tile_format" ADD CONSTRAINT "PK_Tile_format" PRIMARY KEY ("PK_Tile_format");
ALTER TABLE "Edge_type" ADD CONSTRAINT "PK_Edge_type" PRIMARY KEY ("PK_Edge_type");
ALTER TABLE "Finished_product" ADD CONSTRAINT "PK_Finished_product" PRIMARY KEY ("PK_Finished_product");

CREATE INDEX "IX_Relationship6" ON "Assembly_unit" ("PK_Finished_product");
CREATE INDEX "IX_Relationship8" ON "Assembly_unit" ("FK_PK_Assembly_unit");
ALTER TABLE "Assembly_unit" ADD CONSTRAINT "PK_Assembly_unit" PRIMARY KEY ("PK_Assembly_unit");

CREATE INDEX "IX_Relationship7" ON "Detail" ("PK_Assembly_unit");
CREATE INDEX "IX_Relationship9" ON "Detail" ("PK_Material");
ALTER TABLE "Detail" ADD CONSTRAINT "PK_Detail" PRIMARY KEY ("PK_Detail");

ALTER TABLE "Job_title" ADD CONSTRAINT "PK_Job_title" PRIMARY KEY ("PK_Job_title");
ALTER TABLE "Subdivision" ADD CONSTRAINT "PK_Subdivision" PRIMARY KEY ("PK_Subdivision");

CREATE INDEX "IX_Relationship10" ON "Employee" ("PK_Job_title");
CREATE INDEX "IX_Relationship52" ON "Employee" ("PK_Subdivision");
ALTER TABLE "Employee" ADD CONSTRAINT "PK_Employee" PRIMARY KEY ("PK_Employee");

ALTER TABLE "Document_status" ADD CONSTRAINT "PK_Document_status" PRIMARY KEY ("PK_Document_status");

CREATE INDEX "IX_Relationship12" ON "Cutting_layout" ("PK_Document_status");
CREATE INDEX "IX_Relationship13" ON "Cutting_layout" ("PK_Material");
CREATE INDEX "IX_Relationship14" ON "Cutting_layout" ("PK_Tile_format");
CREATE INDEX "IX_Relationship15" ON "Cutting_layout" ("PK_Employee");
ALTER TABLE "Cutting_layout" ADD CONSTRAINT "PK_Cutting_layout" PRIMARY KEY ("PK_Cutting_layout");

CREATE INDEX "IX_Relationship17" ON "Cutting_layout_position" ("PK_Detail");
ALTER TABLE "Cutting_layout_position" ADD CONSTRAINT "PK_Cutting_layout_position" PRIMARY KEY ("PK_Cutting_layout_position", "PK_Cutting_layout");

CREATE INDEX "IX_Relationship18" ON "Consumption_rate" ("PK_Document_status");
CREATE INDEX "IX_Relationship19" ON "Consumption_rate" ("PK_Detail");
CREATE INDEX "IX_Relationship20" ON "Consumption_rate" ("PK_Assembly_unit");
CREATE INDEX "IX_Relationship21" ON "Consumption_rate" ("PK_Finished_product");
CREATE INDEX "IX_Relationship22" ON "Consumption_rate" ("PK_Material");
CREATE INDEX "IX_Relationship23" ON "Consumption_rate" ("PK_Cutting_layout_position", "PK_Cutting_layout");
CREATE INDEX "IX_Relationship24" ON "Consumption_rate" ("PK_Edge_banding_consumption_rate");
CREATE INDEX "IX_Relationship25" ON "Consumption_rate" ("PK_Employee");
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "PK_Consumption_rate" PRIMARY KEY ("PK_Consumption_rate");

ALTER TABLE "Supplier" ADD CONSTRAINT "PK_Supplier" PRIMARY KEY ("PK_Supplier");
ALTER TABLE "Suppliers_price_for_the_material" ADD CONSTRAINT "PK_Suppliers_price_for_the_material" PRIMARY KEY ("PK_Suppliers_price_for_the_material", "PK_Supplier", "PK_Material");

CREATE INDEX "IX_Relationship28" ON "Production_program" ("PK_Document_status");
CREATE INDEX "IX_Relationship29" ON "Production_program" ("PK_Employee");
ALTER TABLE "Production_program" ADD CONSTRAINT "PK_Production_program" PRIMARY KEY ("PK_Production_program");
ALTER TABLE "Production_program_item" ADD CONSTRAINT "PK_Production_program_item" PRIMARY KEY ("PK_Production_program_item", "PK_Production_program", "PK_Finished_product");
ALTER TABLE "Material_requirements" ADD CONSTRAINT "PK_Material_requirements" PRIMARY KEY ("PK_Material_requirements", "PK_Production_program", "PK_Material");

-- ============ 4. ВНЕШНИЕ КЛЮЧИ ============
ALTER TABLE "Material" ADD CONSTRAINT "классифицирует" FOREIGN KEY ("PK_Type_material") REFERENCES "Type_material" ("PK_Type_material") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "измеряет" FOREIGN KEY ("PK_Units_of_measurement") REFERENCES "Units_of_measurement" ("PK_Units_of_measurement") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "окрашивает" FOREIGN KEY ("PK_Color_of_material") REFERENCES "Color_of_material" ("PK_Color_of_material") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "декорирует" FOREIGN KEY ("PK_Material_texture") REFERENCES "Material_texture" ("PK_Material_texture") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "калибрует" FOREIGN KEY ("PK_Tile_format") REFERENCES "Tile_format" ("PK_Tile_format") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "окантовывает" FOREIGN KEY ("PK_Edge_type") REFERENCES "Edge_type" ("PK_Edge_type") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Edge_banding_consumption_rate" ADD CONSTRAINT "нормирует" FOREIGN KEY ("PK_Edge_type") REFERENCES "Edge_type" ("PK_Edge_type") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assembly_unit" ADD CONSTRAINT "включает" FOREIGN KEY ("PK_Finished_product") REFERENCES "Finished_product" ("PK_Finished_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Detail" ADD CONSTRAINT "содержит" FOREIGN KEY ("PK_Assembly_unit") REFERENCES "Assembly_unit" ("PK_Assembly_unit") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Assembly_unit" ADD CONSTRAINT "группирует" FOREIGN KEY ("FK_PK_Assembly_unit") REFERENCES "Assembly_unit" ("PK_Assembly_unit") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Detail" ADD CONSTRAINT "применяется" FOREIGN KEY ("PK_Material") REFERENCES "Material" ("PK_Material") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Employee" ADD CONSTRAINT "назначается" FOREIGN KEY ("PK_Job_title") REFERENCES "Job_title" ("PK_Job_title") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "входит" FOREIGN KEY ("PK_Subdivision") REFERENCES "Subdivision" ("PK_Subdivision") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cutting_layout" ADD CONSTRAINT "фиксирует" FOREIGN KEY ("PK_Document_status") REFERENCES "Document_status" ("PK_Document_status") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cutting_layout" ADD CONSTRAINT "раскраивается" FOREIGN KEY ("PK_Material") REFERENCES "Material" ("PK_Material") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cutting_layout" ADD CONSTRAINT "определяет" FOREIGN KEY ("PK_Tile_format") REFERENCES "Tile_format" ("PK_Tile_format") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cutting_layout" ADD CONSTRAINT "разрабатывает" FOREIGN KEY ("PK_Employee") REFERENCES "Employee" ("PK_Employee") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cutting_layout_position" ADD CONSTRAINT "перечисляет" FOREIGN KEY ("PK_Cutting_layout") REFERENCES "Cutting_layout" ("PK_Cutting_layout") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cutting_layout_position" ADD CONSTRAINT "выкраивается" FOREIGN KEY ("PK_Detail") REFERENCES "Detail" ("PK_Detail") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "согласовывает" FOREIGN KEY ("PK_Document_status") REFERENCES "Document_status" ("PK_Document_status") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "учитывается" FOREIGN KEY ("PK_Detail") REFERENCES "Detail" ("PK_Detail") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "специфицируется" FOREIGN KEY ("PK_Assembly_unit") REFERENCES "Assembly_unit" ("PK_Assembly_unit") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "калькулируется" FOREIGN KEY ("PK_Finished_product") REFERENCES "Finished_product" ("PK_Finished_product") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "расходуется" FOREIGN KEY ("PK_Material") REFERENCES "Material" ("PK_Material") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "порождает" FOREIGN KEY ("PK_Cutting_layout_position", "PK_Cutting_layout") REFERENCES "Cutting_layout_position" ("PK_Cutting_layout_position", "PK_Cutting_layout") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "уточняет" FOREIGN KEY ("PK_Edge_banding_consumption_rate") REFERENCES "Edge_banding_consumption_rate" ("PK_Edge_banding_consumption_rate") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consumption_rate" ADD CONSTRAINT "утверждает" FOREIGN KEY ("PK_Employee") REFERENCES "Employee" ("PK_Employee") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Suppliers_price_for_the_material" ADD CONSTRAINT "предлагает" FOREIGN KEY ("PK_Supplier") REFERENCES "Supplier" ("PK_Supplier") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Suppliers_price_for_the_material" ADD CONSTRAINT "оценивается" FOREIGN KEY ("PK_Material") REFERENCES "Material" ("PK_Material") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Production_program" ADD CONSTRAINT "регистрирует" FOREIGN KEY ("PK_Document_status") REFERENCES "Document_status" ("PK_Document_status") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Production_program" ADD CONSTRAINT "формирует" FOREIGN KEY ("PK_Employee") REFERENCES "Employee" ("PK_Employee") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Production_program_item" ADD CONSTRAINT "планирует" FOREIGN KEY ("PK_Production_program") REFERENCES "Production_program" ("PK_Production_program") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Production_program_item" ADD CONSTRAINT "производится" FOREIGN KEY ("PK_Finished_product") REFERENCES "Finished_product" ("PK_Finished_product") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Material_requirements" ADD CONSTRAINT "требуется" FOREIGN KEY ("PK_Material") REFERENCES "Material" ("PK_Material") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Material_requirements" ADD CONSTRAINT "обуславливает" FOREIGN KEY ("PK_Production_program") REFERENCES "Production_program" ("PK_Production_program") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ 5. ДАННЫЕ ============
INSERT INTO "Type_material" ("PK_Type_material", "Name", "Description") VALUES
(1, 'Плитный', 'ЛДСП, ДВП, фанера'),
(2, 'Кромочный', 'Кромка ПВХ, АБС'),
(3, 'Фурнитура', 'Крепёж, ручки, петли'),
(4, 'Вспомогательный', 'Клей, упаковка');

INSERT INTO "Units_of_measurement" ("PK_Units_of_measurement", "Name", "Description") VALUES
(1, 'лист', 'Плитный материал'),
(2, 'рулон', 'Кромочный материал'),
(3, 'шт', 'Штучные изделия'),
(4, 'комплект', 'Комплектующие'),
(5, 'кг', 'Килограммы'),
(6, 'пог. м', 'Погонный метр');

INSERT INTO "Color_of_material" ("PK_Color_of_material", "Name", "Description") VALUES
(1, 'Белый', 'RAL 9016'),
(2, 'Венге', 'Тёмно-коричневый'),
(3, 'Дуб сонома', 'Светлое дерево');

INSERT INTO "Material_texture" ("PK_Material_texture", "Name", "Description") VALUES
(1, 'Гладкая', 'Матовая поверхность'),
(2, 'Шагрень', 'Рельефная поверхность'),
(3, 'Древесная', 'Имитация дерева');

INSERT INTO "Tile_format" ("PK_Tile_format", "Name", "Length", "Width") VALUES
(1, 'ЛДСП 2750×1830', 2750, 1830),
(2, 'ЛДСП 2800×2070', 2800, 2070),
(3, 'ДВП 2745×1700', 2745, 1700);

INSERT INTO "Edge_type" ("PK_Edge_type", "Name", "Thickness", "Description") VALUES
(1, 'ПВХ 0.4 мм', 0, 'Тонкая кромка'),
(2, 'ПВХ 2.0 мм', 2, 'Толстая кромка');

INSERT INTO "Job_title" ("PK_Job_title", "Name", "Description") VALUES
(1, 'Технолог', 'Карты раскроя и нормы'),
(2, 'Нормировщик', 'Консолидация норм'),
(3, 'Экономист', 'Калькуляция'),
(4, 'Снабженец', 'Закупки'),
(5, 'Администратор', 'Управление системой');

INSERT INTO "Subdivision" ("PK_Subdivision", "Name", "Description") VALUES
(1, 'Техбюро', 'Технологическая документация'),
(2, 'ПЭО', 'Планово-экономический отдел'),
(3, 'ОМТС', 'Отдел снабжения'),
(4, 'ИТ-отдел', 'Техподдержка');

INSERT INTO "Document_status" ("PK_Document_status", "Name", "Description") VALUES
(1, 'Черновик', 'Документ в работе'),
(2, 'На согласовании', 'Отправлен на проверку'),
(3, 'Утверждён', 'Действующая версия'),
(4, 'Архив', 'Устаревшая версия');

INSERT INTO "Supplier" ("PK_Supplier", "Name", "INN", "Phone_number", "Address") VALUES
(1, 'ООО "Кроношпан"', '7701234567', '+7 (495) 123-45-67', 'Москва, ул. Промышленная, 10'),
(2, 'ООО "Латекс"', '5406234567', '+7 (383) 234-56-78', 'Новосибирск, ул. Заводская, 5'),
(3, 'ООО "Боярд"', '7709876543', '+7 (495) 987-65-43', 'Москва, ул. Мебельная, 15');

INSERT INTO "Finished_product" ("PK_Finished_product", "Cipher", "Name", "Description", "Creation_date") VALUES
(1, 'СТ-01', 'Стол письменный', 'Стол с двумя тумбами', '2026-01-15'),
(2, 'ШК-05', 'Шкаф для одежды', 'Двухстворчатый шкаф', '2026-01-20');

INSERT INTO "Material" ("PK_Material", "Material_code", "Name", "Thickness", "Sheet_area", "Roll_length", "Base_price", "Current_balance", "PK_Type_material", "PK_Units_of_measurement", "PK_Color_of_material", "PK_Material_texture", "PK_Tile_format", "PK_Edge_type") VALUES
(1, 'ЛДСП16Б', 'ЛДСП 16 Белый', 16, 5, NULL, 2500.00, 50, 1, 1, 1, 1, 1, NULL),
(2, 'ЛДСП16В', 'ЛДСП 16 Венге', 16, 5, NULL, 2800.00, 30, 1, 1, 2, 2, 1, NULL),
(3, 'КР04Б', 'Кромка ПВХ 0.4 Бел', NULL, NULL, 100, 350.00, 20, 2, 2, 1, 1, NULL, 1),
(4, 'КР20В', 'Кромка ПВХ 2.0 Венге', NULL, NULL, 100, 550.00, 15, 2, 2, 2, 2, NULL, 2),
(5, 'КОНФ750', 'Конфирмат 7×50', NULL, NULL, NULL, 3.50, 500, 3, 3, NULL, NULL, NULL, NULL),
(6, 'ШР3516', 'Шуруп 3.5×16', NULL, NULL, NULL, 1.20, 1000, 3, 3, NULL, NULL, NULL, NULL);

INSERT INTO "Edge_banding_consumption_rate" ("PK_Edge_banding_consumption_rate", "Roll_consumption_per_linear_meter_of_edge", "Loss_coefficient", "Description", "PK_Edge_type") VALUES
(1, 1, 1.05, 'Расход ПВХ 0.4 на 1 пог.м', 1),
(2, 1, 1.08, 'Расход ПВХ 2.0 на 1 пог.м', 2);

INSERT INTO "Employee" ("PK_Employee", "Surname", "Name", "Patronymic", "Login", "Password", "Phone_number", "PK_Job_title", "PK_Subdivision") VALUES
(1, 'Иванов', 'Иван', 'Иванович', 'ivanov', 'pass123', '+7 (913) 111-11-11', 1, 1),
(2, 'Петров', 'Пётр', 'Петрович', 'petrov', 'pass456', '+7 (913) 222-22-22', 2, 1),
(3, 'Сидорова', 'Мария', 'Сергеевна', 'sidorova', 'pass789', '+7 (913) 333-33-33', 3, 2);

INSERT INTO "Assembly_unit" ("PK_Assembly_unit", "Cipher", "Name", "Length", "Width", "Height", "Square", "Number_of_occurrences", "Description", "PK_Finished_product", "FK_PK_Assembly_unit") VALUES
(1, 'ТМБ-01', 'Тумба правая', 500, 500, 750, 12500, 1, 'Правая тумба стола', 1, NULL),
(2, 'ТМБ-02', 'Тумба левая', 500, 500, 750, 12500, 1, 'Левая тумба стола', 1, NULL),
(3, 'КРК-01', 'Каркас стола', 1200, 600, 100, 7200, 1, 'Каркас со столешницей', 1, NULL),
(4, 'КРП-05', 'Корпус шкафа', 2400, 600, 2200, 14400, 1, 'Корпус шкафа ШК-05', 2, NULL),
(5, 'СЕК-05', 'Секция полок', 2300, 400, 1200, 9200, 1, 'Секция с полками', 2, 4);

INSERT INTO "Cutting_layout" ("PK_Cutting_layout", "Card_code", "Number_of_parts_from_a_single_sheet", "Material_utilization_factor", "Date_of_approval", "Description_of_the_diagram", "PK_Document_status", "PK_Material", "PK_Tile_format", "PK_Employee") VALUES
(1, 'КР-001', 13, 0.72, '2026-02-01', 'Раскрой ЛДСП 16 белый: 4 боковины, 6 полок, 1 столешница, 2 царги', 3, 1, 1, 1),
(2, 'КР-002', 3, 0.86, '2026-02-01', 'Раскрой ЛДСП 16 венге: 2 боковины и 1 крышка', 3, 2, 1, 1),
(3, 'КР-003', 4, 0.84, '2026-02-01', 'Раскрой ЛДСП 16 венге: 1 дно и 3 полки', 3, 2, 1, 1);

INSERT INTO "Detail" ("PK_Detail", "Cipher", "Name", "Length", "Width", "Height", "Square", "Length_of_edges_to_be_veneered", "Number_of_occurrences", "Creation_date", "Description", "PK_Assembly_unit", "PK_Material") VALUES
(1, 'БК-01', 'Боковина', 750, 500, 16, 3750, 2000, 2, '2026-01-15', 'Боковина тумбы', 1, 1),
(2, 'ПЛ-01', 'Полка', 500, 400, 16, 2000, 500, 3, '2026-01-15', 'Полка в тумбу', 1, 1),
(3, 'СТ-01-С', 'Столешница', 1200, 600, 16, 7200, 3600, 1, '2026-01-15', 'Столешница стола', 3, 1),
(4, 'ЦР-01', 'Царга', 1000, 100, 16, 1000, 1000, 2, '2026-01-15', 'Царга стола', 3, 1),
(5, 'БК-05', 'Боковина шкафа', 2400, 600, 16, 14400, 4800, 2, '2026-01-20', 'Боковина корпуса', 4, 2),
(6, 'КР-05', 'Крышка шкафа', 2400, 600, 16, 14400, 2400, 1, '2026-01-20', 'Крышка шкафа', 4, 2),
(7, 'ДН-05', 'Дно шкафа', 2400, 600, 16, 14400, 0, 1, '2026-01-20', 'Дно шкафа', 4, 2),
(8, 'ПЛ-05', 'Полка шкафа', 2300, 400, 16, 9200, 2300, 3, '2026-01-20', 'Съемная полка', 5, 2);

INSERT INTO "Cutting_layout_position" ("PK_Cutting_layout_position", "Item_number", "Length", "Width", "Quantity", "Description", "PK_Cutting_layout", "PK_Detail") VALUES
(1, 1, 750, 500, 4, 'Боковина тумбы', 1, 1),
(2, 2, 500, 400, 6, 'Полка', 1, 2),
(3, 3, 1200, 600, 1, 'Столешница', 1, 3),
(4, 4, 1000, 100, 2, 'Царга', 1, 4),
(5, 1, 2400, 600, 2, 'Боковина шкафа', 2, 5),
(6, 2, 2400, 600, 1, 'Крышка шкафа', 2, 6),
(7, 1, 2400, 600, 1, 'Дно шкафа', 3, 7),
(8, 2, 2300, 400, 3, 'Полка шкафа', 3, 8);

-- Базовые нормы (PK 1-20)
INSERT INTO "Consumption_rate" ("PK_Consumption_rate", "Consumption_code", "Significance_of_the_norm", "Loss_coefficient", "Version", "Date", "Description", "PK_Document_status", "PK_Detail", "PK_Assembly_unit", "PK_Finished_product", "PK_Material", "PK_Cutting_layout_position", "PK_Edge_banding_consumption_rate", "PK_Employee", "PK_Cutting_layout") VALUES
(1, 'ПН-ЛДСП-БК', 0.25, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП на боковину (1/4 листа)', 3, 1, NULL, NULL, 1, 1, NULL, 1, 1),
(2, 'ПН-ЛДСП-ПЛ', 0.167, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП на полку (1/6 листа)', 3, 2, NULL, NULL, 1, 2, NULL, 1, 1),
(3, 'ПН-ЛДСП-СТ', 1.00, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП на столешницу (1 лист)', 3, 3, NULL, NULL, 1, 3, NULL, 1, 1),
(4, 'ПН-ЛДСП-ЦР', 0.50, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП на царгу (1/2 листа)', 3, 4, NULL, NULL, 1, 4, NULL, 1, 1),
(5, 'СН-ЛДСП-ТМБ1', 1.00, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП на тумбу правую', 3, NULL, 1, NULL, 1, NULL, NULL, 2, NULL),
(6, 'СвН-ЛДСП-СТ01', 4.00, 1.00, 'v1.0', '2026-02-01', 'Сводная норма ЛДСП на стол СТ-01', 3, NULL, NULL, 1, 1, NULL, NULL, 2, NULL),
(7, 'ПН-ЛДСП-БК05', 0.5, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП венге на боковину шкафа', 3, 5, NULL, NULL, 2, 5, NULL, 1, 2),
(8, 'ПН-ЛДСП-КР05', 1.0, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП венге на крышку', 3, 6, NULL, NULL, 2, 6, NULL, 1, 2),
(9, 'ПН-ЛДСП-ДН05', 1.0, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП венге на дно', 3, 7, NULL, NULL, 2, 7, NULL, 1, 3),
(10, 'ПН-ЛДСП-ПЛ05', 0.333, 1.00, 'v1.0', '2026-02-01', 'Норма ЛДСП венге на полку (1/3)', 3, 8, NULL, NULL, 2, 8, NULL, 1, 3),
(11, 'СвН-ЛДСП-ШК05', 4.0, 1.00, 'v1.0', '2026-02-01', 'Сводная норма ЛДСП венге на шкаф', 3, NULL, NULL, 2, 2, NULL, NULL, 2, NULL),
(12, 'Н-КОНФ-БК01', 4, 1.00, 'v1.0', '2026-02-01', '4 конфирмата на боковину тумбы', 3, 1, NULL, NULL, 5, NULL, NULL, 1, NULL),
(13, 'Н-КОНФ-ТМБ01', 16, 1.00, 'v1.0', '2026-02-01', '16 конфирматов на тумбу правую', 3, NULL, 1, NULL, 5, NULL, NULL, 1, NULL),
(14, 'Н-ШР-ТМБ01', 12, 1.00, 'v1.0', '2026-02-01', '12 шурупов на тумбу правую', 3, NULL, 1, NULL, 6, NULL, NULL, 1, NULL),
(15, 'СвН-КОНФ-СТ01', 64, 1.00, 'v1.0', '2026-02-01', 'Сводная норма конфирматов на стол', 3, NULL, NULL, 1, 5, NULL, NULL, 2, NULL),
(16, 'СвН-ШР-СТ01', 36, 1.00, 'v1.0', '2026-02-01', 'Сводная норма шурупов на стол', 3, NULL, NULL, 1, 6, NULL, NULL, 2, NULL),
(17, 'СвН-КОНФ-ШК05', 40, 1.00, 'v1.0', '2026-02-01', 'Сводная норма конфирматов на шкаф', 3, NULL, NULL, 2, 5, NULL, NULL, 2, NULL),
(18, 'Н-КР04-БК01', 0.021, 1.05, 'v1.0', '2026-02-01', 'Кромка 0.4 на боковину (2 пог.м × 1.05)', 3, 1, NULL, NULL, 3, NULL, 1, 1, NULL),
(19, 'Н-КР20-БК05', 0.052, 1.08, 'v1.0', '2026-02-01', 'Кромка 2.0 на боковину шкафа', 3, 5, NULL, NULL, 4, NULL, 2, 1, NULL),
(20, 'СвН-КР04-СТ01', 0.15, 1.05, 'v1.0', '2026-02-01', 'Сводная норма кромки 0.4 на стол', 3, NULL, NULL, 1, 3, NULL, NULL, 2, NULL);

-- Доп. крепёж по остальным узлам (PK 21-25)
INSERT INTO "Consumption_rate" ("PK_Consumption_rate", "Consumption_code", "Significance_of_the_norm", "Loss_coefficient", "Version", "Date", "Description", "PK_Document_status", "PK_Detail", "PK_Assembly_unit", "PK_Finished_product", "PK_Material", "PK_Cutting_layout_position", "PK_Edge_banding_consumption_rate", "PK_Employee", "PK_Cutting_layout") VALUES
(21, 'Н-КОНФ-ТМБ02', 16, 1.00, 'v1.0', '2026-02-01', '16 конфирматов на тумбу левую', 3, NULL, 2, NULL, 5, NULL, NULL, 1, NULL),
(22, 'Н-ШР-ТМБ02', 12, 1.00, 'v1.0', '2026-02-01', '12 шурупов на тумбу левую', 3, NULL, 2, NULL, 6, NULL, NULL, 1, NULL),
(23, 'Н-КОНФ-КРК01', 32, 1.00, 'v1.0', '2026-02-01', '32 конфирмата на каркас стола', 3, NULL, 3, NULL, 5, NULL, NULL, 1, NULL),
(24, 'Н-ШР-КРК01', 24, 1.00, 'v1.0', '2026-02-01', '24 шурупа на каркас стола', 3, NULL, 3, NULL, 6, NULL, NULL, 1, NULL),
(25, 'Н-КОНФ-КРП05', 40, 1.00, 'v1.0', '2026-02-01', '40 конфирматов на корпус шкафа', 3, NULL, 4, NULL, 5, NULL, NULL, 1, NULL);

-- Цены поставщиков
INSERT INTO "Suppliers_price_for_the_material" ("PK_Suppliers_price_for_the_material", "Price", "As-of_date", "Note", "PK_Supplier", "PK_Material") VALUES
(1, 2450.00, '2026-01-01', 'Опт Кроношпан', 1, 1),
(2, 2550.00, '2026-01-01', 'Опт Латекс', 2, 1),
(3, 2750.00, '2026-01-01', 'Опт Кроношпан', 1, 2),
(4, 2850.00, '2026-01-01', 'Опт Латекс', 2, 2),
(5, 3.20, '2026-01-01', 'Конфирмат, опт Боярд', 3, 5),
(6, 1.10, '2026-01-01', 'Шуруп, опт Боярд', 3, 6),
(7, 340.00, '2026-01-01', 'Кромка 0.4, опт Латекс', 2, 3),
(8, 520.00, '2026-01-01', 'Кромка 2.0, опт Латекс', 2, 4);

-- Производственная программа
INSERT INTO "Production_program" ("PK_Production_program", "Program_code", "Year", "Month", "Generation_date", "Description", "PK_Document_status", "PK_Employee") VALUES
(1, 'ПП-2026-02', 2026, 2, '2026-01-25', 'Программа на февраль 2026', 3, 3);

INSERT INTO "Production_program_item" ("PK_Production_program_item", "Release_plan", "Note", "PK_Production_program", "PK_Finished_product") VALUES
(1, 20.0, 'План 20 столов', 1, 1),
(2, 10.0, 'План 10 шкафов', 1, 2);

-- Потребность (ручная, будет перезаписана процедурой)
INSERT INTO "Material_requirements" ("PK_Material_requirements", "Standard_quantity", "Current_balance", "Required_quantity", "Calculation_date", "Note", "PK_Material", "PK_Production_program") VALUES
(1, 80.0, 50, 30, '2026-01-26', '4 листа/стол × 20 шт − остаток 50', 1, 1),
(2, 40.0, 30, 10, '2026-01-26', 'Венге: 4 листа × 10 шкафов', 2, 1),
(3, 1680.0, 500, 1180, '2026-01-26', 'Конфирматы: 64×20 + 40×10', 5, 1),
(4, 920.0, 400, 520, '2026-01-26', 'Шурупы: 36×20 + 20×10', 6, 1),
(5, 3.5, 2, 2, '2026-01-26', 'Кромка 0.4 с округлением вверх', 3, 1);

-- ============ 6. СИНХРОНИЗАЦИЯ SEQUENCE ============
DO $$
DECLARE
  rec RECORD;
  seq_name text;
  max_id bigint;
BEGIN
  FOR rec IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_default LIKE 'nextval%'
  LOOP
    seq_name := pg_get_serial_sequence(quote_ident(rec.table_name), rec.column_name);
    IF seq_name IS NOT NULL THEN
      EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I',
                     rec.column_name, rec.table_name)
        INTO max_id;
      PERFORM setval(seq_name, GREATEST(max_id, 1));
    END IF;
  END LOOP;
END $$;

-- ============ 7. СЕРВЕРНАЯ ЧАСТЬ ============

-- Показатель 1: подетальная норма (доля листа)
CREATE OR REPLACE VIEW v_detail_norm AS
SELECT p."PK_Cutting_layout_position",
       p."PK_Detail",
       cl."PK_Material",
       cl."PK_Cutting_layout",
       1.0 / NULLIF(p."Quantity", 0) AS norm_sheet
FROM "Cutting_layout_position" p
JOIN "Cutting_layout" cl ON cl."PK_Cutting_layout" = p."PK_Cutting_layout";

-- Показатель 2: КИМ, %
CREATE OR REPLACE VIEW v_kim AS
SELECT cl."PK_Cutting_layout",
       cl."Card_code",
       ROUND(100.0 * SUM(p."Length" * p."Width" * p."Quantity")
             / NULLIF(tf."Length" * tf."Width", 0), 2) AS kim_percent
FROM "Cutting_layout" cl
JOIN "Cutting_layout_position" p ON p."PK_Cutting_layout" = cl."PK_Cutting_layout"
JOIN "Tile_format" tf ON tf."PK_Tile_format" = cl."PK_Tile_format"
GROUP BY cl."PK_Cutting_layout", cl."Card_code", tf."Length", tf."Width";

-- Показатель 3: норма кромки (рулонов на деталь)
CREATE OR REPLACE FUNCTION fn_edge_norm(p_detail integer, p_edge_material integer)
RETURNS numeric
LANGUAGE sql AS $$
  SELECT ROUND(
    (d."Length_of_edges_to_be_veneered" / 1000.0)
    * r."Roll_consumption_per_linear_meter_of_edge"
    * r."Loss_coefficient"
    / NULLIF(m."Roll_length", 0),
    6
  )
  FROM "Detail" d
  CROSS JOIN "Material" m
  JOIN "Edge_type" t ON t."PK_Edge_type" = m."PK_Edge_type"
  JOIN "Edge_banding_consumption_rate" r ON r."PK_Edge_type" = t."PK_Edge_type"
  WHERE d."PK_Detail" = p_detail
    AND m."PK_Material" = p_edge_material;
$$;

-- Показатель 4: сводная норма (рекурсивный обход дерева)
CREATE OR REPLACE FUNCTION fn_summary_norm(p_product integer)
RETURNS TABLE (pk_material integer, material_name varchar, norm numeric)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE tree AS (
    SELECT a."PK_Assembly_unit",
           a."Number_of_occurrences"::numeric AS qty
    FROM "Assembly_unit" a
    WHERE a."PK_Finished_product" = p_product
      AND a."FK_PK_Assembly_unit" IS NULL
    UNION ALL
    SELECT c."PK_Assembly_unit",
           (t.qty * c."Number_of_occurrences")::numeric
    FROM "Assembly_unit" c
    JOIN tree t ON c."FK_PK_Assembly_unit" = t."PK_Assembly_unit"
  ),
  parts AS (
    -- плитные материалы: подетальная норма из карты раскроя
    SELECT d."PK_Material" AS mat,
           dn.norm_sheet * d."Number_of_occurrences" * tr.qty AS contrib
    FROM tree tr
    JOIN "Detail" d ON d."PK_Assembly_unit" = tr."PK_Assembly_unit"
    JOIN v_detail_norm dn ON dn."PK_Detail" = d."PK_Detail"
    UNION ALL
    -- прочие подетальные нормы (кромка, крепёж на деталь)
    SELECT cr."PK_Material",
           cr."Significance_of_the_norm" * d."Number_of_occurrences" * tr.qty
    FROM tree tr
    JOIN "Detail" d ON d."PK_Assembly_unit" = tr."PK_Assembly_unit"
    JOIN "Consumption_rate" cr ON cr."PK_Detail" = d."PK_Detail"
      AND cr."PK_Cutting_layout_position" IS NULL
      AND cr."PK_Document_status" = 3
    UNION ALL
    -- нормы уровня сборочной единицы
    SELECT cr."PK_Material",
           cr."Significance_of_the_norm" * tr.qty
    FROM tree tr
    JOIN "Consumption_rate" cr ON cr."PK_Assembly_unit" = tr."PK_Assembly_unit"
      AND cr."PK_Detail" IS NULL
      AND cr."PK_Document_status" = 3
  )
  SELECT m."PK_Material", m."Name", SUM(p.contrib)
  FROM parts p
  JOIN "Material" m ON m."PK_Material" = p.mat
  GROUP BY m."PK_Material", m."Name";
$$;

-- Автоконсолидация сводных норм изделия
CREATE OR REPLACE PROCEDURE pr_consolidate_norms(p_product integer)
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "Consumption_rate"
  WHERE "PK_Finished_product" = p_product
    AND "PK_Detail" IS NULL
    AND "PK_Assembly_unit" IS NULL;

  INSERT INTO "Consumption_rate"
    ("Consumption_code", "Significance_of_the_norm", "Loss_coefficient",
     "Version", "Date", "Description", "PK_Document_status",
     "PK_Finished_product", "PK_Material")
  SELECT 'СвН-АВТО-' || m."Material_code",
         s.norm, 1.00, 'auto', CURRENT_DATE,
         'Автоматически консолидированная норма: ' || m."Name",
         3, p_product, s.pk_material
  FROM fn_summary_norm(p_product) s
  JOIN "Material" m ON m."PK_Material" = s.pk_material;
END $$;

-- Показатель 5: потребность на программу
CREATE OR REPLACE PROCEDURE pr_calc_requirements(p_program integer)
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "Material_requirements"
  WHERE "PK_Production_program" = p_program;

  INSERT INTO "Material_requirements"
    ("Standard_quantity", "Current_balance", "Required_quantity",
     "Calculation_date", "Note", "PK_Material", "PK_Production_program")
  SELECT t.standard, t.balance, GREATEST(0, t.standard - t.balance),
         CURRENT_DATE, 'Автоматический расчет', t.pk_material, p_program
  FROM (
    SELECT s.pk_material,
           SUM(CEIL(s.norm * i."Release_plan")) AS standard,
           MAX(m."Current_balance") AS balance
    FROM "Production_program_item" i
    CROSS JOIN LATERAL fn_summary_norm(i."PK_Finished_product") s
    JOIN "Material" m ON m."PK_Material" = s.pk_material
    WHERE i."PK_Production_program" = p_program
    GROUP BY s.pk_material
  ) t;
END $$;

-- Калькуляция материальной себестоимости
CREATE OR REPLACE FUNCTION fn_product_cost(p_product integer)
RETURNS TABLE (material_name varchar, norm numeric, price numeric, cost numeric)
LANGUAGE sql STABLE AS $$
  SELECT s.material_name, s.norm, p.price, ROUND(s.norm * p.price, 2)
  FROM fn_summary_norm(p_product) s
  CROSS JOIN LATERAL (
    SELECT MIN(sp."Price") AS price
    FROM "Suppliers_price_for_the_material" sp
    WHERE sp."PK_Material" = s.pk_material
  ) p
  WHERE p.price IS NOT NULL;
$$;

-- ============ 8. ДЕМО-ПРОГОН ============
CALL pr_consolidate_norms(1);
CALL pr_consolidate_norms(2);
CALL pr_calc_requirements(1);

-- КИМ по картам (показатель 2)
SELECT * FROM v_kim ORDER BY "Card_code";

-- Сводные нормы стола СТ-01 (показатель 4)
SELECT * FROM fn_summary_norm(1);

-- Сводные нормы шкафа ШК-05
SELECT * FROM fn_summary_norm(2);

-- Что консолидация записала в таблицу норм
SELECT cr."Consumption_code", cr."Significance_of_the_norm", m."Name"
FROM "Consumption_rate" cr
JOIN "Material" m ON m."PK_Material" = cr."PK_Material"
WHERE cr."PK_Finished_product" IS NOT NULL
  AND cr."PK_Detail" IS NULL AND cr."PK_Assembly_unit" IS NULL
ORDER BY cr."PK_Consumption_rate";

-- Потребность на программу (показатель 5)
SELECT m."Name", mr."Standard_quantity", mr."Current_balance", mr."Required_quantity"
FROM "Material_requirements" mr
JOIN "Material" m ON m."PK_Material" = mr."PK_Material"
WHERE mr."PK_Production_program" = 1
ORDER BY m."Name";

-- Калькуляция себестоимости стола
SELECT *, SUM(cost) OVER () AS total FROM fn_product_cost(1);

-- Норма кромки на боковину (показатель 3): деталь 1, кромка 3
SELECT fn_edge_norm(1, 3) AS "Кромка на боковину тумбы";
SELECT fn_edge_norm(5, 4) AS "Кромка на боковину шкафа";