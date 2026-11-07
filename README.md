# Book Machine

A Netflix-style reading app for kids. Browse rows of book covers, tap one, and swipe through
the pages. Everything is free and legal: the books come from the **Internet Archive's
Children's Library**, about 2,800 public-domain children's books in English, scanned from the
original illustrated editions.

No accounts, no ads, no subscription.

**Live app: <https://dragoonant.github.io/book-machine/>**

The first time it opens it asks the reader's name ("✎ Tell me your name") and keeps it
in that browser only. Tap the greeting to change it.

## Putting it on a laptop (Windows, Mac or Chromebook)

1. Copy this whole folder to the laptop (USB stick, OneDrive, Google Drive, whatever's easy).
2. Double-click `index.html`. It opens in the web browser.
3. Make it easy to find: drag `index.html` to the desktop as a shortcut, or bookmark it in
   the browser and pin the bookmark.

It needs an internet connection to load books.

> Optional: `node server.js` and then <http://localhost:5173> runs it as a tiny local web
> server. Run that way, Chrome/Edge show an "Install app" button in the address bar so it
> opens in its own window like a real app. You don't need this for normal use.

## Putting it on an iPad

1. Open <https://dragoonant.github.io/book-machine/> in Safari.
2. Tap **Share → Add to Home Screen**.

It then gets its own icon and opens full-screen like an app. The same link works in any
browser on a laptop too. In Chrome or Edge, the install icon in the address bar makes it
open in its own window.

Pushing changes to `main` updates the live site within a minute or two.

## How she uses it

| Where | What to do |
| --- | --- |
| Home | Scroll the rows sideways (swipe, or the ‹ › arrows on a laptop). Tap a cover. |
| Search | Type a word like "bears", "Oz", "princess" or "cat". |
| Book card | **Read** opens it. **Add to My Books** saves it to her shelf. |
| Reading | Swipe left/right, tap the right or left edge, or use the arrow keys. Tap the middle to show or hide the buttons. The bottom slider jumps to any page. |
| Coming back | Half-read books appear in **Keep Reading** and reopen on the same page. |

Finished books get a ★ and count toward "You've finished N books!" on the home screen.
Progress is saved in the browser on that device only.

## Things to know

- **These are old books** (mostly 1800s to early 1900s). That's what keeps them free. Most
  are classic fairy tales, nursery rhymes, animal stories and adventures (Oz, Peter Rabbit
  era). A few reflect the attitudes of their time, so browse with her at first.
- **Not Epic's catalog.** Modern, licensed picture books aren't free to read anywhere
  without a subscription or a library card. For newer titles, your public library's free
  **Libby** or **Hoopla** apps are the legal route.
- **Needs internet.** Pages stream as she reads, and the next pages load ahead so swiping
  feels instant.

## Customizing

Everything adjustable is in `config.js`:

- `readerName`: a fallback greeting name. Keep it empty on the public site; the app asks
  the reader instead and stores the answer on their device.
- `ROWS`: the home-screen rows. Each row is a title plus an Internet Archive search, so you
  can add rows like "Dogs" with `title:(dog OR puppy)`.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `styles.css` | Page layout and look |
| `app.js` | Home screen rows, search, book details |
| `reader.js` | The swipe-to-flip page reader |
| `ia.js` | Talks to the Internet Archive |
| `library.js` | My Books and reading progress (saved in the browser) |
| `config.js` | Settings and home-screen rows |
| `sw.js`, `manifest.webmanifest`, `icons/` | Make it installable as an app |
| `server.js` | Optional tiny local web server |
