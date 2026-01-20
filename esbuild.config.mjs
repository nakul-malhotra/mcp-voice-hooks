import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/client/main.tsx'],
  bundle: true,
  outfile: 'public/bundle.js',
  format: 'esm',
  target: 'es2020',
  sourcemap: isDev,
  minify: !isDev,
  plugins: [],
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.jsx': 'jsx',
    '.js': 'js',
    '.css': 'empty',
  },
  logLevel: 'info',
};

if (isDev) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(config);
}
