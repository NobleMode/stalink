import os
import sys
import json
import socket
import threading
import time
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

# Port and state variables
HTTP_PORT = 18383
UDP_PORT = 18382
CONNECTED_PEER = None

KVM_PROCESS = None
SYNC_PROCESSES = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_BASE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "bin"))
current_os = sys.platform
platform_dir = "windows" if current_os == "win32" else "linux"
BIN_DIR = os.path.join(BIN_BASE_DIR, platform_dir)

def get_local_ip():
    try:
        # Connect to a public DNS server to find the interface routing packets locally
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def check_binaries():
    ext = ".exe" if current_os == "win32" else ""
    mutagen_name = f"mutagen{ext}"
    mutagen_agents_bundle = "mutagen-agents.tar.gz"
    deskflow_name = f"deskflow{ext}"
    
    mutagen_dir = os.path.join(BIN_DIR, "mutagen")
    deskflow_dir = os.path.join(BIN_DIR, "deskflow")
    
    mutagen_path = os.path.join(mutagen_dir, mutagen_name)
    mutagen_bundle_path = os.path.join(mutagen_dir, mutagen_agents_bundle)
    
    if current_os == "win32":
        deskflow_path = os.path.join(deskflow_dir, deskflow_name)
    else:
        deskflow_path = os.path.join(deskflow_dir, "usr", "bin", deskflow_name)
        
    mutagen_ok = os.path.exists(mutagen_path) and os.path.exists(mutagen_bundle_path)
    deskflow_ok = os.path.exists(deskflow_path)
    return {
        "mutagen": "installed" if mutagen_ok else "missing",
        "deskflow": "installed" if deskflow_ok else "missing"
    }

def scan_local_network():
    peers = []
    local_ip = get_local_ip()
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(1.2)
    
    # Broadcast discovery message
    discover_msg = json.dumps({"event": "STALINK_DISCOVER", "sender_ip": local_ip, "sender_port": HTTP_PORT})
    try:
        sock.sendto(discover_msg.encode("utf-8"), ("255.255.255.255", UDP_PORT))
    except Exception as e:
        print(f"Error sending broadcast: {e}", file=sys.stderr)
    
    start_time = time.time()
    while time.time() - start_time < 1.5:
        try:
            data, addr = sock.recvfrom(2048)
            payload = json.loads(data.decode("utf-8"))
            if payload.get("event") == "STALINK_RESPOND":
                peer_ip = payload.get("ip")
                peer_port = payload.get("port")
                peer_hostname = payload.get("hostname")
                
                # Check if it's already in the list
                is_dup = False
                for p in peers:
                    if p["ip"] == peer_ip and p["port"] == peer_port:
                        is_dup = True
                        break
                
                if not is_dup:
                    peers.append({
                        "hostname": peer_hostname,
                        "ip": peer_ip,
                        "port": peer_port,
                        "is_self": peer_ip == local_ip and peer_port == HTTP_PORT
                    })
        except socket.timeout:
            break
        except Exception:
            pass
            
    sock.close()
    return peers

def handle_start_kvm(payload):
    global KVM_PROCESS
    handle_stop_kvm()
    
    role = payload.get("role", "server").lower()
    config_path = payload.get("config_path")
    address = payload.get("address")
    server_address = payload.get("server_address")
    
    ext = ".exe" if current_os == "win32" else ""
    deskflow_name = f"deskflow{ext}"
    deskflow_dir = os.path.join(BIN_DIR, "deskflow")
    if current_os == "win32":
        deskflow_path = os.path.join(deskflow_dir, deskflow_name)
    else:
        deskflow_path = os.path.join(deskflow_dir, "usr", "bin", deskflow_name)
        
    if not os.path.exists(deskflow_path):
        print(json.dumps({"event": "KVM_STATUS", "status": "ERROR", "message": "Deskflow binary not found."}))
        sys.stdout.flush()
        return
        
    args = [deskflow_path, role]
    if role == "server":
        if config_path:
            args += ["--config", config_path]
        if address:
            args += ["--address", address]
    elif role == "client":
        if server_address:
            args += [server_address]
            
    creation_flags = 0
    if sys.platform == "win32":
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        
    try:
        print(json.dumps({"event": "KVM_STATUS", "status": "STARTING", "args": args}))
        sys.stdout.flush()
        
        KVM_PROCESS = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags
        )
        
        print(json.dumps({"event": "KVM_STATUS", "status": "RUNNING", "pid": KVM_PROCESS.pid}))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"event": "KVM_STATUS", "status": "ERROR", "message": str(e)}))
        sys.stdout.flush()

def handle_stop_kvm():
    global KVM_PROCESS
    if KVM_PROCESS:
        try:
            KVM_PROCESS.terminate()
            KVM_PROCESS.wait(timeout=2)
        except Exception:
            try:
                KVM_PROCESS.kill()
            except Exception:
                pass
        KVM_PROCESS = None
        print(json.dumps({"event": "KVM_STATUS", "status": "STOPPED"}))
        sys.stdout.flush()

def handle_start_sync(payload):
    global SYNC_PROCESSES
    name = payload.get("name", "stalink-sync")
    alpha = payload.get("alpha")
    beta = payload.get("beta")
    
    handle_stop_sync({"name": name})
    
    ext = ".exe" if current_os == "win32" else ""
    mutagen_name = f"mutagen{ext}"
    mutagen_dir = os.path.join(BIN_DIR, "mutagen")
    mutagen_path = os.path.join(mutagen_dir, mutagen_name)
    
    if not os.path.exists(mutagen_path):
        print(json.dumps({"event": "SYNC_STATUS", "name": name, "status": "ERROR", "message": "Mutagen binary not found."}))
        sys.stdout.flush()
        return
        
    args = [mutagen_path, "sync", "create", "--name", name, alpha, beta]
    
    creation_flags = 0
    if sys.platform == "win32":
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        
    try:
        print(json.dumps({"event": "SYNC_STATUS", "name": name, "status": "STARTING", "args": args}))
        sys.stdout.flush()
        
        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags
        )
        
        # Give mutagen a moment to start
        time.sleep(0.5)
        ret_code = proc.poll()
        if ret_code is not None and ret_code != 0:
            stderr_out = proc.stderr.read().decode("utf-8", errors="ignore").strip()
            raise RuntimeError(f"Mutagen failed to start: {stderr_out}")
            
        SYNC_PROCESSES[name] = proc
        print(json.dumps({"event": "SYNC_STATUS", "name": name, "status": "RUNNING", "pid": proc.pid}))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"event": "SYNC_STATUS", "name": name, "status": "ERROR", "message": str(e)}))
        sys.stdout.flush()

def handle_stop_sync(payload):
    global SYNC_PROCESSES
    name = payload.get("name", "stalink-sync")
    
    proc = SYNC_PROCESSES.pop(name, None)
    if proc:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
                
    # Always terminate sync session using mutagen CLI to clean state
    ext = ".exe" if current_os == "win32" else ""
    mutagen_name = f"mutagen{ext}"
    mutagen_dir = os.path.join(BIN_DIR, "mutagen")
    mutagen_path = os.path.join(mutagen_dir, mutagen_name)
    
    if os.path.exists(mutagen_path):
        args = [mutagen_path, "sync", "terminate", name]
        creation_flags = 0
        if sys.platform == "win32":
            creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        try:
            subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=creation_flags)
        except Exception:
            pass
            
    print(json.dumps({"event": "SYNC_STATUS", "name": name, "status": "STOPPED"}))
    sys.stdout.flush()

def cleanup_all():
    global KVM_PROCESS, SYNC_PROCESSES
    if KVM_PROCESS:
        try:
            KVM_PROCESS.kill()
        except Exception:
            pass
    for name, proc in list(SYNC_PROCESSES.items()):
        try:
            proc.kill()
        except Exception:
            pass

def run_stdin_reader():
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
                
            payload = json.loads(line)
            command = payload.get("command")
            
            if command == "START_KVM":
                handle_start_kvm(payload)
            elif command == "START_SYNC":
                handle_start_sync(payload)
            elif command == "STOP_KVM":
                handle_stop_kvm()
            elif command == "STOP_SYNC":
                handle_stop_sync(payload)
        except Exception as e:
            print(json.dumps({"event": "COMMAND_ERROR", "error": str(e)}))
            sys.stdout.flush()
            
    cleanup_all()
    os._exit(0)

class StalinkHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
        
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        global CONNECTED_PEER
        
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            
            bins = check_binaries()
            status_data = {
                "status": "online",
                "hostname": socket.gethostname(),
                "ip": get_local_ip(),
                "port": HTTP_PORT,
                "mutagen": bins["mutagen"],
                "deskflow": bins["deskflow"],
                "linked_peer": CONNECTED_PEER
            }
            self.wfile.write(json.dumps(status_data).encode("utf-8"))
            
        elif self.path == "/api/scan":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            
            peers = scan_local_network()
            self.wfile.write(json.dumps({"status": "success", "peers": peers}).encode("utf-8"))
            
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

    def do_POST(self):
        global CONNECTED_PEER
        
        if self.path == "/api/connect":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode("utf-8"))
                peer_hostname = payload.get("hostname")
                peer_ip = payload.get("ip")
                peer_port = payload.get("port")
                disconnect = payload.get("disconnect", False)
                
                if disconnect:
                    CONNECTED_PEER = None
                    response = {"status": "disconnected", "message": "Successfully unlinked peer."}
                else:
                    CONNECTED_PEER = {
                        "hostname": peer_hostname,
                        "ip": peer_ip,
                        "port": peer_port
                    }
                    response = {"status": "linked", "message": f"Successfully linked to {peer_hostname}"}
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(response).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

def run_udp_listener():
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if hasattr(socket, "SO_REUSEPORT"):
        try:
            udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except Exception:
            pass
            
    try:
        udp_sock.bind(("", UDP_PORT))
    except Exception as e:
        print(f"Failed to bind UDP socket to port {UDP_PORT}: {e}", file=sys.stderr)
        return

    local_ip = get_local_ip()
    while True:
        try:
            data, addr = udp_sock.recvfrom(1024)
            payload = json.loads(data.decode("utf-8"))
            if payload.get("event") == "STALINK_DISCOVER":
                # Respond back to the sender
                respond_data = {
                    "event": "STALINK_RESPOND",
                    "hostname": socket.gethostname(),
                    "ip": local_ip,
                    "port": HTTP_PORT
                }
                udp_sock.sendto(json.dumps(respond_data).encode("utf-8"), addr)
        except Exception:
            time.sleep(0.1)

def run_http_server():
    global HTTP_PORT
    server = None
    for port in range(18383, 18400):
        try:
            server = HTTPServer(("0.0.0.0", port), StalinkHTTPHandler)
            HTTP_PORT = port
            break
        except Exception:
            continue
            
    if not server:
        print("Failed to bind HTTP server to any port in range 18383-18399.", file=sys.stderr)
        sys.exit(1)
        
    # Notify parent process of selected port
    print(json.dumps({"event": "INSTANCE_STARTED", "port": HTTP_PORT}))
    sys.stdout.flush()
    
    server.serve_forever()

if __name__ == "__main__":
    # Start UDP listener thread
    udp_thread = threading.Thread(target=run_udp_listener, daemon=True)
    udp_thread.start()
    
    # Start Stdin reader thread
    stdin_thread = threading.Thread(target=run_stdin_reader, daemon=True)
    stdin_thread.start()
    
    # Run HTTP server in main thread
    run_http_server()
