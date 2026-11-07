// Small wrapper around the Internet Archive's public APIs.
(() => {

const FIELDS = ["identifier", "title", "creator", "date", "imagecount"];

function cleanTitle(t) {
  if (Array.isArray(t)) t = t[0];
  return String(t || "Untitled").replace(/\s*[:/;,.]\s*$/, "").trim();
}

function cleanCreator(c) {
  if (Array.isArray(c)) c = c[0];
  if (!c) return "";
  // "Dalziel, Edward, 1817-1905" -> "Edward Dalziel"
  const parts = String(c).replace(/,?\s*\d{3,4}\s*-\s*\d{0,4}\.?$/, "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && !/\d/.test(parts[1])) return `${parts[1]} ${parts[0]}`;
  return parts[0] || "";
}

function cleanYear(d) {
  if (Array.isArray(d)) d = d[0];
  const m = String(d || "").match(/\d{4}/);
  return m ? m[0] : "";
}

function toBook(doc) {
  return {
    id: doc.identifier,
    title: cleanTitle(doc.title),
    author: cleanCreator(doc.creator),
    year: cleanYear(doc.date),
    pages: Number(doc.imagecount) || 0,
  };
}

function coverUrl(id) {
  return `https://archive.org/services/img/${encodeURIComponent(id)}`;
}

function pageUrl(id, index, width) {
  return `https://archive.org/download/${encodeURIComponent(id)}/page/n${index}_w${width}.jpg`;
}

async function searchBooks({ q = "", sort = "downloads desc", rows = 30, page = 1 } = {}) {
  const query = q ? `${BM.BASE_QUERY} AND ${q}` : BM.BASE_QUERY;
  const params = new URLSearchParams({ q: query, rows: String(rows), page: String(page), output: "json" });
  FIELDS.forEach((f) => params.append("fl[]", f));
  if (sort) params.append("sort[]", sort);
  const res = await fetch(`https://archive.org/advancedsearch.php?${params}`);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return data.response.docs.map(toBook).filter((b) => b.pages > 2);
}

// Turn what a kid types into a safe search clause.
function textQuery(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 6);
  if (!words.length) return "";
  // "bears" -> bear* so it also finds "bear", "bears", "bear's"...
  const plain = words.map((w) => w.replace(/'/g, ""));
  const exact = plain.join(" AND ");
  const wild = plain.map((w) => (w.length > 3 ? `${w.replace(/(es|s)$/, "")}*` : w)).join(" AND ");
  // Title matches rank highest; authors only match whole words.
  return `(title:(${exact})^8 OR title:(${wild})^4 OR subject:(${wild}) OR creator:(${exact}))`;
}

// Page count and reading direction for one book.
async function bookDetails(id) {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}/metadata`);
  if (!res.ok) throw new Error(`Couldn't open book (${res.status})`);
  const { result } = await res.json();
  return {
    pages: Number(result?.imagecount) || 0,
    rtl: String(result?.["page-progression"] || "lr") === "rl",
  };
}

BM.ia = { toBook, coverUrl, pageUrl, searchBooks, textQuery, bookDetails };
})();
