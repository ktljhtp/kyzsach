import { build, context } from 'esbuild';

const opts = {
  entryPoints: ['src/client/main.ts'],
  bundle: true,
  outfile: 'public/app.js',
  target: 'es2021',
  sourcemap: true,
  minify: !process.argv.includes('--watch'),
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(opts);
  await ctx.watch();
} else {
  await build(opts);
}
