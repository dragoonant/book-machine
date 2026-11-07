// Modern picture books with real text (Pratham Books, African Storybook, Book Dash).
// The list lives in catalog/index.js; each book's pages load on demand from
// catalog/text-NN.js. Pictures stream from the publishers' public GitHub repos.
(() => {
const RAW = "https://raw.githubusercontent.com/global-asp";
const SOURCES = {
  pb: {
    name: "Pratham Books",
    img: (id) => `${RAW}/pb-imagebank/master/medium/${id.slice(3)}/`,
    home: "https://storyweaver.org.in/",
  },
  asp: {
    name: "African Storybook",
    img: (id) => `${RAW}/asp-imagebank/master/medium/${id.slice(4)}/`,
    home: "https://www.africanstorybook.org/",
  },
  bd: {
    name: "Book Dash",
    img: (id) => `https://bookdash.github.io/bookdash-books/${id.slice(3)}/en/images/`,
    home: "https://bookdash.org/books/",
  },
};
const LICENSE = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };

const all = (BM.CATALOG || []).map((e) => ({
  ...e,
  cover: e.cover || SOURCES[e.src].img(e.id) + (e.src === "bd" ? "cover.jpg" : "01.jpg"),
}));
const byId = new Map(all.map((b) => [b.id, b]));

function isStory(book) {
  return Boolean(book && SOURCES[book.src]);
}

// ---------- Page text, loaded a chunk at a time with a <script> tag ----------
const chunks = new Map(); // n -> {id: {base, imgs, text, link}}
const waiting = new Map(); // n -> [resolve...]

BM.storyChunk = (n, data) => {
  chunks.set(n, data);
  (waiting.get(n) || []).forEach((fn) => fn(data));
  waiting.delete(n);
};

function loadChunk(n) {
  if (chunks.has(n)) return Promise.resolve(chunks.get(n));
  return new Promise((resolve, reject) => {
    const first = !waiting.has(n);
    waiting.set(n, [...(waiting.get(n) || []), resolve]);
    if (!first) return;
    const s = document.createElement("script");
    s.src = `catalog/text-${String(n).padStart(2, "0")}.js`;
    s.onerror = () => {
      waiting.delete(n);
      s.remove();
      reject(new Error("Couldn't load this story"));
    };
    document.head.append(s);
  });
}

// Pages for the reader: a title page, then picture + words.
async function loadPages(book) {
  const entry = byId.get(book.id) || book;
  const data = (await loadChunk(entry.chunk))[book.id];
  if (!data) throw new Error("Story not found");
  const pages = [{ img: entry.cover, title: entry.title, byline: byline(entry), cover: true }];
  data.text.forEach((text, i) => pages.push({ img: data.imgs[i] ? data.base + data.imgs[i] : "", text }));
  return pages;
}

function byline(b) {
  if (b.illus && b.illus !== b.author) return `Written by ${b.author}. Pictures by ${b.illus}.`;
  if (b.illus) return `Words and pictures by ${b.author}.`;
  return b.author ? `By ${b.author}.` : "";
}

function credit(book) {
  const b = byId.get(book.id) || book;
  const src = SOURCES[b.src];
  const extra = Object.entries(b.extra || {})
    .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`)
    .join(". ");
  return {
    text: [byline(b), extra && `${extra}.`, `From ${src.name}.`].filter(Boolean).join(" "),
    publisher: src.name,
    publisherUrl: src.home,
    license: LICENSE,
  };
}

// ---------- Rows and search ----------
function dailyShuffle(list, salt) {
  const day = Math.floor(Date.now() / 86400000);
  let seed = (day * 9301 + salt * 49297) % 233280;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function row(filter, size, salt) {
  return dailyShuffle(all.filter(filter), salt).slice(0, size);
}

function search(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w));
  if (!words.length) return [];
  const scored = [];
  for (const b of all) {
    const title = b.title.toLowerCase();
    const people = `${b.author} ${b.illus}`.toLowerCase();
    const more = `${b.kw} ${b.blurb || ""} ${(b.tags || []).join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 8;
      else if (more.includes(w)) score += 3;
      else if (people.includes(w)) score += 2;
      else {
        score = 0;
        break;
      }
    }
    if (score) scored.push([score, b]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, b]) => b);
}

BM.stories = { all, isStory, loadPages, credit, row, search, sourceName: (b) => SOURCES[b.src]?.name || "" };
})();
