"""The hub proxy against a stub hub on a local port (ACC-PROXY-14 to ACC-PROXY-21, ACC-LIVE-22).

The workstation's environment carries a live JUPYTERHUB_API_URL and JUPYTERHUB_API_TOKEN, so
every test first points both at a port nothing listens on; the `hub` fixture then points them
at the stub.
"""
import json
import socket

import pytest
import tornado.httpserver
import tornado.testing
import tornado.web

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
def no_real_hub(monkeypatch):
    monkeypatch.setenv("JUPYTERHUB_API_URL", f"http://127.0.0.1:{_closed_port()}/hub/api")
    monkeypatch.setenv("JUPYTERHUB_API_TOKEN", "not-the-stub-token")


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
    monkeypatch.setenv("JUPYTERHUB_API_URL", f"http://127.0.0.1:{port}/hub/api")
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
    for name in ("terminal", "rich", "notifications"):
        await _fetch(jp_fetch, name)
    assert hub.paths() == ["extensions/motd/terminal", "extensions/motd/rich", "user-notifications"]


async def test_no_other_route(jp_fetch, hub):
    for name in ("ingest", "hello", "rich/extra"):
        response = await _fetch(jp_fetch, name)
        assert response.code == 404, name
    response = await _fetch(jp_fetch, "rich", method="POST", body=b"{}")
    assert response.code == 405
    assert hub.requests == []


async def test_etag_and_cache_control_pass_through(jp_fetch, hub):
    body = json.dumps({"entries": [{"group": "analysts", "kind": "markdown", "body": "# Hi"}]})
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
    hub.answers["extensions/motd/rich"] = (200, {**JSON, "Etag": '"r1"'}, b'{"entries": []}')
    response = await _fetch(jp_fetch, "rich", headers={"If-None-Match": '"r1"'})
    assert response.code == 304
    assert response.body == b""
    response = await _fetch(jp_fetch, "rich", headers={"If-None-Match": '"stale"'})
    assert response.code == 200
    assert json.loads(response.body) == {"entries": []}


async def test_hub_404_answers_204(jp_fetch, hub):
    hub.answers["extensions/motd/rich"] = (404, JSON, b'{"message": "Not Found"}')
    response = await _fetch(jp_fetch, "rich")
    assert response.code == 204
    assert response.body == b""
    assert response.headers["Cache-Control"] == "no-cache"


async def test_refused_connection_answers_204(jp_fetch):
    # no `hub` fixture: JUPYTERHUB_API_URL points at a port nothing listens on
    response = await _fetch(jp_fetch, "notifications")
    assert response.code == 204
    assert response.body == b""
    assert response.headers["Cache-Control"] == "no-cache"


async def test_unset_hub_url_answers_204(jp_fetch, monkeypatch):
    monkeypatch.delenv("JUPYTERHUB_API_URL")
    response = await _fetch(jp_fetch, "rich")
    assert response.code == 204
    assert response.headers["Cache-Control"] == "no-cache"


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
