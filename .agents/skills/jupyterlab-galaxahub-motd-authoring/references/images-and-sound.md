# Images, fonts and sound

## Files or embedded

- **Package** - ship images, fonts and sound as package files (`resources/...`): the browser loads only what the page asks for, and base64 inside the page adds a third to every file
- **Single `.html` upload** - everything is embedded as `data:` addresses; keep the page under 5 MB
- **Licence** - ship a font or music only when its licence allows the copy

## Images

- **Animated** - animated AVIF, not GIF or WebP: one banner of 788 × 249 px and 40 frames was about 7 MB as GIF, 1.28 MB as WebP (quality 55) and 0.27 MB as AVIF (quality 60)
- **Pillow 11.3 or newer** - `frames[0].save(path, format="AVIF", save_all=True, append_images=frames[1:], duration=ms, quality=60, speed=4)`; the result loops without end. `speed=4` gave the smallest file and the shortest run, 6 s against 471 s for `speed=0`
- **Frames of a GIF** - `ImageSequence.Iterator` reuses one image object, so convert inside the loop: `[f.convert("RGB") for f in ImageSequence.Iterator(gif)]`
- **Ratio** - give each image box its ratio in CSS (`aspect-ratio: 788 / 249`, image at `width: 100%`), so the page keeps its height while the image loads
- **One of several** - for an image per day, set `img.src` to the chosen file only; a file the page never asks for costs nothing

## Fonts

- **Subset** - reduce a font to the characters the page uses and store it as WOFF2 with fontTools: `subset.Subsetter()`, `populate(unicodes=range(0x20, 0x7F))`, `subset(font)`, `font.flavor = "woff2"`. Orbitron with its weight axis: 51 kB as TTF, 12 kB as subset
- **Load** - `@font-face { font-family: "Name"; src: url("resources/name.woff2") format("woff2"); }`

## Sound

- **Start on a press** - a browser may block sound until the reader acts on the page, so start sound only from a press, such as the first press of the Pause button
- **Pause button** - sound longer than 3 s, and every `loop` element, gets a visible button that starts, pauses and resumes it: `button.onclick = () => (music.paused ? music.play() : music.pause())`
- **Element** - `<audio id="music" src="resources/music.mp3" loop></audio>`; without `controls` the element is invisible
- **Size** - keep sound files short ([html-package.md](html-package.md), Whole files)
- **A tune per button** - `new Audio("resources/tune.mp3")`, made on the first press; several play at once

## Players from other hosts

- **YouTube** - the content policy needs `frame-src https://www.youtube-nocookie.com`, and the `iframe` needs `referrerpolicy="strict-origin-when-cross-origin"`, because YouTube refuses a player that does not name its page. `allow="autoplay"` on the `iframe` passes the reader's press on to the player
