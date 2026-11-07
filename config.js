// Settings you might want to change.
window.BM = window.BM || {};
BM.CONFIG = {
  // Fallback greeting name ("Hi, ___!"). Leave empty: the app asks the reader
  // for their name and saves it on their own device, so it never goes online.
  readerName: "",
  appName: "Book Machine",
  // How many books each row loads.
  rowSize: 30,
};

// Modern picture books with words and Read to me (from catalog/index.js).
// Each row picks books with a filter; the order reshuffles every day.
BM.STORY_ROWS = [
  { id: "new", title: "New Picture Books", filter: () => true },
  { id: "easy", title: "First Readers", filter: (b) => b.words > 0 && b.words <= 120 },
  { id: "animal-stories", title: "Animal Stories", filter: (b) => (b.tags || []).includes("animals") },
  { id: "bookdash", title: "Book Dash Favorites", filter: (b) => b.src === "bd" },
  { id: "india", title: "Stories from India", filter: (b) => b.src === "pb" },
  { id: "africa", title: "Stories from Africa", filter: (b) => b.src === "asp" },
  { id: "longer", title: "Longer Stories", filter: (b) => b.words >= 500 },
];

// Classic scanned books from the Internet Archive.
// Every query is limited to the Internet Archive's Children's Library
// (public-domain, freely readable, English).
BM.BASE_QUERY =
  'collection:iacl AND mediatype:texts AND language:(English OR eng) AND NOT access-restricted-item:true';

// The Netflix-style rows on the home screen.
BM.ROWS = [
  { id: "popular", title: "Classic Favorites", q: "", sort: "downloads desc" },
  { id: "quick", title: "Classic Quick Reads", q: "imagecount:[8 TO 40]", sort: "downloads desc" },
  {
    id: "fairy",
    title: "Classic Fairy Tales",
    q: '(subject:"fairy tales" OR subject:folklore OR title:(fairy OR princess OR giant OR goblin OR cinderella OR beauty))',
    sort: "downloads desc",
  },
  {
    id: "animals",
    title: "Classic Animal Tales",
    q: "(subject:animals OR title:(cat OR cats OR kitten OR dog OR puppy OR bear OR rabbit OR bunny OR pig OR fox OR bird OR mouse OR duck OR hen OR monkey))",
    sort: "downloads desc",
  },
  {
    id: "rhymes",
    title: "Poems & Nursery Rhymes",
    q: '(subject:(poetry OR "nursery rhymes") OR title:(rhymes OR mother goose OR verses OR songs))',
    sort: "downloads desc",
  },
  {
    id: "adventure",
    title: "Classic Adventures",
    q: "(subject:(adventure OR adventurers OR voyages OR pirates) OR title:(adventures OR island OR wizard OR journey))",
    sort: "downloads desc",
  },
  { id: "chapter", title: "Classic Chapter Books", q: "imagecount:[150 TO 3000]", sort: "downloads desc" },
  { id: "hidden", title: "Old Treasures", q: "imagecount:[10 TO 80]", sort: "addeddate desc" },
];
