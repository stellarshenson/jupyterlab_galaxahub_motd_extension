"""The three hub reads, proxied with the lab's API token, and the lab's own local page.

The frontend calls only these routes. The hub is called from here with JUPYTERHUB_API_TOKEN,
so the token never reaches the browser. The two hub URLs come from the lab's Jupyter config
(GalaxaHubMotd); the contract is the hub's galaxahub-motd-extension (terminal, rich) and its
user-notifications rail. When the hub gives no rich entry, the rich route answers the local
page GalaxaHubMotd.fallback_html instead, served from the lab's own disk, or the extension's
built-in page while that setting is empty.
"""
import json
import os
import time
from pathlib import Path

import tornado
from jupyter_server.base.handlers import APIHandler, JupyterHandler
from jupyter_server.utils import url_path_join
from tornado.httpclient import AsyncHTTPClient, HTTPClientError, HTTPRequest
from traitlets import Bool, Unicode
from traitlets.config import Configurable

from . import __version__

NAMESPACE = "jupyterlab-galaxahub-motd-extension"
ROUTES = ("terminal", "rich", "notifications")
# the built-in page: the version, what the extension does, its settings and the hub API it reads
ABOUT_PAGE = Path(__file__).parent / "about" / "index.html"


class GalaxaHubMotd(Configurable):
    """The two hub URLs, the local page, the tab label, the open-on-start switch and the scripts
    switch, set in jupyter_server_config or jupyter_lab_config. Both URLs are required: with either one empty
    the extension has no hub to ask and shows only the local page."""

    motd_api_url = Unicode(
        "", config=True,
        help="Base URL of the motd API: <url>/rich answers the welcome entries (markdown and "
             "html pages), <url>/terminal the terminal text. Empty: no hub is asked, and the tab "
             "shows the local or built-in page.",
    )
    notifications_api_url = Unicode(
        "", config=True,
        help="URL that answers the broadcasts sent to the user. Empty: no hub is asked, and the tab "
             "shows the local or built-in page.",
    )
    fallback_html = Unicode(
        "", config=True,
        help="Absolute path of an HTML page on the lab's disk, shown in the tab when the hub gives no "
             "welcome entry: a URL setting empty, no motd extension, not reachable, an error answer, or "
             "no entry for the user. The files in its directory are served beside it. Empty: the "
             "extension's built-in page, which states what it does, its settings and the hub API it reads.",
    )
    label = Unicode(
        "Message of the day", config=True,
        help="The label of the tab, and of the local page's card.",
    )
    open_on_start = Bool(
        True, config=True,
        help="Open the tab on the first load of the lab page after each lab server start; a later "
             "load, a browser refresh included, opens no tab. False: no load opens the tab. The "
             "user's openOnStart lab setting must be on too.",
    )
    html_allow_scripts = Bool(
        True, config=True,
        help="Let the scripts of an HTML page run in the tab: the local page's, and a hub page's where "
             "the hub's Content-Security-Policy allows script. A script on the lab's origin has the "
             "access of the lab page itself, so only an administrator must be able to write a page. "
             "False: no script in a page runs.",
    )

    def empty(self):
        """The names of the settings left empty."""
        return [name for name in ("motd_api_url", "notifications_api_url") if not getattr(self, name)]

    def url(self, route):
        """The URL one route reads."""
        if route == "notifications":
            return self.notifications_api_url.rstrip("/")
        return url_path_join(self.motd_api_url, route)

# the hub answer headers the browser receives; nothing else of the hub answer is passed on
PASSED_HEADERS = ("Content-Type", "Etag", "Cache-Control")


def has_entries(answer):
    """Whether a hub rich answer gives the browser entries: a 304 keeps those the browser holds,
    a 200 carries at least one."""
    if answer.code == 304:
        return True
    try:
        return answer.code == 200 and bool(json.loads(answer.body)["entries"])
    except (ValueError, KeyError, TypeError):
        return False


class MotdProxyHandler(APIHandler):
    """GET one hub read and answer it unchanged, or 204 when there is no hub to ask.

    A hub 404 (the hub carries no motd extension), a hub that cannot be reached and an empty
    GalaxaHubMotd setting are one answer: 204 with Cache-Control: no-cache. Every other hub
    status passes through with its body. The rich route answers the local or built-in page
    whenever the hub gives no entry."""

    def initialize(self, motd):
        self.motd = motd

    @tornado.web.authenticated
    async def get(self, name):
        empty = self.motd.empty()
        if empty:
            return self.absent(name, f"GalaxaHubMotd.{' and GalaxaHubMotd.'.join(empty)} not set")
        url = self.motd.url(name)
        headers = {"Authorization": f"token {os.environ.get('JUPYTERHUB_API_TOKEN', '')}"}
        if "If-None-Match" in self.request.headers:
            headers["If-None-Match"] = self.request.headers["If-None-Match"]
        try:
            # raise_error=False covers HTTP statuses only; a refused connection, a failed name
            # lookup and a timeout still raise
            answer = await AsyncHTTPClient().fetch(
                HTTPRequest(url, headers=headers, connect_timeout=5, request_timeout=10),
                raise_error=False,
            )
        except (OSError, HTTPClientError, ValueError) as error:
            return self.absent(name, f"{url} cannot be reached: {error}")
        if answer.code == 404:
            return self.absent(name, f"{url} answered 404")
        if name == "rich" and not has_entries(answer) and self.local(f"{url} answered {answer.code} with no entry"):
            return

        self.set_status(answer.code)
        for header in PASSED_HEADERS:
            if header in answer.headers:
                self.set_header(header, answer.headers[header])
        # the hub's rich route answers 200 whatever If-None-Match says; the browser leg is
        # still a 304 when the Etag it holds is the current one
        if answer.code == 200 and self.check_etag_header():
            self.set_status(304)
        if self.get_status() in (204, 304):
            return self.finish()
        self.finish(answer.body, set_content_type=answer.headers.get("Content-Type", "application/json"))

    def absent(self, name, why):
        """The one answer for a hub that has no motd to give; the log says which case it was."""
        if name == "rich" and self.local(why):
            return
        self.log.info("[Message of the day] %s: %s - answering 204", name, why)
        self.set_status(204)
        self.set_header("Cache-Control", "no-cache")
        self.finish()

    def local(self, why):
        """Answer the local page as the one html entry, labelled with GalaxaHubMotd.label: the
        page fallback_html names, or the built-in page while it is empty; False when fallback_html
        names no file."""
        page = self.motd.fallback_html
        if page and not os.path.isfile(page):
            self.log.warning("[Message of the day] GalaxaHubMotd.fallback_html %s is not a file - no local page", page)
            return False
        self.log.info("[Message of the day] rich: %s - answering the local page %s", why, page or "(built-in)")
        self.set_header("Cache-Control", "no-cache")
        if page:
            url = url_path_join(self.base_url, NAMESPACE, "local", os.path.basename(page))
        else:
            url = url_path_join(self.base_url, NAMESPACE, "about", "index.html")
        self.finish(json.dumps({"entries": [{"label": self.motd.label, "kind": "html", "url": url}]}))
        return True


class PageHandler(JupyterHandler, tornado.web.StaticFileHandler):
    """GET the local page and the files in its folder for the tab's frame, only to a logged-in
    user, with Cache-Control: no-cache; 404 while the folder is empty (no fallback_html)."""

    def initialize(self, folder):
        self.folder = folder
        super().initialize(path=folder)

    @tornado.web.authenticated
    def get(self, path, include_body=True):
        if not self.folder:
            raise tornado.web.HTTPError(404)
        return super().get(path, include_body)

    @tornado.web.authenticated
    def head(self, path):
        return self.get(path, include_body=False)

    def set_extra_headers(self, path):
        self.set_header("Cache-Control", "no-cache")


class AboutPageHandler(JupyterHandler):
    """GET the built-in page with this extension's version in place of {{version}}, only to a
    logged-in user."""

    @tornado.web.authenticated
    def get(self):
        self.set_header("Content-Type", "text/html; charset=utf-8")
        self.set_header("Cache-Control", "no-cache")
        self.finish(ABOUT_PAGE.read_text().replace("{{version}}", __version__))


class MotdSettingsHandler(APIHandler):
    """GET the two hub URLs as this server holds them, so the CLI uses the running lab's config."""

    def initialize(self, motd):
        self.motd = motd

    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({
            "motd_api_url": self.motd.motd_api_url,
            "notifications_api_url": self.motd.notifications_api_url,
        }))


def setup_route_handlers(web_app, motd):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    route_pattern = url_path_join(base_url, NAMESPACE, f"({'|'.join(ROUTES)})")
    local = os.path.dirname(os.path.abspath(motd.fallback_html)) if motd.fallback_html else ""
    web_app.add_handlers(host_pattern, [
        (route_pattern, MotdProxyHandler, {"motd": motd}),
        (url_path_join(base_url, NAMESPACE, "settings"), MotdSettingsHandler, {"motd": motd}),
        (url_path_join(base_url, NAMESPACE, "local", "(.*)"), PageHandler, {"folder": local}),
        (url_path_join(base_url, NAMESPACE, "about", "index.html"), AboutPageHandler),
    ])
    # the frontend reads the tab label, the open-on-start switch, the scripts switch and whether a
    # notifications URL is set (without one the tab has no Notifications column) from the lab
    # page's config, and this server start, so the tab opens by itself once per start and not on
    # every page load
    page_config = web_app.settings.setdefault("page_config_data", {})
    page_config["galaxahubMotdLabel"] = motd.label
    page_config["galaxahubMotdOpenOnStart"] = motd.open_on_start
    page_config["galaxahubMotdHtmlAllowScripts"] = motd.html_allow_scripts
    page_config["galaxahubMotdNotifications"] = bool(motd.notifications_api_url)
    page_config["galaxahubMotdServerStart"] = str(time.time())
