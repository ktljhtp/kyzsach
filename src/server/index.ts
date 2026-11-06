import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { authenticate, requireAuth } from './auth';
import { errorHandler } from './http';
import { pool } from './db';
import { authRouter } from './routes/auth';
import { refsRouter } from './routes/refs';
import { productsRouter } from './routes/products';
import { layoutsRouter } from './routes/layouts';
import { normsRouter } from './routes/norms';
import { calcRouter } from './routes/calc';
import { programsRouter } from './routes/programs';
import { docsRouter } from './routes/docs';
import { factRouter } from './routes/fact';
import { adminRouter } from './routes/admin';
import { dashboardRouter } from './routes/dashboard';

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(authenticate);

app.use('/api/auth', authRouter);
const api = express.Router();
api.use(requireAuth);
for (const r of [dashboardRouter, refsRouter, productsRouter, layoutsRouter, normsRouter, calcRouter, programsRouter, docsRouter, factRouter])
  api.use(r);
api.use('/admin', adminRouter);
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено.' }));

const pub = path.resolve(__dirname, '../../public');
app.use(express.static(pub, { index: 'index.html', maxAge: '1h' }));
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
pool
  .query('SELECT 1')
  .then(() => app.listen(port, () => console.log(`Нормы-М: http://localhost:${port}`)))
  .catch((e) => {
    console.error('Нет подключения к БД. Проверьте DATABASE_URL в .env и выполните npm run db:init.\n', e.message);
    process.exit(1);
  });
