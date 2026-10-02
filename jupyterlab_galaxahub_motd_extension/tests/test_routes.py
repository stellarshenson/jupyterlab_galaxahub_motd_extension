"""The hub proxy against a stub hub on a local port (ACC-PROXY-14 to ACC-PROXY-21, ACC-LIVE-22,
ACC-SERVER-53, ACC-SERVER-54, ACC-SERVER-60, ACC-CLI-56), the local and built-in pages
(ACC-LOCAL-67 to ACC-LOCAL-70), the tab label (ACC-SERVER-66) and the open-on-start switch
(ACC-SERVER-71). Without fallback_html the rich route answers the built-in page where the hub
gives no entry, so the 204 cases are asserted on the other two routes.

The workstation's environment carries a live JUPYTERHUB_API_TOKEN, so every test replaces it.
The server config points the two GalaxaHubMotd URLs at a port nothing listens on, or at the
stub when the test uses the `hub` fixture.
"""
import asyncio
import json
import logging
import os
import socket

import pytest
import tornado.httpserver
import tornado.testing
import tornado.web

from jupyterlab_galaxahub_motd_extension import __version__, cli
from jupyterlab_galaxahub_motd_extension.routes import ROUTES, GalaxaHubMotd, setup_route_handlers

NS = "jupyterlab-galaxahub-motd-extension"
TOKEN = "stub-lab-token-5f1e0c"
JSON = {"Content-Type": "application/json"}


class StubHub:
    """Answers GET /hub/api/<path> from `answers`, recording each request's path and headers."""

    def __init__(self):
        self.requests = []
        self.answers = {}

    def paths(self):
        return [path for path, _ in self.requests]


class _StubHandler(tornado.web.RequestHandler):
    def initialize(self, hub):
        self.hub = hub

    def compute_etag(self):
        # no tornado-made Etag: the stub sends only the headers a test gives it
        return None

    def get(self, path):
        self.hub.requests.append((path, dict(self.request.headers)))
        status, headers, body = self.hub.answers.get(path, (200, JSON, b"{}"))
        self.set_status(status)
        for name, value in headers.items():
            self.set_header(name, value)
        if status in (204, 304):
            return self.finish()
        self.finish(body)


def _closed_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(autouse=True)
def no_real_token(monkeypatch):
    monkeypatch.setenv("JUPYTERHUB_API_TOKEN", "not-the-stub-token")


@pytest.fixture
def hub_url(request):
    """The stub's API base when the test uses the `hub` fixture, else a port nothing listens on."""
    if "hub" in request.fixturenames:
        return request.getfixturevalue("hub").url
    return f"http://127.0.0.1:{_closed_port()}/hub/api"


@pytest.fixture
def hub_paths():
    """The motd and notifications paths under hub_url that the server config names."""
    return ("extensions/motd", "user-notifications")


@pytest.fixture
def left_out():
    """The GalaxaHubMotd settings a test leaves out of the server config."""
    return ()


@pytest.fixture
def page_dir(tmp_path):
    """A local page and an image beside it, and a file outside their directory."""
    folder = tmp_path / "motd"
    folder.mkdir()
    (folder / "index.html").write_text('<!doctype html><h1>Local welcome</h1><img src="logo.svg">')
    (folder / "logo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    (tmp_path / "outside.txt").write_text("not served")
    return folder


@pytest.fixture
def motd_extra():
    """GalaxaHubMotd settings a test adds besides the two URLs."""
    return {}


@pytest.fixture
def jp_server_config(jp_server_config, hub_url, hub_paths, left_out, motd_extra, request):
    motd, notifications = hub_paths
    urls = {"motd_api_url": f"{hub_url}/{motd}", "notifications_api_url": f"{hub_url}/{notifications}"}
    settings = {k: v for k, v in urls.items() if k not in left_out}
    # a test that uses `page_dir` sets the local page
    if "page_dir" in request.fixturenames:
        settings["fallback_html"] = str(request.getfixturevalue("page_dir") / "index.html")
    return {**jp_server_config, "GalaxaHubMotd": {**settings, **motd_extra}}


@pytest.fixture
def hub(jp_asyncio_loop, monkeypatch):
    stub = StubHub()
    sock, port = tornado.testing.bind_unused_port()
    app = tornado.web.Application([(r"/hub/api/(.*)", _StubHandler, {"hub": stub})])

    async def start():
        server = tornado.httpserver.HTTPServer(app)
        server.add_socket(sock)
        return server

    server = jp_asyncio_loop.run_until_complete(start())
    stub.url = f"http://127.0.0.1:{port}/hub/api"
    monkeypatch.setenv("JUPYTERHUB_API_TOKEN", TOKEN)
    yield stub
    server.stop()
    sock.close()


def _fetch(jp_fetch, name, **kwargs):
    return jp_fetch(NS, name, raise_error=False, **kwargs)


async def test_token_is_forwarded_to_the_hub(jp_fetch, hub):
    await _fetch(jp_fetch, "rich")
    [(_, headers)] = hub.requests
    assert headers["Authorization"] == f"token {TOKEN}"


async def test_each_route_reaches_its_hub_path(jp_fetch, hub):
    for name in ROUTES:
        await _fetch(jp_fetch, name)
    assert hub.paths() == ["extensions/motd/terminal", "extensions/motd/rich", "user-notifications"]


@pytest.mark.parametrize("hub_paths", [("lab-motd/v1", "lab-motd/notes"), ("lab-motd/v1/", "lab-motd/notes/")])
async def test_routes_follow_the_settings(jp_fetch, hub, hub_paths):
    for name in ROUTES:
        await _fetch(jp_fetch, name)
    assert hub.paths() == ["lab-motd/v1/terminal", "lab-motd/v1/rich", "lab-motd/notes"]


async def test_settings_route_answers_the_server_settings(jp_fetch, hub_url):
    response = await jp_fetch(NS, "settings")
    assert json.loads(response.body) == {
        "motd_api_url": f"{hub_url}/extensions/motd", "notifications_api_url": f"{hub_url}/user-notifications"}


@pytest.mark.parametrize("left_out", [("motd_api_url", "notifications_api_url")])
async def test_settings_route_answers_empty_strings(jp_fetch, left_out):
    response = await jp_fetch(NS, "settings")
    assert json.loads(response.body) == {"motd_api_url": "", "notifications_api_url": ""}


async def test_cli_asks_the_running_lab(jp_fetch, jp_serverapp, jp_http_port, jp_base_url, hub, monkeypatch,
                                        tmp_path, capsys):
    # the CLI reads the URLs this server holds through its settings route, with the token the
    # server wrote to its runtime file; it runs in a thread so this event loop keeps serving
    lab = f"http://127.0.0.1:{jp_http_port}{jp_base_url}"
    # a runtime directory of its own: pytest-jupyter already uses tmp_path / "runtime"
    runtime = tmp_path / "cli-runtime"
    runtime.mkdir()
    (runtime / f"jpserver-{os.getpid()}.json").write_text(
        json.dumps({"url": lab, "token": jp_serverapp.identity_provider.token, "pid": os.getpid()}))
    monkeypatch.setenv("JUPYTER_RUNTIME_DIR", str(runtime))
    monkeypatch.setenv("JUPYTER_SERVER_URL", lab)
    hub.answers["extensions/motd/terminal"] = (200, {"Content-Type": "text/plain"}, b"from the stub hub\n")
    code = await asyncio.to_thread(cli.main, ["terminal"])
    out, err = capsys.readouterr()
    assert (code, out, err) == (0, "from the stub hub\n", "")
    [(path, headers)] = hub.requests
    assert (path, headers["Authorization"]) == ("extensions/motd/terminal", f"token {TOKEN}")


def test_settings_are_empty_by_default():
    motd = GalaxaHubMotd()
    assert (motd.motd_api_url, motd.notifications_api_url, motd.fallback_html) == ("", "", "")
    assert (motd.label, motd.open_on_start, motd.html_allow_scripts) == ("Message of the day", True, True)
    assert set(GalaxaHubMotd.class_trait_names(config=True)) == {
        "motd_api_url", "notifications_api_url", "fallback_html", "label", "open_on_start", "html_allow_scripts"}


async def test_no_other_route(jp_fetch, hub):
    for name in ("ingest", "hello", "rich/extra"):
        response = await _fetch(jp_fetch, name)
        assert response.code == 404, name
    response = await _fetch(jp_fetch, "rich", method="POST", body=b"{}")
    assert response.code == 405
    assert hub.requests == []


async def test_etag_and_cache_control_pass_through(jp_fetch, hub):
    body = json.dumps({"entries": [{"label": "analysts", "kind": "markdown", "body": "# Hi"}]})
    hub.answers["extensions/motd/rich"] = (
        200, {**JSON, "Etag": '"abc123"', "Cache-Control": "no-cache"}, body.encode())
    response = await _fetch(jp_fetch, "rich")
    assert response.code == 200
    assert response.headers["Etag"] == '"abc123"'
    assert response.headers["Cache-Control"] == "no-cache"
    assert json.loads(response.body) == json.loads(body)


async def test_hub_304_passes_through(jp_fetch, hub):
    hub.answers["extensions/motd/terminal"] = (304, {"Etag": '"t1"', "Cache-Control": "no-cache"}, b"")
    response = await _fetch(jp_fetch, "terminal", headers={"If-None-Match": '"t1"'})
    [(_, headers)] = hub.requests
    assert headers["If-None-Match"] == '"t1"'
    assert response.code == 304
    assert response.headers["Etag"] == '"t1"'
    assert response.body == b""


async def test_matching_etag_answers_304(jp_fetch, hub):
    # the hub's rich route answers 200 whatever If-None-Match says
    body = json.dumps({"entries": [{"label": "analysts", "kind": "markdown", "body": "# Hi"}]}).encode()
    hub.answers["extensions/motd/rich"] = (200, {**JSON, "Etag": '"r1"'}, body)
    response = await _fetch(jp_fetch, "rich", headers={"If-None-Match": '"r1"'})
    assert response.code == 304
    assert response.body == b""
    response = await _fetch(jp_fetch, "rich", headers={"If-None-Match": '"stale"'})
    assert response.code == 200
    assert json.loads(response.body) == json.loads(body)


async def test_hub_404_answers_204(jp_fetch, hub):
    hub.answers["extensions/motd/terminal"] = (404, JSON, b'{"message": "Not Found"}')
    response = await _fetch(jp_fetch, "terminal")
    assert response.code == 204
    assert response.body == b""
    assert response.headers["Cache-Control"] == "no-cache"


async def test_refused_connection_answers_204(jp_fetch):
    # no `hub` fixture: both settings point at a port nothing listens on
    response = await _fetch(jp_fetch, "notifications")
    assert response.code == 204
    assert response.body == b""
    assert response.headers["Cache-Control"] == "no-cache"


@pytest.mark.parametrize("left_out", [
    ("motd_api_url",), ("notifications_api_url",), ("motd_api_url", "notifications_api_url")])
async def test_empty_setting_answers_204(jp_fetch, jp_serverapp, jp_base_url, hub, left_out):
    # either setting empty stops all three routes, and the server log names the empty one; the
    # rich route answers the built-in page instead of 204
    records = []
    handler = logging.Handler()
    handler.emit = records.append
    jp_serverapp.log.addHandler(handler)
    try:
        for name in ("terminal", "notifications"):
            response = await _fetch(jp_fetch, name)
            assert response.code == 204, name
            assert response.body == b""
            assert response.headers["Cache-Control"] == "no-cache"
        response = await _fetch(jp_fetch, "rich")
        assert json.loads(response.body) == _about_entry(jp_base_url)
    finally:
        jp_serverapp.log.removeHandler(handler)
    assert hub.requests == []
    logged = [r.getMessage() for r in records if "answering" in r.getMessage()]
    assert len(logged) == len(ROUTES)
    assert all(f"GalaxaHubMotd.{setting}" in line for line in logged for setting in left_out)


async def test_hub_403_passes_through(jp_fetch, hub):
    hub.answers["user-notifications"] = (403, JSON, b'{"status": 403, "message": "Forbidden"}')
    response = await _fetch(jp_fetch, "notifications")
    assert response.code == 403
    assert json.loads(response.body) == {"status": 403, "message": "Forbidden"}


async def test_terminal_text_passes_through(jp_fetch, hub):
    text = "\x1b[1;36mWelcome\x1b[0m to the analysts lab\n\nsecond group\n".encode()
    hub.answers["extensions/motd/terminal"] = (
        200, {"Content-Type": "text/plain; charset=utf-8", "Etag": '"t2"'}, text)
    response = await _fetch(jp_fetch, "terminal")
    assert response.code == 200
    assert response.headers["Content-Type"] == "text/plain; charset=utf-8"
    assert response.body == text
    hub.answers["extensions/motd/terminal"] = (204, {"Cache-Control": "no-cache"}, b"")
    response = await _fetch(jp_fetch, "terminal")
    assert response.code == 204


async def test_token_never_in_the_answer(jp_fetch, hub):
    # a hub header that echoes the Authorization it received must not reach the browser
    echo = {"X-Echo-Authorization": f"token {TOKEN}"}
    hub.answers["user-notifications"] = (200, {**JSON, **echo, "Etag": '"n1"'}, b'{"notifications": []}')
    hub.answers["extensions/motd/rich"] = (403, {**JSON, **echo}, b'{"message": "Forbidden"}')
    for name in ("terminal", "rich", "notifications"):
        response = await _fetch(jp_fetch, name)
        assert TOKEN not in response.body.decode(errors="replace"), name
        assert all(TOKEN not in value for _, value in response.headers.get_all()), name


def _local_entry(jp_base_url, label="Message of the day"):
    return {"entries": [{"label": label, "kind": "html", "url": f"{jp_base_url}{NS}/local/index.html"}]}


def _about_entry(jp_base_url):
    return {"entries": [{"label": "Message of the day", "kind": "html", "url": f"{jp_base_url}{NS}/about/index.html"}]}


async def test_local_page_when_the_hub_gives_no_entry(jp_fetch, jp_base_url, hub, page_dir):
    # ACC-LOCAL-67: a 200 with no entry, a 404 and an error status answer the local page
    for status, body in ((200, b'{"entries": []}'), (404, b'{"message": "Not Found"}'), (500, b"{}"), (403, b"{}")):
        hub.answers["extensions/motd/rich"] = (status, {**JSON, "Etag": '"r0"'}, body)
        response = await _fetch(jp_fetch, "rich")
        assert response.code == 200, status
        assert json.loads(response.body) == _local_entry(jp_base_url), status
        assert response.headers["Cache-Control"] == "no-cache", status
        # the hub's Etag does not travel with the local page; tornado sets its own, of this body
        assert response.headers.get("Etag") != '"r0"', status
    # the notifications route stays the hub's
    hub.answers["user-notifications"] = (404, JSON, b"{}")
    assert (await _fetch(jp_fetch, "notifications")).code == 204


async def test_local_page_when_the_hub_cannot_be_reached(jp_fetch, jp_base_url, page_dir):
    # ACC-LOCAL-67: no `hub` fixture, the settings point at a port nothing listens on
    response = await _fetch(jp_fetch, "rich")
    assert (response.code, json.loads(response.body)) == (200, _local_entry(jp_base_url))


@pytest.mark.parametrize("left_out", [("motd_api_url",)])
@pytest.mark.parametrize("motd_extra", [{"label": "Welcome to the lab"}])
async def test_local_page_with_an_empty_setting_carries_the_label(jp_fetch, jp_base_url, jp_serverapp, hub,
                                                                   page_dir, left_out, motd_extra):
    # ACC-LOCAL-67 and ACC-SERVER-66: no hub to ask, the local page under the configured label
    response = await _fetch(jp_fetch, "rich")
    assert json.loads(response.body) == _local_entry(jp_base_url, "Welcome to the lab")
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdLabel"] == "Welcome to the lab"
    assert hub.requests == []


async def test_label_in_the_page_config_by_default(jp_serverapp):
    # ACC-SERVER-66
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdLabel"] == "Message of the day"


async def test_hub_entries_win_over_the_local_page(jp_fetch, hub, page_dir):
    # ACC-LOCAL-68: entries and a 304 pass through unchanged
    body = json.dumps({"entries": [{"label": "analysts", "kind": "markdown", "body": "# Hi"}]})
    hub.answers["extensions/motd/rich"] = (200, {**JSON, "Etag": '"r1"'}, body.encode())
    response = await _fetch(jp_fetch, "rich")
    assert (response.code, json.loads(response.body), response.headers["Etag"]) == (200, json.loads(body), '"r1"')
    hub.answers["extensions/motd/rich"] = (304, {"Etag": '"r1"'}, b"")
    response = await _fetch(jp_fetch, "rich", headers={"If-None-Match": '"r1"'})
    assert response.code == 304


@pytest.mark.parametrize("motd_extra", [{"fallback_html": "/nonexistent/motd/index.html"}])
async def test_missing_local_page_answers_as_before(jp_fetch, jp_serverapp, hub, motd_extra):
    # ACC-LOCAL-68: a fallback_html that names no file changes nothing, and the log names it
    records = []
    handler = logging.Handler()
    handler.emit = records.append
    jp_serverapp.log.addHandler(handler)
    try:
        hub.answers["extensions/motd/rich"] = (404, JSON, b"{}")
        assert (await _fetch(jp_fetch, "rich")).code == 204
        hub.answers["extensions/motd/rich"] = (200, JSON, b'{"entries": []}')
        response = await _fetch(jp_fetch, "rich")
        assert (response.code, json.loads(response.body)) == (200, {"entries": []})
    finally:
        jp_serverapp.log.removeHandler(handler)
    assert any("/nonexistent/motd/index.html is not a file" in r.getMessage() for r in records)


async def test_local_route_serves_the_page_directory_only(jp_fetch, page_dir):
    # ACC-LOCAL-69
    response = await _fetch(jp_fetch, "local/index.html")
    assert response.code == 200
    assert b"Local welcome" in response.body
    assert response.headers["Content-Type"].startswith("text/html")
    assert response.headers["Cache-Control"] == "no-cache"
    response = await _fetch(jp_fetch, "local/logo.svg")
    assert (response.code, response.headers["Content-Type"]) == (200, "image/svg+xml")
    response = await _fetch(jp_fetch, "local/../outside.txt")
    assert response.code in (403, 404)
    assert b"not served" not in response.body
    # no token: nothing of the page
    response = await _fetch(jp_fetch, "local/index.html", headers={"Authorization": ""}, follow_redirects=False)
    assert response.code in (302, 403)
    assert b"Local welcome" not in response.body


async def test_local_route_404_without_a_local_page(jp_fetch):
    # ACC-LOCAL-69
    assert (await _fetch(jp_fetch, "local/index.html")).code == 404


async def test_builtin_page_without_a_local_page(jp_fetch, jp_base_url, hub):
    # ACC-LOCAL-70: no fallback_html; a 200 with no entry, a 404 and an error answer the built-in page
    for status, body in ((200, b'{"entries": []}'), (404, b"{}"), (500, b"{}")):
        hub.answers["extensions/motd/rich"] = (status, JSON, body)
        response = await _fetch(jp_fetch, "rich")
        assert (response.code, json.loads(response.body)) == (200, _about_entry(jp_base_url)), status
    response = await _fetch(jp_fetch, "about/index.html")
    assert response.code == 200
    assert response.headers["Cache-Control"] == "no-cache"
    page = response.body.decode()
    assert f"jupyterlab_galaxahub_motd_extension {__version__}" in page and "{{version}}" not in page
    for words in ("c.GalaxaHubMotd.motd_api_url", "c.GalaxaHubMotd.fallback_html", "c.GalaxaHubMotd.open_on_start",
                  "c.GalaxaHubMotd.html_allow_scripts", "notificationWindow", "/rich", "/terminal",
                  "JUPYTERHUB_API_TOKEN"):
        assert words in page, words
    # no script and no file from elsewhere: the page reads the same with html_allow_scripts off, and stands alone
    assert "<script" not in page and 'src="http' not in page and "<link" not in page


@pytest.mark.parametrize("motd_extra", [{"motd_api_url": "/extensions/motd", "notifications_api_url": "/user-notifications"}])
async def test_local_page_when_a_hub_url_has_no_scheme(jp_fetch, jp_base_url, motd_extra):
    # ACC-LOCAL-70: a URL with no scheme cannot be fetched; the tab gets the built-in page, not a 500
    response = await _fetch(jp_fetch, "rich")
    assert (response.code, json.loads(response.body)) == (200, _about_entry(jp_base_url))
    assert (await _fetch(jp_fetch, "notifications")).code == 204


async def test_open_on_start_in_the_page_config(jp_serverapp):
    # ACC-SERVER-71
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdOpenOnStart"] is True


@pytest.mark.parametrize("motd_extra", [{"open_on_start": False}])
async def test_open_on_start_off_in_the_page_config(jp_serverapp, motd_extra):
    # ACC-SERVER-71
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdOpenOnStart"] is False


async def test_html_allow_scripts_in_the_page_config(jp_serverapp):
    # ACC-SERVER-76
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdHtmlAllowScripts"] is True


@pytest.mark.parametrize("motd_extra", [{"html_allow_scripts": False}])
async def test_html_allow_scripts_off_in_the_page_config(jp_serverapp, motd_extra):
    # ACC-SERVER-76
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdHtmlAllowScripts"] is False


async def test_notifications_in_the_page_config(jp_serverapp):
    # ACC-LAYOUT-77: this lab names a notifications URL
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdNotifications"] is True


@pytest.mark.parametrize("left_out", [("notifications_api_url",)])
async def test_no_notifications_url_in_the_page_config(jp_serverapp, left_out):
    # ACC-LAYOUT-77
    assert jp_serverapp.web_app.settings["page_config_data"]["galaxahubMotdNotifications"] is False


async def test_server_start_in_the_page_config(jp_serverapp):
    # ACC-START-72: a string the frontend compares; a later start carries another one
    page_config = jp_serverapp.web_app.settings["page_config_data"]
    start = page_config["galaxahubMotdServerStart"]
    assert isinstance(start, str) and start
    setup_route_handlers(jp_serverapp.web_app, GalaxaHubMotd())
    assert page_config["galaxahubMotdServerStart"] not in ("", start)
