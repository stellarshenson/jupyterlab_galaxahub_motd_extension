# GalaxaHub motd extension - Hub API v2

Status: matches the extension with the two URL settings, 2026-09-29.

## Contents

- [1. Overview](#1.-Overview)
- [2. Caller and authentication](#2.-Caller-and-authentication)
- [3. Hub routes](#3.-Hub-routes)
  - [3.1 Welcome entries](#3.1-Welcome-entries)
  - [3.2 Broadcasts](#3.2-Broadcasts)
  - [3.3 Terminal text](#3.3-Terminal-text)
- [4. Status codes and caching](#4.-Status-codes-and-caching)
- [5. HTML pages](#5.-HTML-pages)
- [6. Tab open conditions](#6.-Tab-open-conditions)
- [7. Live broadcasts](#7.-Live-broadcasts)
- [8. Stock JupyterHub implementation](#8.-Stock-JupyterHub-implementation)

## 1. Overview

This document states the hub API that the message of the day (motd) extension reads. It is for a
developer who writes the hub side without GalaxaHub.

- **Direction** - the extension reads three routes from the hub that spawned the lab and writes
  nothing to the hub
- **GalaxaHub** - serves the three routes through its `galaxahub-motd-extension` and its
  `user-notifications` route
- **Other hubs** - a hub that answers the three routes as this document states works with the
  extension
- **Tab** - the extension shows the answers in the **Message of the day** tab in the lab
- **Broadcast** - a notification the hub sent to all users or to named users

## 2. Caller and authentication

This section states who calls the hub and how the call authenticates. Two callers read the routes,
and both send the token of the lab server.

- **Proxy** - the extension's server handler in `routes.py`, which reads the routes for the tab
- **CLI** - the `jupyterlab-galaxahub-motd` command, which reads the routes in a terminal
- **Browser** - never calls the three routes and never holds the token
- **URLs** - the lab's Jupyter config sets `c.GalaxaHubMotd.motd_api_url` and
  `c.GalaxaHubMotd.notifications_api_url`; the proxy reads them at start, and the CLI asks the
  running lab server for them
- **Empty URL** - while either setting is empty, neither caller calls the hub
- **GalaxaHub values** - `<JUPYTERHUB_API_URL>/extensions/motd` and
  `<JUPYTERHUB_API_URL>/user-notifications`, for example `http://hub:8081/hub/api/extensions/motd`
- **Token** - `Authorization: token <JUPYTERHUB_API_TOKEN>`, the token of the lab server
- **User** - the hub finds the owner of the token and answers with that user's data only, so the
  request carries no username
- **Scope** - GalaxaHub requires `users:activity!user=<owner>` on the token, which the default
  JupyterHub server role grants
- **Timeouts** - the proxy waits 5 s for the connection and 10 s for the whole request

## 3. Hub routes

This section lists the three routes and the answer of each. All three are GET routes at the URLs
that the two settings name.

| Route                     | Reader   | Answer                |
| ------------------------- | -------- | --------------------- |
| `<motd_api_url>/rich`     | tab, CLI | JSON, welcome entries |
| `<notifications_api_url>` | tab, CLI | JSON, broadcasts      |
| `<motd_api_url>/terminal` | CLI only | plain text            |

### 3.1 Welcome entries

`GET <motd_api_url>/rich` returns the welcome entries of the user. The answer is a JSON object
with one `entries` list.

```json
{
  "entries": [
    {
      "label": "Interns",
      "kind": "markdown",
      "body": "# Welcome\n\nRead the handbook first."
    },
    {
      "label": "Research",
      "kind": "html",
      "url": "/hub/api/extensions/motd/rich/<package-id>/index.html"
    }
  ]
}
```

- **Entries** - one entry for each group of the user that has a welcome entry
- **Label** - `label` is the heading of the entry's card; with a `label` that is missing, not a
  string or blank, the card has no header bar. The extension reads only `label`, `kind`, `body`
  and `url`, so the `group` GalaxaHub also sends is not used
- **Order** - the tab shows the entries in answer order, and GalaxaHub sorts them by group name
- **Markdown entry** - `kind: markdown` carries `body`, which the lab's markdown renderer shows as
  untrusted content, so it sanitises any HTML in it. A link to a heading of the same entry
  (`[text](#fragment)`) scrolls to that heading: the fragment is the heading's text with a hyphen
  for each space (`#Getting-started`), or the GitHub form in lower case and without punctuation
  (`#getting-started`)
- **HTML entry** - `kind: html` carries `url`, a page that the browser loads in a frame, as
  [5. HTML pages](#5.-HTML-pages) states
- **Dropped entries** - the extension drops an entry with another `kind`, or a missing `body` or
  `url`
- **Empty list** - `{"entries": []}` means the hub has the motd feature and the user has no
  welcome entry

### 3.2 Broadcasts

`GET <notifications_api_url>` returns the broadcasts sent to the user. The answer is a JSON object with
one `notifications` list.

```json
{
  "notifications": [
    {
      "ts": "2026-09-29T08:00:00+00:00",
      "message": "Maintenance tonight at 22:00",
      "type": "warning",
      "audience": "all"
    }
  ]
}
```

- **Content** - the broadcasts sent to all users and the broadcasts that name the user, and no
  broadcast addressed only to other users
- **Limit** - GalaxaHub returns the newest 100 broadcasts
- **`message`** - required string, and the extension drops a row without it
- **`ts`** - ISO 8601 timestamp; the tab shows only the rows inside its `notificationWindow`
  setting (the last 24 hours, 3 days or 7 days, 24 hours by default), newest first, and leaves
  out a row whose `ts` it cannot parse
- **`type`** - one of the lab notification types `info`, `success`, `warning`, `error` and
  `in-progress`, and the tab shows any other value as `default`
- **`audience`** - `direct` marks a broadcast that named the user, which the tab labels Direct,
  and the tab labels every other value All users

### 3.3 Terminal text

`GET <motd_api_url>/terminal` returns the terminal text of the user. The CLI and the terminal hook
of the lab image read it, and the tab does not.

- **Format** - `text/plain; charset=utf-8`, which the CLI prints as received, so ANSI escape
  sequences reach the terminal
- **No text** - the hub answers 204 when the user has no terminal text

## 4. Status codes and caching

This section states what the extension does with each hub status and which cache headers the hub
sends. The proxy passes the hub's `Content-Type`, `Etag` and `Cache-Control` headers to the browser.

| Hub status                                | Extension action                                            |
| ----------------------------------------- | ----------------------------------------------------------- |
| 200                                       | uses the body as the current rows                           |
| 304                                       | keeps the rows it holds                                     |
| 404                                       | treats the hub as having no motd, and the proxy answers 204 |
| no connection, timeout, empty URL setting | same as 404                                                 |
| any other status, including 403 and 500   | marks the pull as failed and keeps the rows it holds        |

- **Etag** - optional, and when the hub sends it, the next pull sends it back as `If-None-Match`
- **304 answer** - optional, because the proxy answers the browser 304 when a 200 answer carries
  an `Etag` equal to `If-None-Match`
- **Cache-Control** - the hub sends `Cache-Control: no-cache` on every answer, including a 204
- **Cached 204** - a browser caches a 204 by default, and a cached 204 hides a motd that the hub
  receives later

## 5. HTML pages

This section states what the hub serves for an `html` welcome entry. The browser loads the entry
`url` in a frame in the tab, and the proxy never calls it.

- **Address** - a path from the host root, as GalaxaHub sends it, resolves against the lab's origin
- **Authentication** - the browser sends its hub login cookie, because the lab token is not in the
  browser
- **Access** - GalaxaHub serves a page only to a user whose groups name it, and answers the same
  404 to every other user
- **Framing** - the page must allow the lab to frame it, and the CSP directive
  `frame-ancestors 'self'` allows it when hub and lab share one origin, as in the default
  JupyterHub proxy layout
- **Blocked frame** - `X-Frame-Options: DENY` or `frame-ancestors 'none'` leaves the frame empty
- **Sandbox** - the frame has `allow-same-origin allow-popups allow-popups-to-escape-sandbox`, and
  `allow-scripts` while `c.GalaxaHubMotd.html_allow_scripts` is on, which is the default
- **Scripts** - with the setting on, a script in the page runs; on the lab's origin it has the
  access of the lab page itself, so the hub must let only an administrator write a page. With the
  setting off, no script in the page runs
- **Hub header** - the hub decides too: a page sent with `script-src 'none'` in its
  `Content-Security-Policy` runs no script, whatever the setting says, and a page sent with
  `script-src 'self' 'unsafe-inline'` runs the scripts embedded in it and those of its own files
- **Links** - a link with `target="_blank"` opens in a new browser tab
- **Height** - on the lab's origin, the tab measures the page and sets the frame height to it
- **Height fallback** - a page on another origin, or a page the tab cannot measure, gets a 480 px
  frame that scrolls
- **Scrollbar room** - the element that scrolls the cards (the entries column, or the whole tab
  when it is narrower than 800 px) keeps the room of its scrollbar while it does not scroll, so
  the width of a page does not change when scrolling starts

## 6. Tab open conditions

This section states when the tab opens on lab start. The tab shows the user's welcome entries when
both conditions hold:

- `<motd_api_url>/rich` answered 200 or 304
- the user has at least one welcome entry

In every other case the tab shows a page of the lab instead: the local page
`c.GalaxaHubMotd.fallback_html` names, or the extension's built-in page while that setting is
empty. A 404 on `<motd_api_url>/rich`, an error, a hub that cannot be reached and an empty URL
setting all count as no entry, and so do broadcasts without an entry. The hub side needs nothing
for it.

- **No tab** - only when `fallback_html` names a file that does not exist; the extension then
  writes one console line and opens nothing, and an open tab closes when `<motd_api_url>/rich`
  answers with no entry
- **Open on start** - the tab opens by itself once per lab server start, on the first load of
  the lab page after it; a later load in the same browser, a refresh included, opens no tab.
  `c.GalaxaHubMotd.open_on_start = False`, or the user's `openOnStart` lab setting off, keeps
  the tab closed on every load
- **Palette command** - `Message of the day: Open` pulls again and opens the tab under the same
  conditions, whatever the two open-on-start switches say

## 7. Live broadcasts

This section states how a broadcast sent while the lab runs opens the tab. The extension does not
receive broadcasts, and `jupyterlab_notifications_extension` shows them in the lab as lab
notifications.

- **Setting** - the tab opens for a live broadcast only when the `reopenOnBroadcast` setting is on
- **Pulls** - each new lab notification makes the extension pull `<notifications_api_url>` 1 s, 5 s
  and 15 s after it
- **Match** - a row with a new `ts` and `message` pair, whose `message` equals the text of the lab
  notification
- **Result** - on a match, the extension opens the tab behind the current tab when the tab is
  closed and it has something to show: a welcome entry, or the page of section 6
- **Hub requirement** - the hub records a delivered broadcast in the `<notifications_api_url>`
  answer, with the same message text, no later than 15 s after the lab notification appears

## 8. Stock JupyterHub implementation

This section states how to add the three routes to a JupyterHub without GalaxaHub. The two URL
settings can point at hub handlers or at a JupyterHub service, and each caller sends the lab
server's token.

- **Lab config** - the lab image sets both URLs, for example from `JUPYTERHUB_API_URL` in
  `jupyter_server_config.py`, as the README shows
- **`extra_handlers`** - JupyterHub 6.0.1 mounts `c.JupyterHub.extra_handlers` under the hub prefix,
  before its API 404 handler
- **Example** - `(r"/api/extensions/motd/rich", RichHandler)` answers at
  `/hub/api/extensions/motd/rich`
- **Deprecation** - `extra_handlers` is deprecated since JupyterHub 3.1 and logs a warning at start
- **Token authentication** - a handler that subclasses `jupyterhub.apihandlers.base.APIHandler`
  accepts the lab token, and `self.current_user` is the owner of the token
- **Service** - JupyterHub serves a service under `/services/<name>/`, and `HubAuth` accepts a
  token only with `access:services!service=<name>` by default
- **Service scope** - the default server role grants `users:activity!user` and
  `access:servers!server`, so the hub config adds `access:services!service=<name>` to the `server`
  role through `c.JupyterHub.load_roles`
- **HTML route** - the browser loads the HTML pages, so their route accepts the hub login cookie
