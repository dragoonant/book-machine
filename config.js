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

// Every query is limited to the Internet Archive's Children's Library
// (public-domain, freely readable, English).
BM.BASE_QUERY =
  'collection:iacl AND mediatype:texts AND language:(English OR eng) AND NOT access-restricted-item:true';

// The Netflix-style rows on the home screen.
BM.ROWS = [
  { id: "popular", title: "Most Popular", q: "", sort: "downloads desc" },
  { id: "quick", title: "Quick Reads", q: "imagecount:[8 TO 40]", sort: "downloads desc" },
  {
    id: "fairy",
    title: "Fairy Tales & Princesses",
    q: '(subject:"fairy tales" OR subject:folklore OR title:(fairy OR princess OR giant OR goblin OR cinderella OR beauty))',
    sort: "downloads desc",
  },
  {
    id: "animals",
    title: "Animal Friends",
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
    title: "Big Adventures",
    q: "(subject:(adventure OR adventurers OR voyages OR pirates) OR title:(adventures OR island OR wizard OR journey))",
    sort: "downloads desc",
  },
  { id: "chapter", title: "Chapter Books", q: "imagecount:[150 TO 3000]", sort: "downloads desc" },
  { id: "hidden", title: "Hidden Gems", q: "imagecount:[10 TO 80]", sort: "addeddate desc" },
];
