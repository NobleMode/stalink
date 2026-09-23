import os
import sys
import platform
import socket
import re
import subprocess

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_normalized_arch():
    raw_arch = platform.machine().lower()
    if raw_arch in ["x86_64", "amd64"]:
        return "x86_64"
    elif raw_arch in ["aarch64", "arm64"]:
        return "arm64"
    elif "arm" in raw_arch:
        return "armhf"
    elif raw_arch in ["i386", "i686", "x86"]:
        return "x86"
    return raw_arch

def get_binary_arch():
    norm = get_normalized_arch()
    if norm == "arm64":
        return "arm64"
    elif norm == "x86_64":
        return "amd64"
    elif norm == "armhf":
        return "armhf"
    return "amd64"

def get_os_distro_info():
    system = platform.system().lower()
    distro_info = {
        "system": system,
        "name": platform.system(),
        "version": platform.release(),
        "pretty_name": f"{platform.system()} {platform.release()}"
    }

    if system == "linux":
        os_release_paths = ["/etc/os-release", "/usr/lib/os-release"]
        for p in os_release_paths:
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8", errors="ignore") as f:
                        data = {}
                        for line in f:
                            line = line.strip()
                            if line and "=" in line and not line.startswith("#"):
                                k, v = line.split("=", 1)
                                data[k] = v.strip('"\'')
                        distro_info["name"] = data.get("NAME", "Linux")
                        distro_info["version"] = data.get("VERSION_ID", platform.release())
                        distro_info["pretty_name"] = data.get("PRETTY_NAME", distro_info["name"])
                        break
                except Exception:
                    pass
    elif system == "darwin":
        mac_ver = platform.mac_ver()[0]
        distro_info["name"] = "macOS"
        distro_info["version"] = mac_ver
        distro_info["pretty_name"] = f"macOS {mac_ver}" if mac_ver else "macOS"
    elif system == "windows":
        win_ver = platform.win32_ver()
        distro_info["name"] = f"Windows {win_ver[0]}"
        distro_info["version"] = win_ver[1]
        distro_info["pretty_name"] = f"Windows {win_ver[0]} ({win_ver[1]})"

    return distro_info

def get_cpu_info():
    cores = os.cpu_count() or 1
    arch = get_normalized_arch()
    model = platform.processor() or "Unknown CPU"

    system = platform.system().lower()
    if system == "linux" and os.path.exists("/proc/cpuinfo"):
        try:
            with open("/proc/cpuinfo", "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "model name" in line:
                        model = line.split(":", 1)[1].strip()
                        break
                    elif "Hardware" in line and model == "Unknown CPU":
                        model = line.split(":", 1)[1].strip()
        except Exception:
            pass
    elif system == "windows":
        model = os.environ.get("PROCESSOR_IDENTIFIER", model)
    elif system == "darwin":
        try:
            out = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"]).decode().strip()
            if out:
                model = out
        except Exception:
            pass

    return {
        "arch": arch,
        "binary_arch": get_binary_arch(),
        "cores": cores,
        "model": model
    }

def get_memory_info():
    mem_info = {"total_mb": 0, "available_mb": 0, "total_gb": 0.0, "available_gb": 0.0}
    system = platform.system().lower()

    if system == "linux" and os.path.exists("/proc/meminfo"):
        try:
            with open("/proc/meminfo", "r") as f:
                data = {}
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        key = parts[0].strip()
                        val = parts[1].strip().split()[0]
                        data[key] = int(val)
                total_kb = data.get("MemTotal", 0)
                avail_kb = data.get("MemAvailable", data.get("MemFree", 0))
                mem_info["total_mb"] = total_kb // 1024
                mem_info["available_mb"] = avail_kb // 1024
                mem_info["total_gb"] = round(total_kb / (1024 * 1024), 1)
                mem_info["available_gb"] = round(avail_kb / (1024 * 1024), 1)
        except Exception:
            pass
    elif system == "windows":
        try:
            import ctypes
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                total_b = stat.ullTotalPhys
                avail_b = stat.ullAvailPhys
                mem_info["total_mb"] = int(total_b // (1024 * 1024))
                mem_info["available_mb"] = int(avail_b // (1024 * 1024))
                mem_info["total_gb"] = round(total_b / (1024 ** 3), 1)
                mem_info["available_gb"] = round(avail_b / (1024 ** 3), 1)
        except Exception:
            pass
    elif system == "darwin":
        try:
            total_b = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"]).decode().strip())
            mem_info["total_mb"] = total_b // (1024 * 1024)
            mem_info["total_gb"] = round(total_b / (1024 ** 3), 1)
        except Exception:
            pass

    return mem_info

def get_display_session_info():
    system = platform.system().lower()
    session_type = os.environ.get("XDG_SESSION_TYPE", "unknown" if system == "linux" else system)
    desktop = os.environ.get("XDG_CURRENT_DESKTOP", os.environ.get("DESKTOP_SESSION", "desktop" if system != "linux" else "unknown"))
    return {
        "session_type": session_type,
        "desktop_environment": desktop
    }

def get_full_environment_profile():
    distro = get_os_distro_info()
    cpu = get_cpu_info()
    mem = get_memory_info()
    display = get_display_session_info()

    return {
        "hostname": socket.gethostname(),
        "ip": get_local_ip(),
        "os": distro,
        "cpu": cpu,
        "memory": mem,
        "display": display,
        "python_version": platform.python_version()
    }

if __name__ == "__main__":
    import json
    print(json.dumps(get_full_environment_profile(), indent=2))
