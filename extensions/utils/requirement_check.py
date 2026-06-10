import os
import sys
import json
import urllib.request
import zipfile
import tarfile
import shutil
import subprocess
import re
import platform

# Define where binaries will live locally inside the backend extension folder
# Script path: extensions/utils/requirement_check.py
# Target path: extensions/backend/bin
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_BASE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "backend", "bin"))

# Determine platform-specific bin directory
current_os = sys.platform
platform_dir = "windows" if current_os == "win32" else "linux"
BIN_DIR = os.path.join(BIN_BASE_DIR, platform_dir)

# Hosting pool URLs mapping to exact .zip and .tar.gz targets for Deskflow and Mutagen
HOSTING_POOL_URLS = {
    "win32": {
        "mutagen": "https://github.com/mutagen-io/mutagen/releases/download/v0.18.1/mutagen_windows_amd64_v0.18.1.zip",
        "deskflow": "https://github.com/deskflow/deskflow/releases/download/v1.26.0/deskflow-1.26.0-win-x64-portable.zip"
    },
    "linux": {
        "mutagen": "https://github.com/mutagen-io/mutagen/releases/download/v0.18.1/mutagen_linux_amd64_v0.18.1.tar.gz",
        "deskflow": "https://github.com/deskflow/deskflow/releases/download/v1.26.0/deskflow-1.26.0-ubuntu-resolute-x86_64.deb"
    }
}

def get_latest_release_url(repo, patterns, fallback_url):
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/vnd.github.v3+json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            for asset in data.get("assets", []):
                name = asset.get("name", "").lower()
                if all(p.lower() in name for p in patterns):
                    return asset.get("browser_download_url")
    except Exception:
        # Fall back to known static URL if API rate limit is hit or network is down
        pass
    return fallback_url

def check_latest_version(repo, current_version):
    """
    Queries GitHub to check if the local version is the latest release version.
    Returns True if up-to-date, or if the API check fails (offline/rate-limited) to prevent redownload loops.
    """
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/vnd.github.v3+json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            latest_version = data.get("tag_name", "").lstrip("v")
            return latest_version == current_version
    except Exception:
        # If check fails due to offline/rate-limit, accept local version
        return True
    return False

def get_local_binary_version(binary_path, args):
    """
    Executes the binary with the given args and extracts the version number.
    """
    try:
        result = subprocess.run([binary_path] + args, capture_output=True, text=True, timeout=5)
        output = (result.stdout + result.stderr).strip()
        match = re.search(r'\d+\.\d+(?:\.\d+)?(?:\.\d+)?', output)
        if match:
            return match.group(0)
    except Exception:
        pass
    return None

def extract_deb(deb_path, extract_dir):
    """
    Extracts the contents of a .deb package using pure Python standard library ar parser.
    """
    with open(deb_path, 'rb') as f:
        signature = f.read(8)
        if signature != b'!<arch>\n':
            raise ValueError("Invalid .deb archive (missing !<arch> signature)")
        
        while True:
            header = f.read(60)
            if len(header) < 60:
                break
            
            name = header[0:16].strip().decode('ascii')
            size_str = header[48:58].strip().decode('ascii')
            if not size_str:
                break
            size = int(size_str)
            
            data_size = size
            if size % 2 != 0:
                size += 1
            
            data = f.read(size)
            if name.startswith('data.tar'):
                temp_tar = os.path.join(extract_dir, name)
                with open(temp_tar, 'wb') as out:
                    out.write(data[:data_size])
                
                # Extract the tar file using tarfile (handles gz, xz, etc.)
                with tarfile.open(temp_tar) as tar_ref:
                    tar_ref.extractall(extract_dir)
                
                os.remove(temp_tar)
                break

def extract_7z(archive_path, extract_dir):
    """
    Extracts a .7z file by invoking the 7z command-line utility.
    """
    executable = shutil.which("7z") or shutil.which("7za")
    if not executable:
        common_paths = [
            r"C:\Program Files\7-Zip\7z.exe",
            r"C:\Program Files (x86)\7-Zip\7z.exe"
        ]
        for p in common_paths:
            if os.path.exists(p):
                executable = p
                break
    
    if not executable:
        raise FileNotFoundError("7z or 7za executable not found. Please install 7-Zip to extract .7z archives.")
    
    result = subprocess.run([executable, "x", archive_path, f"-o{extract_dir}", "-y"], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"7z extraction failed: {result.stderr}")

def find_and_move_binary(extract_dir, binary_name, dest_dir):
    """
    Recursively searches the extraction directory for a target binary and moves it directly to dest_dir.
    """
    for root, dirs, files in os.walk(extract_dir):
        if binary_name in files:
            src_path = os.path.join(root, binary_name)
            dest_path = os.path.join(dest_dir, binary_name)
            os.makedirs(dest_dir, exist_ok=True)
            if os.path.exists(dest_path):
                os.remove(dest_path)
            shutil.move(src_path, dest_path)
            return True
    return False

def move_all_contents(src, dst):
    os.makedirs(dst, exist_ok=True)
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.move(s, d)
        else:
            if os.path.exists(d):
                os.remove(d)
            shutil.move(s, d)

def extract_all_to_bin(archive_path, dest_dir):
    temp_extract_dir = os.path.join(os.path.dirname(archive_path), "temp_extract")
    os.makedirs(temp_extract_dir, exist_ok=True)
    
    filename = os.path.basename(archive_path)
    if filename.endswith(".zip"):
        with zipfile.ZipFile(archive_path, 'r') as zip_ref:
            zip_ref.extractall(temp_extract_dir)
    elif filename.endswith(".tar.gz") or filename.endswith(".tgz"):
        with tarfile.open(archive_path, "r:gz") as tar_ref:
            tar_ref.extractall(temp_extract_dir)
    elif filename.endswith(".deb"):
        extract_deb(archive_path, temp_extract_dir)
    elif filename.endswith(".7z"):
        extract_7z(archive_path, temp_extract_dir)
    else:
        raise ValueError(f"Unsupported archive format: {filename}")

    src_dir = temp_extract_dir
    items = os.listdir(temp_extract_dir)
    if len(items) == 1 and os.path.isdir(os.path.join(temp_extract_dir, items[0])):
        if items[0] != "usr":
            src_dir = os.path.join(temp_extract_dir, items[0])
            
    move_all_contents(src_dir, dest_dir)

def download_and_extract(url, dest_dir):
    """
    Downloads an archive from a URL and extracts its entire contents into dest_dir.
    """
    filename = url.split("/")[-1]
    
    # Use a separate temp_download folder to avoid polluting the platform bin directory
    temp_dir = os.path.join(BIN_BASE_DIR, "temp_download")
    archive_path = os.path.join(temp_dir, filename)
    
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        urllib.request.urlretrieve(url, archive_path)
        extract_all_to_bin(archive_path, dest_dir)
    finally:
        # Clean up the entire temp_download directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

def load_env():
    env_path = os.path.abspath(os.path.join(BASE_DIR, "..", "..", ".env"))
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        val = parts[1].strip().strip('"').strip("'")
                        os.environ[key] = val

def ensure_binaries_exist():
    # Load env vars from .env
    load_env()
    
    # Make sure the bin folder exists
    os.makedirs(BIN_DIR, exist_ok=True)
    
    current_os = sys.platform
    if current_os not in ["win32", "linux"]:
        print(json.dumps({"event": "INSTALLER_STATUS", "status": "ERROR", "payload": f"Unsupported platform: {current_os}"}))
        sys.stdout.flush()
        return False
        
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
        # Deskflow binary in Linux Ubuntu resolutes to usr/bin/deskflow inside the deb archive
        deskflow_path = os.path.join(deskflow_dir, "usr", "bin", deskflow_name)

    # File validation checkpoint (scan local bin/ directory on app startup)
    mutagen_exists = os.path.exists(mutagen_path) and os.path.exists(mutagen_bundle_path)
    deskflow_exists = os.path.exists(deskflow_path)
    
    # If all files exist and we are not simulating a retry, dispatch COMPLETE status and exit
    if mutagen_exists and deskflow_exists and os.environ.get("RETRY", "FALSE").upper() != "TRUE":
        print(json.dumps({"event": "INSTALLER_STATUS", "status": "COMPLETE", "payload": "All core binaries verified."}))
        sys.stdout.flush()
        return True

    # If files are missing, dispatch MISSING payload immediately
    print(json.dumps({"event": "INSTALLER_STATUS", "status": "MISSING", "payload": "Required binaries are missing. Preparing installation..."}))
    sys.stdout.flush()

    try:
        # Check if we should simulate a network failure on startup/installation
        if os.environ.get("RETRY", "FALSE").upper() == "TRUE":
            print(json.dumps({"event": "INSTALLER_STATUS", "status": "INSTALLING", "payload": "Downloading Mutagen..."}))
            sys.stdout.flush()
            raise RuntimeError("Simulated network connection lost (RETRY=TRUE env active).")

        machine_arch = platform.machine().lower()
        is_arm = "arm" in machine_arch or "aarch" in machine_arch
        
        # 1. Download and extract Mutagen if missing
        if not mutagen_exists:
            print(json.dumps({"event": "INSTALLER_STATUS", "status": "INSTALLING", "payload": "Downloading Mutagen..."}))
            sys.stdout.flush()
            
            # Find latest Mutagen release url matching patterns dynamically
            arch_pattern = "arm64" if is_arm else "amd64"
            os_pattern = "windows" if current_os == "win32" else "linux"
            archive_ext = ".zip" if current_os == "win32" else ".tar.gz"
            patterns = [os_pattern, arch_pattern, archive_ext]
            
            fallback_url = HOSTING_POOL_URLS[current_os]["mutagen"]
            mutagen_url = get_latest_release_url("mutagen-io/mutagen", patterns, fallback_url)
            
            # Clean and create directory
            if os.path.exists(mutagen_dir):
                shutil.rmtree(mutagen_dir)
            os.makedirs(mutagen_dir, exist_ok=True)
            
            download_and_extract(mutagen_url, mutagen_dir)

        # 2. Download and extract Deskflow if missing
        if not deskflow_exists:
            print(json.dumps({"event": "INSTALLER_STATUS", "status": "INSTALLING", "payload": "Downloading Deskflow..."}))
            sys.stdout.flush()
            
            # Find latest Deskflow release url matching patterns dynamically
            if current_os == "win32":
                patterns = ["win", "arm64" if is_arm else "x64", "portable"]
            else:
                patterns = ["ubuntu", "resolute", "arm64" if is_arm else "x86_64", ".deb"]
                
            fallback_url = HOSTING_POOL_URLS[current_os]["deskflow"]
            deskflow_url = get_latest_release_url("deskflow/deskflow", patterns, fallback_url)
            
            # Clean and create directory
            if os.path.exists(deskflow_dir):
                shutil.rmtree(deskflow_dir)
            os.makedirs(deskflow_dir, exist_ok=True)
            
            download_and_extract(deskflow_url, deskflow_dir)

        # Linux Specific Security Requirement: Apply executable flags to binaries
        if current_os == "linux":
            os.chmod(mutagen_path, 0o755)
            os.chmod(deskflow_path, 0o755)

        print(json.dumps({"event": "INSTALLER_STATUS", "status": "COMPLETE", "payload": "Setup complete! Rigs ready to link."}))
        sys.stdout.flush()
        return True

    except Exception as e:
        print(json.dumps({"event": "INSTALLER_STATUS", "status": "ERROR", "payload": f"Download failed: {str(e)}"}))
        sys.stdout.flush()
        return False

if __name__ == "__main__":
    success = ensure_binaries_exist()
    if not success:
        sys.exit(1)