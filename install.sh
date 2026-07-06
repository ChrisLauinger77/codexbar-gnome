#!/bin/bash
# Script para instalar/reinstalar la extensión para pruebas rápidas

UUID="codexbar@inled.es"
ZIP_FILE="${UUID}.shell-extension.zip"

# 1. Asegurarse de que esté empaquetada
./build.sh

echo "Eliminando versión anterior (si existe)..."
gnome-extensions uninstall "$UUID" 2>/dev/null
rm -rf ~/.local/share/gnome-shell/extensions/"$UUID"

echo "Instalando nueva versión..."
gnome-extensions install "$ZIP_FILE" --force

echo "Habilitando extensión..."
gnome-extensions enable "$UUID"

echo "Listo. Si no ves los cambios, reinicia GNOME Shell (Alt+F2, r, Enter en X11 o cierra sesión en Wayland)."
