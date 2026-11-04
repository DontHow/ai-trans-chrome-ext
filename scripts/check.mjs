import { readFile, access, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
for (const path of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page]) await access(path);
for (const dir of ['src', 'tests', 'scripts']) for (const file of await readdir(dir)) if (/\.(js|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', `${dir}/${file}`]);
for (const html of ['popup.html', 'options.html']) {
  const source = await readFile(html, 'utf8');
  for (const [, path] of source.matchAll(/(?:src|href)="([^"?#]+)"/g)) await access(path);
  if (/\son\w+=|<script(?![^>]*\bsrc=)/.test(source)) throw new Error(`Inline script in ${html}`);
}
console.log('Manifest, local resources, CSP and JavaScript syntax checks passed.');
