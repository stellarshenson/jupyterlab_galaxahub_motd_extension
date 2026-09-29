"""The agent CLI against a stub hub on a local port (ACC-CLI-40 to ACC-CLI-63).

The workstation's environment carries a live JUPYTERHUB_API_TOKEN and the JUPYTER_SERVER_URL of
its own lab, so every test replaces the token, removes the lab URL and points the runtime
directory at an empty one. The `hub` stub also answers the lab server's settings route under
/lab/, naming its own hub paths, and the fixture points JUPYTER_SERVER_URL at it.
"""
import argparse
import http.server
import json
import os
import socket
import subprocess
import sys
import threading
from pathlib import Path

import pytest

from jupyterlab_galaxahub_motd_extension import cli

ROOT = Path(__file__).parents[2]
TOKEN = "stub-cli-token-7c2d9a"
LAB_TOKEN = "stub-lab-server-token-41b8e3"
SETTINGS_PATH = "/lab/jupyterlab-galaxahub-motd-extension/settings"
JSON = "application/json"
COMMANDS = ("show", "terminal", "rich", "notifications")

TERMINAL = "\x1b[1;36mWelcome\x1b[0m to the analysts lab\n\nsecond group\n"
RICH = {"entries": [
    {"group": "analysts", "kind": "markdown", "body": "# Analysts\n\nRead the wiki first."},
    {"group": "ops", "kind": "html", "url": "/hub/api/extensions/motd/rich/p1/index.html"},
]}
# out of order on purpose: the CLI sorts newest first
NOTIFICATIONS = {"notifications": [
    {"ts": "2026-09-27T08:00:00+00:00", "message": "Older broadcast", "type": "info", "audience": "all"},
    {"ts": "2026-09-28T09:30:00+00:00", "message": "Newest\nbroadcast", "type": "warning", "audience": "direct"},
    {"ts": "2026-09-28T07:00:00+00:00", "message": "Middle broadcast", "type": "success", "audience": "all"},
]}


class StubHub(http.server.ThreadingHTTPServer):
    """Answers GET /hub/api/<path> from `answers`, recording each request's path and
    Authorization header, and the lab server's settings route from `settings` (or
    `lab_answer`), recorded in `lab_requests`. `<authorization>` in an answer body is replaced
    by the header the request carried, so a body can echo the token."""

    def __init__(self):
        super().__init__(("127.0.0.1", 0), _StubHandler)
        self.requests = []
        self.lab_requests = []
        self.lab_answer = None
        self.point(self.url)
        self.answers = {
            "extensions/motd/terminal": (200, "text/plain; charset=utf-8", TERMINAL.encode()),
            "extensions/motd/rich": (200, JSON, json.dumps(RICH).encode()),
            "user-notifications": (200, JSON, json.dumps(NOTIFICATIONS).encode()),
        }

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server_port}/hub/api"

    @property
    def lab_url(self):
        return f"http://127.0.0.1:{self.server_port}/lab/"

    def point(self, base):
        """The settings route names the GalaxaHub paths under the API base `base`."""
        self.settings = {"motd_api_url": f"{base}/extensions/motd", "notifications_api_url": f"{base}/user-notifications"}

    def paths(self):
        return [path for path, _ in self.requests]


class _StubHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        authorization = self.headers.get("Authorization", "")
        if self.path.startswith("/lab/"):
            self.server.lab_requests.append((self.path, authorization))
            status, content_type, body = self.server.lab_answer or (
                (200, JSON, json.dumps(self.server.settings).encode()) if self.path == SETTINGS_PATH else (404, JSON, b"{}"))
        else:
            path = self.path.removeprefix("/hub/api/")
            self.server.requests.append((path, authorization))
            status, content_type, body = self.server.answers.get(path, (404, JSON, b"{}"))
        body = body.replace(b"<authorization>", authorization.encode())
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def _closed_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(autouse=True)
def runtime_dir(monkeypatch, tmp_path):
    """No test reaches this workstation's lab: no lab server URL, an empty runtime directory."""
    monkeypatch.delenv("JUPYTER_SERVER_URL", raising=False)
    monkeypatch.setenv("JUPYTER_RUNTIME_DIR", str(tmp_path / "runtime"))
    monkeypatch.setenv("JUPYTERHUB_API_TOKEN", "not-the-stub-token")
    (tmp_path / "runtime").mkdir()
    return tmp_path / "runtime"


@pytest.fixture
def hub(monkeypatch):
    stub = StubHub()
    thread = threading.Thread(target=stub.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("JUPYTER_SERVER_URL", stub.lab_url)
    monkeypatch.setenv("JUPYTERHUB_API_TOKEN", TOKEN)
    yield stub
    stub.shutdown()
    stub.server_close()


def run(capsys, *argv):
    code = cli.main(list(argv))
    out, err = capsys.readouterr()
    return code, out, err


def _one_line(err):
    return err.endswith("\n") and err.count("\n") == 1 and err.strip() != ""


def test_help_exits_0_and_the_script_is_declared(capsys):
    with pytest.raises(SystemExit) as stop:
        cli.main(["--help"])
    assert stop.value.code == 0
    assert "jupyterlab-galaxahub-motd" in capsys.readouterr().out
    script = '[project.scripts]\njupyterlab-galaxahub-motd = "jupyterlab_galaxahub_motd_extension.cli:main"\n'
    assert script in (ROOT / "pyproject.toml").read_text()


def test_each_subcommand_reads_its_hub_path_with_the_token(capsys, hub):
    expected = {
        "show": ["extensions/motd/terminal", "extensions/motd/rich", "user-notifications"],
        "terminal": ["extensions/motd/terminal"],
        "rich": ["extensions/motd/rich"],
        "notifications": ["user-notifications"],
    }
    for command, paths in expected.items():
        hub.requests.clear()
        assert run(capsys, command)[0] == 0, command
        assert hub.paths() == paths, command
        assert all(header == f"token {TOKEN}" for _, header in hub.requests), command


def test_show_prints_the_whole_motd(capsys, hub):
    code, out, err = run(capsys, "show")
    assert code == 0
    assert err == ""
    order = [
        "\x1b[1;36mWelcome\x1b[0m to the analysts lab\n\nsecond group",
        "## analysts\n\n# Analysts\n\nRead the wiki first.",
        "## ops\n\nhttp://127.0.0.1:%d/hub/api/extensions/motd/rich/p1/index.html" % hub.server_port,
        "## Notifications\n\n",
        "Newest broadcast",
        "Middle broadcast",
        "Older broadcast",
    ]
    positions = [out.index(part) for part in order]
    assert positions == sorted(positions)


def test_one_feed_per_subcommand(capsys, hub):
    code, out, _ = run(capsys, "terminal")
    assert code == 0
    assert out == TERMINAL
    code, out, _ = run(capsys, "rich")
    assert code == 0
    assert "## analysts" in out and "## ops" in out
    assert "Welcome" not in out and "broadcast" not in out
    code, out, _ = run(capsys, "notifications")
    assert code == 0
    assert "Newest broadcast" in out
    assert "Welcome" not in out and "## analysts" not in out and "## Notifications" not in out


def test_json_output(capsys, hub):
    keys = {
        "show": {"terminal", "entries", "notifications"},
        "terminal": {"terminal"},
        "rich": {"entries"},
        "notifications": {"notifications"},
    }
    for command, expected in keys.items():
        code, out, _ = run(capsys, command, "--json")
        assert code == 0, command
        assert set(json.loads(out)) == expected, command
    motd = json.loads(run(capsys, "show", "--json")[1])
    assert motd["terminal"] == TERMINAL
    assert motd["entries"][1] == {
        "group": "ops", "kind": "html",
        "url": f"http://127.0.0.1:{hub.server_port}/hub/api/extensions/motd/rich/p1/index.html",
    }
    assert [n["message"] for n in motd["notifications"]] == [
        "Newest\nbroadcast", "Middle broadcast", "Older broadcast"]


def test_notification_lines(capsys, hub):
    code, out, _ = run(capsys, "notifications")
    assert code == 0
    assert out.splitlines() == [
        "2026-09-28T09:30:00+00:00\twarning\tdirect\tNewest broadcast",
        "2026-09-28T07:00:00+00:00\tsuccess\tall\tMiddle broadcast",
        "2026-09-27T08:00:00+00:00\tinfo\tall\tOlder broadcast",
    ]


def test_token_never_printed(capsys, hub):
    echo = {"echo": "<authorization>"}
    hub.answers["extensions/motd/rich"] = (200, JSON, json.dumps(
        {"entries": [{**RICH["entries"][0], **echo}], **echo}).encode())
    hub.answers["user-notifications"] = (200, JSON, json.dumps(
        {"notifications": [{**NOTIFICATIONS["notifications"][0], **echo}], **echo}).encode())
    for command in COMMANDS:
        for flags in ((), ("--json",)):
            code, out, err = run(capsys, command, *flags)
            assert code == 0, (command, flags)
            assert TOKEN not in out + err, (command, flags)
    forbidden = (403, JSON, b'{"message": "Forbidden", "echo": "<authorization>"}')
    hub.answers = dict.fromkeys(hub.answers, forbidden)
    for command in COMMANDS:
        for flags in ((), ("--json",)):
            code, out, err = run(capsys, command, *flags)
            assert code == 4, (command, flags)
            assert TOKEN not in out + err, (command, flags)
    # the stub did receive the token, so the echo held it
    assert all(header == f"token {TOKEN}" for _, header in hub.requests)


def test_token_never_printed_from_a_malformed_status_line(capsys, hub):
    # DEF-CLI-11: a hub that answers a broken status line echoing the Authorization header
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen()
    sent = []

    def answer():
        for _ in COMMANDS:
            connection, _ = server.accept()
            with connection:
                request = connection.recv(65536).decode("latin-1")
                authorization = next(line.split(":", 1)[1].strip() for line in request.split("\r\n")
                                     if line.lower().startswith("authorization:"))
                connection.sendall(f"HTTP/1.1 4O3 {authorization}\r\n\r\n".encode("latin-1"))
                sent.append(authorization)

    thread = threading.Thread(target=answer, daemon=True)
    thread.start()
    hub.point(f"http://127.0.0.1:{server.getsockname()[1]}/hub/api")
    try:
        for command in COMMANDS:
            code, out, err = run(capsys, command, "--json")
            assert (code, out) == (4, ""), command
            assert TOKEN not in err and _one_line(err), (command, err)
        # the stub thread appends after it answers, so wait for its last append
        thread.join(timeout=10)
    finally:
        server.close()
    # the stub did send the echoed status line, once per command
    assert sent == [f"token {TOKEN}"] * len(COMMANDS)


def test_no_motd_exits_1(capsys, hub):
    # an empty hub: no terminal text, no entry, no notification
    hub.answers["extensions/motd/terminal"] = (204, "text/plain", b"")
    hub.answers["extensions/motd/rich"] = (200, JSON, b'{"entries": []}')
    hub.answers["user-notifications"] = (200, JSON, b'{"notifications": []}')
    for command in COMMANDS:
        code, out, err = run(capsys, command)
        assert (code, out) == (1, ""), command
        assert _one_line(err), (command, err)
    # a hub without the motd extension
    hub.answers.pop("extensions/motd/rich")
    code, out, err = run(capsys, "rich")
    assert (code, out) == (1, "")
    assert _one_line(err) and "404" in err
    # no hub to ask: one setting empty, then both
    requests = len(hub.requests)
    hub.settings["notifications_api_url"] = ""
    code, out, err = run(capsys, "rich")
    assert (code, out) == (1, "")
    assert _one_line(err) and "GalaxaHubMotd.notifications_api_url not set" in err
    assert "motd_api_url" not in err
    hub.settings["motd_api_url"] = ""
    for command in COMMANDS:
        code, out, err = run(capsys, command, "--json")
        assert (code, out) == (1, ""), command
        assert _one_line(err), command
        assert "GalaxaHubMotd.motd_api_url and GalaxaHubMotd.notifications_api_url not set" in err, command
    assert len(hub.requests) == requests


def _runtime_file(runtime_dir, url, token, pid):
    (runtime_dir / f"jpserver-{pid}.json").write_text(json.dumps({"url": url, "token": token, "pid": pid}))


def test_asks_the_running_lab(capsys, hub, runtime_dir, monkeypatch):
    # ACC-CLI-56: the URLs come from the lab server's settings route, never from JUPYTERHUB_API_URL
    monkeypatch.setenv("JUPYTERHUB_API_URL", f"http://127.0.0.1:{_closed_port()}/hub/api")
    code, out, err = run(capsys, "show", "--json")
    assert (code, err) == (0, "")
    assert hub.paths() == ["extensions/motd/terminal", "extensions/motd/rich", "user-notifications"]
    # no runtime file: the lab server gets JUPYTERHUB_API_TOKEN
    assert hub.lab_requests == [(SETTINGS_PATH, f"token {TOKEN}")]
    # the running lab's runtime file token wins; a file whose process is gone is skipped
    gone = subprocess.Popen([sys.executable, "-c", "pass"])
    gone.wait()
    _runtime_file(runtime_dir, hub.lab_url, "stale-lab-token", gone.pid)
    _runtime_file(runtime_dir, hub.lab_url, LAB_TOKEN, os.getpid())
    code, out, err = run(capsys, "terminal")
    assert (code, out) == (0, TERMINAL)
    assert hub.lab_requests[-1] == (SETTINGS_PATH, f"token {LAB_TOKEN}")
    assert hub.requests[-1] == ("extensions/motd/terminal", f"token {TOKEN}")


def test_lab_server_failures_exit_4(capsys, hub, monkeypatch):
    # ACC-CLI-61: no lab server URL, no lab server, a refusing one, a broken answer
    hub.lab_answer = (403, JSON, b'{"echo": "<authorization>"}')
    code, out, err = run(capsys, "show")
    assert (code, out) == (4, "")
    assert _one_line(err) and "403" in err and TOKEN not in err
    hub.lab_answer = (200, JSON, b"not json")
    code, out, err = run(capsys, "terminal")
    assert (code, out) == (4, "") and _one_line(err) and "lab server" in err
    hub.lab_answer = (200, JSON, b'{"motd_api_url": null}')
    code, out, err = run(capsys, "terminal")
    assert (code, out) == (4, "") and _one_line(err) and "lab server" in err
    monkeypatch.setenv("JUPYTER_SERVER_URL", f"http://127.0.0.1:{_closed_port()}/lab/")
    code, out, err = run(capsys, "rich")
    assert (code, out) == (4, "") and _one_line(err) and "cannot read the settings of the lab server" in err
    monkeypatch.delenv("JUPYTER_SERVER_URL")
    code, out, err = run(capsys, "notifications", "--json")
    assert (code, out) == (4, "") and _one_line(err) and "JUPYTER_SERVER_URL is not set" in err
    assert hub.requests == []


def test_startup_script_line(hub, runtime_dir):
    # ACC-CLI-57: a new process finds the lab server through JUPYTER_SERVER_URL, as a lab startup
    # script's process does, and the script itself holds no URL and no token
    env = {k: v for k, v in os.environ.items() if not k.startswith(("JUPYTERHUB_", "JPY_", "JUPYTER_SERVER_"))}
    env.update(JUPYTER_SERVER_URL=hub.lab_url, JUPYTER_RUNTIME_DIR=str(runtime_dir),
               JUPYTERHUB_API_TOKEN=TOKEN, PYTHONPATH=str(ROOT))
    command = [sys.executable, "-m", "jupyterlab_galaxahub_motd_extension.cli", "terminal"]
    done = subprocess.run(command, env=env, cwd=ROOT, capture_output=True, timeout=60)
    assert (done.returncode, done.stdout) == (0, TERMINAL.encode())
    hub.answers["extensions/motd/terminal"] = (204, "text/plain", b"")
    done = subprocess.run(command, env=env, cwd=ROOT, capture_output=True, timeout=60)
    assert (done.returncode, done.stdout) == (1, b"")
    assert hub.paths() == ["extensions/motd/terminal"] * 2


def test_refusal_or_failure_exits_4(capsys, hub):
    hub.answers["extensions/motd/rich"] = (403, JSON, b'{"message": "Forbidden"}')
    code, out, err = run(capsys, "rich")
    assert (code, out) == (4, "")
    assert _one_line(err) and "403" in err and "JUPYTERHUB_API_TOKEN" in err
    hub.answers["extensions/motd/rich"] = (500, JSON, b'{"message": "Internal Server Error"}')
    code, out, err = run(capsys, "rich")
    assert (code, out) == (4, "")
    assert _one_line(err) and "500" in err and "try again" in err
    hub.point(f"http://127.0.0.1:{_closed_port()}/hub/api")
    code, out, err = run(capsys, "show")
    assert (code, out) == (4, "")
    assert _one_line(err) and "cannot reach" in err and "GalaxaHubMotd.motd_api_url" in err


def _subcommands():
    p = cli.parser()
    [sub] = [a for a in p._actions if isinstance(a, argparse._SubParsersAction)]
    return p, sub.choices


def test_help_written_for_agents():
    p, subcommands = _subcommands()
    top = p.format_help()
    for word in ("GalaxaHubMotd.motd_api_url", "GalaxaHubMotd.notifications_api_url", "JUPYTER_SERVER_URL",
                 "JUPYTERHUB_API_TOKEN", *COMMANDS):
        assert word in top, word
    for code in (0, 1, 2, 4):
        assert f"\n  {code}  " in top, code
    assert set(subcommands) == set(COMMANDS)
    for name, sub in subcommands.items():
        text = sub.format_help()
        assert sub.description, name
        assert "\nexamples:\n" in text, name
        examples = text.split("\nexamples:\n")[1].splitlines()
        assert 1 <= sum(line.strip().startswith("jupyterlab-galaxahub-motd") for line in examples) <= 3, name
        assert all(action.help for action in sub._actions), name
    # ACC-CLI-58: the startup script use is in the terminal help
    terminal = subcommands["terminal"].format_help()
    assert "jupyterlab-galaxahub-motd terminal 2>/dev/null" in terminal
    assert "On exit 1 and 4 stdout stays empty" in terminal


def test_agent_skill():
    skill = ROOT / ".agents" / "skills" / "jupyterlab-galaxahub-motd-extension" / "SKILL.md"
    lines = skill.read_text().splitlines()
    assert len(lines) < 30
    assert lines[0] == "---"
    frontmatter = lines[1:lines.index("---", 1)]
    assert f"name: {skill.parent.name}" in frontmatter
    assert any(line.startswith("description: ") for line in frontmatter)
    assert "jupyterlab-galaxahub-motd --help" in skill.read_text()
    # ACC-CLI-59: a startup script calls the CLI, never the motd API
    rule = next(line for line in lines if line.startswith("- Lab startup script:"))
    assert "jupyterlab-galaxahub-motd terminal 2>/dev/null" in rule and "Never fetch motd API" in rule


def test_pip_install_ships_the_skill():
    # ACC-CLI-63: the wheel puts SKILL.md under the environment, outside the Python package
    name = "jupyterlab-galaxahub-motd-extension"
    installed = Path(sys.prefix, "share", "jupyter", "agents", "skills", name, "SKILL.md")
    assert installed.read_text() == (ROOT / ".agents" / "skills" / name / "SKILL.md").read_text()
