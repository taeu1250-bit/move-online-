import { build } from 'esbuild'
import { readdir, readFile, mkdir, copyFile } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
const local = process.argv.includes('--emulator')
const root = local ? '.sites-runtime/emulator-client' : '.client-build'
const types = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
}
const assets = {}
for (const file of await readdir(root, {
  recursive: true,
  withFileTypes: true,
})) {
  if (!file.isFile()) continue
  const filename = join(file.parentPath, file.name)
  const url = filename.slice(root.length).replaceAll('\\', '/')
  assets[url] = [
    types[extname(filename)] || 'application/octet-stream',
    (await readFile(filename)).toString('base64'),
  ]
}
await build({
  entryPoints: ['server/index.mjs'],
  outfile: local ? '.sites-runtime/emulator/index.js' : 'dist/server/index.js',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  plugins: [
    {
      name: 'client-assets',
      setup(b) {
        if (local)
          b.onResolve({ filter: /^\.\/token\.mjs$/ }, () => ({
            path: resolve('scripts/emulator-claims.mjs'),
          }))
        b.onResolve({ filter: /^moov:client-assets$/ }, () => ({
          path: 'assets',
          namespace: 'moov',
        }))
        b.onLoad({ filter: /.*/, namespace: 'moov' }, () => ({
          loader: 'json',
          contents: JSON.stringify(assets),
        }))
      },
    },
  ],
})
if (!local) {
  await mkdir('dist/.openai', { recursive: true })
  await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json')
}
