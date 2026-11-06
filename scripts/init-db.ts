import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

// Запуск: npm run db:init            — полная (пере)установка БД: BDScript.sql + расширения
//         npm run db:init -- --ext   — только расширения (данные не затрагиваются)
async function main() {
  const onlyExt = process.argv.includes('--ext');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (!onlyExt) {
      console.log('→ BDScript.sql (таблицы, данные, view, функции, процедуры)…');
      await client.query(fs.readFileSync(path.resolve('db/BDScript.sql'), 'utf8'));
    }
    console.log('→ extensions.sql (факт, история версий, аудит)…');
    await client.query(fs.readFileSync(path.resolve('db/extensions.sql'), 'utf8'));
    console.log('Готово.');
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
