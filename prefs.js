import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { storeToken, loadToken, clearToken, nullTokenSchema } from './secret.js';

/**
 * Predefined providers list.
 * Lista de proveedores predefinidos.
 */
const PREDEFINED_PROVIDERS = [
    { id: 'codex', name: 'Codex', useApi: true, defaultCommand: '' },
    { id: 'claude', name: 'Claude', useApi: false, defaultCommand: 'codexbar --provider claude --source cli --format json' },
    { id: 'gemini', name: 'Gemini', useApi: false, defaultCommand: 'codexbar --provider gemini --source api --format json' },
    { id: 'deepseek', name: 'DeepSeek', useApi: false, defaultCommand: 'codexbar --provider deepseek --source api --format json' },
    { id: 'copilot', name: 'Copilot', useApi: false, defaultCommand: 'codexbar --provider copilot --source api --format json' },
    { id: 'openrouter', name: 'OpenRouter', useApi: false, defaultCommand: 'codexbar --provider openrouter --source api --format json' },
    { id: 'perplexity', name: 'Perplexity', useApi: false, defaultCommand: 'codexbar --provider perplexity --source api --format json' },
    { id: 'mistral', name: 'Mistral', useApi: false, defaultCommand: 'codexbar --provider mistral --source api --format json' },
    { id: 'antigravity', name: 'Antigravity', useApi: false, defaultCommand: 'codexbar --provider antigravity --source cli --format json' },
];

/**
 * Preferences page for CodexBar.
 * Página de preferencias para CodexBar.
 */
const CodexBarPrefsPage = GObject.registerClass(
class CodexBarPrefsPage extends Adw.PreferencesPage {
    _init(settings, extensionPath = null) {
        super._init({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });

        this._settings = settings;
        this._extensionPath = extensionPath;
        this._providerRows = [];

        this.add(this._buildSettingsGroup());
        this.add(this._buildProvidersGroup());
        this.add(this._buildContributeGroup());
        this.add(this._buildMaintenanceGroup());

        this.connect('destroy', () => {
            this._settings = null;
            this._providerRows = [];
        });
    }

    /**
     * Build the contribute and contact group.
     * Construye el grupo de contribución y contacto.
     */
    _buildContributeGroup() {
        const group = new Adw.PreferencesGroup({
            title: _('Contribute & Contact'),
            description: _('Support CodexBar development and get in touch with the team.'),
        });

        // Pull Request / Contribute
        const prRow = new Adw.ActionRow({
            title: _('Add a New Provider'),
            subtitle: _('Help the community by submitting a Pull Request on GitHub'),
        });
        prRow.add_prefix(new Gtk.Image({ icon_name: 'window-new-symbolic' }));
        
        const prBtn = new Gtk.Button({
            icon_name: 'go-next-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        prBtn.connect('clicked', () => {
            Gio.app_info_launch_default_for_uri('https://github.com/InledGroup/codexbar-gnome', null);
        });
        prRow.add_suffix(prBtn);
        group.add(prRow);

        // Review on GNOME Extensions
        const reviewRow = new Adw.ActionRow({
            title: _('Leave a Review'),
            subtitle: _('Rate us on the GNOME Extensions website or share it on social media!'),
        });
        reviewRow.add_prefix(new Gtk.Image({ icon_name: 'starred-symbolic' }));

        const reviewBtn = new Gtk.Button({
            icon_name: 'go-next-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        reviewBtn.connect('clicked', () => {
            Gio.app_info_launch_default_for_uri('https://extensions.gnome.org/extension/9841/codexbar/', null);
        });
        reviewRow.add_suffix(reviewBtn);
        group.add(reviewRow);



        // Contact Inled
        const contactRow = new Adw.ActionRow({
            title: _('Contact Inled'),
            subtitle: _('Questions? Suggestions? Write to us at hi@inled.es'),
        });
        contactRow.add_prefix(new Gtk.Image({ icon_name: 'mail-message-new-symbolic' }));

        const contactBtn = new Gtk.Button({
            icon_name: 'go-next-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        contactBtn.connect('clicked', () => {
            Gio.app_info_launch_default_for_uri('mailto:hi@inled.es', null);
        });
        contactRow.add_suffix(contactBtn);
        group.add(contactRow);

        // Visit Website
        const webRow = new Adw.ActionRow({
            title: _('Visit inled.es'),
            subtitle: _('Discover more tools and projects that might interest you!'),
        });
        webRow.add_prefix(new Gtk.Image({ icon_name: 'web-browser-symbolic' }));

        const webBtn = new Gtk.Button({
            icon_name: 'go-next-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        webBtn.connect('clicked', () => {
            Gio.app_info_launch_default_for_uri('https://inled.es', null);
        });
        webRow.add_suffix(webBtn);
        group.add(webRow);

        // Social Media
        const socialRow = new Adw.ActionRow({
            title: _('Join the Community'),
            subtitle: _('Follow us on social media for updates and support'),
        });
        socialRow.add_prefix(new Gtk.Image({ icon_name: 'system-users-symbolic' }));

        const socialBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
        });

        const createSocialBtn = (name, url, tooltip) => {
            const iconPath = GLib.build_filenamev([this._extensionPath, "media", "logos", `${name}-symbolic.svg`]);
            const btn = new Gtk.Button({
                css_classes: ['flat'],
                tooltip_text: tooltip,
            });
            if (GLib.file_test(iconPath, GLib.FileTest.EXISTS)) {
                const gicon = Gio.Icon.new_for_string(iconPath);
                btn.set_child(new Gtk.Image({ gicon: gicon }));
            } else {
                btn.set_label(tooltip);
            }
            btn.connect('clicked', () => {
                Gio.app_info_launch_default_for_uri(url, null);
            });
            return btn;
        };

        socialBox.append(createSocialBtn('discord', 'https://discord.com/invite/PSeTkDMnr', 'Discord'));
        socialBox.append(createSocialBtn('mastodon', 'https://mastodon.social/@inled', 'Mastodon'));
        socialBox.append(createSocialBtn('youtube', 'https://www.youtube.com/@inledgroup', 'YouTube'));
        socialBox.append(createSocialBtn('x', 'https://x.com/inledgroup', 'X (Twitter)'));

        socialRow.add_suffix(socialBox);
        group.add(socialRow);

        return group;
    }

    /**
     * Build the general settings group (Refresh interval, Display mode).
     * Construye el grupo de ajustes generales (Intervalo de refresco, Modo de visualización).
     */
    _buildSettingsGroup() {
        const group = new Adw.PreferencesGroup({
            title: _('Settings'),
        });

        const refreshRow = new Adw.SpinRow({
            title: _('Refresh Interval (minutes)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 1440,
                step_increment: 1,
                value: this._settings.get_int('refresh-interval'),
            }),
        });
        this._settings.bind('refresh-interval', refreshRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(refreshRow);

        const displayModeRow = new Adw.ComboRow({
            title: _('Display Mode'),
            model: new Gtk.StringList({
                strings: [_('Used'), _('Remaining')],
            }),
            selected: this._settings.get_string('display-mode') === 'used' ? 0 : 1,
        });
        displayModeRow.connect('notify::selected', () => {
            this._settings.set_string('display-mode', displayModeRow.selected === 0 ? 'used' : 'remaining');
        });
        group.add(displayModeRow);

        const showLogosRow = new Adw.SwitchRow({
            title: _('Show Provider Logos'),
            subtitle: _('Display the logo of each AI provider in the selection tabs'),
            active: this._settings.get_boolean('show-logos'),
        });
        this._settings.bind('show-logos', showLogosRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(showLogosRow);

        return group;
    }

    /**
     * Build the AI providers configuration group.
     * Construye el grupo de configuración de proveedores de IA.
     */
    _buildProvidersGroup() {
        const group = new Adw.PreferencesGroup({
            title: _('AI Providers'),
            description: _('Enable providers. Codex uses Direct API. Others use codexbar-cli with --source api.'),
        });

        const activeProvidersJson = this._settings.get_string('providers');
        let activeProviders = [];
        try {
            activeProviders = JSON.parse(activeProvidersJson);
        } catch (e) {
            activeProviders = [];
        }

        const saveProviders = () => {
            const newProviders = [];
            this._providerRows.forEach(row => {
                if (row._enabledSwitch.active) {
                    newProviders.push({
                        id: row._id,
                        name: row._name,
                        command: row._commandEntry.get_text(),
                        useApi: row._useApi,
                    });
                    
                    if (row._useApi) {
                        const token = row._tokenEntry.get_text();
                        if (token) {
                            storeToken(row._id, token);
                        }
                    }
                }
            });
            this._settings.set_string('providers', JSON.stringify(newProviders));
        };

        const createProviderRow = (info, activeData = null) => {
            const isEnabled = activeData !== null;
            const isPredefined = PREDEFINED_PROVIDERS.some(p => p.id === info.id);
            
            // Handle command defaults and migrations
            // Manejar valores por defecto y migraciones de comandos
            let command = info.defaultCommand || '';
            if (activeData) {
                if (activeData.command && (activeData.command.includes('--provider') || info.useApi || !isPredefined)) {
                    command = activeData.command;
                } else {
                    command = info.defaultCommand;
                }
            }
            
            const row = new Adw.ExpanderRow({
                title: info.name,
                subtitle: isEnabled ? _('Enabled') : _('Disabled'),
                expanded: isEnabled,
            });
            
            row._id = activeData ? activeData.id : info.id;
            row._name = info.name;
            row._useApi = info.useApi;

            const enabledSwitch = new Gtk.Switch({
                active: isEnabled,
                valign: Gtk.Align.CENTER,
            });
            enabledSwitch.connect('notify::active', () => {
                row.set_subtitle(enabledSwitch.active ? _('Enabled') : _('Disabled'));
                row.expanded = enabledSwitch.active;
                saveProviders();
            });
            row.add_suffix(enabledSwitch);
            row._enabledSwitch = enabledSwitch;

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12,
            });

            if (info.useApi) {
                // For Direct API providers like Codex
                // Para proveedores de API directa como Codex
                const tokenEntry = new Gtk.PasswordEntry({
                    placeholder_text: _('Authentication Cookie (starts with __Secure...)'),
                    text: loadToken(row._id) || '',
                });
                tokenEntry.connect('changed', () => {
                    storeToken(row._id, tokenEntry.get_text().trim());
                    saveProviders();
                });
                row._tokenEntry = tokenEntry;

                const importBtn = new Gtk.Button({
                    label: _('Auto-Login from Browser (Codex Only)'),
                    margin_top: 6,
                    tooltip_text: _('Uses a local Python script to extract cookies from Chrome/Brave. Works only for Codex.')
                });
                
                const spinner = new Gtk.Spinner({
                    valign: Gtk.Align.CENTER,
                    margin_start: 6,
                });
                const btnBox = new Gtk.Box({ spacing: 6, margin_top: 6 });
                btnBox.append(importBtn);
                btnBox.append(spinner);

                importBtn.connect('clicked', () => {
                    importBtn.sensitive = false;
                    spinner.start();
                    this._importFromBrowser(row._id, tokenEntry, () => {
                        importBtn.sensitive = true;
                        spinner.stop();
                    });
                });
                
                box.append(new Gtk.Label({ 
                    label: _('Session Cookies (Codex):'), 
                    xalign: 0,
                    css_classes: ['caption'] 
                }));
                box.append(tokenEntry);
                box.append(btnBox);
                box.append(new Gtk.Label({ 
                    label: _('Manual entry: Paste your session cookies here.'), 
                    xalign: 0,
                    css_classes: ['dim-label']
                }));
                row._commandEntry = new Gtk.Entry({ text: '' }); // Dummy
            } else {
                const commandEntry = new Gtk.Entry({
                    placeholder_text: _('CLI Command (e.g. codexbar --provider ...)'),
                    text: command,
                });
                commandEntry.connect('changed', saveProviders);
                row._commandEntry = commandEntry;
                
                const labelBox = new Gtk.Box({ spacing: 6 });
                labelBox.append(new Gtk.Label({ label: _('CLI Command:'), xalign: 0 }));
                
                if (isPredefined) {
                    const resetBtn = new Gtk.Button({
                        label: _('Reset Default'),
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat'],
                    });
                    resetBtn.connect('clicked', () => {
                        commandEntry.set_text(info.defaultCommand);
                        saveProviders();
                    });
                    labelBox.append(resetBtn);
                }
                
                box.append(labelBox);
                box.append(commandEntry);

                if (info.id === 'antigravity') {
                    const hasLsof = !!GLib.find_program_in_path("lsof");
                    
                    if (!hasLsof) {
                        let lsofCmd = "sudo apt install lsof";
                        if (GLib.find_program_in_path("pacman")) {
                            lsofCmd = "sudo pacman -S lsof";
                        } else if (GLib.find_program_in_path("dnf")) {
                            lsofCmd = "sudo dnf install lsof";
                        }
                        const lsofLabel = new Gtk.Label({
                            label: _(`⚠️ Antigravity requires the 'lsof' utility to detect the local server ports. Run this command to install it:\n\n${lsofCmd}`),
                            xalign: 0,
                            use_markup: false,
                            wrap: true,
                            css_classes: ['dim-label'],
                        });
                        lsofLabel.set_margin_top(6);
                        box.append(lsofLabel);
                    }

                    // Antigravity SSL certificate setup
                    const certLabel = new Gtk.Label({
                        label: _('💡 To trust the local Antigravity self-signed SSL certificate, click below to install it into your system ca-certificates bundle (requires administrator authorization).'),
                        xalign: 0,
                        use_markup: false,
                        wrap: true,
                        css_classes: ['dim-label'],
                    });
                    certLabel.set_margin_top(12);
                    box.append(certLabel);

                    const installCertBtn = new Gtk.Button({
                        label: _('Install Antigravity SSL Certificate'),
                        margin_top: 6,
                    });
                    
                    const certSpinner = new Gtk.Spinner({
                        valign: Gtk.Align.CENTER,
                        margin_start: 6,
                    });
                    certSpinner.set_margin_top(6);
                    
                    const certBox = new Gtk.Box({ spacing: 6 });
                    certBox.append(installCertBtn);
                    certBox.append(certSpinner);
                    box.append(certBox);

                    installCertBtn.connect('clicked', () => {
                        installCertBtn.sensitive = false;
                        certSpinner.start();
                        this._installAntigravityCert(certSpinner, () => {
                            installCertBtn.sensitive = true;
                        });
                    });
                }
            }

            if (!isPredefined) {
                const deleteBtn = new Gtk.Button({
                    label: _('Remove Provider'),
                    margin_top: 12,
                    css_classes: ['destructive-action'],
                });
                deleteBtn.connect('clicked', () => {
                    group.remove(row);
                    this._providerRows = this._providerRows.filter(r => r !== row);
                    saveProviders();
                });
                box.append(deleteBtn);
            }

            row.add_row(box);
            this._providerRows.push(row);
            return row;
        };

        const processedIds = new Set();
        const processedNames = new Set();

        // 1. Predefined Providers
        PREDEFINED_PROVIDERS.forEach(info => {
            const infoNameLower = info.name.toLowerCase();
            const activeData = activeProviders.find(p => p.id === info.id) || 
                               activeProviders.find(p => p.name.toLowerCase() === infoNameLower);
            
            if (activeData) {
                processedIds.add(activeData.id);
                processedNames.add(activeData.name.toLowerCase());
            }
            group.add(createProviderRow(info, activeData));
        });

        // 2. Custom Providers
        activeProviders.forEach(p => {
            const pNameLower = p.name.toLowerCase();
            if (!processedIds.has(p.id) && !processedNames.has(pNameLower)) {
                group.add(createProviderRow({
                    id: p.id,
                    name: p.name,
                    useApi: p.useApi || false,
                    defaultCommand: p.command
                }, p));
            }
        });

        // 3. Add Custom Provider Button
        const addBtnRow = new Adw.ActionRow({
            title: _('Add Custom Provider'),
            subtitle: _('Specify a name and a codexbar CLI command'),
        });
        
        const addBtn = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        
        addBtn.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({
                heading: _('New Provider'),
                body: _('Enter the details for your custom AI provider.'),
                transient_for: this.get_root(),
                modal: true,
            });

            const content = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
            });

            const nameEntry = new Gtk.Entry({
                placeholder_text: _('Provider Name (e.g. MyLocalModel)'),
            });
            content.append(nameEntry);

            const cmdEntry = new Gtk.Entry({
                placeholder_text: _('Command (e.g. codexbar --provider ...)'),
            });
            content.append(cmdEntry);

            dialog.set_extra_child(content);
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('add', _('Add'));
            dialog.set_response_appearance('add', Adw.ResponseAppearance.SUGGESTED);

            dialog.connect('response', (d, response) => {
                if (response === 'add') {
                    const name = nameEntry.get_text().trim();
                    const cmd = cmdEntry.get_text().trim();
                    if (name && cmd) {
                        const newProvider = {
                            id: `custom-${Date.now()}`,
                            name: name,
                            command: cmd,
                            useApi: false
                        };
                        const row = createProviderRow({
                            id: newProvider.id,
                            name: newProvider.name,
                            useApi: false,
                            defaultCommand: newProvider.command
                        }, newProvider);
                        // Add before the "Add Custom Provider" button
                        // Añadir antes del botón "Añadir Proveedor Personalizado"
                        group.add(row);
                        // Manually move it up if needed, but Adw.PreferencesGroup appends
                        // In GNOME 45+ we can't easily reorder children in PreferencesGroup 
                        // without removing the button and re-adding it.
                        saveProviders();
                    }
                }
            });
            dialog.present();
        });

        addBtnRow.add_suffix(addBtn);
        group.add(addBtnRow);

        return group;
    }

    /**
     * Build the maintenance/debug group.
     * Construye el grupo de mantenimiento/depuración.
     */
    _buildMaintenanceGroup() {
        const group = new Adw.PreferencesGroup({
            title: _('Maintenance'),
        });

        const setupBtnRow = new Adw.ActionRow({
            title: _('Show Welcome Screen'),
            subtitle: _('Reset first-run state'),
        });
        const setupBtn = new Gtk.Button({
            icon_name: 'help-about-symbolic',
            valign: Gtk.Align.CENTER,
        });
        setupBtn.connect('clicked', () => {
            this._settings.set_boolean('first-run', true);
        });
        setupBtnRow.add_suffix(setupBtn);
        group.add(setupBtnRow);

        return group;
    }

    /**
     * Import cookies from browser using local Python script.
     * Importa cookies desde el navegador usando un script de Python local.
     */
    /**
     * Import cookies from browser using local Python script.
     * Importa cookies desde el navegador usando un script de Python local.
     */
    async _importFromBrowser(providerId, tokenEntry, callback = null) {
        const finish = () => {
            if (callback) callback();
        };

        const showError = (title, message) => {
            const dialog = new Adw.MessageDialog({
                heading: title,
                body: message,
                transient_for: this.get_root(),
                modal: true,
            });
            dialog.add_response('ok', _('OK'));
            dialog.present();
            finish();
        };

        const showMissingDialog = () => {
            const dialog = new Adw.MessageDialog({
                heading: _('Cookie Importer Missing'),
                body: _('To import cookies automatically from your browser, please install the python dependency by running:\n\npip install codexbar-cookie-importer'),
                transient_for: this.get_root(),
                modal: true,
            });
            dialog.add_response('ok', _('OK'));
            dialog.present();
            finish();
        };

        // Find the executable binary or fallback to python module
        // Encontrar el binario ejecutable o recurrir al módulo python
        let argv = null;
        if (GLib.find_program_in_path('codexbar-cookie-importer')) {
            argv = ['codexbar-cookie-importer'];
        } else {
            const localBin = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'codexbar-cookie-importer']);
            if (GLib.file_test(localBin, GLib.FileTest.EXISTS)) {
                argv = [localBin];
            } else {
                // Try executing as module / Intentar ejecutar como módulo
                argv = ['/usr/bin/python3', '-m', 'codexbar_cookie_importer'];
            }
        }
        
        try {
            const proc = new Gio.Subprocess({
                argv: argv,
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            proc.init(null);

            const cancellable = new Gio.Cancellable();
            let timedOut = false;

            const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15000, () => {
                timedOut = true;
                cancellable.cancel();
                proc.force_exit();
                showError(_('Timeout'), _('The cookie importer is taking too long. Please ensure your browser is closed and try again.'));
                return GLib.SOURCE_REMOVE;
            });

            proc.communicate_utf8_async(null, cancellable, (p, res) => {
                if (timeoutId > 0 && !timedOut) {
                    GLib.source_remove(timeoutId);
                }

                try {
                    const [success, stdout, stderr] = p.communicate_utf8_finish(res);
                    
                    if (timedOut) return;

                    // If the module is not found, python returns exit code 1 or 2 and No module named in stderr
                    // Si el módulo no se encuentra, python devuelve código de salida 1 o 2 y No module named en stderr
                    if (!success && stderr && (stderr.includes('No module named') || stderr.includes('No such file'))) {
                        showMissingDialog();
                        return;
                    }

                    if (success && stdout) {
                        const result = JSON.parse(stdout.trim());
                        
                        if (result.error === 'DEPENDENCIES_MISSING') {
                            showMissingDialog();
                        } else if (result.error) {
                            showError(_('Import Failed'), result.details || result.error);
                        } else if (result.cookie_header) {
                            tokenEntry.set_text(result.cookie_header);
                            storeToken(providerId, result.cookie_header);
                            
                            const toast = new Adw.Toast({ title: _('Cookies imported successfully!') });
                            this.get_root().add_toast(toast);
                            finish();
                        }
                    } else {
                        const err = stderr || _('The importer returned no data.');
                        if (err.includes('No module named')) {
                            showMissingDialog();
                        } else {
                            showError(_('Error'), err);
                        }
                    }
                } catch (e) {
                    if (!timedOut) {
                        // Check if it's a module not found issue
                        if (e.message && e.message.includes('No module named')) {
                            showMissingDialog();
                        } else {
                            console.error(e, 'CodexBar: Error reading importer output');
                            showError(_('Unexpected Error'), e.message);
                        }
                    }
                }
            });
        } catch (e) {
            console.error(e, 'CodexBar: Error in _importFromBrowser');
            showMissingDialog();
        }
    }

    /**
     * Scan ports, download cert, and install to system CA store using pkexec.
     */
    async _installAntigravityCert(spinner, callback = null) {
        const finish = () => {
            if (callback) callback();
            spinner.stop();
        };

        const showError = (title, message) => {
            const dialog = new Adw.MessageDialog({
                heading: title,
                body: message,
                transient_for: this.get_root(),
                modal: true,
            });
            dialog.add_response('ok', _('OK'));
            dialog.present();
            finish();
        };

        try {
            // 1. Discover local ports
            const ports = await this._discoverAntigravityPorts();
            if (ports.length === 0) {
                showError(_('No Server Found / Servidor no encontrado'), _('Could not find any running Antigravity server process. Please ensure your Antigravity local language server is active and try again. / No se pudo encontrar ningún proceso del servidor Antigravity activo. Por favor, asegúrate de que tu servidor de lenguaje local de Antigravity esté activo e inténtalo de nuevo.'));
                return;
            }

            // 2. Extract self-signed certificate
            let cert = null;
            for (const port of ports) {
                cert = await this._extractCertificate(port);
                if (cert) break;
            }

            if (!cert) {
                showError(_('Extraction Failed / Error de extracción'), _('Failed to extract the self-signed SSL certificate from the running Antigravity server ports. / Falló la extracción del certificado SSL auto-firmado de los puertos activos del servidor Antigravity.'));
                return;
            }

            // 3. Save to a temporary file in user cache
            const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "codexbar-gnome"]);
            GLib.mkdir_with_parents(cacheDir, 0o755);
            const tempCertPath = GLib.build_filenamev([cacheDir, "antigravity-temp.crt"]);

            const file = Gio.File.new_for_path(tempCertPath);
            await new Promise((resolve, reject) => {
                file.replace_contents_async(
                    new TextEncoder().encode(cert),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null,
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

            // 4. Elevate permissions via pkexec to copy the cert to system CA bundle
            const command = `pkexec sh -c "cp ${tempCertPath} /usr/local/share/ca-certificates/antigravity.crt && update-ca-certificates"`;
            const proc = new Gio.Subprocess({
                argv: ["bash", "-c", command],
                flags: Gio.SubprocessFlags.NONE,
            });
            proc.init(null);

            proc.wait_async(null, (p, res) => {
                try {
                    const success = p.wait_finish(res);
                    if (success) {
                        const dialog = new Adw.MessageDialog({
                            heading: _('Success / Éxito'),
                            body: _('Antigravity SSL certificate successfully installed and trusted at system level! / ¡Certificado SSL de Antigravity instalado y confiado a nivel de sistema!'),
                            transient_for: this.get_root(),
                            modal: true,
                        });
                        dialog.add_response('ok', _('OK'));
                        dialog.present();
                    } else {
                        showError(_('Authorization Failed / Error de autorización'), _('The certificate could not be installed because the authorization request was canceled or failed. / No se pudo instalar el certificado porque la solicitud de autorización falló o fue cancelada.'));
                    }
                } catch (e) {
                    showError(_('Execution Error'), e.message);
                } finally {
                    finish();
                }
            });

        } catch (e) {
            showError(_('Unexpected Error'), e.message);
        }
    }

    /**
     * Scan active ports of the local Antigravity server.
     */
    async _discoverAntigravityPorts() {
        const ports = [];
        
        // Method A: run 'ss -lntp' to list socket processes
        try {
            const proc = Gio.Subprocess.new(
                ["ss", "-lnt", "-p"],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            const [stdout] = await new Promise((resolve) => {
                proc.communicate_utf8_async(null, null, (p, res) => {
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
                    tcpFile.load_contents_async(null, (file, res) => {
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
    async _extractCertificate(port) {
        try {
            const proc = Gio.Subprocess.new(
                ["bash", "-c", `openssl s_client -showcerts -connect 127.0.0.1:${port} < /dev/null 2>/dev/null`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            const [stdout] = await new Promise((resolve) => {
                proc.communicate_utf8_async(null, null, (p, res) => {
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
});

/**
 * Main preferences entry point.
 * Punto de entrada principal para las preferencias.
 */
export default class CodexBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new CodexBarPrefsPage(settings, this.path);
        window.add(page);

        // Null out token schema when preferences window is closed
        // Anular el esquema del token cuando se cierre la ventana de preferencias
        window.connect('destroy', () => {
            nullTokenSchema();
        });
    }
}
