# Content policy of an HTML post

The hub sends every package file with a `Content-Security-Policy` header, and the browser obeys it in the frame of the Welcome tab. Two controls of the post set it: the **Allow scripts** switch and the text in **Edit Content Policy**.

## Standard policy

The default for every HTML post. In the post, switch **Allow scripts** on, open **Edit Content Policy**, enter these lines, press **Apply**, then save the group policy:

```
script-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
media-src 'self' data: blob:
connect-src 'self' data: blob:
```

The hub then serves:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; frame-ancestors 'self'; connect-src 'self' data: blob:
```

- **Allowed** - the package's script files and inline scripts; `fetch` of package files and of `data:` and `blob:` addresses; images, fonts and sound from the package and from `data:`; images and sound the page makes (`blob:`)
- **Downloads** - the tab's frame allows them (`allow-downloads`) whatever the policy says: a package file and a file the page makes both save
- **Not allowed** - anything from another host (scripts, styles, images, fonts, sound, connections, frames) and `eval`

## Override

- An entered directive replaces the hub's directive of the same name; any other entered directive follows the hub's
- An entered `script-src` decides the scripts whatever the Allow scripts switch says
- Keep `'self'` in a replaced directive, or the package's own files of that kind stop loading
- Examples, one line each in the editor:
  - a service on another host: `connect-src 'self' data: blob: https://counter.example.org`
  - a YouTube player: `frame-src https://www.youtube-nocookie.com`
  - inline scripts forbidden: `script-src 'self'`
  - no script at all: Allow scripts off and no `script-src` line

## Without an entered policy

The hub serves the standard header with three differences:

- `script-src` follows the switch: off gives `'none'` (no script runs), on gives `'self' 'unsafe-inline'`
- `img-src` and `media-src` have no `blob:`, so images and sound made in the page are blocked
- no `connect-src`, so `fetch` falls back to `default-src 'self'` and a `data:` or `blob:` fetch is blocked

## What the editor accepts

The hub refuses a Save that breaks one of these:

- Directives one per line or separated by `;`, each name once and with at least one value
- Names: `default-src`, `script-src`, `script-src-elem`, `script-src-attr`, `style-src`, `style-src-elem`, `style-src-attr`, `img-src`, `font-src`, `connect-src`, `media-src`, `object-src`, `frame-src`, `child-src`, `worker-src`, `manifest-src`, `form-action`, `frame-ancestors`, `base-uri`
- Keywords in single quotes: `'self'`, `'none'`, `'unsafe-inline'`, `'unsafe-eval'`, `'unsafe-hashes'`, `'strict-dynamic'`, `'wasm-unsafe-eval'`
- `'none'` alone in its directive
- Printable ASCII only, 4096 bytes at most

## Several posts, one package

When several posts of a reader's groups name one package, scripts are allowed while any of them has Allow scripts on, and the entered policy is that of the first such post that has one, in the hub's order.

## When something is blocked

- Read the header the browser received: developer tools, Network, `index.html`, Response Headers
- A blocked load writes a console line that names the directive
- No script runs although the policy allows it: the lab's frame has no `allow-scripts` ([html-package.md](html-package.md), Frame)
