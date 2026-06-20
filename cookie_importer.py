import os
import sqlite3
import json
import shutil
import glob
import re

# Dependencies
try:
    import secretstorage
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False

CHROMIUM_SECRET_SCHEMA = "chrome_libsecret_os_crypt_password_v2"

def get_keys(label_hints, app_names=None):
    keys = []
    seen = set()
    errors = []
    app_names = {name.lower() for name in (app_names or [])}

    def add_secret(secret):
        if secret not in seen:
            keys.append(secret)
            seen.add(secret)

    def item_priority(item):
        try:
            attrs = item.get_attributes()
        except Exception:
            attrs = {}
        app = attrs.get("application", "").lower()
        schema = attrs.get("xdg:schema", "")
        if app in app_names and schema == CHROMIUM_SECRET_SCHEMA:
            return 0

        label = item.get_label().lower()
        if any(hint.lower() in label for hint in label_hints):
            # Chromium creates "Safe Storage Control" dummy entries to test
            # keyring unlock behavior. They are not cookie encryption keys.
            if "control" in label:
                return None
            return 1

        return None

    def scan_collection(collection):
        try:
            if collection.is_locked():
                collection.unlock()
        except Exception as e:
            errors.append(f"unlock failed: {e}")

        matched = []
        try:
            items = collection.get_all_items()
        except Exception as e:
            errors.append(f"items failed: {e}")
            return

        for item in items:
            try:
                priority = item_priority(item)
                if priority is not None:
                    matched.append((priority, item))
            except Exception as e:
                errors.append(f"item read failed: {e}")

        for _priority, item in sorted(matched, key=lambda pair: pair[0]):
            try:
                add_secret(item.get_secret())
            except Exception as e:
                errors.append(f"secret read failed: {e}")

    try:
        bus = secretstorage.dbus_init()
        for app_name in app_names:
            try:
                for item in secretstorage.search_items(bus, {
                    "application": app_name,
                    "xdg:schema": CHROMIUM_SECRET_SCHEMA,
                }):
                    add_secret(item.get_secret())
            except Exception as e:
                errors.append(f"search {app_name}: {e}")

        try:
            scan_collection(secretstorage.get_default_collection(bus))
        except Exception as e:
            errors.append(f"default collection: {e}")

        if not keys:
            try:
                for collection in secretstorage.get_all_collections(bus):
                    scan_collection(collection)
            except Exception as e:
                errors.append(f"all collections: {e}")
    except Exception as e:
        errors.append(str(e))
    
    found_keyring_keys = bool(keys)
    if b"peanuts" not in seen:
        keys.append(b"peanuts")
    return keys, None if found_keyring_keys else ("; ".join(dict.fromkeys(errors)) or None)

def decrypt_v10(encrypted_value, key):
    if not encrypted_value or len(encrypted_value) < 3:
        return None
        
    if not encrypted_value.startswith(b"v10") and not encrypted_value.startswith(b"v11"):
        return None
        
    try:
        salt = b"saltysalt"
        iv = b" " * 16
        kdf = PBKDF2HMAC(algorithm=hashes.SHA1(), length=16, salt=salt, iterations=1)
        derived_key = kdf.derive(key)
        
        cipher = Cipher(algorithms.AES(derived_key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        decrypted = decryptor.update(encrypted_value[3:]) + decryptor.finalize()
        
        # Chromium Linux v10/v11 values use PKCS#7 padding with AES-CBC.
        # If padding is invalid, the key is almost certainly wrong.
        padding_len = decrypted[-1]
        if padding_len < 1 or padding_len > 16:
            return None
        if not all(decrypted[i] == padding_len for i in range(-padding_len, 0)):
            return None
        decrypted_unpadded = decrypted[:-padding_len]

        # Handle v11 / v10 header/garbage
        # Try to find JWT start
        jwt_start = decrypted_unpadded.find(b'eyJ')
        if jwt_start != -1 and jwt_start < 48:
            res = decrypted_unpadded[jwt_start:]
        else:
            # Try common header offsets for v11
            found_clean = False
            for offset in [32, 28, 0]:
                if len(decrypted_unpadded) > offset:
                    candidate = decrypted_unpadded[offset:]
                    # Check if the first 10 chars are printable (ASCII)
                    if len(candidate) >= 10 and all(32 <= c <= 126 for c in candidate[:10]):
                        res = candidate
                        found_clean = True
                        break
            if not found_clean:
                res = decrypted_unpadded

        # Final cleanup: decode and handle padding/garbage
        res_str = res.decode('utf-8')
        if not is_plausible_cookie_value("", res_str):
            return None
            
        return res_str
    except:
        return None

def is_plausible_cookie_value(name, value):
    if not value:
        return False

    # RFC6265 cookie-octet, excluding DQUOTE, comma, semicolon, backslash,
    # whitespace, and control characters. Wrong decryption often produces these.
    if not re.fullmatch(r"[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+", value):
        return False

    if "session-token" in name and len(value) < 100:
        return False

    return True

def extract_tokens():
    if not HAS_DEPS:
        return {"error": "DEPENDENCIES_MISSING"}

    browsers = [
        {
            "name": "Chrome",
            "path": "~/.config/google-chrome/*/Cookies",
            "key_labels": ["Chrome Safe Storage"],
            "app_names": ["chrome"],
        },
        {
            "name": "Brave",
            "path": "~/.config/BraveSoftware/Brave-Browser/*/Cookies",
            "key_labels": ["Brave Safe Storage"],
            "app_names": ["brave"],
        },
        {
            "name": "Chromium",
            "path": "~/.config/chromium/*/Cookies",
            "key_labels": ["Chromium Safe Storage", "Application key for org.chromium.Chromium"],
            "app_names": ["chromium"],
        },
    ]

    # Target cookies (broaden to ensure session validity)
    targets = ["session-token", "oai-did", "oai-sc", "cf_clearance", "_cf_bm", "oai-is", "oai-allow", "oai-chat-web-route", "oai-client-auth-info"]
    
    all_cookies = {}
    dbus_errors = []
    encrypted_targets = 0
    
    for browser in browsers:
        keys, dbus_err = get_keys(browser["key_labels"], browser.get("app_names"))
        if dbus_err:
            dbus_errors.append(f"{browser['name']}: {dbus_err}")
            
        search_path = os.path.expanduser(browser["path"])
        cookie_files = glob.glob(search_path)
        
        if not cookie_files:
            continue

        for db_path in cookie_files:
            temp_db = None
            try:
                temp_db = f"/tmp/codexbar_cookies_{os.getpid()}.db"
                # Check if we can read the source file
                if not os.access(db_path, os.R_OK):
                    return {"error": "PERMISSION_DENIED", "details": f"Cannot read cookie file at {db_path}. Try closing your browser."}

                shutil.copyfile(db_path, temp_db)
                conn = sqlite3.connect(f"file:{temp_db}?mode=ro", uri=True)
                cursor = conn.cursor()
                
                cursor.execute("SELECT name, value, encrypted_value FROM cookies WHERE host_key LIKE '%chatgpt.com%' OR host_key LIKE '%openai.com%'")
                
                for name, value, enc_val in cursor.fetchall():
                    if not any(t in name for t in targets):
                        continue

                    if enc_val:
                        encrypted_targets += 1

                    cookie_value = value if is_plausible_cookie_value(name, value) else None

                    if cookie_value is None:
                        for key in keys:
                            cookie_value = decrypt_v10(enc_val, key)
                            if cookie_value is not None and is_plausible_cookie_value(name, cookie_value):
                                break
                            cookie_value = None

                    if cookie_value:
                        all_cookies[name] = cookie_value
                
                conn.close()
            except Exception as e:
                return {"error": "DATABASE_ERROR", "details": str(e)}
            finally:
                if temp_db and os.path.exists(temp_db): 
                    os.remove(temp_db)

    if not all_cookies:
        details = "Found no valid session tokens. Please ensure you are logged in."
        if encrypted_targets:
            details += (
                f"\n\nFound {encrypted_targets} encrypted ChatGPT/OpenAI cookies, "
                "but none could be decrypted with the available browser keyring keys."
            )
        if dbus_errors:
            details += "\n\nKeyring access errors (D-Bus):\n" + "\n".join(dbus_errors)
        return {"error": "SESSION_NOT_FOUND", "details": details}

    found_session = any("session-token" in name for name in all_cookies)
    if not found_session:
         return {"error": "SESSION_NOT_FOUND", "details": "Found some cookies but no session token. Please log in."}

    # Format the cookie header
    # Priority: session-token, then others
    session_parts = [f"{name}={val}" for name, val in sorted(all_cookies.items()) if "session-token" in name]
    other_parts = [f"{name}={val}" for name, val in sorted(all_cookies.items()) if "session-token" not in name]
    
    cookie_parts = session_parts + other_parts
    
    # GNOME/Gtk/D-Bus limits: If the string is too long, it might fail to pass through some channels.
    # 4KB is a safe bet for many systems, though D-Bus allows much more.
    # Let's see if we can fit it.
    header = "; ".join(cookie_parts)
    if len(header) > 8192:
        # If still too long, we might need to be more aggressive, but session-token is vital.
        # Let's just return what we have for now and hope for the best.
        pass
        
    return {"cookie_header": header}

if __name__ == "__main__":
    try:
        print(json.dumps(extract_tokens()))
    except Exception as e:
        print(json.dumps({"error": "UNEXPECTED_EXCEPTION", "details": str(e)}))
