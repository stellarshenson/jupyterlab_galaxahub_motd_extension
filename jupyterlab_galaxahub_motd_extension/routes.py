"""The three hub reads the Message of the day tab pulls, proxied with the lab's API token.

The frontend calls only these routes. The hub is called from here with JUPYTERHUB_API_TOKEN,
so the token never reaches the browser. The contract is the hub's galaxahub-motd-extension
(terminal, rich) and its user-notifications rail.
"""
import os

import tornado
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from tornado.httpclient import AsyncHTTPClient, HTTPClientError, HTTPRequest

NAMESPACE = "jupyterlab-galaxahub-motd-extension"

# route name -> hub path under JUPYTERHUB_API_URL
HUB_PATHS = {
    "terminal": "extensions/motd/terminal",
    "rich": "extensions/motd/rich",
    "notifications": "user-notifications",
}

# the hub answer headers the browser receives; nothing else of the hub answer is passed on
PASSED_HEADERS = ("Content-Type", "Etag", "Cache-Control")


class MotdProxyHandler(APIHandler):
    """GET one hub read and answer it unchanged, or 204 when there is no hub to ask.

    A hub 404 (the hub carries no motd extension), a hub that cannot be reached and an unset
    JUPYTERHUB_API_URL are one answer: 204 with Cache-Control: no-cache. Every other hub
    status passes through with its body."""

    @tornado.web.authenticated
    async def get(self, name):
        api_url = os.environ.get("JUPYTERHUB_API_URL", "")
        if not api_url:
            return self.absent(name, "JUPYTERHUB_API_URL is not set")
        url = url_path_join(api_url, HUB_PATHS[name])
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


def setup_route_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    route_pattern = url_path_join(base_url, NAMESPACE, f"({'|'.join(HUB_PATHS)})")
    web_app.add_handlers(host_pattern, [(route_pattern, MotdProxyHandler)])
