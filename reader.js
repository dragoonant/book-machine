(() => {
const { bookDetails, pageUrl } = BM.ia;
const { library, stories } = BM;

const $ = (id) => document.getElementById(id);
const reader = $("reader");
const stage = $("stage");
const track = $("track");
const slots = [...track.querySelectorAll(".page")];
const spinner = $("spinner");
const slider = $("pageSlider");
const label = $("pageLabel");
const theEnd = $("theEnd");
const speakBtn = $("readerSpeak");

let book = null;
let pages = 0;
let storyPages = null; // picture books with words: [{img, text} | {img, title, byline, cover}]
let index = 0;
let width = 1000;
let busy = false;
let hooks = {};
let chromeTimer;

const BASE = -100 / 3; // track is 3 slots wide; middle slot is "current"

// ---------- Pages ----------
function pageAt(i) {
  if (i < 0 || i >= pages) return null;
  if (storyPages) return storyPages[i];
  return { img: pageUrl(book.id, i, width) };
}

// What Read-to-me says for a page, plus where each word starts in that string.
function speechFor(page) {
  if (!page) return "";
  if (page.cover) return `${page.title}. ${page.byline}`;
  return (page.text || "").replace(/\n+/g, " ");
}

function wordsInto(parent, text, offset) {
  const re = /\S+/g;
  let m;
  let last = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    const w = document.createElement("span");
    w.className = "w";
    w.dataset.at = String(offset + m.index);
    w.textContent = m[0];
    parent.append(w);
    last = m.index + m[0].length;
  }
}

function fillSlot(fig, page, key) {
  if (fig.dataset.key === key) return;
  fig.dataset.key = key;
  const img = fig.querySelector("img");
  const box = fig.querySelector(".page-text");
  if (page?.img) img.src = page.img;
  else img.removeAttribute("src");
  box.replaceChildren();
  fig.className = "page";
  if (!page) return;
  if (page.cover) {
    fig.classList.add("is-cover", "has-text");
    const h = document.createElement("h2");
    wordsInto(h, page.title, 0);
    const p = document.createElement("p");
    wordsInto(p, page.byline, page.title.length + 2);
    box.append(h, p);
  } else if (page.text) {
    fig.classList.add("has-text");
    if (!page.img) fig.classList.add("text-only");
    // Paragraphs are joined with one space in the spoken string.
    let offset = 0;
    for (const para of page.text.split(/\n+/)) {
      const p = document.createElement("p");
      wordsInto(p, para, offset);
      box.append(p);
      offset += para.length + 1;
    }
  }
}

function setTrack(offsetPx, animate) {
  track.classList.toggle("animating", Boolean(animate));
  track.style.transform = `translateX(calc(${BASE}% + ${offsetPx}px))`;
}

function setSlotsTo(i) {
  [i - 1, i, i + 1].forEach((p, k) => fillSlot(slots[k], pageAt(p), `${book.id}:${p}`));
}

function render() {
  setSlotsTo(index);
  setTrack(0, false);
  // Warm up the next couple of pages so swiping feels instant.
  [index + 2, index + 3].forEach((p) => {
    const pg = pageAt(p);
    if (pg?.img) new Image().src = pg.img;
  });
  const cur = slots[1].querySelector("img");
  const hasImg = cur.hasAttribute("src");
  spinner.hidden = !hasImg || (cur.complete && cur.naturalWidth > 0);
  cur.onload = () => (spinner.hidden = true);
  cur.onerror = () => (spinner.hidden = true);

  slider.max = String(pages - 1);
  slider.value = String(index);
  label.textContent = `Page ${index + 1} of ${pages}`;
  $("prevBtn").disabled = index === 0;
  library.setProgress(book, index, pages);
  if (readAloud) speakCurrent(false);
}

function go(delta) {
  if (busy || !book) return;
  if (delta > 0 && index >= pages - 1) return showEnd();
  if (delta < 0 && index <= 0) return setTrack(0, true);
  stopSpeech();
  busy = true;
  const stageW = stage.clientWidth;
  setTrack(-delta * stageW, true);
  const done = () => {
    track.removeEventListener("transitionend", done);
    clearTimeout(fallback);
    busy = false;
    if (!book) return; // reader was closed mid-swipe
    index += delta;
    // Shift pages over without re-downloading: the slot we slid to becomes the middle.
    render();
  };
  const fallback = setTimeout(done, 450);
  track.addEventListener("transitionend", done);
}

function jumpTo(i) {
  stopSpeech();
  index = Math.max(0, Math.min(pages - 1, i));
  render();
}

function showEnd() {
  stopSpeech();
  library.setProgress(book, pages - 1, pages);
  $("theEndText").textContent = `You finished “${book.title}”!`;
  const credit = $("theEndCredit");
  if (stories.isStory(book)) {
    const c = stories.credit(book);
    credit.replaceChildren(
      `${c.text} `,
      link(c.license.name, c.license.url),
      ". ",
      link(`More from ${c.publisher}`, c.publisherUrl)
    );
    credit.hidden = false;
  } else {
    credit.hidden = true;
  }
  theEnd.hidden = false;
  if (readAloud) say("The End!");
  $("endPick").focus();
}

function link(text, href) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}

function showChrome() {
  reader.classList.remove("chrome-hidden");
  clearTimeout(chromeTimer);
}

function toggleChrome() {
  reader.classList.toggle("chrome-hidden");
}

// ---------- Read to me ----------
const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
let readAloud = false;
let utter = null;
let advanceTimer;
let speakTimer;
let voice = null;

function pickVoice() {
  if (!synth) return null;
  const english = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
  const score = (v) =>
    (/natural|neural|enhanced|premium/i.test(v.name) ? 8 : 0) +
    (/samantha|zira|google us english|google uk english female/i.test(v.name) ? 5 : 0) +
    (/en[-_]us/i.test(v.lang) ? 2 : 0) +
    (v.default ? 1 : 0);
  return english.sort((a, b) => score(b) - score(a))[0] || null;
}
if (synth) {
  voice = pickVoice();
  synth.addEventListener?.("voiceschanged", () => (voice = pickVoice()));
}

function clearHighlight() {
  track.querySelectorAll(".w.say").forEach((w) => w.classList.remove("say"));
}

function highlightAt(charIndex) {
  const words = slots[1].querySelectorAll(".w");
  let hit = null;
  for (const w of words) {
    if (Number(w.dataset.at) <= charIndex) hit = w;
    else break;
  }
  clearHighlight();
  if (hit) {
    hit.classList.add("say");
    hit.scrollIntoView?.({ block: "nearest" });
  }
}

function say(text, onDone) {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || "en-US";
  u.rate = 0.9;
  u.pitch = 1.05;
  u.onboundary = (e) => {
    if (u === utter && e.name !== "sentence") highlightAt(e.charIndex);
  };
  u.onend = () => {
    if (u !== utter) return;
    utter = null;
    clearHighlight();
    onDone?.();
  };
  u.onerror = u.onend;
  utter = u;
  synth.speak(u);
}

function stopSpeech() {
  clearTimeout(advanceTimer);
  clearTimeout(speakTimer);
  utter = null;
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
  clearHighlight();
}

// immediate=true when called straight from a tap (iPad only allows speech that starts from a tap).
function speakCurrent(immediate) {
  stopSpeech();
  if (!readAloud || !book) return;
  const page = pageAt(index);
  const text = speechFor(page);
  const next = () => {
    advanceTimer = setTimeout(() => readAloud && go(1), 1100);
  };
  if (!text.trim()) {
    advanceTimer = setTimeout(() => readAloud && go(1), 2500); // picture-only page
    return;
  }
  if (immediate) say(text, next);
  else speakTimer = setTimeout(() => say(text, next), 120);
}

function setReadAloud(on) {
  readAloud = on && Boolean(synth);
  speakBtn.classList.toggle("on", readAloud);
  speakBtn.textContent = readAloud ? "■ Stop" : "🔊 Read to me";
  speakBtn.setAttribute("aria-pressed", String(readAloud));
  if (readAloud) speakCurrent(true);
  else stopSpeech();
}

speakBtn.addEventListener("click", () => {
  setReadAloud(!readAloud);
  if (readAloud) {
    clearTimeout(chromeTimer);
    chromeTimer = setTimeout(() => reader.classList.add("chrome-hidden"), 2500);
  }
});

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
document.addEventListener("visibilitychange", () => {
  if (document.hidden && readAloud) setReadAloud(false);
});

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
  storyPages = null;
  index = startPage;
  width = pickWidth();
  theEnd.hidden = true;
  $("readerTitle").textContent = b.title;
  updateSaveIcon();
  showChrome();
  setReadAloud(false);
  const isStory = stories.isStory(b);
  speakBtn.hidden = !isStory || !synth;
  slots.forEach((s) => fillSlot(s, null, ""));
  spinner.hidden = false;
  reader.hidden = false;
  document.body.style.overflow = "hidden";
  history.pushState({ reader: b.id }, "");

  try {
    if (isStory) {
      const loaded = await stories.loadPages(b);
      if (book !== b) return;
      storyPages = loaded;
      pages = loaded.length;
    } else {
      const details = await bookDetails(b.id);
      if (book !== b) return;
      if (details.pages) pages = details.pages;
    }
  } catch {
    if (isStory) pages = 0;
    /* scanned books fall back to the page count from search */
  }
  if (book !== b) return;
  if (!pages) {
    $("readerTitle").textContent = "Sorry, this book won't open. Try another one!";
    spinner.hidden = true;
    return;
  }
  index = Math.min(index, pages - 1);
  render();
  // Hide the buttons after a moment so the page fills the screen.
  chromeTimer = setTimeout(() => reader.classList.add("chrome-hidden"), isStory ? 5000 : 3500);
}

function closeReader(fromHistory = false) {
  setReadAloud(false);
  reader.hidden = true;
  theEnd.hidden = true;
  document.body.style.overflow = "";
  clearTimeout(chromeTimer);
  book = null;
  storyPages = null;
  if (!fromHistory && history.state?.reader) history.back();
}

BM.reader = { openReader, closeReader };
})();
