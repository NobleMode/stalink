import os
import sys
import json
import urllib.request
import zipfile
import tarfile
import shutil
import subprocess
import re

# Define where binaries will live locally inside the backend extension folder
# Script path: extensions/utils/requirement_check.py
# Target path: extensions/backend/bin
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BIN_BASE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "backend", "bin"))

# Determine platform-specific bin directory
platform = sys.platform
platform_dir = "windows" if platform == "win32" else "linux"
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

def download_and_extract(url, target_binaries):
    """
    Downloads an archive from a URL and extracts the target binaries from it.
    """
    filename = url.split("/")[-1]
    
    # Use a separate temp_download folder to avoid polluting the platform bin directory
    temp_dir = os.path.join(BIN_BASE_DIR, "temp_download")
    archive_path = os.path.join(temp_dir, filename)
    temp_extract_dir = os.path.join(temp_dir, "temp_extract")
    
    os.makedirs(temp_extract_dir, exist_ok=True)
    
    try:
        urllib.request.urlretrieve(url, archive_path)
        
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
            
        # Clean up the downloaded archive file immediately after extraction to save disk space
        if os.path.exists(archive_path):
            os.remove(archive_path)
            
        all_found = True
        for binary in target_binaries:
            found = find_and_move_binary(temp_extract_dir, binary, BIN_DIR)
            if not found:
                all_found = False
        
        if not all_found:
            raise FileNotFoundError(f"Could not find all required binaries {target_binaries} in the downloaded archive.")
            
    finally:
        # Clean up the entire temp_download directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

def ensure_binaries_exist():
    # Make sure the bin folder exists
    os.makedirs(BIN_DIR, exist_ok=True)
    
    platform = sys.platform
    if platform not in ["win32", "linux"]:
        print(json.dumps({"event": "INSTALLER_STATUS", "status": "ERROR", "payload": f"Unsupported platform: {platform}"}))
        sys.stdout.flush()
        return False
        
    ext = ".exe" if platform == "win32" else ""
    mutagen_name = f"mutagen{ext}"
    deskflow_name = f"deskflow-core{ext}"
    
    mutagen_path = os.path.join(BIN_DIR, mutagen_name)
    deskflow_path = os.path.join(BIN_DIR, deskflow_name)

    # File validation checkpoint (scan local bin/ directory on app startup)
    mutagen_exists = os.path.exists(mutagen_path)
    deskflow_exists = os.path.exists(deskflow_path)
    
    # If all files exist, dispatch COMPLETE status and exit
    if mutagen_exists and deskflow_exists:
        print(json.dumps({"event": "INSTALLER_STATUS", "status": "COMPLETE", "payload": "All core binaries verified."}))
        sys.stdout.flush()
        return True

    # If files are missing, dispatch MISSING payload immediately
    print(json.dumps({"event": "INSTALLER_STATUS", "status": "MISSING", "payload": "Required binaries are missing. Preparing installation..."}))
    sys.stdout.flush()

    try:
        # 1. Download and extract Mutagen if missing
        if not mutagen_exists:
            print(json.dumps({"event": "INSTALLER_STATUS", "status": "INSTALLING", "payload": "Downloading Mutagen..."}))
            sys.stdout.flush()
            mutagen_url = HOSTING_POOL_URLS[platform]["mutagen"]
            download_and_extract(mutagen_url, [mutagen_name])

        # 2. Download and extract Deskflow if missing
        if not deskflow_exists:
            print(json.dumps({"event": "INSTALLER_STATUS", "status": "INSTALLING", "payload": "Downloading Deskflow..."}))
            sys.stdout.flush()
            deskflow_url = HOSTING_POOL_URLS[platform]["deskflow"]
            download_and_extract(deskflow_url, [deskflow_name])

        # Linux Specific Security Requirement: Apply executable flags to binaries
        if platform == "linux":
            os.chmod(os.path.join(BIN_DIR, "mutagen"), 0o755)
            os.chmod(os.path.join(BIN_DIR, "deskflow-core"), 0o755)

        print(json.dumps({"event": "INSTALLER_STATUS", "status": "COMPLETE", "payload": "Setup complete! Rigs ready to link."}))
        sys.stdout.flush()
        return True

    except Exception as e:
        print(json.dumps({"event": "INSTALLER_STATUS", "status": "ERROR", "payload": f"Download failed: {str(e)}"}))
        sys.stdout.flush()
        return False

if __name__ == "__main__":
    ensure_binaries_exist()