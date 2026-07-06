import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { UsageFetcher } from '../core/ports/UsageFetcher.js';
import { UsageApiError } from '../usageApi.js';

/**
 * ADAPTER (Hexagonal Architecture)
 * Implementation of the UsageFetcher port to run the external 'codexbar' CLI
 * binary as a subprocess. It resolves the executable path dynamically, invokes
 * the tool, and parses stdout/stderr into structured JS objects. It also runs a
 * quick discovery pass to read the text labels for the provider's active windows.
 * 
 * Supports LD_PRELOAD certificate redirect shim and OAuth credentials bridging
 * for the Antigravity provider to trust the local language server self-signed SSL.
 */
export class CliSubprocessFetcher extends UsageFetcher {
    constructor(extensionPath = null) {
        super();
        this._extensionPath = extensionPath;
    }

    /**
     * Scan active ports of the local Antigravity server.
     */
    async _discoverAntigravityPorts(cancellable) {
        const ports = [];
        
        // Method A: run 'ss -lntp' to list socket processes
        try {
            const proc = Gio.Subprocess.new(
                ["ss", "-lnt", "-p"],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            const [stdout] = await new Promise((resolve) => {
                proc.communicate_utf8_async(null, cancellable, (p, res) => {
                    try {
                        const [ok, out] = p.communicate_utf8_finish(res);
                        resolve([out || ""]);
                    } catch (e) {
                        resolve([""]);
                    }
                });
            });
            
            if (stdout) {
                const lines = stdout.split('\n');
                for (const line of lines) {
                    const matchPort = line.match(/(?:127\.0\.0\.1|\[::1\]):(\d+)/);
                    if (matchPort) {
                        const port = parseInt(matchPort[1], 10);
                        if (line.includes('"agy"') || line.includes('"Antigravity"') || line.includes('"language_server"') || line.includes('"language-server"')) {
                            if (!ports.includes(port)) {
                                ports.push(port);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
        
        // Method B: Parse /proc/net/tcp directly
        if (ports.length === 0) {
            try {
                const tcpFile = Gio.File.new_for_path('/proc/net/tcp');
                const [, content] = await new Promise((resolve) => {
                    tcpFile.load_contents_async(cancellable, (file, res) => {
                        try {
                            const [ok, data] = file.load_contents_finish(res);
                            resolve([ok, new TextDecoder().decode(data)]);
                        } catch (e) {
                            resolve([false, ""]);
                        }
                    });
                });

                if (content) {
                    const lines = content.split('\n');
                    for (let i = 1; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;
                        const parts = line.split(/\s+/);
                        if (parts.length > 2) {
                            const localAddr = parts[1];
                            const state = parts[3];
                            if (state === '0A') { // State 0A = LISTEN
                                const addrParts = localAddr.split(':');
                                if (addrParts.length === 2) {
                                    const ipHex = addrParts[0];
                                    const portHex = addrParts[1];
                                    if (ipHex === '0100007F' || ipHex === '00000000') {
                                        const port = parseInt(portHex, 16);
                                        if (!ports.includes(port)) {
                                            ports.push(port);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore
            }
        }
        
        return ports;
    }

    /**
     * Run openssl s_client to extract the self-signed certificate from the port.
     */
    async _extractCertificate(port, cancellable) {
        try {
            const proc = Gio.Subprocess.new(
                ["bash", "-c", `openssl s_client -showcerts -connect 127.0.0.1:${port} < /dev/null 2>/dev/null`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            const [stdout] = await new Promise((resolve) => {
                proc.communicate_utf8_async(null, cancellable, (p, res) => {
                    try {
                        const [ok, out] = p.communicate_utf8_finish(res);
                        resolve([out || ""]);
                    } catch (e) {
                        resolve([""]);
                    }
                });
            });

            if (stdout && stdout.includes("-----BEGIN CERTIFICATE-----")) {
                const startIdx = stdout.indexOf("-----BEGIN CERTIFICATE-----");
                const endIdx = stdout.indexOf("-----END CERTIFICATE-----") + "-----END CERTIFICATE-----".length;
                if (startIdx !== -1 && endIdx !== -1) {
                    return stdout.substring(startIdx, endIdx);
                }
            }
        } catch (e) {
            // Ignore
        }
        return null;
    }

    /**
     * Get extracted cert, append it to system CA bundle, and save to user cache.
     */
    async _setupAntigravitySSL(cancellable) {
        const ports = await this._discoverAntigravityPorts(cancellable);
        if (ports.length === 0) return null;

        let cert = null;
        for (const port of ports) {
            cert = await this._extractCertificate(port, cancellable);
            if (cert) break;
        }

        if (!cert) return null;

        const systemCaPaths = [
            "/etc/ssl/certs/ca-certificates.crt",
            "/etc/pki/tls/certs/ca-bundle.crt",
            "/etc/ssl/ca-bundle.pem",
            "/var/lib/ca-certificates/ca-bundle.pem"
        ];
        
        let systemCaContent = "";
        for (const path of systemCaPaths) {
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                try {
                    const file = Gio.File.new_for_path(path);
                    const [, content] = await new Promise((resolve) => {
                        file.load_contents_async(cancellable, (f, res) => {
                            try {
                                const [ok, data] = f.load_contents_finish(res);
                                resolve([ok, new TextDecoder().decode(data)]);
                            } catch (e) {
                                resolve([false, ""]);
                            }
                        });
                    });
                    if (content) {
                        systemCaContent = content;
                        break;
                    }
                } catch (e) {
                    // Ignore
                }
            }
        }

        const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "codexbar-gnome"]);
        GLib.mkdir_with_parents(cacheDir, 0o755);

        const customBundlePath = GLib.build_filenamev([cacheDir, "custom-ca-bundle.crt"]);
        const customBundleContent = systemCaContent + "\n" + cert;

        try {
            const file = Gio.File.new_for_path(customBundlePath);
            await new Promise((resolve, reject) => {
                file.replace_contents_async(
                    new TextEncoder().encode(customBundleContent),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    cancellable,
                    (f, res) => {
                        try {
                            f.replace_contents_finish(res);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
        } catch (e) {
            return null;
        }

        return customBundlePath;
    }

    /**
     * Run the command, parse the output, and discover labels.
     */
    async fetch(providerCommand, cancellable = null) {
        if (!providerCommand) {
            throw new UsageApiError("No command configured / No hay ningún comando configurado.");
        }

        const isAntigravity = providerCommand.includes("antigravity");

        // Step 1: Resolve the absolute path of the 'codexbar' executable.
        let executable = "/home/linuxbrew/.linuxbrew/bin/codexbar";
        const commonPaths = [
            "/home/linuxbrew/.linuxbrew/bin/codexbar",
            `${GLib.get_home_dir()}/.local/bin/codexbar`,
            "/usr/local/bin/codexbar",
            "/usr/bin/codexbar",
        ];

        for (const path of commonPaths) {
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                executable = path;
                break;
            }
        }

        let finalCommand = providerCommand;
        if (providerCommand.startsWith("codexbar") && !providerCommand.startsWith("/")) {
            finalCommand = providerCommand.replace("codexbar", executable);
        }

        // Setup launcher and custom environment (e.g. to propagate correct PATH)
        const env = GLib.get_environ();

        // Fix PATH to ensure codexbar can find the `agy` executable
        let currentPath = "";
        for (const item of env) {
            if (item.startsWith("PATH=")) {
                currentPath = item.substring(5);
                break;
            }
        }
        const userPaths = [
            `${GLib.get_home_dir()}/.local/bin`,
            "/home/linuxbrew/.linuxbrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin"
        ];
        const newPathDirs = [];
        for (const p of userPaths) {
            if (!newPathDirs.includes(p)) {
                newPathDirs.push(p);
            }
        }
        if (currentPath) {
            for (const p of currentPath.split(":")) {
                if (!newPathDirs.includes(p)) {
                    newPathDirs.push(p);
                }
            }
        }
        const newPath = newPathDirs.join(":");
        let pathFound = false;
        for (let i = 0; i < env.length; i++) {
            if (env[i].startsWith("PATH=")) {
                env[i] = `PATH=${newPath}`;
                pathFound = true;
                break;
            }
        }
        if (!pathFound) {
            env.push(`PATH=${newPath}`);
        }

        // If Antigravity, extract self-signed cert and preload redirect shim
        if (isAntigravity) {
            try {
                const customCaBundle = await this._setupAntigravitySSL(cancellable);
                if (customCaBundle) {
                    env.push(`CUSTOM_CA_BUNDLE=${customCaBundle}`);
                    // Check persistent user location for the redirect shim
                    const userLdPreload = GLib.build_filenamev([GLib.get_home_dir(), ".codexbar", "cert_redirect.so"]);
                    if (GLib.file_test(userLdPreload, GLib.FileTest.EXISTS)) {
                        env.push(`LD_PRELOAD=${userLdPreload}`);
                    }
                }
            } catch (e) {
                // Non-fatal, fallback to standard execution
            }

            // Bridge ~/.gemini/oauth_creds.json to ANTIGRAVITY_OAUTH_CREDENTIALS_JSON
            const credsPath = GLib.build_filenamev([GLib.get_home_dir(), ".gemini", "oauth_creds.json"]);
            if (GLib.file_test(credsPath, GLib.FileTest.EXISTS)) {
                try {
                    const file = Gio.File.new_for_path(credsPath);
                    const [, content] = await new Promise((resolve) => {
                        file.load_contents_async(cancellable, (f, res) => {
                            try {
                                const [ok, data] = f.load_contents_finish(res);
                                resolve([ok, new TextDecoder().decode(data)]);
                            } catch (e) {
                                resolve([false, ""]);
                            }
                        });
                    });
                    if (content) {
                        env.push(`ANTIGRAVITY_OAUTH_CREDENTIALS_JSON=${content.trim()}`);
                    }
                } catch (e) {
                    // Ignore
                }
            }
        }

        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        });
        launcher.set_environ(env);

        // Step 2: Spawn the subprocess to execute the CLI tool
        const proc = launcher.spawnv(["bash", "-c", finalCommand]);

        const [stdout, stderr] = await new Promise((resolve, reject) => {
            proc.communicate_utf8_async(null, cancellable, (p, res) => {
                try {
                    const [ok, out, err] = p.communicate_utf8_finish(res);
                    resolve([out || "", err || ""]);
                } catch (e) {
                    if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                        resolve(["", ""]);
                    } else {
                        reject(e);
                    }
                }
            });
        });

        const trimmedStdout = stdout.trim();
        const trimmedStderr = stderr.trim();

        // Step 3: Automatic label detection (run command in text mode to parse names)
        let labels = [];
        try {
            let discoveryCommand = finalCommand
                .replace("--format json", "")
                .replace("--json-only", "")
                .replace("--json", "")
                .replace("--pretty", "");

            const dLauncher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            });
            dLauncher.set_environ(env);
            const dProc = dLauncher.spawnv(["bash", "-c", discoveryCommand]);

            const [dStdout] = await new Promise((resolve) => {
                dProc.communicate_utf8_async(null, cancellable, (p, res) => {
                    try {
                        const [ok, out] = p.communicate_utf8_finish(res);
                        resolve([out || ""]);
                    } catch (e) {
                        resolve([""]);
                    }
                });
            });

            if (dStdout) {
                const lines = dStdout.split("\n");
                for (let line of lines) {
                    const match = line.match(/^([^:]+):\s+\d+%/);
                    if (match) {
                        labels.push(match[1].trim());
                    }
                }
            }
        } catch (e) {
            // Ignore label discovery failures
        }

        // Step 4: Parse the JSON stdout or format errors
        if (trimmedStdout && (trimmedStdout.startsWith("[") || trimmedStdout.startsWith("{"))) {
            try {
                const parsed = JSON.parse(trimmedStdout);
                const rawData = Array.isArray(parsed) ? parsed[0] : parsed;
                return {
                    data: rawData,
                    labels: labels,
                    command: finalCommand
                };
            } catch (e) {
                throw new UsageApiError(`JSON Error / Error JSON: ${e.message}`);
            }
        } else if (trimmedStderr) {
            throw new UsageApiError(`CLI Error / Error de CLI: ${trimmedStderr.split("\n")[0]}`);
        } else if (trimmedStdout) {
            throw new UsageApiError("Output is not valid JSON / La salida no es un JSON válido");
        } else {
            throw new UsageApiError("No output from command / Sin respuesta del comando");
        }
    }
}
