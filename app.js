(() => {
const { CONFIG, ROWS, STORY_ROWS, library, stories } = BM;
const { searchBooks, textQuery, coverUrl } = BM.ia;
const { openReader } = BM.reader;

const $ = (id) => document.getElementById(id);
const rowsEl = $("rows");
const coverOf = (book) => book.cover || coverUrl(book.id);
const heroEl = $("hero");

// ---------- Cards ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function bookCard(book) {
  const card = el("button", "card");
  card.type = "button";
  card.setAttribute("aria-label", book.title);
  const cover = el("div", "card-cover");
  const img = document.createElement("img");
  img.loading = "lazy";
  img.alt = "";
  img.onload = () => img.classList.add("loaded");
  img.src = coverOf(book);
  cover.append(img);

  const prog = library.progressFor(book.id);
  if (prog && prog.page > 0 && !prog.finished) {
    const bar = el("div", "card-bar");
    const fill = el("span");
    fill.style.width = `${Math.round(((prog.page + 1) / prog.pages) * 100)}%`;
    bar.append(fill);
    cover.append(bar);
  } else if (prog?.finished) {
    cover.append(el("span", "card-badge", "★ Read"));
  } else if (stories.isStory(book)) {
    cover.append(el("span", "card-badge", "🔊"));
  } else if (book.pages && book.pages <= 40) {
    cover.append(el("span", "card-badge", "Short"));
  }
  card.append(cover, el("p", "card-title", book.title));
  card.addEventListener("click", () => openSheet(book));
  return card;
}

function skeletonCards(n = 8) {
  return Array.from({ length: n }, () => {
    const c = el("div", "card skeleton");
    c.append(el("div", "card-cover"));
    return c;
  });
}

function makeRow(title, id) {
  const row = el("section", "row");
  row.dataset.row = id;
  const head = el("div", "row-head");
  head.append(el("h2", "row-title", title));
  const wrap = el("div", "row-wrap");
  const track = el("div", "row-track");
  const left = el("button", "row-arrow left", "‹");
  const right = el("button", "row-arrow right", "›");
  left.setAttribute("aria-label", "Scroll left");
  right.setAttribute("aria-label", "Scroll right");
  left.onclick = () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: "smooth" });
  right.onclick = () => track.scrollBy({ left: track.clientWidth * 0.85, behavior: "smooth" });
  wrap.append(left, track, right);
  row.append(head, wrap);
  return { row, track };
}

function fillTrack(track, books, emptyText) {
  track.replaceChildren();
  if (!books.length) {
    track.append(el("p", "row-empty", emptyText || "No books here yet."));
    return;
  }
  books.forEach((b) => track.append(bookCard(b)));
}

// ---------- Home ----------
const rowCache = new Map();
let personalRows = { keep: null, mine: null };

function renderPersonalRows() {
  const keep = library.keepReading();
  const mine = library.savedBooks();
  for (const [key, title, books] of [
    ["keep", "Keep Reading", keep],
    ["mine", "My Books", mine],
  ]) {
    if (!books.length) {
      personalRows[key]?.row.remove();
      personalRows[key] = null;
      continue;
    }
    if (!personalRows[key]) {
      personalRows[key] = makeRow(title, key);
      const anchor = key === "keep" ? rowsEl.firstChild : personalRows.keep?.row.nextSibling || rowsEl.firstChild;
      rowsEl.insertBefore(personalRows[key].row, anchor);
    }
    fillTrack(personalRows[key].track, books);
  }
}

function renderHero(book) {
  heroBook = book;
  heroEl.replaceChildren();
  const bg = el("div", "hero-bg");
  bg.style.backgroundImage = `url("${coverOf(book)}")`;
  const img = document.createElement("img");
  img.className = "hero-cover";
  img.alt = book.title;
  img.src = coverOf(book);
  img.onclick = () => openSheet(book);
  const body = el("div");
  const name = readerName();
  const greet = el("button", "hero-greet", name ? `Hi, ${name}! Today's pick:` : "Hi there! Today's pick:");
  greet.title = "Tap to change your name";
  greet.onclick = askName;
  body.append(greet);
  if (!name) {
    const add = el("button", "name-chip", "✎ Tell me your name");
    add.onclick = askName;
    body.append(add);
  }
  body.append(el("h1", "hero-title", book.title));
  body.append(el("p", "hero-meta", metaLine(book)));
  const actions = el("div", "actions");
  const read = el("button", "btn btn-primary", "▶ Read now");
  read.onclick = () => startReading(book);
  const more = el("button", "btn btn-ghost", "More info");
  more.onclick = () => openSheet(book);
  actions.append(read, more);
  body.append(actions);
  const done = library.finishedCount();
  if (done) body.append(el("p", "hero-stat", `★ You've finished ${done} book${done === 1 ? "" : "s"}!`));
  heroEl.append(bg, img, body);
}

function metaLine(book) {
  const story = stories.isStory(book);
  return [
    book.author && `by ${book.author}`,
    story && book.illus && book.illus !== book.author && `pictures by ${book.illus}`,
    book.year,
    book.pages && `${book.pages} pages`,
    story && "🔊 Read to me",
  ]
    .filter(Boolean)
    .join(" · ");
}

// The reader's name lives only in this browser, never in the published code.
const NAME_KEY = "book-machine:name";
let heroBook = null;

function readerName() {
  try {
    return localStorage.getItem(NAME_KEY) || CONFIG.readerName || "";
  } catch {
    return CONFIG.readerName || "";
  }
}

function askName() {
  const typed = window.prompt("What's your name?", readerName());
  if (typed == null) return;
  const clean = typed.trim().slice(0, 20);
  try {
    if (clean) localStorage.setItem(NAME_KEY, clean);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* storage blocked: greeting just stays generic */
  }
  if (heroBook) renderHero(heroBook);
}

async function loadHome() {
  // Modern picture books come from a local list, so these rows appear instantly.
  STORY_ROWS.forEach((r, i) => {
    const books = stories.row(r.filter, CONFIG.rowSize, i + 1);
    if (!books.length) return;
    const made = makeRow(r.title, r.id);
    fillTrack(made.track, books);
    rowsEl.append(made.row);
    rowCache.set(r.id, books);
  });
  if (rowCache.get("new")) pickHero(rowCache.get("new"));

  const rowEls = ROWS.map((r) => {
    const made = makeRow(r.title, r.id);
    made.track.append(...skeletonCards());
    rowsEl.append(made.row);
    return made;
  });
  renderPersonalRows();

  await Promise.all(
    ROWS.map(async (r, i) => {
      try {
        const books = await searchBooks({ q: r.q, sort: r.sort, rows: CONFIG.rowSize });
        rowCache.set(r.id, books);
        fillTrack(rowEls[i].track, books);
      } catch (err) {
        console.error(err);
        fillTrack(rowEls[i].track, [], "Couldn't load these books. Check the internet connection.");
      }
    })
  );
  if (!heroEl.childElementCount) pickHero(rowCache.get("quick") || rowCache.get("popular") || []);
}

function pickHero(books) {
  // Same pick all day, a new one tomorrow.
  const day = Math.floor(Date.now() / 86400000);
  const pool = books.slice(0, 20);
  if (pool.length) renderHero(pool[day % pool.length]);
}

// ---------- Search ----------
const searchInput = $("searchInput");
const searchClear = $("searchClear");
let searchTimer;
let searchSeq = 0;

async function runSearch(text) {
  const seq = ++searchSeq;
  const q = textQuery(text);
  if (!q) return showHome();
  $("home").hidden = true;
  $("results").hidden = false;
  $("resultsTitle").textContent = `Looking for “${text}”…`;
  const grid = $("resultsGrid");
  // Modern picture books first (searched on this device), then classics from the Internet Archive.
  const local = stories.search(text).slice(0, 60);
  grid.replaceChildren(...local.map(bookCard), ...skeletonCards(local.length ? 4 : 12));
  let classics = [];
  let failed = false;
  try {
    classics = await searchBooks({ q, sort: "", rows: 40 });
  } catch {
    failed = true;
  }
  if (seq !== searchSeq) return;
  const total = local.length + classics.length;
  $("resultsTitle").textContent = total
    ? `Books about “${text}”`
    : failed
      ? "Search isn't working right now. Check the internet connection."
      : `No books found for “${text}”. Try another word!`;
  grid.replaceChildren(...local.map(bookCard), ...classics.map(bookCard));
}

function showHome() {
  searchSeq++;
  $("results").hidden = true;
  $("home").hidden = false;
}

searchInput.addEventListener("input", () => {
  searchClear.hidden = !searchInput.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value.trim()), 450);
});
$("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(searchTimer);
  searchInput.blur();
  runSearch(searchInput.value.trim());
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.hidden = true;
  showHome();
});

// ---------- Details sheet ----------
let sheetBook = null;

function openSheet(book) {
  sheetBook = book;
  $("sheetCover").src = coverOf(book);
  $("sheetTitle").textContent = book.title;
  $("sheetMeta").textContent = metaLine(book);
  $("sheetBlurb").textContent = book.blurb || "";
  $("sheetBlurb").hidden = !book.blurb;
  const credit = $("sheetCredit");
  if (stories.isStory(book)) {
    const c = stories.credit(book);
    const a = document.createElement("a");
    a.href = c.license.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = c.license.name;
    credit.replaceChildren(`From ${c.publisher}. Free to read and share under `, a, ".");
    credit.hidden = false;
  } else {
    credit.textContent = "A classic from the Internet Archive's Children's Library.";
    credit.hidden = false;
  }
  const prog = library.progressFor(book.id);
  const bar = $("sheetProgress");
  if (prog && prog.page > 0 && !prog.finished) {
    bar.hidden = false;
    bar.firstElementChild.style.width = `${Math.round(((prog.page + 1) / prog.pages) * 100)}%`;
    $("sheetRead").textContent = `▶ Keep reading (page ${prog.page + 1})`;
  } else {
    bar.hidden = true;
    $("sheetRead").textContent = prog?.finished ? "▶ Read again" : "▶ Read";
  }
  updateSaveBtn();
  $("sheet").hidden = false;
  $("sheetRead").focus();
}

function updateSaveBtn() {
  if (!sheetBook) return;
  $("sheetSave").textContent = library.isSaved(sheetBook.id) ? "♥ In My Books" : "♡ Add to My Books";
}

function closeSheet() {
  $("sheet").hidden = true;
}

$("sheetClose").onclick = closeSheet;
$("sheet").addEventListener("click", (e) => {
  if (e.target.id === "sheet") closeSheet();
});
$("sheetSave").onclick = () => {
  library.toggleSaved(sheetBook);
  updateSaveBtn();
};
$("sheetRead").onclick = () => {
  closeSheet();
  startReading(sheetBook);
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("sheet").hidden) closeSheet();
});

function startReading(book) {
  const prog = library.progressFor(book.id);
  const start = prog && !prog.finished ? prog.page : 0;
  openReader(book, start, {
    onPick: () => {
      searchInput.value = "";
      showHome();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
}

// ---------- Boot ----------
library.onChange(() => {
  renderPersonalRows();
  updateSaveBtn();
});
document.title = CONFIG.appName;
loadHome();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
})();
