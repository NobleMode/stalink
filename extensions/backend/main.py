import os
import sys
import json
import socket
import threading
import time
import shutil
import atexit
import signal
import subprocess
import urllib.request
import zipfile
import tarfile
from http.server import BaseHTTPRequestHandler, HTTPServer

# Import environment detection utility
try:
    from env_detector import (
        get_full_environment_profile,
        get_binary_arch,
        get_local_ip
    )
except ImportError:
    from .env_detector import (
        get_full_environment_profile,
        get_binary_arch,
        get_local_ip
    )

# Base directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_BASE_DIR = os.path.join(BASE_DIR, "bin")
CURRENT_OS = sys.platform
PLATFORM_DIR = "windows" if CURRENT_OS == "win32" else "linux"
BIN_DIR = os.path.join(BIN_BASE_DIR, PLATFORM_DIR)

# Network ports and state
HTTP_PORT = 18383
UDP_PORT = 18382
CONNECTED_PEER = None
ENV_DATA = None

# Subprocess tracking
KVM_PROCESS = None
SYNC_PROCESSES = {}
WEB_SERVER_PROC = None
TUNNEL_PROC = None
DOWNLOAD_CANCELLED = False

# Default Mutagen ignore rules
DEFAULT_SYNC_IGNORES = [
    ".idea/",
    ".vs/",
    ".godot/",
    "Library/",
    "node_modules/",
    "bin/",
    "obj/",
    ".git/"
]

def emit_event(event_name, data=None, **kwargs):
    payload = {"event": event_name}
    if data is not None:
        if isinstance(data, dict):
            payload.update(data)
        else:
            payload["payload"] = data
    if kwargs:
        payload.update(kwargs)
    print(json.dumps(payload), flush=True)

# ----------------------------------------------------------------------
# Process Lifecycle & Teardown Management
# ----------------------------------------------------------------------

def cleanup_all_processes():
    global KVM_PROCESS, SYNC_PROCESSES, TUNNEL_PROC
    # Stop KVM
    if KVM_PROCESS:
        try:
            KVM_PROCESS.terminate()
            KVM_PROCESS.wait(timeout=1.5)
        except Exception:
            try:
                KVM_PROCESS.kill()
            except Exception:
                pass
        KVM_PROCESS = None

    # Stop all Mutagen sync processes
    for name, proc in list(SYNC_PROCESSES.items()):
        try:
            proc.terminate()
            proc.wait(timeout=1.5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        # Also terminate mutagen session via CLI
        terminate_mutagen_cli(name)
    SYNC_PROCESSES.clear()

    # Stop WAN Tunnel
    if TUNNEL_PROC:
        try:
            TUNNEL_PROC.terminate()
            TUNNEL_PROC.wait(timeout=1.5)
        except Exception:
            try:
                TUNNEL_PROC.kill()
            except Exception:
                pass
        TUNNEL_PROC = None

def signal_handler(signum, frame):
    cleanup_all_processes()
    os._exit(0)

atexit.register(cleanup_all_processes)
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def get_creation_flags():
    if CURRENT_OS == "win32":
        return getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return 0

# ----------------------------------------------------------------------
# Phase 2: Binary Auto-Installer & Unpacker
# ----------------------------------------------------------------------

def extract_deb(deb_path, extract_dir):
    with open(deb_path, "rb") as f:
        signature = f.read(8)
        if signature != b"!<arch>\n":
            raise ValueError("Invalid .deb archive (missing !<arch> signature)")
        while True:
            header = f.read(60)
            if len(header) < 60:
                break
            name = header[0:16].strip().decode("ascii")
            size_str = header[48:58].strip().decode("ascii")
            if not size_str:
                break
            size = int(size_str)
            data_size = size
            if size % 2 != 0:
                size += 1
            data = f.read(size)
            if name.startswith("data.tar"):
                temp_tar = os.path.join(extract_dir, name)
                with open(temp_tar, "wb") as out:
                    out.write(data[:data_size])
                with tarfile.open(temp_tar) as tar_ref:
                    tar_ref.extractall(extract_dir)
                try:
                    os.remove(temp_tar)
                except Exception:
                    pass
                break

def extract_archive(archive_path, dest_dir):
    temp_dir = os.path.join(os.path.dirname(archive_path), "temp_extract")
    os.makedirs(temp_dir, exist_ok=True)
    filename = os.path.basename(archive_path)

    if filename.endswith(".zip"):
        with zipfile.ZipFile(archive_path, "r") as zip_ref:
            zip_ref.extractall(temp_dir)
    elif filename.endswith(".tar.gz") or filename.endswith(".tgz"):
        with tarfile.open(archive_path, "r:gz") as tar_ref:
            tar_ref.extractall(temp_dir)
    elif filename.endswith(".deb"):
        extract_deb(archive_path, temp_dir)
    else:
        # Direct binary
        dest_binary = os.path.join(dest_dir, filename)
        shutil.copy2(archive_path, dest_binary)
        return

    # Move extracted contents to dest_dir
    os.makedirs(dest_dir, exist_ok=True)
    src_dir = temp_dir
    items = os.listdir(temp_dir)
    if len(items) == 1 and os.path.isdir(os.path.join(temp_dir, items[0])):
        if items[0] != "usr":
            src_dir = os.path.join(temp_dir, items[0])

    for item in os.listdir(src_dir):
        s = os.path.join(src_dir, item)
        d = os.path.join(dest_dir, item)
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.move(s, d)
        else:
            if os.path.exists(d):
                os.remove(d)
            shutil.move(s, d)

    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)

KNOWN_SIZES = {
    "mutagen": 102172827 if CURRENT_OS != "win32" else 92 * 1024 * 1024,
    "deskflow": 25 * 1024 * 1024 if CURRENT_OS == "win32" else 3 * 1024 * 1024,
    "cloudflared": 38 * 1024 * 1024
}

def get_remote_file_size(url, curl_bin=None):
    if curl_bin:
        try:
            res = subprocess.run(
                [curl_bin, "-sIL", "--connect-timeout", "6", "-m", "8", url],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if res.returncode == 0:
                for line in reversed(res.stdout.splitlines()):
                    if line.lower().startswith("content-length:"):
                        val = line.split(":", 1)[1].strip()
                        if val.isdigit() and int(val) > 1000:
                            return int(val)
        except Exception:
            pass
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'},
            method="HEAD"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            cl = resp.headers.get("Content-Length")
            if cl and cl.isdigit() and int(cl) > 1000:
                return int(cl)
    except Exception:
        pass
    return 0

def get_candidate_urls(url):
    candidates = []
    if "github.com" in url:
        # High-speed regional CDN edge mirrors first
        candidates.append(f"https://ghproxy.net/{url}")
        candidates.append(f"https://mirror.ghproxy.com/{url}")
        candidates.append(f"https://gh-proxy.com/{url}")
    # Direct URL
    candidates.append(url)
    return candidates

def download_file(url, dest_path, app_id="", app_name="Dependency", step=""):
    global DOWNLOAD_CANCELLED
    dest_dir = os.path.dirname(dest_path)
    os.makedirs(dest_dir, exist_ok=True)
    filename = os.path.basename(dest_path)
    prefix = f"[{step}] " if step else ""

    emit_event("INSTALLER_PROGRESS",
        app_id=app_id,
        app_name=app_name,
        step=step,
        percent=0,
        transferred_mb=0,
        total_mb=0,
        log=f"{prefix}Resolving multi-connection mirrors for {app_name} ({filename})..."
    )

    aria2c_bin = shutil.which("aria2c")
    curl_bin = shutil.which("curl")
    candidate_urls = get_candidate_urls(url)

    total_size = get_remote_file_size(url, curl_bin)
    if total_size <= 0:
        total_size = KNOWN_SIZES.get(app_id, 0)
    total_mb = round(total_size / (1024 * 1024), 1) if total_size > 0 else 0

    download_success = False
    last_error = None

    # Clean partial target & control files
    for f in [dest_path, dest_path + ".aria2"]:
        if os.path.exists(f):
            try:
                os.remove(f)
            except Exception:
                pass

    # 1. Super-Speed Tier: aria2c multi-connection parallel segment downloader
    if aria2c_bin and not download_success:
        try:
            emit_event("INSTALLER_PROGRESS",
                app_id=app_id,
                app_name=app_name,
                step=step,
                percent=0,
                transferred_mb=0,
                total_mb=total_mb,
                log=f"{prefix}Engaging 16-channel accelerated engine for {app_name}..."
            )

            cmd = [
                aria2c_bin,
                "-x", "16",
                "-s", "16",
                "-j", "4",
                "-k", "1M",
                "--min-split-size=1M",
                "--connect-timeout=8",
                "--timeout=25",
                "--max-tries=3",
                "--retry-wait=1",
                "--allow-overwrite=true",
                "--auto-file-renaming=false",
                "--file-allocation=none",
                "--check-certificate=false",
                "-d", dest_dir,
                "-o", filename,
            ] + candidate_urls

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=get_creation_flags()
            )

            last_bytes = 0
            last_time = time.time()
            speed_mb = 0.0
            last_emitted_percent = -1
            last_emitted_time = 0.0
            last_emitted_bytes = -1
            finalizing_emitted = False

            while proc.poll() is None:
                if DOWNLOAD_CANCELLED:
                    proc.terminate()
                    try:
                        proc.wait(timeout=1.0)
                    except Exception:
                        proc.kill()
                    for f in [dest_path, dest_path + ".aria2"]:
                        if os.path.exists(f):
                            try:
                                os.remove(f)
                            except Exception:
                                pass
                    raise RuntimeError("Download cancelled by user")

                time.sleep(0.25)
                if os.path.exists(dest_path):
                    cur_bytes = os.path.getsize(dest_path)
                    now = time.time()
                    dt = now - last_time
                    if dt >= 0.5:
                        speed_mb = round(((cur_bytes - last_bytes) / dt) / (1024 * 1024), 1)
                        last_bytes = cur_bytes
                        last_time = now

                    cur_mb = round(cur_bytes / (1024 * 1024), 1)
                    if total_size > 0 and cur_bytes >= total_size:
                        percent = 100
                        cur_mb = total_mb
                        if not finalizing_emitted:
                            finalizing_emitted = True
                            emit_event("INSTALLER_PROGRESS",
                                app_id=app_id,
                                app_name=app_name,
                                step=step,
                                percent=100,
                                transferred_mb=total_mb,
                                total_mb=total_mb,
                                speed_mb_s=0.0,
                                log=f"{prefix}Finalizing {app_name} ({total_mb}/{total_mb} MB)..."
                            )
                    else:
                        percent = max(0, min(99, int((cur_bytes * 100) / total_size))) if total_size > 0 else 0
                        speed_str = f" @ {speed_mb} MB/s" if speed_mb > 0 else ""
                        if percent != last_emitted_percent or (now - last_emitted_time >= 1.0 and cur_bytes != last_emitted_bytes):
                            last_emitted_percent = percent
                            last_emitted_time = now
                            last_emitted_bytes = cur_bytes
                            emit_event("INSTALLER_PROGRESS",
                                app_id=app_id,
                                app_name=app_name,
                                step=step,
                                percent=percent,
                                transferred_mb=cur_mb,
                                total_mb=total_mb,
                                speed_mb_s=speed_mb,
                                log=f"{prefix}Downloading {app_name}: {percent}% ({cur_mb}/{total_mb} MB){speed_str}"
                            )

            stdout_data, stderr_data = proc.communicate()
            aria_ctrl = dest_path + ".aria2"
            if os.path.exists(aria_ctrl):
                try:
                    os.remove(aria_ctrl)
                except Exception:
                    pass

            if proc.returncode == 0 and os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000:
                download_success = True
                final_bytes = os.path.getsize(dest_path)
                final_mb = round(final_bytes / (1024 * 1024), 1)
                emit_event("INSTALLER_PROGRESS",
                    app_id=app_id,
                    app_name=app_name,
                    step=step,
                    percent=100,
                    transferred_mb=final_mb,
                    total_mb=final_mb,
                    log=f"{prefix}Downloaded {app_name} successfully ({final_mb} MB)."
                )
            else:
                last_error = f"aria2c exit {proc.returncode}: {stderr_data.decode('utf-8', errors='ignore')}"
        except Exception as e:
            last_error = str(e)
            if DOWNLOAD_CANCELLED:
                raise

    # 2. Secondary Tier: curl with fast mirrors first & instant speed watchdog
    if not download_success and curl_bin and not DOWNLOAD_CANCELLED:
        for attempt_url in candidate_urls:
            if DOWNLOAD_CANCELLED:
                raise RuntimeError("Download cancelled by user")

            desc = "Accelerated Mirror" if "ghproxy" in attempt_url or "gh-proxy" in attempt_url else "Direct CDN"
            if os.path.exists(dest_path):
                try:
                    os.remove(dest_path)
                except Exception:
                    pass

            emit_event("INSTALLER_PROGRESS",
                app_id=app_id,
                app_name=app_name,
                step=step,
                percent=0,
                transferred_mb=0,
                total_mb=total_mb,
                log=f"{prefix}Connecting to {app_name} via {desc}..."
            )

            cmd = [
                curl_bin,
                "-L",
                "--fail",
                "--connect-timeout", "10",
                "-o", dest_path,
                attempt_url
            ]

            try:
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    creationflags=get_creation_flags()
                )

                start_t = time.time()
                last_bytes = 0
                last_time = start_t
                speed_mb = 0.0
                stalled = False
                last_emitted_percent = -1
                last_emitted_time = 0.0
                last_emitted_bytes = -1
                finalizing_emitted = False

                while proc.poll() is None:
                    if DOWNLOAD_CANCELLED:
                        proc.terminate()
                        try:
                            proc.wait(timeout=1.0)
                        except Exception:
                            proc.kill()
                        if os.path.exists(dest_path):
                            try:
                                os.remove(dest_path)
                            except Exception:
                                pass
                        raise RuntimeError("Download cancelled by user")

                    time.sleep(0.25)
                    if os.path.exists(dest_path):
                        cur_bytes = os.path.getsize(dest_path)
                        now = time.time()
                        dt = now - last_time
                        if dt >= 0.5:
                            speed_mb = round(((cur_bytes - last_bytes) / dt) / (1024 * 1024), 1)
                            last_bytes = cur_bytes
                            last_time = now

                        # Active watchdog: If after 5s downloaded < 500KB (< 100 KB/s), drop connection and switch mirror
                        if (now - start_t) >= 5.0 and cur_bytes < 500 * 1024 and len(candidate_urls) > 1:
                            stalled = True
                            proc.terminate()
                            try:
                                proc.wait(timeout=1.0)
                            except Exception:
                                proc.kill()
                            emit_event("INSTALLER_PROGRESS",
                                app_id=app_id,
                                app_name=app_name,
                                step=step,
                                percent=0,
                                log=f"{prefix}Transfer too slow (< 100 KB/s) on {desc}. Switching to next route..."
                            )
                            break

                        cur_mb = round(cur_bytes / (1024 * 1024), 1)
                        if total_size > 0 and cur_bytes >= total_size:
                            percent = 100
                            cur_mb = total_mb
                            if not finalizing_emitted:
                                finalizing_emitted = True
                                emit_event("INSTALLER_PROGRESS",
                                    app_id=app_id,
                                    app_name=app_name,
                                    step=step,
                                    percent=100,
                                    transferred_mb=total_mb,
                                    total_mb=total_mb,
                                    speed_mb_s=0.0,
                                    log=f"{prefix}Finalizing {app_name} ({total_mb}/{total_mb} MB)..."
                                )
                        else:
                            percent = max(0, min(99, int((cur_bytes * 100) / total_size))) if total_size > 0 else 0
                            speed_str = f" @ {speed_mb} MB/s" if speed_mb > 0 else ""
                            if percent != last_emitted_percent or (now - last_emitted_time >= 1.0 and cur_bytes != last_emitted_bytes):
                                last_emitted_percent = percent
                                last_emitted_time = now
                                last_emitted_bytes = cur_bytes
                                emit_event("INSTALLER_PROGRESS",
                                    app_id=app_id,
                                    app_name=app_name,
                                    step=step,
                                    percent=percent,
                                    transferred_mb=cur_mb,
                                    total_mb=total_mb,
                                    speed_mb_s=speed_mb,
                                    log=f"{prefix}Downloading {app_name}: {percent}% ({cur_mb}/{total_mb} MB){speed_str}"
                                )

                if stalled:
                    continue

                stdout_data, stderr_data = proc.communicate()
                if proc.returncode == 0 and os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000:
                    download_success = True
                    final_bytes = os.path.getsize(dest_path)
                    final_mb = round(final_bytes / (1024 * 1024), 1)
                    emit_event("INSTALLER_PROGRESS",
                        app_id=app_id,
                        app_name=app_name,
                        step=step,
                        percent=100,
                        transferred_mb=final_mb,
                        total_mb=final_mb,
                        log=f"{prefix}Successfully downloaded {app_name} ({final_mb} MB)."
                    )
                    break
                else:
                    last_error = f"curl exit {proc.returncode}: {stderr_data.decode('utf-8', errors='ignore')}"
            except Exception as e:
                last_error = str(e)
                if DOWNLOAD_CANCELLED:
                    raise

    # 3. Tertiary Tier: Python urllib fallback
    if not download_success and not DOWNLOAD_CANCELLED:
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
        }
        for attempt_url in candidate_urls:
            if DOWNLOAD_CANCELLED:
                raise RuntimeError("Download cancelled by user")
            if os.path.exists(dest_path):
                try:
                    os.remove(dest_path)
                except Exception:
                    pass

            try:
                emit_event("INSTALLER_PROGRESS",
                    app_id=app_id,
                    app_name=app_name,
                    step=step,
                    percent=0,
                    transferred_mb=0,
                    total_mb=total_mb,
                    log=f"{prefix}Streaming {app_name} via Python network layer..."
                )
                req = urllib.request.Request(attempt_url, headers=headers)
                with urllib.request.urlopen(req, timeout=15) as resp:
                    cl = resp.headers.get('Content-Length')
                    if cl and cl.isdigit() and int(cl) > 1000:
                        total_size = int(cl)
                        total_mb = round(total_size / (1024 * 1024), 1)

                    downloaded = 0
                    last_time = time.time()
                    last_bytes = 0
                    chunk_size = 1024 * 1024
                    last_emitted_percent = -1
                    last_emitted_time = 0.0
                    last_emitted_bytes = -1
                    finalizing_emitted = False

                    with open(dest_path, 'wb') as out_f:
                        while True:
                            if DOWNLOAD_CANCELLED:
                                raise RuntimeError("Download cancelled by user")
                            chunk = resp.read(chunk_size)
                            if not chunk:
                                break
                            out_f.write(chunk)
                            downloaded += len(chunk)

                            now = time.time()
                            cur_mb = round(downloaded / (1024 * 1024), 1)
                            dt = now - last_time
                            speed_mb = 0.0
                            if dt >= 0.5:
                                speed_mb = round(((downloaded - last_bytes) / dt) / (1024 * 1024), 1)
                                last_bytes = downloaded
                                last_time = now

                            if total_size > 0 and downloaded >= total_size:
                                percent = 100
                                cur_mb = total_mb
                                if not finalizing_emitted:
                                    finalizing_emitted = True
                                    emit_event("INSTALLER_PROGRESS",
                                        app_id=app_id,
                                        app_name=app_name,
                                        step=step,
                                        percent=100,
                                        transferred_mb=total_mb,
                                        total_mb=total_mb,
                                        speed_mb_s=0.0,
                                        log=f"{prefix}Finalizing {app_name} ({total_mb}/{total_mb} MB)..."
                                    )
                            else:
                                percent = max(0, min(99, int((downloaded * 100) / total_size))) if total_size > 0 else 0
                                speed_str = f" @ {speed_mb} MB/s" if speed_mb > 0 else ""
                                if percent != last_emitted_percent or (now - last_emitted_time >= 1.0 and downloaded != last_emitted_bytes):
                                    last_emitted_percent = percent
                                    last_emitted_time = now
                                    last_emitted_bytes = downloaded
                                    emit_event("INSTALLER_PROGRESS",
                                        app_id=app_id,
                                        app_name=app_name,
                                        step=step,
                                        percent=percent,
                                        transferred_mb=cur_mb,
                                        total_mb=total_mb,
                                        speed_mb_s=speed_mb,
                                        log=f"{prefix}Downloading {app_name}: {percent}% ({cur_mb}/{total_mb} MB){speed_str}"
                                    )

                    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000:
                        download_success = True
                        final_mb = round(os.path.getsize(dest_path) / (1024 * 1024), 1)
                        emit_event("INSTALLER_PROGRESS",
                            app_id=app_id,
                            app_name=app_name,
                            step=step,
                            percent=100,
                            transferred_mb=final_mb,
                            total_mb=final_mb,
                            log=f"{prefix}Successfully downloaded {app_name} ({final_mb} MB)."
                        )
                        break
            except Exception as e:
                last_error = str(e)
                if os.path.exists(dest_path):
                    try:
                        os.remove(dest_path)
                    except Exception:
                        pass

    if not download_success:
        raise RuntimeError(f"Failed to download {app_name}: {last_error}")

def get_binary_paths():
    ext = ".exe" if CURRENT_OS == "win32" else ""
    mutagen_dir = os.path.join(BIN_DIR, "mutagen")
    deskflow_dir = os.path.join(BIN_DIR, "deskflow")
    cloudflared_dir = os.path.join(BIN_DIR, "cloudflared")

    mutagen_bin = os.path.join(mutagen_dir, f"mutagen{ext}")
    mutagen_agents = os.path.join(mutagen_dir, "mutagen-agents.tar.gz")

    if CURRENT_OS == "win32":
        deskflow_core_bin = os.path.join(deskflow_dir, f"deskflow-core{ext}")
        deskflow_bin = os.path.join(deskflow_dir, f"deskflow{ext}")
    else:
        deskflow_core_bin = os.path.join(deskflow_dir, "usr", "bin", f"deskflow-core{ext}")
        deskflow_bin = os.path.join(deskflow_dir, "usr", "bin", f"deskflow{ext}")

    cloudflared_bin = os.path.join(cloudflared_dir, f"cloudflared{ext}")

    return {
        "mutagen_dir": mutagen_dir,
        "mutagen_bin": mutagen_bin,
        "mutagen_agents": mutagen_agents,
        "deskflow_dir": deskflow_dir,
        "deskflow_core_bin": deskflow_core_bin,
        "deskflow_bin": deskflow_bin,
        "cloudflared_dir": cloudflared_dir,
        "cloudflared_bin": cloudflared_bin
    }

def check_binaries():
    paths = get_binary_paths()
    mutagen_ok = os.path.exists(paths["mutagen_bin"]) and os.path.exists(paths["mutagen_agents"])
    deskflow_ok = os.path.exists(paths["deskflow_core_bin"]) or os.path.exists(paths["deskflow_bin"])
    cloudflared_ok = os.path.exists(paths["cloudflared_bin"])

    return {
        "mutagen": "installed" if mutagen_ok else "missing",
        "deskflow": "installed" if deskflow_ok else "missing",
        "cloudflared": "installed" if cloudflared_ok else "missing",
        "all_ready": mutagen_ok and deskflow_ok and cloudflared_ok
    }

def inspect_and_emit_binaries():
    os.makedirs(BIN_DIR, exist_ok=True)
    status = check_binaries()
    emit_event("BINARY_STATUS", status)
    if status["all_ready"]:
        emit_event("INSTALLER_STATUS", status="COMPLETE", payload="All core binaries verified.")
        emit_event("INSTALLER_READY")
    else:
        missing_names = [k.capitalize() for k, v in status.items() if k != "all_ready" and v == "missing"]
        emit_event("INSTALLER_STATUS", status="MISSING", payload=f"Missing dependencies: {', '.join(missing_names)}")
    return status

def ensure_binaries_exist():
    os.makedirs(BIN_DIR, exist_ok=True)
    paths = get_binary_paths()
    status = check_binaries()
    emit_event("BINARY_STATUS", status)

    if status["all_ready"]:
        emit_event("INSTALLER_STATUS", status="COMPLETE", payload="All core binaries verified.")
        emit_event("INSTALLER_READY")
        return True

    emit_event("INSTALLER_STATUS", status="INSTALLING", payload="Initiating download for required dependencies...")
    bin_arch = get_binary_arch()

    temp_download_dir = os.path.join(BIN_BASE_DIR, "temp_download")
    os.makedirs(temp_download_dir, exist_ok=True)

    try:
        # 1. Mutagen
        if status["mutagen"] != "installed":
            emit_event("INSTALLER_STATUS", status="INSTALLING", payload="[1/3] Downloading Mutagen Sync Engine...")
            if CURRENT_OS == "win32":
                mutagen_url = f"https://github.com/mutagen-io/mutagen/releases/download/v0.18.1/mutagen_windows_{bin_arch}_v0.18.1.zip"
                archive_name = "mutagen.zip"
            else:
                mutagen_url = f"https://github.com/mutagen-io/mutagen/releases/download/v0.18.1/mutagen_linux_{bin_arch}_v0.18.1.tar.gz"
                archive_name = "mutagen.tar.gz"

            archive_path = os.path.join(temp_download_dir, archive_name)
            download_file(mutagen_url, archive_path, app_id="mutagen", app_name="Mutagen Sync Engine", step="1/3")
            emit_event("INSTALLER_PROGRESS", app_id="mutagen", app_name="Mutagen Sync Engine", step="1/3", percent=100, log="[1/3] Extracting Mutagen archive...")
            extract_archive(archive_path, paths["mutagen_dir"])
            if os.path.exists(archive_path):
                os.remove(archive_path)
            if CURRENT_OS == "linux" and os.path.exists(paths["mutagen_bin"]):
                try:
                    os.chmod(paths["mutagen_bin"], 0o755)
                except Exception:
                    pass
            status = check_binaries()
            emit_event("BINARY_STATUS", status)
            emit_event("INSTALLER_PROGRESS", app_id="mutagen", app_name="Mutagen Sync Engine", step="1/3", percent=100, installed=True, log="[1/3] Mutagen Sync Engine installed.")

        # 2. Deskflow
        if status["deskflow"] != "installed":
            emit_event("INSTALLER_STATUS", status="INSTALLING", payload="[2/3] Downloading Deskflow KVM switch...")
            if CURRENT_OS == "win32":
                deskflow_url = "https://github.com/deskflow/deskflow/releases/download/v1.26.0/deskflow-1.26.0-win-x64-portable.zip"
                archive_name = "deskflow.zip"
            else:
                deskflow_url = "https://github.com/deskflow/deskflow/releases/download/v1.26.0/deskflow-1.26.0-ubuntu-resolute-x86_64.deb"
                archive_name = "deskflow.deb"

            archive_path = os.path.join(temp_download_dir, archive_name)
            download_file(deskflow_url, archive_path, app_id="deskflow", app_name="Deskflow KVM Switch", step="2/3")
            emit_event("INSTALLER_PROGRESS", app_id="deskflow", app_name="Deskflow KVM Switch", step="2/3", percent=100, log="[2/3] Extracting Deskflow package...")
            extract_archive(archive_path, paths["deskflow_dir"])
            if os.path.exists(archive_path):
                os.remove(archive_path)
            for b in [paths["deskflow_core_bin"], paths["deskflow_bin"]]:
                if CURRENT_OS == "linux" and os.path.exists(b):
                    try:
                        os.chmod(b, 0o755)
                    except Exception:
                        pass
            status = check_binaries()
            emit_event("BINARY_STATUS", status)
            emit_event("INSTALLER_PROGRESS", app_id="deskflow", app_name="Deskflow KVM Switch", step="2/3", percent=100, installed=True, log="[2/3] Deskflow KVM Switch installed.")

        # 3. Cloudflared
        if status["cloudflared"] != "installed":
            emit_event("INSTALLER_STATUS", status="INSTALLING", payload="[3/3] Downloading Cloudflare Tunnel CLI...")
            if CURRENT_OS == "win32":
                cloudflared_url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
                filename = "cloudflared.exe"
            else:
                cloudflared_url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{bin_arch}"
                filename = "cloudflared"

            os.makedirs(paths["cloudflared_dir"], exist_ok=True)
            download_file(cloudflared_url, paths["cloudflared_bin"], app_id="cloudflared", app_name="Cloudflare Tunnel CLI", step="3/3")
            if CURRENT_OS == "linux" and os.path.exists(paths["cloudflared_bin"]):
                try:
                    os.chmod(paths["cloudflared_bin"], 0o755)
                except Exception:
                    pass
            status = check_binaries()
            emit_event("BINARY_STATUS", status)
            emit_event("INSTALLER_PROGRESS", app_id="cloudflared", app_name="Cloudflare Tunnel CLI", step="3/3", percent=100, installed=True, log="[3/3] Cloudflare Tunnel CLI installed.")

        # Final check and permissions pass
        if CURRENT_OS == "linux":
            for b in [paths["mutagen_bin"], paths["deskflow_core_bin"], paths["deskflow_bin"], paths["cloudflared_bin"]]:
                if os.path.exists(b):
                    try:
                        os.chmod(b, 0o755)
                    except Exception:
                        pass

        emit_event("BINARY_STATUS", check_binaries())
        emit_event("INSTALLER_STATUS", status="COMPLETE", payload="All core systems verified and ready.")
        emit_event("INSTALLER_READY")
        return True

    except Exception as e:
        emit_event("INSTALLER_STATUS", status="ERROR", payload=f"Binary installation error: {str(e)}")
        return False
    finally:
        if os.path.exists(temp_download_dir):
            shutil.rmtree(temp_download_dir, ignore_errors=True)

# ----------------------------------------------------------------------
# Phase 3: Process Execution & Subprocess Automation
# ----------------------------------------------------------------------

def get_deskflow_executable():
    paths = get_binary_paths()
    if os.path.exists(paths["deskflow_core_bin"]):
        return paths["deskflow_core_bin"], True
    elif os.path.exists(paths["deskflow_bin"]):
        return paths["deskflow_bin"], False
    return None, False

def handle_start_kvm(payload):
    global KVM_PROCESS
    handle_stop_kvm()

    role = payload.get("role", "server").lower()
    address = payload.get("address", "0.0.0.0:24800")
    server_address = payload.get("server_address", "")
    config_path = payload.get("config_path", "")

    exe_path, is_core = get_deskflow_executable()
    if not exe_path:
        emit_event("KVM_STATUS", status="ERROR", message="Deskflow binary not found.")
        return

    if is_core:
        if role == "server":
            args = [exe_path, "--server", "--address", address]
            if config_path:
                args += ["--config", config_path]
        else:
            target = server_address or address
            args = [exe_path, "client", target]
    else:
        args = [exe_path, role]
        if role == "server":
            if address:
                args += ["--address", address]
            if config_path:
                args += ["--config", config_path]
        elif role == "client":
            target = server_address or address
            if target:
                args += [target]

    creation_flags = get_creation_flags()
    try:
        emit_event("KVM_STATUS", status="STARTING", args=args, role=role)
        KVM_PROCESS = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags
        )
        emit_event("KVM_STATUS", status="RUNNING", pid=KVM_PROCESS.pid, role=role)
    except Exception as e:
        emit_event("KVM_STATUS", status="ERROR", message=str(e))

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
        emit_event("KVM_STATUS", status="STOPPED")

def terminate_mutagen_cli(name):
    paths = get_binary_paths()
    if os.path.exists(paths["mutagen_bin"]):
        try:
            subprocess.run(
                [paths["mutagen_bin"], "sync", "terminate", name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=get_creation_flags(),
                timeout=3
            )
        except Exception:
            pass

def handle_start_sync(payload):
    global SYNC_PROCESSES
    name = payload.get("name", "stalink-session")
    local_path = payload.get("local_path") or payload.get("alpha")
    remote_target = payload.get("remote_target") or payload.get("beta")
    custom_ignores = payload.get("ignores", [])

    if not local_path or not remote_target:
        emit_event("SYNC_STATUS", name=name, status="ERROR", message="local_path and remote_target are required.")
        return

    handle_stop_sync({"name": name})

    paths = get_binary_paths()
    if not os.path.exists(paths["mutagen_bin"]):
        emit_event("SYNC_STATUS", name=name, status="ERROR", message="Mutagen binary not found.")
        return

    args = [paths["mutagen_bin"], "sync", "create", local_path, remote_target, f"--name={name}"]

    # Apply default ignore rules
    ignores = list(DEFAULT_SYNC_IGNORES)
    if custom_ignores:
        ignores.extend(custom_ignores)
    for rule in ignores:
        args.append(f"--ignore={rule}")

    creation_flags = get_creation_flags()
    try:
        emit_event("SYNC_STATUS", name=name, status="STARTING", args=args)
        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=creation_flags
        )
        time.sleep(0.5)
        ret_code = proc.poll()
        if ret_code is not None and ret_code != 0:
            err_output = proc.stderr.read().decode("utf-8", errors="ignore").strip()
            raise RuntimeError(f"Mutagen failed to initialize: {err_output}")

        SYNC_PROCESSES[name] = proc
        emit_event("SYNC_STATUS", name=name, status="RUNNING", pid=proc.pid)
    except Exception as e:
        emit_event("SYNC_STATUS", name=name, status="ERROR", message=str(e))

def handle_stop_sync(payload):
    global SYNC_PROCESSES
    name = payload.get("name", "stalink-session")
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
    terminate_mutagen_cli(name)
    emit_event("SYNC_STATUS", name=name, status="STOPPED")

def handle_stop_all():
    cleanup_all_processes()
    emit_event("ALL_STOPPED", status="CLEAN")

# ----------------------------------------------------------------------
# Local Network Hub & Discovery Endpoints
# ----------------------------------------------------------------------

def scan_local_network():
    peers = []
    local_ip = get_local_ip()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.settimeout(1.2)

    discover_msg = json.dumps({"event": "STALINK_DISCOVER", "sender_ip": local_ip, "sender_port": HTTP_PORT})
    try:
        sock.sendto(discover_msg.encode("utf-8"), ("255.255.255.255", UDP_PORT))
    except Exception as e:
        pass

    start_time = time.time()
    while time.time() - start_time < 1.5:
        try:
            data, addr = sock.recvfrom(2048)
            payload = json.loads(data.decode("utf-8"))
            if payload.get("event") == "STALINK_RESPOND":
                peer_ip = payload.get("ip")
                peer_port = payload.get("port")
                peer_hostname = payload.get("hostname")
                if not any(p["ip"] == peer_ip and p["port"] == peer_port for p in peers):
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
        global CONNECTED_PEER, ENV_DATA
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
                "cloudflared": bins["cloudflared"],
                "linked_peer": CONNECTED_PEER,
                "env": ENV_DATA
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
        return

    local_ip = get_local_ip()
    while True:
        try:
            data, addr = udp_sock.recvfrom(1024)
            payload = json.loads(data.decode("utf-8"))
            if payload.get("event") == "STALINK_DISCOVER":
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
        sys.exit(1)

    emit_event("INSTANCE_STARTED", port=HTTP_PORT)
    server.serve_forever()

# ----------------------------------------------------------------------
# Standard Input Command Reader Loop
# ----------------------------------------------------------------------

IS_DOWNLOADING = False
DOWNLOAD_LOCK = threading.Lock()

def start_download_thread():
    global IS_DOWNLOADING, DOWNLOAD_CANCELLED
    DOWNLOAD_CANCELLED = False
    with DOWNLOAD_LOCK:
        if IS_DOWNLOADING:
            return
        IS_DOWNLOADING = True

    def _worker():
        global IS_DOWNLOADING
        try:
            ensure_binaries_exist()
        finally:
            with DOWNLOAD_LOCK:
                IS_DOWNLOADING = False

    t = threading.Thread(target=_worker, daemon=True)
    t.start()

def handle_force_retry():
    global DOWNLOAD_CANCELLED
    DOWNLOAD_CANCELLED = True
    time.sleep(0.3)
    DOWNLOAD_CANCELLED = False

    paths = get_binary_paths()
    for d in [paths["mutagen_dir"], paths["deskflow_dir"], paths["cloudflared_dir"], os.path.join(BIN_BASE_DIR, "temp_download")]:
        if os.path.exists(d):
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
    inspect_and_emit_binaries()
    start_download_thread()

def handle_cancel_install():
    global DOWNLOAD_CANCELLED
    DOWNLOAD_CANCELLED = True
    temp_download_dir = os.path.join(BIN_BASE_DIR, "temp_download")
    if os.path.exists(temp_download_dir):
        shutil.rmtree(temp_download_dir, ignore_errors=True)
    emit_event("INSTALLER_STATUS", status="CANCELLED", payload="Installation cancelled.")

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
            data_payload = payload.get("data") if isinstance(payload.get("data"), dict) else {}
            command = (
                payload.get("command") or 
                payload.get("action") or 
                payload.get("event") or
                data_payload.get("command") or 
                data_payload.get("action") or
                data_payload.get("event")
            )

            if command == "START_KVM":
                handle_start_kvm(payload)
            elif command == "STOP_KVM":
                handle_stop_kvm()
            elif command == "START_SYNC":
                handle_start_sync(payload)
            elif command == "STOP_SYNC":
                handle_stop_sync(payload)
            elif command == "STOP_ALL":
                handle_stop_all()
            elif command == "GET_ENV":
                emit_event("ENV_INFO", ENV_DATA)
            elif command in ["START_DOWNLOAD", "DOWNLOAD_BINARIES", "ENSURE_BINARIES"]:
                start_download_thread()
            elif command in ["forceRetry", "FORCE_RETRY", "FORCE_REINSTALL"]:
                handle_force_retry()
            elif command in ["cancelInstall", "CANCEL_INSTALL"]:
                handle_cancel_install()
            elif command == "CHECK_BINARIES":
                inspect_and_emit_binaries()
        except Exception as e:
            emit_event("COMMAND_ERROR", error=str(e))

    cleanup_all_processes()
    os._exit(0)

# ----------------------------------------------------------------------
# Main Entry Point
# ----------------------------------------------------------------------

if __name__ == "__main__":
    # Check CLI options for testing
    if "--check-only" in sys.argv:
        ENV_DATA = get_full_environment_profile()
        emit_event("ENV_INFO", ENV_DATA)
        inspect_and_emit_binaries()
        sys.exit(0)
    elif "--ipc-test" in sys.argv:
        ENV_DATA = get_full_environment_profile()
        emit_event("ENV_INFO", ENV_DATA)
        run_stdin_reader()
        sys.exit(0)

    # 1. Detect & emit environment specs
    ENV_DATA = get_full_environment_profile()
    emit_event("ENV_INFO", ENV_DATA)

    # 2. Inspect dependencies and emit status (on-demand download)
    inspect_and_emit_binaries()

    # 3. Start background UDP peer listener
    udp_thread = threading.Thread(target=run_udp_listener, daemon=True)
    udp_thread.start()

    # 4. Start Stdin command reader loop
    stdin_thread = threading.Thread(target=run_stdin_reader, daemon=True)
    stdin_thread.start()

    # 5. Run HTTP service in main thread
    run_http_server()
