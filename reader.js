(() => {
const { bookDetails, pageUrl } = BM.ia;
const { library } = BM;

const $ = (id) => document.getElementById(id);
const reader = $("reader");
const stage = $("stage");
const track = $("track");
const slots = [...track.querySelectorAll("img")];
const spinner = $("spinner");
const slider = $("pageSlider");
const label = $("pageLabel");
const theEnd = $("theEnd");

let book = null;
let pages = 0;
let index = 0;
let width = 1000;
let busy = false;
let hooks = {};
let chromeTimer;

const BASE = -100 / 3; // track is 3 slots wide; middle slot is "current"

function src(i) {
  return i >= 0 && i < pages ? pageUrl(book.id, i, width) : "";
}

function setTrack(offsetPx, animate) {
  track.classList.toggle("animating", Boolean(animate));
  track.style.transform = `translateX(calc(${BASE}% + ${offsetPx}px))`;
}

function setSlotsTo(i) {
  [i - 1, i, i + 1].forEach((p, k) => {
    const s = src(p);
    if (slots[k].getAttribute("src") !== s) {
      if (s) slots[k].src = s;
      else slots[k].removeAttribute("src");
    }
  });
}

function render() {
  setSlotsTo(index);
  setTrack(0, false);
  // Warm up the next couple of pages so swiping feels instant.
  [index + 2, index + 3].forEach((p) => {
    if (p < pages) new Image().src = src(p);
  });
  const cur = slots[1];
  spinner.hidden = cur.complete && cur.naturalWidth > 0;
  cur.onload = () => (spinner.hidden = true);
  cur.onerror = () => (spinner.hidden = true);

  slider.max = String(pages - 1);
  slider.value = String(index);
  label.textContent = `Page ${index + 1} of ${pages}`;
  $("prevBtn").disabled = index === 0;
  library.setProgress(book, index, pages);
}

function go(delta) {
  if (busy || !book) return;
  if (delta > 0 && index >= pages - 1) return showEnd();
  if (delta < 0 && index <= 0) return setTrack(0, true);
  busy = true;
  const stageW = stage.clientWidth;
  setTrack(-delta * stageW, true);
  const done = () => {
    track.removeEventListener("transitionend", done);
    clearTimeout(fallback);
    busy = false;
    if (!book) return; // reader was closed mid-swipe
    index += delta;
    // Shift images over without re-downloading: the slot we slid to becomes the middle.
    render();
  };
  const fallback = setTimeout(done, 450);
  track.addEventListener("transitionend", done);
}

function jumpTo(i) {
  index = Math.max(0, Math.min(pages - 1, i));
  render();
}

function showEnd() {
  library.setProgress(book, pages - 1, pages);
  $("theEndText").textContent = `You finished “${book.title}”!`;
  theEnd.hidden = false;
  $("endPick").focus();
}

function showChrome() {
  reader.classList.remove("chrome-hidden");
  clearTimeout(chromeTimer);
}

function toggleChrome() {
  reader.classList.toggle("chrome-hidden");
}

// ---------- Touch / mouse swiping ----------
let drag = null;

stage.addEventListener("pointerdown", (e) => {
  if (busy || e.button > 0 || e.target.closest(".nav-btn")) return;
  drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, id: e.pointerId };
  stage.setPointerCapture(e.pointerId);
});

stage.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  let dx = e.clientX - drag.x;
  // Rubber-band at the first and last page.
  if ((dx > 0 && index === 0) || (dx < 0 && index === pages - 1)) dx *= 0.3;
  drag.dx = dx;
  if (Math.abs(dx) > 4) setTrack(dx, false);
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { dx, x, y, t } = drag;
  drag = null;
  const dt = performance.now() - t;
  const moved = Math.abs(dx);
  const fast = moved > 30 && moved / dt > 0.45;
  if (moved > stage.clientWidth * 0.18 || fast) {
    go(dx < 0 ? 1 : -1);
  } else if (moved < 8 && Math.abs(e.clientY - y) < 8 && dt < 400) {
    setTrack(0, false);
    // Tap: left side = back, right side = forward, middle = show/hide buttons.
    const rel = (x - stage.getBoundingClientRect().left) / stage.clientWidth;
    if (rel < 0.28) go(-1);
    else if (rel > 0.72) go(1);
    else toggleChrome();
  } else {
    setTrack(0, true);
  }
}
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

$("prevBtn").addEventListener("click", () => go(-1));
$("nextBtn").addEventListener("click", () => go(1));
slider.addEventListener("input", () => (label.textContent = `Page ${Number(slider.value) + 1} of ${pages}`));
slider.addEventListener("change", () => jumpTo(Number(slider.value)));

document.addEventListener("keydown", (e) => {
  if (reader.hidden) return;
  if (e.key === "Escape") return closeReader();
  if (!theEnd.hidden) return;
  if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
    e.preventDefault();
    go(1);
  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    go(-1);
  }
});

window.addEventListener("resize", () => !reader.hidden && setTrack(0, false));

// ---------- Open / close ----------
function updateSaveIcon() {
  const saved = book && library.isSaved(book.id);
  $("readerSave").textContent = saved ? "♥" : "♡";
  $("readerSave").setAttribute("aria-label", saved ? "Remove from My Books" : "Save to My Books");
}

$("readerSave").addEventListener("click", () => {
  library.toggleSaved(book);
  updateSaveIcon();
});
$("readerClose").addEventListener("click", () => closeReader());
$("endAgain").addEventListener("click", () => {
  theEnd.hidden = true;
  jumpTo(0);
});
$("endPick").addEventListener("click", () => {
  closeReader();
  hooks.onPick?.();
});

window.addEventListener("popstate", () => {
  if (!reader.hidden) closeReader(true);
});

function pickWidth() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const need = Math.min(window.innerWidth, window.innerHeight * 0.78) * dpr;
  return Math.max(400, Math.min(1600, Math.ceil(need / 200) * 200));
}

async function openReader(b, startPage = 0, opts = {}) {
  book = b;
  hooks = opts;
  pages = b.pages || 0;
  index = startPage;
  width = pickWidth();
  theEnd.hidden = true;
  $("readerTitle").textContent = b.title;
  updateSaveIcon();
  showChrome();
  slots.forEach((s) => s.removeAttribute("src"));
  spinner.hidden = false;
  reader.hidden = false;
  document.body.style.overflow = "hidden";
  history.pushState({ reader: b.id }, "");

  try {
    const details = await bookDetails(b.id);
    if (book !== b) return;
    if (details.pages) pages = details.pages;
  } catch {
    /* fall back to the page count from search */
  }
  if (!pages) {
    $("readerTitle").textContent = "Sorry, this book won't open. Try another one!";
    spinner.hidden = true;
    return;
  }
  index = Math.min(index, pages - 1);
  render();
  // Hide the buttons after a moment so the page fills the screen.
  chromeTimer = setTimeout(() => reader.classList.add("chrome-hidden"), 3500);
}

function closeReader(fromHistory = false) {
  reader.hidden = true;
  theEnd.hidden = true;
  document.body.style.overflow = "";
  clearTimeout(chromeTimer);
  book = null;
  if (!fromHistory && history.state?.reader) history.back();
}

BM.reader = { openReader, closeReader };
})();
