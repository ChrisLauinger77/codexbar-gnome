import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CodexBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        // General Group
        const generalGroup = new Adw.PreferencesGroup({
            title: _('Settings'),
        });
        page.add(generalGroup);

        const refreshRow = new Adw.SpinRow({
            title: _('Refresh Interval (minutes)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 1440,
                step_increment: 1,
                value: settings.get_int('refresh-interval'),
            }),
        });
        settings.bind('refresh-interval', refreshRow.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(refreshRow);

        const displayModeRow = new Adw.ComboRow({
            title: _('Display Mode'),
            model: new Gtk.StringList({
                strings: [_('Used'), _('Remaining')],
            }),
            selected: settings.get_string('display-mode') === 'used' ? 0 : 1,
        });
        displayModeRow.connect('notify::selected', () => {
            settings.set_string('display-mode', displayModeRow.selected === 0 ? 'used' : 'remaining');
        });
        generalGroup.add(displayModeRow);

        const setupBtnRow = new Adw.ActionRow({
            title: _('Show Setup Instructions'),
            subtitle: _('Show the welcome screen again'),
        });
        const setupBtn = new Gtk.Button({
            icon_name: 'help-about-symbolic',
            valign: Gtk.Align.CENTER,
            margin_top: 12,
            margin_bottom: 12,
        });
        setupBtn.connect('clicked', () => {
            settings.set_boolean('first-run', true);
            // We can't easily trigger the main extension UI from here, 
            // but setting first-run to true will make it appear on next refresh/load
        });
        setupBtnRow.add_suffix(setupBtn);
        generalGroup.add(setupBtnRow);

        // Providers Group
        const providersGroup = new Adw.PreferencesGroup({
            title: _('AI Providers'),
            description: _('1. Install CLI: brew install steipete/tap/codexbar\n2. Configure command with --format json\n3. Prefer absolute paths (e.g. /home/linuxbrew/.linuxbrew/bin/codexbar)'),
        });
        page.add(providersGroup);

        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        providersGroup.add(listBox);

        const providersJson = settings.get_string('providers');
        let providers = [];
        try {
            providers = JSON.parse(providersJson);
        } catch (e) {
            console.error('Failed to parse providers JSON:', e);
        }

        const saveProviders = () => {
            const newProviders = [];
            let row = listBox.get_first_child();
            while (row) {
                if (row._providerData) {
                    newProviders.push({
                        name: row._nameEntry.get_text(),
                        command: row._commandEntry.get_text(),
                    });
                }
                row = row.get_next_sibling();
            }
            settings.set_string('providers', JSON.stringify(newProviders));
        };

        const createProviderRow = (name = '', command = '') => {
            const row = new Adw.ActionRow({
                title: name || _('New Provider'),
            });
            row._providerData = true;

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12,
            });

            const nameEntry = new Gtk.Entry({
                placeholder_text: _('Provider Name'),
                text: name,
            });
            nameEntry.connect('changed', () => {
                row.set_title(nameEntry.get_text() || _('New Provider'));
                saveProviders();
            });
            row._nameEntry = nameEntry;
            box.append(nameEntry);

            const commandEntry = new Gtk.Entry({
                placeholder_text: _('CLI Command'),
                text: command,
            });
            commandEntry.connect('changed', saveProviders);
            row._commandEntry = commandEntry;
            box.append(commandEntry);

            const removeBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action'],
            });
            removeBtn.connect('clicked', () => {
                listBox.remove(row);
                saveProviders();
            });

            const rowContent = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
            });
            rowContent.append(box);
            rowContent.append(removeBtn);

            row.set_child(rowContent);
            return row;
        };

        providers.forEach(p => {
            listBox.append(createProviderRow(p.name, p.command));
        });

        const addButton = new Gtk.Button({
            label: _('Add Provider'),
            icon_name: 'list-add-symbolic',
            margin_top: 12,
        });
        addButton.connect('clicked', () => {
            listBox.append(createProviderRow('', ''));
        });
        providersGroup.add(addButton);
    }
}
