"""Build the modern picture-book catalog (catalog/*.js) from three open-license sources.

    python tools/build_catalog.py            # clones/updates sources into .cache/
    python tools/build_catalog.py --offline  # reuse what is already in .cache/

Sources (all CC BY 4.0, English only):
  * Pratham Books / StoryWeaver  github.com/global-asp/pb-source  + pb-imagebank
  * African Storybook            github.com/global-asp/asp-source + asp-imagebank
  * Book Dash                    github.com/bookdash/bookdash-books

The output is plain JavaScript (not JSON) so the app also works when index.html is
opened straight from disk, where browsers block fetch() of local files.
"""

import argparse
import collections
import json
import random
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "catalog"
CHUNK = 40  # books per text file

REPOS = {
    "pb-source": "https://github.com/global-asp/pb-source.git",
    "asp-source": "https://github.com/global-asp/asp-source.git",
    "bookdash-books": "https://github.com/bookdash/bookdash-books.git",
}
IMAGEBANKS = {"pb": "global-asp/pb-imagebank", "asp": "global-asp/asp-imagebank"}

RAW = "https://raw.githubusercontent.com"
BD_SITE = "https://bookdash.github.io/bookdash-books"

STOP = set(
    """a about after again all also am an and any are as at away back be because been before
    being big but by came can come could day did do does down each even every for from get go
    going good got had has have he her here him his how i if in into is it its just know like
    little look made make man many may me more most much must my no not now of off oh old on one
    only or other our out over put ran said saw say says see she so some still take than that the
    their them then there these they thing things think this time to too took two up us very
    want was way we went were what when where which who why will with would yes you your""".split()
)

ANIMALS = set(
    """ant ants bear bears bee bees bird birds butterfly cat cats chicken chickens cow cows crab
    crocodile deer dog dogs donkey duck ducks elephant elephants fish fox frog frogs giraffe goat
    goats hen hens hippo horse kitten lion lions lizard monkey monkeys mouse mice owl parrot pig
    pigs puppy rabbit rat sheep snake snail spider tiger tortoise turtle whale zebra hare
    caterpillar insects animals animal penguin sloth ladybird""".split()
)


# A few stories in these collections cover grown-up topics; leave them out.
MATURE = re.compile(r"\b(miscarriag\w*|hiv|aids|rape|raped|abus(e|ed|ing)|alcohol\w*|suicide|murder\w*)\b", re.I)


def log(*a):
    print(*a, file=sys.stderr)


def sync_sources(offline):
    CACHE.mkdir(exist_ok=True)
    for name, url in REPOS.items():
        dest = CACHE / name
        if offline:
            continue
        if dest.exists():
            subprocess.run(["git", "-C", str(dest), "pull", "--ff-only", "-q"], check=True)
        else:
            subprocess.run(["git", "clone", "-q", "--depth", "1", url, str(dest)], check=True)


def imagebank_tree(key, offline):
    path = CACHE / f"{key}-imagebank-tree.json"
    if not offline or not path.exists():
        url = f"https://api.github.com/repos/{IMAGEBANKS[key]}/git/trees/master?recursive=1"
        req = urllib.request.Request(url, headers={"User-Agent": "book-machine-catalog"})
        path.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    files = collections.defaultdict(list)
    for item in json.loads(path.read_text("utf8"))["tree"]:
        p = item["path"].split("/")
        if item["type"] == "blob" and len(p) == 3 and p[0] == "medium":
            files[p[1]].append(p[2])
    return {k: sorted(v) for k, v in files.items()}


# ---------- text cleanup ----------
def clean_inline(s):
    s = re.sub(r"<[^>]+>", " ", s)  # stray HTML
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)  # images
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)  # links -> text
    s = re.sub(r"\{[:.][^}]*\}", " ", s)  # kramdown attributes
    s = re.sub(r"(\*\*|__|\*|(?<!\w)_|_(?!\w))", "", s)  # emphasis markers
    s = s.replace("\\", "")
    s = re.sub(r"([.!?,;:])([“\"‘])", r"\1 \2", s)  # 'Mom.“Say' -> 'Mom. “Say'
    s = re.sub(r"([”\"’?!.])([A-Z])", r"\1 \2", s)  # '?”But' -> '?” But'
    return re.sub(r"\s+", " ", s).strip()


def paragraphs(block):
    """Blank-line separated paragraphs, re-joining lines that were split mid-sentence."""
    out = []
    for para in re.split(r"\n\s*\n", block):
        text = clean_inline(para)
        if not text or re.fullmatch(r"[#\-*_=\s]+", text):
            continue
        if out and not re.search(r"[.!?”\"’'):…]$", out[-1]):
            out[-1] = f"{out[-1]} {text}"
        else:
            out.append(text)
    return out


def credits_from(lines):
    found = {}
    for line in lines:
        m = re.match(r"\*\s*([A-Za-z ]+):\s*(.+)", line.strip())
        if m:
            found[m.group(1).strip().lower()] = clean_inline(m.group(2))
    return found


def words_of(texts):
    return re.findall(r"[a-z']+", " ".join(texts).lower())


def keywords(title, texts, limit=14):
    counts = collections.Counter(w.strip("'") for w in words_of([title] + texts))
    picked = [w for w, _ in counts.most_common() if len(w) >= 4 and w not in STOP]
    return picked[:limit]


# ---------- sources ----------
def global_asp(key, src_dir, tree, publisher):
    books = []
    for md in sorted((CACHE / src_dir / "en").glob("*.md")):
        sid = md.name[:4]
        raw = md.read_text("utf8").replace("\r\n", "\n")
        title_m = re.match(r"#\s+(.+)", raw.strip())
        if not title_m:
            continue
        parts = re.split(r"^##\s*$", raw, flags=re.M)
        body, credit_block = parts[1:-1], parts[-1]
        cred = credits_from(credit_block.splitlines())
        pages = ["\n\n".join(paragraphs(p)) for p in body]
        imgs = tree.get(sid, [])
        extra = len(imgs) - len(pages)
        # 01.jpg is normally the cover, then one picture per page.
        if extra in (1, 2):
            page_imgs = imgs[1 : 1 + len(pages)]
        elif extra == 0:
            page_imgs = imgs
        else:
            log(f"skip {key}-{sid}: {len(pages)} pages vs {len(imgs)} images")
            continue
        if not pages or not imgs or not any(pages):
            continue
        books.append(
            {
                "id": f"{key}-{sid}",
                "src": key,
                "title": clean_inline(title_m.group(1)),
                "author": cred.get("text", ""),
                "illus": cred.get("illustration", ""),
                "extra": {k: v for k, v in cred.items() if k in ("translation", "adaptation", "original story")},
                "publisher": publisher,
                "cover": f"{RAW}/{IMAGEBANKS[key]}/master/medium/{sid}/{imgs[0]}",
                "imgBase": f"{RAW}/{IMAGEBANKS[key]}/master/medium/{sid}/",
                "pageImgs": page_imgs,
                "pages": pages,
                "link": f"https://github.com/{'global-asp/' + src_dir}/blob/master/en/{md.name}",
            }
        )
    return books


def bookdash_meta():
    meta, cur = {}, None
    for line in (CACHE / "bookdash-books" / "_data" / "meta.yml").read_text("utf8").splitlines():
        m = re.match(r"^  ([a-z0-9-]+):\s*$", line)
        if m:
            cur = meta.setdefault(m.group(1), {})
            continue
        m = re.match(r'^    (\w+):\s*"(.*?)"', line)
        if m and cur is not None:
            cur[m.group(1)] = m.group(2)
    return meta


def bookdash():
    meta = bookdash_meta()
    books = []
    base = CACHE / "bookdash-books"
    for idx in sorted(base.glob("*/en/index.md")):
        slug = idx.parent.parent.name
        raw = idx.read_text("utf8").replace("\r\n", "\n")
        raw = re.sub(r"^---\n.*?\n---\n", "", raw, flags=re.S)
        info = meta.get(slug, {})
        title = info.get("title") or ""
        if not title:
            m = re.search(r"^#\s+(.+)", raw, re.M)
            title = clean_inline(m.group(1)) if m else slug.replace("-", " ").title()
        chunks = re.split(r"(!\[[^\]]*\]\(\{\{\s*site\.image-set\s*\}\}/([^)\s]+)\))", raw)
        # chunks: [before, imgmd, file, text, imgmd, file, text, ...]
        page_imgs, pages = [], []
        for i in range(1, len(chunks) - 2, 3):
            page_imgs.append(chunks[i + 1])
            text = re.sub(r"^#+\s.*$", "", chunks[i + 2], flags=re.M)
            pages.append("\n\n".join(paragraphs(text)))
        cover = idx.parent / "images" / "cover.jpg"
        have = {f.name for f in (idx.parent / "images").glob("*")}
        if not cover.exists() or any(f not in have for f in page_imgs) or not "".join(pages).strip():
            log(f"skip bd-{slug}: missing pictures or text")
            continue
        img_base = f"{BD_SITE}/{slug}/en/images/"
        books.append(
            {
                "id": f"bd-{slug}",
                "src": "bd",
                "title": title,
                "author": info.get("creator", ""),
                "illus": "",
                "extra": {},
                "publisher": "Book Dash",
                "blurb": info.get("description", ""),
                "year": info.get("date", "")[:4],
                "cover": img_base + ("cover.jpg" if cover.exists() else page_imgs[0]),
                "imgBase": img_base,
                "pageImgs": page_imgs,
                "pages": pages,
                "link": f"https://bookdash.org/books/",
            }
        )
    return books


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    sync_sources(args.offline)

    books = (
        bookdash()
        + global_asp("pb", "pb-source", imagebank_tree("pb", args.offline), "Pratham Books")
        + global_asp("asp", "asp-source", imagebank_tree("asp", args.offline), "African Storybook")
    )
    # Same story published by two projects: keep the first.
    seen, unique = set(), []
    for b in books:
        key = re.sub(r"[^a-z0-9]", "", b["title"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(b)
    books = [b for b in unique if not MATURE.search(" ".join(b["pages"]))]
    for b in books:
        b["title"] = re.sub(r"(?<![.])\.$", "", b["title"]).strip()

    # Stable shuffle so each text chunk mixes sources (not required, but spreads load).
    order = list(range(len(books)))
    random.Random(7).shuffle(order)

    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("text-*.js"):
        old.unlink()

    index, chunks = [], collections.defaultdict(dict)
    for pos, i in enumerate(order):
        b = books[i]
        chunk = pos // CHUNK
        words = words_of(b["pages"])
        kws = keywords(b["title"], b["pages"])
        tags = []
        if ANIMALS & set(words_of([b["title"]])) or len(ANIMALS & set(kws[:8])) >= 1:
            tags.append("animals")
        entry = {
            "id": b["id"],
            "src": b["src"],
            "title": b["title"],
            "author": b["author"],
            "illus": b["illus"],
            "pages": len(b["pages"]) + 1,  # + the title page
            "words": len(words),
            "chunk": chunk,
            "kw": " ".join(kws),
        }
        default_cover = b["imgBase"] + ("cover.jpg" if b["src"] == "bd" else "01.jpg")
        if b["cover"] != default_cover:
            entry["cover"] = b["cover"]
        for opt in ("blurb", "year"):
            if b.get(opt):
                entry[opt] = b[opt]
        if b["extra"]:
            entry["extra"] = b["extra"]
        if tags:
            entry["tags"] = tags
        index.append(entry)
        chunks[chunk][b["id"]] = {
            "base": b["imgBase"],
            "imgs": b["pageImgs"],
            "text": b["pages"],
            "link": b["link"],
        }

    def js(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

    header = "// Generated by tools/build_catalog.py. Do not edit by hand.\n"
    (OUT / "index.js").write_text(
        header + "window.BM = window.BM || {};\nBM.CATALOG = " + js(index) + ";\n", "utf8"
    )
    for n, data in chunks.items():
        (OUT / f"text-{n:02d}.js").write_text(header + f"BM.storyChunk({n}, {js(data)});\n", "utf8")

    by_src = collections.Counter(b["src"] for b in index)
    log(f"{len(index)} books {dict(by_src)} in {len(chunks)} text files")


if __name__ == "__main__":
    main()
