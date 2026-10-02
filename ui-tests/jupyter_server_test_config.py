"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provide access to JupyterLab
JavaScript objects through the global window variable.
"""
import os
from tempfile import mkdtemp

from jupyterlab.galata import configure_jupyter_server

configure_jupyter_server(c)
# configure_jupyter_server moves the workspaces and the server root, not the user settings;
# without this a settings write to the test server lands in ~/.jupyter/lab/user-settings
c.LabApp.user_settings_dir = mkdtemp(prefix="galata-settings-")

# `or`, not a get() default: JavaScript's `||` reads "" as absent and falls back, so an
# exported-but-empty JUPYTER_TEST_PORT must fall back here too (playwright.config.js)
c.ServerApp.port = int(os.environ.get("JUPYTER_TEST_PORT") or "8888")

# the two hub URLs point at the stub hub the suite starts (playwright.config.js sets its port)
if os.environ.get("MOTD_STUB_PORT"):
    stub = f"http://127.0.0.1:{os.environ['MOTD_STUB_PORT']}/hub/api"
    c.GalaxaHubMotd.motd_api_url = f"{stub}/extensions/motd"
    c.GalaxaHubMotd.notifications_api_url = f"{stub}/user-notifications"

# the local page: the file exists only while a local page test runs, and without it the rich
# route answers as if no local page were set
if os.environ.get("MOTD_LOCAL_PAGE"):
    c.GalaxaHubMotd.fallback_html = os.environ["MOTD_LOCAL_PAGE"]

# the lab also reads the machine's Jupyter config directories, where a lab image may set these
# three; the suite runs on the defaults
c.GalaxaHubMotd.label = "Message of the day"
c.GalaxaHubMotd.open_on_start = True
c.GalaxaHubMotd.html_allow_scripts = True

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
