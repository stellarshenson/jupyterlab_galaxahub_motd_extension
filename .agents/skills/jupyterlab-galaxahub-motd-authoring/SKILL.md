---
name: jupyterlab-galaxahub-motd-authoring
description: Writes GalaxaHub message of the day (motd) posts for the Welcome tab of jupyterlab_galaxahub_motd_extension - markdown with buttons that run JupyterLab commands, HTML pages and zip packages with scripts, data files, images, sound and downloads, and the Content-Security-Policy a package needs. Use when asked to write, build, fix or check a motd post, a welcome page or Welcome tab package, a motd markdown with an install, login or open button (data-commandlinker), the content policy of a motd HTML package, or sound, images or downloads in a welcome page.
---

# Message of the day posts

A GalaxaHub administrator writes posts in a group's policy, section Message of the day. The lab of every group member shows the Welcome part of each post as a card in the Welcome tab, in the hub's order: group priority, then post order. The lab command `Message of the day: Open` opens the tab again.

- **Post** - a Label (one line, the card heading), a terminal text and one Welcome part, `markdown` or `html`; 20 posts per group at most
- **Markdown** - text, links, images, buttons that run lab commands (install a tool, sign in, open a file); stored in the post, 64 KiB at most: [references/markdown.md](references/markdown.md)
- **HTML** - a designed page with scripts, data files, images, sound and downloads; one `.html` file or a `.zip` package: [references/html-package.md](references/html-package.md)
- **Content policy** of an HTML post: [references/content-policy.md](references/content-policy.md)
- **Images, fonts and sound** in a page: [references/images-and-sound.md](references/images-and-sound.md)

## Rules

- Give every HTML post the standard content policy, which allows scripts and the files a page makes; the tab's frame allows downloads. Change a directive only when the page needs it
- Check every post in the Welcome tab after the group policy is saved; the hub's Preview runs no package script and no markdown button
- No secret in a post: every group member reads it, and a command button shows its arguments before it runs
- Only an administrator turns on the scripts of a post or changes its content policy

<!-- improved 2026-10-16 | body 343→334w / 24→21L | benchmark n/a (not-requested) | via improve-skill -->
