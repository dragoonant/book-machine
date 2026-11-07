(() => {
// "My Books" and reading progress, stored on this device only.
const KEY = "book-machine:v1";

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { saved: data.saved || {}, progress: data.progress || {} };
  } catch {
    return { saved: {}, progress: {} };
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
  listeners.forEach((fn) => fn());
}

const library = {
  onChange(fn) {
    listeners.add(fn);
  },
  isSaved(id) {
    return Boolean(state.saved[id]);
  },
  toggleSaved(book) {
    if (state.saved[book.id]) delete state.saved[book.id];
    else state.saved[book.id] = { ...book, savedAt: Date.now() };
    persist();
    return this.isSaved(book.id);
  },
  savedBooks() {
    return Object.values(state.saved).sort((a, b) => b.savedAt - a.savedAt);
  },
  progressFor(id) {
    return state.progress[id] || null;
  },
  setProgress(book, page, pages) {
    state.progress[book.id] = { ...book, page, pages, finished: page >= pages - 1, updatedAt: Date.now() };
    persist();
  },
  keepReading() {
    return Object.values(state.progress)
      .filter((p) => !p.finished && p.page > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  finishedCount() {
    return Object.values(state.progress).filter((p) => p.finished).length;
  },
};

BM.library = library;
})();
