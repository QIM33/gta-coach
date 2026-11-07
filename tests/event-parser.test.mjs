import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRss, pickEventItem, parseWeekFromTitle, htmlToBlocks, extractItems, buildEventFile, mapTarget, decodeEntities } from '../scripts/lib/event-parser.mjs';
import { eventStatus } from '../js/data.js';

const xml = fs.readFileSync(new URL('./fixtures/rockstarintel-feed.xml', import.meta.url), 'utf8');

test('RSS: memilih artikel event mingguan, bukan artikel lain yang lebih baru', () => {
  const items = parseRss(xml);
  assert.equal(items.length, 2);
  const ev = pickEventItem(items);
  assert.match(ev.title, /Halloween Event Ends/);
  assert.ok(ev.content.includes('<h3>Bonuses</h3>'));
});

test('tanggal minggu dari judul, termasuk lintas bulan dan lintas tahun', () => {
  assert.deepEqual(parseWeekFromTitle('GTA Online Event Week: X (October 29th-November 4th)', 'Wed, 28 Oct 2026 20:25:38 +0000'), {
    startsAt: '2026-10-29T10:00:00Z',
    endsAt: '2026-11-05T10:00:00Z',
  });
  assert.deepEqual(parseWeekFromTitle('GTA Online Event Week: The Heist Event (November 5th-11th)', 'Thu, 05 Nov 2026 10:00:00 +0000'), {
    startsAt: '2026-11-05T10:00:00Z',
    endsAt: '2026-11-12T10:00:00Z',
  });
  const nye = parseWeekFromTitle('GTA Online Event Week: New Year (December 31st-January 6th)', 'Wed, 30 Dec 2026 20:00:00 +0000');
  assert.equal(nye.startsAt, '2026-12-31T10:00:00Z');
  assert.equal(nye.endsAt, '2027-01-07T10:00:00Z');
  assert.equal(parseWeekFromTitle('GTA Online Event Week: tanpa tanggal', 'x'), null);
});

test('isi artikel: bonus, diskon, tantangan, podium; abaikan menu situs dan Gun Van', () => {
  const ev = pickEventItem(parseRss(xml));
  const { items, unparsed } = extractItems(htmlToBlocks(ev.content));
  const by = (type) => items.filter((i) => i.type === type);

  const mult = by('multiplier');
  assert.equal(mult.length, 4);
  assert.equal(mult[0].value, 3);
  assert.equal(mult[0].label, 'Halloween Featured Series: Slasher');
  assert.equal(mult[1].label, 'Halloween Survivals: Ludendorff Cemetery Survival');
  assert.equal(mult[1].gtaPlusValue, 6);
  assert.equal(mult[2].target, 'bail-office');
  assert.equal(mult[3].note, 'GTA$');

  assert.equal(by('first-completion').length, 1);
  assert.deepEqual(by('discount').map((d) => d.percent), [40, 40, 30]);
  assert.equal(by('challenge')[0].reward, 250000);
  assert.equal(by('podium')[0].label, 'Kendaraan podium Lucky Wheel: Progen GP1');
  assert.equal(by('reward').length, 2);

  assert.ok(!items.some((i) => /Charts|Knife|Shocker|monthly post/.test(i.label)), 'menu situs, Gun Van, dan GTA+ tidak ikut');
  assert.deepEqual(unparsed, ['Double rewards on something unusual']);
});

test('pemetaan target hanya untuk skenario yang dimodelkan', () => {
  assert.equal(mapTarget('Bail Office Standard and Most Wanted Targets'), 'bail-office');
  assert.equal(mapTarget('Acid Lab Sell Missions'), 'acid-lab');
  assert.equal(mapTarget('Payphone Hits'), null); // bukan skenario Agency (Dr. Dre)
  assert.equal(mapTarget('Dr. Dre VIP Contract'), 'agency');
});

test('file hasil build lolos pemeriksaan status website', () => {
  const ev = pickEventItem(parseRss(xml));
  const week = parseWeekFromTitle(ev.title, ev.pubDate);
  const { items } = extractItems(htmlToBlocks(ev.content));
  const file = buildEventFile({ article: ev, week, items, fetchedAt: '2026-10-29T11:30:00Z' });
  assert.equal(file.title, 'Halloween Event Ends');
  assert.equal(file.sourceLevel, 'secondary');
  assert.equal(eventStatus(file, new Date('2026-11-01T00:00:00Z')).state, 'active');
  assert.equal(eventStatus(file, new Date('2026-11-05T10:00:00Z')).state, 'expired');
});

test('decodeEntities', () => {
  assert.equal(decodeEntities('GTA$ &amp; RP &#8220;x&#8221; &#x41;'), 'GTA$ & RP “x” A');
});
