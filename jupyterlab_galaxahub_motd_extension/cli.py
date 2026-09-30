"""jupyterlab-galaxahub-motd - print the GalaxaHub message of the day in a lab terminal.

Reads the three hub feeds - the terminal text, the rich entries of the user's groups and the
broadcasts sent to the user - with the lab's own API token, the same reads the lab's server
proxy makes. The two hub URLs come from the running lab server this terminal belongs to, so
whatever configured that lab applies.
"""
import argparse
import http.client
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jupyter_core.paths import jupyter_runtime_dir
from jupyter_server.utils import url_path_join
from traitlets import TraitError

from .routes import NAMESPACE, GalaxaHubMotd

PROG = "jupyterlab-galaxahub-motd"
NO_MOTD = 1
HUB_FAILED = 4
PLUGIN_ID = "jupyterlab_galaxahub_motd_extension:plugin"
# the choices of the tab's notificationWindow setting, schema/plugin.json
NOTIFICATION_WINDOWS = {"24h": timedelta(hours=24), "3d": timedelta(days=3), "7d": timedelta(days=7)}


class Stop(Exception):
    """The one stderr line a run ends with, and its exit code."""

    def __init__(self, code, line):
        super().__init__(line)
        self.code = code


def lab_token(server):
    """The token a running lab server at `server` wrote to its runtime file, or ''."""
    for path in Path(jupyter_runtime_dir()).glob("jpserver-*.json"):
        try:
            info = json.loads(path.read_text())
            os.kill(int(info["pid"]), 0)
        except (OSError, ValueError, KeyError, TypeError):
            continue
        if str(info.get("url", "")).rstrip("/") == server.rstrip("/") and info.get("token"):
            return info["token"]
    return ""


def lab_read(read, *path):
    """What `read` makes of the JSON answer of the running lab server for `path`."""
    server = os.environ.get("JUPYTER_SERVER_URL", "")
    if not server:
        raise Stop(HUB_FAILED, "JUPYTER_SERVER_URL is not set - run this in a terminal of the lab, which sets it")
    token = lab_token(server) or os.environ.get("JUPYTERHUB_API_TOKEN", "")
    request = urllib.request.Request(url_path_join(server, *path), headers={"Authorization": f"token {token}"})
    try:
        with urllib.request.urlopen(request, timeout=10) as answer:
            return read(json.loads(answer.read()))
    except urllib.error.HTTPError as error:
        # the status only: the body could echo the token
        raise Stop(HUB_FAILED, f"the lab server at {server} answered {error.code} - run this in a terminal of "
                               "the running lab, whose server runs jupyterlab_galaxahub_motd_extension")
    except (OSError, http.client.HTTPException, ValueError, KeyError, TypeError, TraitError) as error:
        # only the class name for anything but a network error: its text could echo the token
        why = getattr(error, "reason", error) if isinstance(error, OSError) else type(error).__name__
        raise Stop(HUB_FAILED, f"cannot read the settings of the lab server at {server}: {why} - "
                               "run this in a terminal of the running lab")


def settings():
    """The GalaxaHubMotd settings the running lab server holds, from its settings route."""
    motd = lab_read(lambda found: GalaxaHubMotd(motd_api_url=found["motd_api_url"],
                                                notifications_api_url=found["notifications_api_url"]),
                    NAMESPACE, "settings")
    empty = motd.empty()
    if empty:
        raise Stop(NO_MOTD, f"no motd: GalaxaHubMotd.{' and GalaxaHubMotd.'.join(empty)} not set in the "
                            "running lab's config, so this lab has no hub to ask")
    return motd


def notification_window():
    """The tab's notificationWindow setting in the running lab: the user's choice, else its default.
    The lab answers user settings that break the schema as none, so the value is one of the choices."""
    def read(tab):
        return tab["settings"].get("notificationWindow", tab["schema"]["properties"]["notificationWindow"]["default"])

    return lab_read(read, "lab/api/settings", PLUGIN_ID)


def fetch(motd, name):
    """The hub's answer body for one feed; b'' for a 204."""
    url = motd.url(name)
    token = os.environ.get("JUPYTERHUB_API_TOKEN", "")
    request = urllib.request.Request(url, headers={"Authorization": f"token {token}"})
    try:
        with urllib.request.urlopen(request, timeout=10) as answer:
            return answer.read()
    except urllib.error.HTTPError as error:
        # the status only: the hub's body and reason phrase are not ours to print, and could
        # echo the token
        if error.code == 404:
            raise Stop(NO_MOTD, f"no motd: {url} answered 404 - the hub does not carry this feed")
        if error.code == 403:
            raise Stop(HUB_FAILED, f"{url} answered 403 - the hub refused JUPYTERHUB_API_TOKEN; "
                                   "run this in a terminal of the lab, whose server sets the lab's own token")
        raise Stop(HUB_FAILED, f"{url} answered {error.code} - try again later; if it persists, "
                               "the hub log holds the cause")
    except (OSError, http.client.HTTPException) as error:
        # an http.client error's text is what the hub sent (a broken status line can echo the
        # token), so only its class name is printed
        if isinstance(error, http.client.HTTPException):
            why = type(error).__name__
        else:
            why = getattr(error, "reason", error)
        raise Stop(HUB_FAILED, f"cannot reach {url}: {why} - check GalaxaHubMotd.motd_api_url and "
                               "GalaxaHubMotd.notifications_api_url in the lab's config")


def rows(motd, name, key):
    """The list under `key` of one JSON feed; [] for a 204 or an answer without it."""
    try:
        answer = json.loads(fetch(motd, name) or b"{}")
    except ValueError:
        raise Stop(HUB_FAILED, f"the hub's {name} answer is not JSON - check GalaxaHubMotd.motd_api_url "
                               "and GalaxaHubMotd.notifications_api_url in the lab's config")
    found = answer.get(key) if isinstance(answer, dict) else None
    return found if isinstance(found, list) else []


# The readers keep only the known fields of each row, so nothing else the hub answers reaches
# the output.

def read_terminal(motd):
    return fetch(motd, "terminal").decode("utf-8", errors="replace")


def read_entries(motd):
    """The rich entries: markdown with its body, html with the absolute url of its page."""
    entries = []
    for e in rows(motd, "rich", "entries"):
        if not isinstance(e, dict) or not isinstance(e.get("group"), str):
            continue
        if e.get("kind") == "markdown" and isinstance(e.get("body"), str):
            entries.append({"group": e["group"], "kind": "markdown", "body": e["body"]})
        elif e.get("kind") == "html" and isinstance(e.get("url"), str):
            url = urllib.parse.urljoin(motd.motd_api_url, e["url"])
            entries.append({"group": e["group"], "kind": "html", "url": url})
    return entries


def read_notifications(motd, window):
    """The broadcasts inside `window`, newest first; a row whose time cannot be read is left out."""
    def time(row):
        try:
            return datetime.fromisoformat(str(row["ts"]).replace("Z", "+00:00")).timestamp()
        except ValueError:
            return float("-inf")

    since = (datetime.now(timezone.utc) - NOTIFICATION_WINDOWS[window]).timestamp()
    kept = [
        {"ts": r.get("ts"), "type": r.get("type"), "audience": r.get("audience"), "message": r["message"]}
        for r in rows(motd, "notifications", "notifications")
        if isinstance(r, dict) and isinstance(r.get("message"), str)
    ]
    return sorted((r for r in kept if time(r) >= since), key=time, reverse=True)


def entries_text(entries):
    return "\n\n".join(f"## {e['group']}\n\n" + e.get("body", e.get("url")).rstrip("\n") for e in entries)


def notification_lines(notifications):
    # one line per row: whitespace inside a message, line breaks included, prints as one space
    return "\n".join(
        f"{r['ts']}\t{r['type']}\t{r['audience']}\t{' '.join(r['message'].split())}" for r in notifications
    )


def cmd_show(args):
    hub = args.motd
    motd = {"terminal": read_terminal(hub), "entries": read_entries(hub),
            "notifications": read_notifications(hub, notification_window())}
    # notifications alone are no motd
    if not motd["terminal"] and not motd["entries"]:
        raise Stop(NO_MOTD, "no motd: the hub holds no terminal text and no rich entry for this user")
    if args.json:
        print(json.dumps(motd))
        return 0
    parts = []
    if motd["terminal"]:
        parts.append(motd["terminal"].rstrip("\n"))
    if motd["entries"]:
        parts.append(entries_text(motd["entries"]))
    if motd["notifications"]:
        parts.append("## Notifications\n\n" + notification_lines(motd["notifications"]))
    print("\n\n".join(parts))
    return 0


def cmd_terminal(args):
    text = read_terminal(args.motd)
    if not text:
        raise Stop(NO_MOTD, "no motd: the hub holds no terminal text for this user")
    if args.json:
        print(json.dumps({"terminal": text}))
    else:
        sys.stdout.write(text)
    return 0


def cmd_rich(args):
    entries = read_entries(args.motd)
    if not entries:
        raise Stop(NO_MOTD, "no motd: the hub holds no rich entry for this user")
    print(json.dumps({"entries": entries}) if args.json else entries_text(entries))
    return 0


def cmd_notifications(args):
    window = notification_window()
    notifications = read_notifications(args.motd, window)
    if not notifications:
        raise Stop(NO_MOTD, f"no motd: the hub holds no notification of the last {window} for this user "
                            "(the lab's notificationWindow setting)")
    print(json.dumps({"notifications": notifications}) if args.json else notification_lines(notifications))
    return 0


EPILOG = f"""
configuration:
  c.GalaxaHubMotd.motd_api_url           base URL of the motd API; terminal reads <url>/terminal,
                                         rich reads <url>/rich
  c.GalaxaHubMotd.notifications_api_url  URL of the broadcasts sent to the user
  Both are settings of the lab server. The CLI asks the running lab server for them, so
  whatever configured that lab applies: its config files and its command line. Either one
  empty means no hub to ask (exit 1).
  notificationWindow                     the tab's setting in the lab's Settings Editor:
                                         24h (default), 3d or 7d, how far back show and
                                         notifications list broadcasts; the CLI asks the
                                         running lab for it

environment:
  JUPYTER_SERVER_URL    the lab server this terminal belongs to, set by JupyterLab in every
                        terminal; unset means exit 4
  JUPYTERHUB_API_TOKEN  the lab's api token, sent as `Authorization: token ...` to the hub,
                        and to the lab server when its runtime file holds no token; never
                        printed, also not on errors and not with --json

exit status:
  0  the motd is on stdout
  1  no motd: a GalaxaHubMotd setting is empty, the hub answered 404 (it does not carry the
     feed), or the hub holds nothing for this user
  2  an argument the parser rejects
  4  the lab server or the hub refused the token (403), answered another error status, or
     cannot be reached; or JUPYTER_SERVER_URL is unset
Exit 1 and 4 print one line on stderr, naming the cause, and nothing on stdout.

Every command has its own --help with examples: {PROG} show --help
"""

COMMANDS = [
    (
        "show", cmd_show, "the whole motd: terminal text, rich entries, notifications",
        """
Print the whole message of the day in three parts, in this order:

  the terminal text, as `terminal` prints it
  each rich entry under a `## <group>` heading, as `rich` prints it
  `## Notifications`, then one line per broadcast of the lab's notificationWindow setting,
  as `notifications` prints it

A part the hub holds nothing for is left out. Exits 1 when the hub holds no terminal text
and no rich entry, whatever the notifications, or when any of the three feeds answers 404.
""",
        f"""
examples:
  {PROG} show
  {PROG} show --json | jq -r '.entries[].group'
""",
        "print one JSON document instead: "
        '{"terminal": "...", "entries": [...], "notifications": [...]}, each as the command of that name gives it',
    ),
    (
        "terminal", cmd_terminal, "the terminal text, verbatim",
        """
Print the terminal texts of the user's groups, joined by the hub, exactly as the hub stores
them: ANSI escape sequences included and no newline added. Exits 1 when no group of the user
carries a terminal text. On exit 1 and 4 stdout stays empty, so a lab startup script runs this
command with stderr sent to /dev/null and needs no motd URL and no token of its own.
""",
        f"""
examples:
  {PROG} terminal
  {PROG} terminal 2>/dev/null                 # in a lab startup script
  {PROG} terminal --json | jq -r .terminal
""",
        'print one JSON document instead: {"terminal": "<the text>"}',
    ),
    (
        "rich", cmd_rich, "the rich entries, each under its group name",
        """
Print each rich entry of the user's groups, in the hub's order (by group name): a
`## <group>` heading, a blank line, then the markdown body, or for an html entry the url of
its page on the hub, made absolute against motd_api_url. That is the hub address inside
the lab, which a browser may not reach, and the hub answers it only to an authenticated
caller; the page itself is read in the lab's Message of the day tab. Entries are separated by
a blank line. Exits 1 when no group of the user carries a rich entry.
""",
        f"""
examples:
  {PROG} rich
  {PROG} rich --json | jq -r '.entries[] | select(.kind == "html") | .url'
""",
        "print one JSON document instead: "
        '{"entries": [{"group", "kind": "markdown", "body"} or {"group", "kind": "html", "url"}]}',
    ),
    (
        "notifications", cmd_notifications, "the broadcasts of the notificationWindow setting, newest first",
        """
Print the broadcasts the hub recorded for the user - those sent to all users and those naming
the user - one line per broadcast, newest first, as far back as the lab's notificationWindow
setting reaches: 24h (default), 3d or 7d. Each line holds four fields separated by a tab: time
(ISO 8601), type, audience (all or direct), message. Whitespace inside a message, line breaks
included, prints as one space. Exits 1 when the hub holds none inside that span.
""",
        f"""
examples:
  {PROG} notifications
  {PROG} notifications | cut -f4
  {PROG} notifications --json | jq -r '.notifications[0].message'
""",
        'print one JSON document instead: {"notifications": [{"ts", "type", "audience", "message"}]}, newest first',
    ),
]


def parser():
    p = argparse.ArgumentParser(
        prog=PROG,
        description=__doc__,
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="command", required=True, metavar="COMMAND")
    for name, func, help_, description, epilog, json_help in COMMANDS:
        s = sub.add_parser(
            name, help=help_, description=description.strip("\n"), epilog=epilog.strip("\n"),
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )
        s.add_argument("--json", action="store_true", help=json_help)
        s.set_defaults(func=func)
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        args.motd = settings()
        return args.func(args)
    except Stop as stop:
        print(f"{PROG}: {stop}", file=sys.stderr)
        return stop.code


if __name__ == "__main__":
    raise SystemExit(main())
