# CodexBar SSL Helper

A helper script for the CodexBar GNOME Shell extension to automate the discovery, extraction, and system-level installation of the local self-signed SSL certificate used by the Antigravity local language server.

## Installation

```bash
pip install codexbar-ssl-helper
```

## Usage

Simply run:

```bash
codexbar-ssl-helper
```

This will:
1. Scan local TCP ports looking for active `agy` or `Antigravity` language server processes.
2. Fetch the self-signed certificate from the active HTTPS port.
3. Save the certificate to `/usr/local/share/ca-certificates/antigravity.crt` and run `update-ca-certificates` using root privileges (will prompt for `sudo` password).
