# jupyterlab_galaxahub_motd_extension

[![Github Actions Status](https://github.com/stellarshenson/jupyterlab_galaxahub_motd_extension/workflows/Build/badge.svg)](https://github.com/stellarshenson/jupyterlab_galaxahub_motd_extension/actions/workflows/build.yml)

jupyterlab_galaxahub_motd_extension

This extension is composed of a Python package named `jupyterlab_galaxahub_motd_extension`
for the server extension and a NPM package named `jupyterlab_galaxahub_motd_extension`
for the frontend extension.

## Requirements

- JupyterLab >= 4.0.0

## Install

To install the extension, execute:

```bash
pip install jupyterlab_galaxahub_motd_extension
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab_galaxahub_motd_extension
```

## Troubleshoot

If you are seeing the frontend extension, but it is not working, check
that the server extension is enabled:

```bash
jupyter server extension list
```

If the server extension is installed and enabled, but you are not seeing
the frontend extension, check the frontend extension is installed:

```bash
jupyter labextension list
```

## Contributing

If you would like to contribute to this extension, please refer to the [Contributing Guide](CONTRIBUTING.md).
