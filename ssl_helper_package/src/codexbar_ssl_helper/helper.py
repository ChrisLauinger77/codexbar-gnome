import sys
import os
import subprocess
import ssl

def discover_ports():
    ports = []
    # Method A: Try ss -lntp
    try:
        res = subprocess.check_output(["ss", "-lnt", "-p"], text=True, stderr=subprocess.DEVNULL)
        for line in res.splitlines():
            if "127.0.0.1" in line or "[::1]" in line:
                parts = line.split()
                # Find port
                for p in parts:
                    if ":" in p:
                        port_str = p.split(":")[-1]
                        if port_str.isdigit():
                            port = int(port_str)
                            # Check process name
                            if any(x in line.lower() for x in ["agy", "antigravity", "language_server", "language-server"]):
                                if port not in ports:
                                    ports.append(port)
    except Exception:
        pass

    # Method B: Parse /proc/net/tcp
    if not ports and os.path.exists("/proc/net/tcp"):
        try:
            with open("/proc/net/tcp", "r") as f:
                lines = f.readlines()
            for line in lines[1:]:
                parts = line.strip().split()
                if len(parts) > 3:
                    local_addr = parts[1]
                    state = parts[3]
                    if state == "0A": # LISTEN
                        addr_parts = local_addr.split(":")
                        if len(addr_parts) == 2:
                            addr, port_hex = addr_parts
                            # 0100007F is 127.0.0.1 in little endian
                            if addr in ["0100007F", "00000000"]:
                                port = int(port_hex, 16)
                                if port not in ports:
                                    ports.append(port)
        except Exception:
            pass
            
    return ports

def extract_certificate(port):
    try:
        # Fetch certificate using standard ssl module
        cert = ssl.get_server_certificate(("127.0.0.1", port))
        if "-----BEGIN CERTIFICATE-----" in cert:
            return cert
    except Exception:
        pass
    return None

def main():
    print("CodexBar SSL Helper - Setting up Antigravity local SSL trust")
    print("-------------------------------------------------------------")
    
    ports = discover_ports()
    if not ports:
        print("[-] Error: No active Antigravity / agy server processes found.")
        print("    Please make sure your local Antigravity server is running and listening.")
        sys.exit(1)
        
    print(f"[*] Discovered active local ports: {ports}")
    
    cert = None
    active_port = None
    for port in ports:
        print(f"[*] Attempting to fetch certificate from port {port}...")
        cert = extract_certificate(port)
        if cert:
            active_port = port
            print(f"[+] Successfully extracted self-signed certificate from port {port}!")
            break
            
    if not cert:
        print("[-] Error: Could not extract self-signed certificate from any active port.")
        print("    Make sure the Antigravity server is running HTTPS with SSL enabled.")
        sys.exit(1)
        
    # Write certificate and run update-ca-certificates / update-ca-trust using pkexec
    print("[*] Installing certificate to system trust store (requires administrator privileges)...")
    
    # Detect the correct CA trust directory and command based on OS/distro
    dest_file = None
    update_cmd = None
    
    if os.path.exists("/etc/ca-certificates/trust-source/anchors"):
        # Arch Linux
        dest_file = "/etc/ca-certificates/trust-source/anchors/antigravity.crt"
        update_cmd = "update-ca-trust"
    elif os.path.exists("/usr/local/share/ca-certificates"):
        # Debian / Ubuntu
        dest_file = "/usr/local/share/ca-certificates/antigravity.crt"
        update_cmd = "update-ca-certificates"
    elif os.path.exists("/etc/pki/ca-trust/source/anchors"):
        # Fedora / RHEL
        dest_file = "/etc/pki/ca-trust/source/anchors/antigravity.crt"
        update_cmd = "update-ca-trust"
    else:
        # Fallback to Debian style but ensure directory exists
        dest_file = "/usr/local/share/ca-certificates/antigravity.crt"
        update_cmd = "update-ca-certificates"

    print(f"[*] Target location: {dest_file}")
    print(f"[*] Update command: {update_cmd}")

    cert_content_escaped = cert.replace("'", "'\\''")
    # Ensure the parent directory is created if missing, write cert, and run the update command
    dest_dir = os.path.dirname(dest_file)
    install_cmd = f"mkdir -p {dest_dir} && echo '{cert_content_escaped}' > {dest_file} && {update_cmd}"
    
    try:
        subprocess.check_call(["pkexec", "sh", "-c", install_cmd])
        print("[+] Success! Antigravity certificate has been successfully installed and trusted.")
    except subprocess.CalledProcessError as e:
        print(f"[-] Error: Failed to install certificate: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
