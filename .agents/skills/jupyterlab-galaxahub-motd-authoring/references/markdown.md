# Markdown posts

The tab renders the post with the lab's own markdown renderer (GitHub-flavoured Markdown with HTML) as untrusted content, so the lab's sanitizer removes what it does not allow.

## What shows

- Headings, lists, tables, code blocks, links and images, as in any markdown file of the lab
- **Images** - an `https://` address or a `data:` address both show. A `data:` image counts against the 64 KiB of the post
- **Heading links** - a link to a heading of the same post scrolls to it, written `#Getting-started` (lab form) or `#getting-started` (GitHub form)
- **Other links** open a new browser tab. A relative link (`docs/guide.md`) resolves against the address of the lab page and reaches no file: write an `https://` address, or a button that runs `docmanager:open`
- **Removed** - `<script>`, and the `id` and `name` attributes (`id` becomes `data-jupyter-id`), so a link to an `id` set in the post does not scroll

## Command buttons

A button runs a JupyterLab command in the reader's lab:

```markdown
<button class="jp-mod-styled jp-mod-accept" data-commandlinker-command="help:open" data-commandlinker-args='{"url": "https://example.org/guide", "text": "Guide", "newBrowserTab": true}'>Open the guide</button>
```

- **Button only** - only a `<button>` keeps the two attributes; on `<a>` or any other element the sanitizer removes them and a press does nothing
- **One line** - keep the whole element on one line, with a blank line before and after it
- **Arguments** - one JSON object in single quotes. Inside the quotes write `&` as `&amp;`, `'` as `&#39;`, `<` as `&lt;`, `>` as `&gt;`, `$` as `&#36;` and `\` as `&#92;`; a line break inside a JSON string is `&#92;n`. A plain `$` or `\` can start the lab's math pass, which changes the text between its markers and so breaks the script. JSON that does not parse makes the press do nothing
- **Style** - `jp-mod-styled jp-mod-accept` is the lab's accept button; `jp-mod-styled` alone is its plain button
- **Run** - a press opens the lab's dialog **Run Command?** with the command's label, its id and its arguments, and the buttons **Cancel** and **Run**. The command runs only on **Run**. Tell the reader to press **Run**
- **Command ids** - the command must exist in the reader's lab. The lab command `Show Commands Reference` (GalaxaLab) lists every id with its arguments

Build a button whose arguments hold a script with Python, so the escaping is right:

```python
import html, json

args = {"argv": ["bash", "-c", open("install.sh").read()]}
attr = html.escape(json.dumps(args), quote=False).replace("'", "&#39;").replace("$", "&#36;").replace("\\", "&#92;")
print(f"""<button class="jp-mod-styled jp-mod-accept" data-commandlinker-command="basic-terminal:launch" data-commandlinker-args='{attr}'>Install</button>""")
```

## Commands for buttons in GalaxaLab

| Command                 | Arguments                                           | Does                                                                                  |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `basic-terminal:launch` | `argv` (required, a list), `cwd`, `shutdownOnClose` | runs `argv` in a new terminal tab with no shell; the tab closes when the program ends |
| `help:open`             | `url` (required), `text`, `newBrowserTab`           | opens an address in a lab tab, or in a browser tab with `newBrowserTab: true`         |
| `docmanager:open`       | `path`                                              | opens a file of the lab                                                               |
| `apputils:notify`       | `message`, `type`, `options`                        | shows a lab notification                                                              |

- A script runs as `"argv": ["bash", "-c", "<script>"]` or `["python3", "-c", "<script>"]`, as the reader, on the Jupyter server
- The terminal tab closes when the script ends, and its output goes with it. Print the result into a notification, or end the script with `read -p "Press Enter to close"`
- A script that needs a browser step from the reader sends a notification with a button: `jupyterlab-notify` (jupyterlab_notifications_extension; `jupyterlab-notify --help`)
