# HTML posts

An HTML post shows one uploaded page or package in a frame of the Welcome tab.

## Upload

- **File** - one `.html` or `.htm` file, stored as the package's `index.html`, or one `.zip` package. Any other file type is refused
- **Zip** - `index.html` at the root of the zip, not inside a folder; no symbolic link, no absolute path, no `..`, no name twice
- **Size** - the upload and the unpacked package each stay under the hub's cap: the setting `GALAXAHUB_EXTENSION_MOTD_PACKAGE_MAX_MB`, 100 MiB by default; the upload field states it
- **Checks** - the upload answers them in this order: File type, Upload size, Zip opens, Paths, index.html at the root, Unpacked size. A failed check names the zip member or the cap
- **New id** - every upload gets a new package id, so its addresses are new and no browser shows a cached file of an earlier upload
- **Save** - save the group policy after the upload. A package that no saved group policy names is removed after 24 hours

Make the zip from inside the build folder, so `index.html` is at its root, and leave out the lab's checkpoint folders:

```bash
cd out/my-package && zip -r ../my-package.zip . -x '*.ipynb_checkpoints*'
```

## How the hub serves a package

- **Address** - `/hub/api/extensions/motd/rich/<id>/<path>`. Only a member of a group whose post names the package, or a hub user who may read groups, gets a file; any other user gets 404
- **Type** - the content type comes from the file name (Python `mimetypes`), with `X-Content-Type-Options: nosniff`. Use the usual extensions (`.html .js .mjs .css .json .png .jpg .avif .webp .svg .woff2 .mp3 .ogg .mp4 .webm .pdf .txt`). A file with an unknown extension is `application/octet-stream`, and a script under such a name does not run
- **No compression** - the hub sends a file as stored and sets no `Content-Encoding`. A `.json.gz` file arrives as compressed bytes; the page inflates it itself with `DecompressionStream("gzip")`
- **Whole files** - the hub answers no byte range, so keep sound and video files short
- **Cache** - an HTML, SVG or XML file is asked for again at every view; every other file is kept by the browser for one hour
- **Content policy** - every file carries the `Content-Security-Policy` of the post: [content-policy.md](content-policy.md)

## How the tab shows a package

- **Frame** - an `iframe` on the lab's origin with the sandbox `allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads`, plus `allow-scripts` unless the lab sets `c.GalaxaHubMotd.html_allow_scripts = False`
- **Scripts** run on the lab's origin and have the access of the lab page itself
- **Height** - the tab sets the frame to the height of the page, so the page grows with its content. A page the tab cannot measure gets a 480 px box that scrolls: `html, body { height: 100% }`, a root sized in `vh`, content placed against the bottom of the viewport, or only absolute or fixed content
- **Width** - the card's width, which follows the tab
- **Links** - a link with `target="_blank"` opens a browser tab
- **Downloads** - `<a href="notes.pdf" download>` saves a package file, and a file the page makes (a `Blob` given to an `<a download>`) saves too

## Build

- A template with placeholders, a build script that fills it and writes the package folder, and one make target. Edit the template, never the built page
- The build prints the size of every file and of the package. Keep what one view loads small: a page of 64 MB crashed the browser
- Addresses inside the package are relative (`resources/app.js`, never `/resources/app.js`). The hub serves the package under `/hub/api/extensions/motd/rich/<id>/` and `serve.py` serves it at `/`, so a root-absolute address passes the check and fails in the tab. A bundler needs a relative base (Vite: `base: './'`)

## Check before upload

- `python3 <skill folder>/scripts/serve.py out/my-package` serves the folder on `http://127.0.0.1:8791/` with the header the hub sends for the standard content policy ([scripts/serve.py](../scripts/serve.py)). It needs the folder argument and runs until it is stopped: in an agent's shell, start it in the background and stop it after the check
- Open it at 1440, 720 and 390 px and read the console ([content-policy.md](content-policy.md), When something is blocked)
