// Parser artikel event mingguan GTA Online (sumber: RockstarINTEL).
// Fungsi murni tanpa jaringan, agar bisa diuji dengan contoh di tests/.
// Hasilnya selalu draf: pemilik repo mencocokkannya dengan Rockstar Newswire
// sebelum menekan Merge pada Pull Request.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const RESET_HOUR_UTC = 10; // reset mingguan sekitar 10.00 UTC hari Kamis

// ---------- Teks & HTML ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—', '#038': '&', hellip: '…' };

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(#?[a-z0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? (name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : m));
}

const stripTags = (html) => decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Mengubah HTML artikel menjadi urutan blok: heading, li, p (beserta teks tebalnya). */
export function htmlToBlocks(html) {
  const cleaned = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ');
  const blocks = [];
  const re = /<(h[1-6]|li|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(cleaned))) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    const text = stripTags(inner);
    if (!text) continue;
    const strong = [...inner.matchAll(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((s) => stripTags(s[2])).filter(Boolean);
    blocks.push({ type: tag.startsWith('h') ? 'heading' : tag, text, strong });
  }
  return blocks;
}

// ---------- RSS ----------

function tagContent(xml, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (!m) return '';
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(m[1]);
  return cdata ? cdata[1] : decodeEntities(m[1]).trim();
}

export function parseRss(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => ({
    title: stripTags(tagContent(m[1], 'title')),
    link: tagContent(m[1], 'link').trim(),
    pubDate: tagContent(m[1], 'pubDate').trim(),
    content: tagContent(m[1], 'content:encoded'),
  }));
}

/** Artikel event mingguan GTA Online terbaru (RSS sudah berurutan dari yang terbaru). */
export function pickEventItem(items) {
  return items.find((i) => /gta online/i.test(i.title) && /event week|weekly update/i.test(i.title)) ?? null;
}

// ---------- Tanggal ----------

const iso = (y, m, d) => new Date(Date.UTC(y, m, d, RESET_HOUR_UTC)).toISOString().replace('.000Z', 'Z');

/**
 * "(November 5th-11th)" atau "(October 29th-November 4th)" → { startsAt, endsAt }.
 * Tahun diambil dari tanggal terbit. endsAt = reset hari setelah tanggal terakhir di judul.
 */
export function parseWeekFromTitle(title, pubDate) {
  const re = /\(\s*([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(?:([a-z]+)\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*\)/i;
  const m = re.exec(title);
  if (!m) return null;
  const m1 = MONTHS.indexOf(m[1].toLowerCase());
  const m2 = m[3] ? MONTHS.indexOf(m[3].toLowerCase()) : m1;
  if (m1 < 0 || m2 < 0) return null;
  const published = new Date(pubDate);
  let year = Number.isFinite(published.getTime()) ? published.getUTCFullYear() : new Date().getUTCFullYear();
  // Artikel terbit akhir Desember untuk minggu yang mulai Januari
  if (Number.isFinite(published.getTime()) && published.getUTCMonth() === 11 && m1 === 0) year += 1;
  const endYear = m2 < m1 ? year + 1 : year;
  const start = iso(year, m1, Number(m[2]));
  const end = iso(endYear, m2, Number(m[4]) + 1);
  if (Date.parse(end) <= Date.parse(start)) return null;
  return { startsAt: start, endsAt: end };
}

// ---------- Pemetaan ke bisnis di data/businesses.json ----------
// Hanya kata kunci yang jelas cocok dengan skenario yang dimodelkan.
// Contoh: bonus Payphone Hit TIDAK dipetakan ke Agency karena skenario Agency adalah kontrak Dr. Dre.
const TARGETS = [
  [/cayo perico/i, 'cayo-perico-heist'],
  [/kortz center/i, 'kortz-center-heist'],
  [/acid lab|acid product/i, 'acid-lab'],
  [/bunker|gunrunning/i, 'bunker'],
  [/salvage yard robber/i, 'salvage-yard'],
  [/bail office|bounty|bounties/i, 'bail-office'],
  [/auto shop|robbery contract/i, 'auto-shop'],
  [/vip contract|dr\.? dre/i, 'agency'],
  [/money laundering|car wash/i, 'hands-on-car-wash'],
];

export function mapTarget(text) {
  for (const [re, id] of TARGETS) if (re.test(text)) return id;
  return null;
}

// ---------- Isi event ----------

function sectionOf(heading) {
  const h = heading.toLowerCase();
  if (/\d+\s*%\s*off/.test(h)) return { section: 'discount', percent: Number(/(\d+)\s*%/.exec(h)[1]) };
  if (/discount/.test(h)) return { section: 'discount' };
  if (/bonus/.test(h)) return { section: 'bonus' };
  if (/weekly challenge/.test(h)) return { section: 'challenge' };
  if (/podium/.test(h)) return { section: 'podium' };
  if (/reward/.test(h)) return { section: 'reward' };
  return { section: null };
}

const money = (text) => {
  const m = /(?:GTA)?\$\s?([\d,]{4,})/.exec(text);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

/** Mengubah blok artikel menjadi item event + catatan baris yang tidak dikenali. */
export function extractItems(blocks) {
  const items = [];
  const unparsed = [];
  let section = null;
  let percent = null;

  for (const b of blocks) {
    if (b.type === 'heading') {
      const s = sectionOf(b.text);
      section = s.section;
      percent = s.percent ?? (s.section === 'discount' ? percent : null);
      continue;
    }

    const text = b.text;

    // Target dijamin bisa muncul di bagian mana pun.
    if (/guaranteed/i.test(text) && mapTarget(text)) {
      items.push({ type: 'guaranteed-target', target: mapTarget(text), label: text });
      continue;
    }

    if (section === 'bonus' && b.type === 'li') {
      const m = /^(\d+(?:\.\d+)?)\s*x\s+(.*)$/i.exec(text);
      if (!m) {
        unparsed.push(text);
        continue;
      }
      const value = Number(m[1]);
      let rest = m[2];
      const plus = /\((\d+(?:\.\d+)?)\s*x for gta\+ members?\)/i.exec(rest);
      rest = rest.replace(/\([^)]*gta\+[^)]*\)/i, '').trim();
      const first = /first[- ]time completion bonus for\s+(.*)$/i.exec(rest);
      if (first) {
        items.push({ type: 'first-completion', value, label: `Bonus penyelesaian pertama: ${first[1].trim()}` });
        continue;
      }
      const on = /^(GTA\$\s*(?:&|and)\s*RP|GTA\$|RP)?\s*(?:on|in|for)\s+(.*)$/i.exec(rest);
      const label = (on ? on[2] : rest).replace(/^[–-]\s*/, '').trim();
      const what = on?.[1] ? on[1].replace(/&|and/i, 'dan').replace(/\s+/g, ' ') : 'GTA$ dan RP';
      const item = { type: 'multiplier', value, label, note: what };
      const target = mapTarget(label);
      if (target) item.target = target;
      if (plus) item.gtaPlusValue = Number(plus[1]);
      items.push(item);
      continue;
    }

    if (section === 'discount' && b.type === 'li') {
      const inline = /(\d+)\s*%\s*off\s*:?\s*(.*)$/i.exec(text);
      const pct = inline ? Number(inline[1]) : percent;
      if (!pct) {
        unparsed.push(text);
        continue;
      }
      items.push({ type: 'discount', percent: pct, label: inline ? inline[2] : text });
      continue;
    }

    if (section === 'challenge') {
      items.push({ type: 'challenge', label: `Tantangan mingguan: ${text}`, reward: money(text) });
      section = null; // satu paragraf cukup
      continue;
    }

    if (section === 'podium') {
      const name = b.strong[0];
      if (name) items.push({ type: 'podium', label: `Kendaraan podium Lucky Wheel: ${name}` });
      else unparsed.push(text);
      section = null;
      continue;
    }

    if (section === 'reward' && b.type === 'li') {
      items.push({ type: 'reward', label: text });
    }
  }

  return { items, unparsed };
}

/** Menyusun isi data/events/current.json dari hasil parsing. */
export function buildEventFile({ article, week, items, fetchedAt }) {
  const title = /:\s*(.+?)\s*\(/.exec(article.title)?.[1] ?? article.title;
  return {
    schemaVersion: 1,
    status: 'verified',
    title,
    week,
    timeNote: 'Jam reset mingguan sekitar 10.00 UTC (17.00 WIB) hari Kamis; jam pastinya bisa bergeser.',
    sourceLevel: 'secondary',
    verificationNote: 'Draf otomatis dari RockstarINTEL, dicocokkan dengan Rockstar Newswire oleh pemilik repo sebelum di-merge.',
    source: 'https://www.rockstargames.com/newswire',
    sources: [{ title: `RockstarINTEL: ${article.title}`, url: article.link }],
    fetchedAt,
    // Verifikasi terjadi saat Pull Request di-merge; waktunya tercatat di riwayat GitHub.
    verifiedAt: null,
    items,
  };
}
