(() => {
const { CONFIG, ROWS, library } = BM;
const { searchBooks, textQuery, coverUrl } = BM.ia;
const { openReader } = BM.reader;

const $ = (id) => document.getElementById(id);
const rowsEl = $("rows");
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
  img.src = coverUrl(book.id);
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
  bg.style.backgroundImage = `url("${coverUrl(book.id)}")`;
  const img = document.createElement("img");
  img.className = "hero-cover";
  img.alt = book.title;
  img.src = coverUrl(book.id);
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
  body.append(el("p", "hero-meta", [book.author, book.year, book.pages && `${book.pages} pages`].filter(Boolean).join(" · ")));
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
        if (r.id === "quick") pickHero(books);
      } catch (err) {
        console.error(err);
        fillTrack(rowEls[i].track, [], "Couldn't load these books. Check the internet connection.");
      }
    })
  );
  if (!heroEl.childElementCount) pickHero(rowCache.get("popular") || []);
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
  grid.replaceChildren(...skeletonCards(12));
  try {
    const books = await searchBooks({ q, sort: "", rows: 60 });
    if (seq !== searchSeq) return;
    $("resultsTitle").textContent = books.length ? `Books about “${text}”` : `No books found for “${text}”. Try another word!`;
    grid.replaceChildren(...books.map(bookCard));
  } catch {
    if (seq !== searchSeq) return;
    $("resultsTitle").textContent = "Search isn't working right now. Check the internet connection.";
    grid.replaceChildren();
  }
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
  $("sheetCover").src = coverUrl(book.id);
  $("sheetTitle").textContent = book.title;
  $("sheetMeta").textContent = [book.author && `by ${book.author}`, book.year, book.pages && `${book.pages} pages`]
    .filter(Boolean)
    .join(" · ");
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
