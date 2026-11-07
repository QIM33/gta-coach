import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);

test('setiap file di APP_SHELL service worker benar-benar ada (satu file hilang menggagalkan mode offline)', () => {
  const sw = fs.readFileSync(new URL('sw.js', root), 'utf8');
  const list = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(list.length > 20);
  for (const file of list) assert.ok(fs.existsSync(new URL(file, root)), `tidak ada: ${file}`);
});

test('semua file JS aplikasi tercantum di APP_SHELL', () => {
  const sw = fs.readFileSync(new URL('sw.js', root), 'utf8');
  const walk = (dir) =>
    fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}${d.name}/`) : [`${dir}${d.name}`]));
  for (const file of walk('js/')) assert.ok(sw.includes(`'./${file}'`), `belum dicache: ${file}`);
});

test('data/guides.json valid dan setiap sumber punya URL', () => {
  const g = JSON.parse(fs.readFileSync(new URL('data/guides.json', root), 'utf8'));
  assert.ok(g.guides.length >= 5);
  const ids = new Set();
  for (const guide of g.guides) {
    assert.match(guide.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(guide.id));
    ids.add(guide.id);
    assert.ok(guide.sections.length > 0);
    for (const s of guide.sources) assert.match(s.url, /^https:\/\//);
  }
});

test('manifest valid dan ikonnya ada', () => {
  const m = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
  assert.equal(m.display, 'standalone');
  for (const icon of m.icons) assert.ok(fs.existsSync(new URL(icon.src, root)), icon.src);
});
