// Dijalankan oleh GitHub Actions (lihat .github/workflows/weekly-events.yml).
// 1. Baca RSS RockstarINTEL dan cari artikel event mingguan GTA Online terbaru.
// 2. Jika minggunya sama dengan data/events/current.json, berhenti (tidak ada perubahan).
// 3. Jika baru: arsipkan data lama, tulis draf baru, dan siapkan isi Pull Request.
// Tidak memakai paket tambahan; butuh Node.js 18+ (fetch bawaan).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRss, pickEventItem, parseWeekFromTitle, htmlToBlocks, extractItems, buildEventFile } from './lib/event-parser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CURRENT = path.join(ROOT, 'data/events/current.json');
const ARCHIVE_DIR = path.join(ROOT, 'data/events/archive');
const FEEDS = process.env.EVENT_FEEDS
  ? process.env.EVENT_FEEDS.split(',') // hanya untuk pengujian lokal
  : ['https://rockstarintel.com/feed/', 'https://rockstarintel.com/category/gta/event-week/feed/'];
const HEADERS = { 'User-Agent': 'gta-coach-weekly-events/1.0 (GitHub Actions; fan project)', Accept: 'application/rss+xml, text/html;q=0.9' };

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(`${key}=${value}`);
}

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function findArticle() {
  const errors = [];
  for (const feed of FEEDS) {
    try {
      const item = pickEventItem(parseRss(await get(feed)));
      if (item) return item;
      errors.push(`${feed}: tidak ada artikel event mingguan`);
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(`Sumber event tidak bisa dibaca:\n- ${errors.join('\n- ')}`);
}

async function main() {
  const article = await findArticle();
  console.log(`Artikel terbaru: ${article.title}\n${article.link}`);

  const week = parseWeekFromTitle(article.title, article.pubDate);
  if (!week) throw new Error(`Tanggal minggu tidak terbaca dari judul: "${article.title}". Perbarui data event secara manual.`);

  const current = fs.existsSync(CURRENT) ? JSON.parse(fs.readFileSync(CURRENT, 'utf8')) : null;
  if (current?.week?.startsAt === week.startsAt) {
    console.log('Minggu ini sudah ada di data/events/current.json. Tidak ada perubahan.');
    output('changed', 'false');
    return;
  }
  if (current?.week?.startsAt && Date.parse(current.week.startsAt) > Date.parse(week.startsAt)) {
    console.log('Artikel RSS lebih lama dari data yang ada. Tidak ada perubahan.');
    output('changed', 'false');
    return;
  }

  const html = article.content || (await get(article.link));
  const { items, unparsed } = extractItems(htmlToBlocks(html));
  if (items.length < 3) throw new Error(`Hanya ${items.length} item terbaca dari artikel; format situs mungkin berubah. Perbarui data event secara manual.`);

  if (current?.week?.startsAt) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARCHIVE_DIR, `${current.week.startsAt.slice(0, 10)}.json`), JSON.stringify(current, null, 2) + '\n');
  }
  const file = buildEventFile({ article, week, items, fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z') });
  fs.writeFileSync(CURRENT, JSON.stringify(file, null, 2) + '\n');

  const body = [
    `Draf otomatis event mingguan **${file.title}** (${week.startsAt.slice(0, 10)} sampai reset ${week.endsAt.slice(0, 10)}).`,
    '',
    `Sumber draf: ${article.link}`,
    'Sumber resmi untuk dicocokkan: https://www.rockstargames.com/newswire',
    '',
    '## Sebelum menekan Merge',
    '- [ ] Buka artikel GTA Online minggu ini di Rockstar Newswire.',
    '- [ ] Buka tab **Files changed** dan cocokkan setiap item di `data/events/current.json`.',
    '- [ ] Item dengan `target` akan dipakai kalkulator dan rekomendasi. Pastikan pemetaannya benar.',
    '- [ ] Jika ada yang salah, edit file lewat ikon pensil di tab Files changed, lalu commit ke branch ini.',
    '',
    'Merge Pull Request ini berarti data sudah Anda verifikasi.',
    '',
    `### Item terbaca (${items.length})`,
    ...items.map((i) => `- ${i.type}${i.value ? ` ${i.value}x` : ''}${i.percent ? ` ${i.percent}%` : ''}: ${i.label}${i.target ? ` → \`${i.target}\`` : ''}`),
    '',
    unparsed.length ? `### Baris yang tidak dikenali (${unparsed.length}) — cek manual\n${unparsed.map((u) => `- ${u}`).join('\n')}` : '### Semua baris di bagian bonus dan diskon dikenali.',
  ].join('\n');
  const bodyPath = path.join(process.env.RUNNER_TEMP || ROOT, 'event-pr-body.md');
  fs.writeFileSync(bodyPath, body + '\n');

  output('changed', 'true');
  output('week', week.startsAt.slice(0, 10));
  output('title', file.title.replace(/[\r\n]/g, ' '));
  output('body_path', bodyPath);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
