"""The three hub reads, proxied with the lab's API token.

The frontend calls only these routes. The hub is called from here with JUPYTERHUB_API_TOKEN,
so the token never reaches the browser. The two hub URLs come from the lab's Jupyter config
(GalaxaHubMotd); the contract is the hub's galaxahub-motd-extension (terminal, rich) and its
user-notifications rail.
"""
import json
import os

import tornado
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from tornado.httpclient import AsyncHTTPClient, HTTPClientError, HTTPRequest
from traitlets import Unicode
from traitlets.config import Configurable

NAMESPACE = "jupyterlab-galaxahub-motd-extension"
ROUTES = ("terminal", "rich", "notifications")


class GalaxaHubMotd(Configurable):
    """The two hub URLs, set in jupyter_server_config or jupyter_lab_config. Both are required:
    with either one empty the extension has no hub to ask and shows nothing."""

    motd_api_url = Unicode(
        "", config=True,
        help="Base URL of the motd API: <url>/rich answers the welcome entries (markdown and "
             "html pages), <url>/terminal the terminal text. Empty: the extension shows nothing.",
    )
    notifications_api_url = Unicode(
        "", config=True,
        help="URL that answers the broadcasts sent to the user. Empty: the extension shows nothing.",
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


class MotdProxyHandler(APIHandler):
    """GET one hub read and answer it unchanged, or 204 when there is no hub to ask.

    A hub 404 (the hub carries no motd extension), a hub that cannot be reached and an empty
    GalaxaHubMotd setting are one answer: 204 with Cache-Control: no-cache. Every other hub
    status passes through with its body."""

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
        except (OSError, HTTPClientError) as error:
            return self.absent(name, f"{url} cannot be reached: {error}")
        if answer.code == 404:
            return self.absent(name, f"{url} answered 404")

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
        self.log.info("[Message of the day] %s: %s - answering 204", name, why)
        self.set_status(204)
        self.set_header("Cache-Control", "no-cache")
        self.finish()


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
    web_app.add_handlers(host_pattern, [
        (route_pattern, MotdProxyHandler, {"motd": motd}),
        (url_path_join(base_url, NAMESPACE, "settings"), MotdSettingsHandler, {"motd": motd}),
    ])
