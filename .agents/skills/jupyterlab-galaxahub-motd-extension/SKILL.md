---
name: jupyterlab-galaxahub-motd-extension
description: GalaxaHub message of the day read in a lab terminal, through the `jupyterlab-galaxahub-motd` CLI of jupyterlab_galaxahub_motd_extension. Use when asked what the motd, the welcome message, the group announcements or the hub broadcasts say for this lab user, or "show the motd".
---

# jupyterlab-galaxahub-motd

Runs in lab terminal. Reads hub with lab's own token from env; no Jupyter server needed. Commands, flags, output, exit codes: `jupyterlab-galaxahub-motd --help`, `jupyterlab-galaxahub-motd <command> --help`. Read first.

## Rules

- Never print `JUPYTERHUB_API_TOKEN`. CLI never does. No `env`, no `echo $JUPYTERHUB_API_TOKEN` to debug an exit 4
- Never set `JUPYTERHUB_API_URL` or `JUPYTERHUB_API_TOKEN` by hand. Hub sets both for the lab
- Exit 3 = no motd for this user. An answer, not a failure. Report it, no retry
- Exit 4 = hub refused, failed or unreachable. Stderr line names next step. Tell user, no retry loop
- Parse `--json`, not text
- Html entry: CLI gives url only. Page needs hub auth. Send user to Message of the day tab (`Message of the day: Open`). Never put token on a command line to fetch it
- Read-only. Hub admin sets motd in group policy and sends broadcasts from hub. Nothing to change here
