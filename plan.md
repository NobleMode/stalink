# 🛰️ StaLink Architecture & Implementation Master Plan
### Personal Developer Command Center, Multi-Device Workstation Utility & Mass App Spawner

---

## 📌 Product Definition

> **StaLink** is a single, unified personal developer command center and multi-device workstation utility. It combines multi-device workstation management (Deskflow KVM with Game Mode, Mutagen sync, Sunshine/Moonlight streaming, Tailscale mesh, LAN discovery), project/workspace management (Kanban, tasks, milestones, GitHub), and a **configurable mass application, game & service spawner**.
>
> StaLink is engineered for both **software development workflows and high-performance gaming/entertainment setups**:
> - **For Developers**: Launch complete IDEs, databases, containers, engines, and CLI scripts with one click.
> - **For Gamers & Playtesters**: Launch games (Steam, Heroic, Lutris, emulators, custom binaries), voice comms (Discord), recording/streaming tools (OBS Studio), and telemetry/sim peripherals with one action.
> - **For Multi-PC Gaming & Streaming**: Deskflow KVM connects dual PCs with a dedicated "Game Mode" cursor lock hotkey (preventing mouse slip during 3D/FPS games).
> - **For Remote Play**: Stream games or heavy viewports at 120/144 FPS with virtual gamepad passthrough from a powerful desktop rig to a lightweight laptop or handheld (e.g. Steam Deck, ROG Ally) via Sunshine & Moonlight.
>
> The core workflow of StaLink is:
> ```text
> Open StaLink ──► Select Project/Profile (Dev, Gaming, Sim, Playtest) ──► Choose Items (Checkboxes)
>                                                                                │
>                                                                                ▼
> Entire Environment Comes Alive ◄── One-Click Spawn ◄── Dynamic Preflight Check
> (IDEs, Games, Services, OBS, Discord, KVM, Sync, Stream)
> ```

StaLink strictly remains **one application**. The Workstation Utilities, Workspace/Project Subsystem, and Mass App Spawner operate as deeply integrated, complementary components inside a single desktop application and companion mobile interface.

---

## 📌 1. Status Overview

| Phase | Milestone | Scope | Status | Progress |
| :--- | :--- | :--- | :---: | :---: |
| **Phase 1** | **Desktop Scaffolding & Frontend** | Vite 5 + React 18, Tailwind CSS, Neutralino desktop bridge | `[COMPLETED]` | **100%** |
| **Phase 2** | **Binary Auto-Installer & Profiler** | `env_detector.py`, 16-channel `aria2c` downloader, archive extraction, permission management | `[COMPLETED]` | **100%** |
| **Phase 3** | **Core Multi-Device Services & IPC** | Backend KVM/Sync/Killswitch, KVM Game Mode cursor lock, UDP LAN discovery, HTTP server, UI Panels | `[IN PROGRESS]` | **80%** (Backend 100%, UI Panels 60%) |
| **Phase 4** | **Application Registry & Mass App Spawner**| `apps.json` registry, dynamic OS resolvers, games/services/IDEs, URI protocols (`steam://`), preflight, peer RPC | `[PLANNED]` | **25%** (`apps.json` drafted) |
| **Phase 5** | **Local Web Hub, Clipboard & WAN** | Mobile-responsive HTTP hub (`:18383`), live shared clipboard, file upload drop hub, `cloudflared` WAN | `[PLANNED]` | **15%** (`cloudflared` verified) |
| **Phase 6** | **Node Identity, Tailscale & Routing** | Persistent `node_id`, Tailscale auto-installer, daemon bridge, intelligent Route Resolver | `[PLANNED]` | **10%** (Architecture specified) |
| **Phase 7** | **Remote Streaming (Sunshine/Moon)**| Sunshine host manager, 1-click PIN pairing, 120/144 FPS game streaming, gamepad passthrough, `StreamHubPanel.jsx` | `[PLANNED]` | **10%** (Architecture specified) |
| **Phase 8** | **Core Workspace & Cockpit Foundation**| SQLite engine (`stalink.db`, WAL), Project/Game CRUD, default Spawn Profiles, Dev Envs referencing `node_id`, Cockpit HUD | `[PLANNED]` | **0%** (Architecture specified) |
| **Phase 9** | **Lightweight Task & Kanban System**| Backlog/Todo/Doing/Blocked/Done, Task IDs (`WKR-042`), Priorities, Milestones, Cockpit Task Widget | `[PLANNED]` | **0%** (Architecture specified) |
| **Phase 10**| **GitHub Integration & Activity Log**| OS Keyring credentials, offline cache (Issues, PRs, Commits), rate limiter, Cockpit Activity Stream | `[PLANNED]` | **0%** (Architecture specified) |
| **Phase 11**| **Work Session Automation & Cockpit**| Action/Orchestration session runner (consumes Mass Spawner), project/game workflow presets, full Cockpit | `[PLANNED]` | **25%** (Dashboard shell active) |
| **Phase 12**| **Mobile Companion App (Capacitor)**| Capacitor Android/iOS MVP (Status, Kanban, Clipboard, File Upload, Killswitch; Game Macro Pad/Stream later) | `[PLANNED]` | **0%** (Architecture specified) |
| **Phase 13**| **Packaging & Multi-Platform Release**| Standalone Desktop (`neu build`) + Mobile Android/iOS APK/IPA distribution, smoke tests | `[PLANNED]` | **20%** (Build pipeline validated) |

---

## 🏗️ 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                STALINK UNIFIED DEVELOPER COMMAND CENTER                                │
│                 (Vite 5 + React 18 SPA: Neutralino Desktop Bridge + Capacitor Mobile)                  │
├────────────────────────────────────┬───────────────────────────────────┬───────────────────────────────┤
│    WORKSPACE & PROJECT SUBSYSTEM   │        MASS APP SPAWNER           │     WORKSTATION UTILITIES     │
│  • Project Profiles (Dev & Games)  │  • Reusable Spawn Profiles        │  • Deskflow KVM (w/ Game Mode)│
│  • Lightweight Kanban & Tasks      │  • Per-Launch Checkbox Selection  │  • Mutagen Bidirectional Sync │
│  • Task Engine (WKR-042, tags)     │  • Preflight Readiness Check      │  • Sunshine / Moonlight Hub   │
│  • GitHub Offline Integration      │  • Apps / Services / Games / Cmds │  • Tailscale Mesh Manager     │
│  • Dev Environment Presets         │  • Local & Remote Peer Spawning   │  • Intelligent Route Resolver │
│  • Activity & Audit Feed           │  • Portable Argument Templates    │  • Shared Clipboard & Web Hub │
└─────────────────┬──────────────────┴─────────────────┬─────────────────┴───────────────┬───────────────┘
                  │ Desktop: Stdio IPC (JSON Lines)    │                                 │ Mobile: HTTP/WS
┌─────────────────▼────────────────────────────────────▼─────────────────────────────────▼───────────────┐
│                                     STALINK BACKEND ENGINE (Python 3)                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                  COMMAND ROUTER & AUTH DISPATCHER (main.py)                            │
│                  • Validates Bearer Tokens / PSK   • Enforces Access Tiers   • Dispatches to Services  │
├────────────────────────────────────┬───────────────────────────────────┬───────────────────────────────┤
│         WORKSPACE SERVICES         │          SPAWNER SERVICES         │      WORKSTATION SERVICES     │
│  • services/db.py (SQLite WAL)     │  • services/app_registry.py       │  • services/nodes.py          │
│  • services/workspace.py (Projects)│  • services/app_resolver.py       │  • services/discovery.py      │
│  • services/tasks.py (Kanban engine│  • services/spawner.py (Plan/Exec)│  • services/route_resolver.py │
│  • services/github.py (REST cache) │  • services/service_manager.py    │  • services/kvm.py            │
│  • services/credentials.py (Keyring│                                   │  • services/sync.py           │
│  • services/activity.py (Audit)    │                                   │  • services/tailscale.py      │
│  • services/sessions.py (Workflows)│                                   │  • services/stream.py         │
│                                    │                                   │  • services/auth.py           │
└────────────────────────────────────┴───────────────────────────────────┴───────────────────────────────┘
```

---

## 🚀 3. Mass App Spawner Architecture

The Mass App Spawner allows users to define a collection of tools, IDEs, background services, CLI scripts, and **games/launchers** for a specific workflow, select which items to run for the current session, and launch them with a single click.

### Example A: C# Development Workspace
```text
┌──────────────────────────────────────────────────────────────┐
│ MASS APP SPAWNER                                             │
├──────────────────────────────────────────────────────────────┤
│ Profile: [ C# Development                            ▼ ]     │
│ Target:  [ This PC (Local Node)                      ▼ ]     │
├──────────────────────────────────────────────────────────────┤
│ Applications                                                 │
│   ☑ Visual Studio 2022 Community               [Ready]       │
│   ☑ SQL Server Management Studio (SSMS)        [Ready]       │
│   ☐ Visual Studio Code                         [Ready]       │
│   ☐ Rider                                      [Not Found]   │
│   ☑ Postman                                    [Ready]       │
│                                                              │
│ Services                                                     │
│   ☑ Microsoft SQL Server (MSSQLSERVER)         [Stopped]     │
│   ☐ Docker Desktop                             [Running]     │
│                                                              │
│ Utilities & Setup                                            │
│   ☑ Git Environment Verification               [Ready]       │
├──────────────────────────────────────────────────────────────┤
│ [ Select All ]   [ Select Defaults ]   [ Clear All ]         │
│                                                              │
│ Preflight: 4/4 selected ready (1 service will be started)     │
│                                                              │
│                     [ 🚀 SPAWN SELECTED ]                    │
└──────────────────────────────────────────────────────────────┘
```

### Example B: Gaming & Playtest Setup
```text
┌──────────────────────────────────────────────────────────────┐
│ MASS APP SPAWNER                                             │
├──────────────────────────────────────────────────────────────┤
│ Profile: [ Sim Racing & Streaming                     ▼ ]     │
│ Target:  [ This PC (Gaming Rig)                       ▼ ]     │
├──────────────────────────────────────────────────────────────┤
│ Games & Launchers (URI / Protocol)                           │
│   ☑ Assetto Corsa Competizione (Steam: 805550) [Ready]       │
│   ☐ iRacing                                    [Ready]       │
│                                                              │
│ Gaming Companions & Tools                                    │
│   ☑ SimHub (Telemetry & Bass Shakers)          [Ready]       │
│   ☑ Fanatec Control Panel (Wheel FFB Driver)   [Ready]       │
│   ☑ OBS Studio (Livestreaming & Replay Buffer) [Ready]       │
│   ☑ Discord (Voice Chat)                       [Ready]       │
│   ☐ MangoHud (FPS & Frame-Time Overlay)        [Ready]       │
│                                                              │
│ Services                                                     │
│   ☑ Voicemeeter Audio Engine                   [Running]     │
├──────────────────────────────────────────────────────────────┤
│ [ Select All ]   [ Select Defaults ]   [ Clear All ]         │
│                                                              │
│ Preflight: 5/5 selected ready (KVM Game Mode Auto-Lock: ON)  │
│                                                              │
│                     [ 🚀 SPAWN SELECTED ]                    │
└──────────────────────────────────────────────────────────────┘
```

### The Three Conceptual Layers

```text
1. Workspace / Spawn Profile
   ├── Reusable definition of available applications, services, games, and commands
   ├── Default selection state (checked / unchecked)
   └── Launch parameters & portable argument templates
            │
            ▼
2. User Selection (Per-Launch State)
   ├── Checkbox state modified by user for THIS session
   └── Temporary by default (with optional "Save as Defaults" action)
            │
            ▼
3. Spawn Plan (Execution Engine)
   ├── Dependency sorting (Services before dependent GUI apps / games)
   ├── Dynamic executable/service/game resolution via Registry
   ├── Preflight readiness validation
   ├── Controlled sequential/parallel execution
   └── Success, warning & failure reporting
```

### Item Types Supported
1. **Application (`type: "application"`)**: Standard GUI desktop applications (e.g. Visual Studio, VS Code, Unity, Godot, Blender, Postman, Browser).
2. **Service (`type: "service"`)**: Background daemon or system service that must be running before work/play begins (e.g. SQL Server, Docker, PostgreSQL, Redis, Voicemeeter). The spawner checks if the service is running, and if not, starts it via OS service APIs (`systemctl start` on Linux, `net start` / `sc.exe` on Windows).
3. **Game & URI Protocol (`type: "game"` or `type: "uri"`)**: Games launched via platform URI protocols or direct executables:
   - Steam: `steam://rungameid/<id>` (e.g. `steam://rungameid/805550`)
   - Heroic Games Launcher: `heroic://launch/...`
   - Lutris: `lutris:rungame/...`
   - Epic Games Store: `com.epicgames.launcher://apps/...`
   - Emulators (RetroArch, RPCS3, Ryujinx, PCSX2) with ROM parameters.
   - Standalone game binaries with custom arguments (`-novid -high -fullscreen`, MangoHud / Gamemode prefixes, Proton wrappers).
4. **Command / Utility (`type: "command"`)**: CLI process, environment script, or setup task (e.g. `git pull`, `npm run dev`, `docker compose up -d`, Python virtualenv activation).

---

## 🔍 4. Application Registry & Dynamic Resolver

Profiles **never store fragile absolute paths** (such as `C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\devenv.exe`). Absolute paths break when software updates, installs to custom drives, runs on another OS, or is handled via package managers.

Instead, profiles store **Application IDs** (`visual-studio`, `vscode`, `unity`, `blender`, `steam`, `discord`, `obs-studio`, `docker`, `sql-server`), which are resolved at runtime by the **Application Registry & Resolver**:

```text
Profile (app_id: "vscode" or "steam")
            ↓
Application Definition (apps.json)
            ↓
OS-Specific Dynamic Resolver
  ├── Linux:   Checks $PATH, /usr/bin, flatpak, snap, .desktop entries, Steam libraries
  ├── Windows: Checks $PATH, Registry (HKLM/HKCU App Paths), %LOCALAPPDATA%\Programs, Steam registry
  └── macOS:   Checks /Applications, ~/Applications, mdfind kMDItemCFBundleIdentifier
            ↓
Resolution Result: Found (/usr/bin/code, v1.92.0)
            ↓
Preflight Validation ──► Spawn Detached Process
```

### Application Definition Schema (`apps.json`)
The root `apps.json` file serves as the authoritative static Application Definition Registry:

```json
{
  "$schema": "./schema/apps.schema.json",
  "version": "2.1.0",
  "categories": [
    "ide", "game_engine", "database", "terminal",
    "game", "game_launcher", "streaming_recording", "voice_chat", "emulator", "sim_tool", "utility"
  ],
  "applications": [
    {
      "id": "vscode",
      "name": "Visual Studio Code",
      "type": "application",
      "category": "ide",
      "detection": {
        "linux": {
          "commands": ["code", "code-insiders"],
          "desktop_files": ["code.desktop", "code-insiders.desktop"],
          "paths": ["/usr/bin/code", "/snap/bin/code"]
        },
        "windows": {
          "commands": ["code.cmd", "code.exe"],
          "registry_keys": [
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{EA457770-CEBE-43A3-A005-CABFED89E572}_is1",
            "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Code.exe"
          ],
          "paths": [
            "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe",
            "%PROGRAMFILES%\\Microsoft VS Code\\Code.exe"
          ]
        }
      },
      "launch": {
        "linux": { "command": "code", "default_args": ["${PROJECT_ROOT}"] },
        "windows": { "command": "code.cmd", "default_args": ["${PROJECT_ROOT}"] }
      }
    },
    {
      "id": "steam",
      "name": "Steam",
      "type": "game_launcher",
      "category": "game_launcher",
      "detection": {
        "linux": { "commands": ["steam"], "paths": ["~/.local/share/Steam", "~/.steam/steam"] },
        "windows": { "registry_keys": ["HKCU\\Software\\Valve\\Steam"], "paths": ["%PROGRAMFILES(X86)%\\Steam\\steam.exe"] }
      },
      "launch": {
        "linux": { "command": "steam" },
        "windows": { "command": "steam.exe" }
      }
    },
    {
      "id": "obs-studio",
      "name": "OBS Studio",
      "type": "application",
      "category": "streaming_recording",
      "detection": {
        "linux": { "commands": ["obs"], "desktop_files": ["com.obsproject.Studio.desktop"] },
        "windows": { "paths": ["%PROGRAMFILES%\\obs-studio\\bin\\64bit\\obs64.exe"] }
      },
      "launch": {
        "default_args": ["--startreplaybuffer"]
      }
    },
    {
      "id": "discord",
      "name": "Discord",
      "type": "application",
      "category": "voice_chat",
      "detection": {
        "linux": { "commands": ["discord"], "desktop_files": ["discord.desktop"] },
        "windows": { "paths": ["%LOCALAPPDATA%\\Discord\\Update.exe --processStart Discord.exe"] }
      }
    },
    {
      "id": "sql-server",
      "name": "Microsoft SQL Server",
      "type": "service",
      "category": "database",
      "detection": {
        "windows": { "service_names": ["MSSQLSERVER", "MSSQL$SQLEXPRESS"] },
        "linux": { "systemd_units": ["mssql-server"] }
      },
      "launch": {
        "windows": { "start_command": "net start MSSQLSERVER" },
        "linux": { "start_command": "systemctl start mssql-server" }
      }
    },
    {
      "id": "unity",
      "name": "Unity Editor",
      "type": "application",
      "category": "game_engine",
      "detection": {
        "windows": {
          "unity_hub_path": "%PROGRAMFILES%\\Unity Hub\\Unity Hub.exe",
          "editors_root": "%PROGRAMFILES%\\Unity\\Hub\\Editor"
        },
        "linux": {
          "unity_hub_path": "~/Unity/Hub/UnityHub.AppImage",
          "editors_root": "~/Unity/Hub/Editor"
        }
      },
      "launch": {
        "default_args": ["-projectPath", "${PROJECT_ROOT}"]
      }
    }
  ]
}
```

### Portable Argument Templates
Arguments support context variables evaluated at launch time:
* `${PROJECT_ROOT}`: Root workspace folder of the active project.
* `${PROJECT_NAME}`: Active project name.
* `${WORKSPACE_ROOT}`: Global StaLink workspaces directory.
* `${USER_HOME}`: Current user home path (`~` or `%USERPROFILE%`).
* `${NODE_NAME}`: Target machine hostname.

---

## 🌐 5. Remote Mass App & Game Spawning

Because StaLink manages multi-device workstation setups over LAN and Tailscale, the Mass App Spawner supports spawning both **locally** and **on remote linked nodes**:

```text
[ Desktop Command Center (Node A) ]
         │
         │  POST /api/spawner/execute
         │  Payload: {
         │    "profile_name": "Game Playtest Session",
         │    "items": [
         │      { "app_id": "steam", "args": ["steam://rungameid/805550"] },
         │      { "app_id": "discord" },
         │      { "app_id": "obs-studio", "args": ["--startreplaybuffer"] }
         │    ]
         │  }
         ▼
[ Remote Gaming Rig (Node B) ]
         │
         ├── 1. Authenticate request via PSK / Bearer Token
         ├── 2. Validate app_id against local apps.json whitelist
         ├── 3. Resolve executable locally using Node B's OS paths
         ├── 4. Execute preflight check
         ├── 5. Spawn processes detached
         └── 6. Return execution status response
```

> [!IMPORTANT]
> **Zero Shell Injection Rule**: Remote spawning **never** transmits arbitrary raw shell commands or unvalidated binary paths across the network. The remote machine resolves trusted `app_id` keys against its own local registry.

---

## 🪪 6. Node Identity Architecture

### Concept & Model
Every StaLink installation generates and maintains a persistent **Node Identity**. Nodes are first-class entities identified by a permanent `node_id` (UUIDv4) stored on disk (`~/.config/stalink/node_identity.json` on Linux, `%APPDATA%\StaLink\node_identity.json` on Windows) and registered in `stalink.db`.

```text
StaLink Node
├── node_id (UUIDv4, globally unique & persistent across reboots/networks)
├── hostname (OS machine name, e.g. "gaming-rig", "dev-laptop")
├── os (linux / windows / darwin)
├── architecture (amd64 / arm64)
├── capabilities (kvm_server, kvm_client, sync, stream_host, stream_client, rpc, spawner)
├── available_applications (JSON list of locally resolved app_ids)
├── network_addresses (dynamic list of active physical LAN IPv4/IPv6 & MACs)
├── tailscale_ip (100.x.y.z CGNAT address)
├── magic_dns (e.g. "gaming-rig.tailnet-xyz.ts.net")
├── pairing_status (paired, pending, untrusted)
└── last_seen_at (timestamp)
```

### Decoupling Identity from Dynamic IP Addresses
* **Development Environments reference `node_id`**, NOT static IP addresses.
* If a laptop moves from home to a coffee shop or switches between Wi-Fi and Ethernet (triggering DHCP IP churn), the `node_id` remains unchanged.
* The networking layer updates the node's cached addresses dynamically without breaking project environment mappings, sync configurations, or KVM profiles.

---

## 🗄️ 7. Database Architecture (SQLite)

All persistent data is maintained in a local SQLite database (`~/.config/stalink/stalink.db` on Linux, `%APPDATA%\StaLink\stalink.db` on Windows) operated in Write-Ahead Logging (WAL) mode for maximum concurrency and instant UI reads.

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Schema Version Table (Lightweight Migrations)
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Nodes (First-Class Machine Fleet)
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,                 -- Persistent UUIDv4
    hostname TEXT NOT NULL,
    os TEXT NOT NULL,                    -- 'linux', 'windows', 'darwin'
    arch TEXT NOT NULL,                  -- 'amd64', 'arm64'
    last_lan_ip TEXT,                    -- Discovered LAN IP (e.g. '192.168.1.150')
    tailscale_ip TEXT,                   -- Discovered Tailscale IP (100.x.y.z)
    magic_dns TEXT,                      -- e.g. 'workstation.tailnet.ts.net'
    capabilities_json TEXT NOT NULL,     -- JSON array: ["kvm_server", "sync", "spawner"]
    is_local BOOLEAN DEFAULT 0,          -- 1 if this represents the current host machine
    pairing_status TEXT DEFAULT 'paired',-- 'paired', 'pending', 'blocked'
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Spawn Profiles (Reusable Development, Gaming & Tool Collections)
CREATE TABLE spawn_profiles (
    id TEXT PRIMARY KEY,                 -- UUIDv4 or slug: 'csharp-dev', 'sim-racing'
    name TEXT NOT NULL,                  -- e.g. 'C# Development', 'Sim Racing & Streaming'
    profile_category TEXT DEFAULT 'development', -- 'development', 'gaming', 'playtest', 'streaming', 'custom'
    description TEXT,
    icon TEXT DEFAULT 'Code',            -- Lucide icon name: 'Code', 'Gamepad2', 'Tv', 'Cpu'
    is_built_in BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Spawn Profile Items (Apps, Services, Games & Commands in a Profile)
CREATE TABLE spawn_profile_items (
    id TEXT PRIMARY KEY,                 -- UUIDv4
    profile_id TEXT NOT NULL REFERENCES spawn_profiles(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,                -- Identifier matching apps.json (e.g. 'vscode', 'steam')
    item_type TEXT NOT NULL DEFAULT 'application', -- 'application', 'service', 'game', 'uri', 'command'
    is_default_selected BOOLEAN DEFAULT 1,
    is_required BOOLEAN DEFAULT 0,       -- If 1, preflight fails if missing
    launch_order INTEGER DEFAULT 10,     -- Determines sequential execution order
    custom_args TEXT,                    -- Extra flags, e.g. "steam://rungameid/805550"
    env_vars_json TEXT,                  -- Optional environment variables { "PORT": "5000" }
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Application Path & Version Overrides (Per-Node)
CREATE TABLE application_overrides (
    id TEXT PRIMARY KEY,                 -- Composite: '<node_id>:<app_id>'
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    custom_executable_path TEXT,         -- User-specified manual path override
    preferred_version TEXT,              -- e.g. '2022 Community'
    is_enabled BOOLEAN DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Projects (Software or Game Projects)
CREATE TABLE projects (
    id TEXT PRIMARY KEY,                 -- UUIDv4
    slug TEXT UNIQUE NOT NULL,           -- Short prefix (e.g. 'wkr')
    name TEXT NOT NULL,                  -- e.g. 'Wunderkraft'
    description TEXT,
    project_type TEXT DEFAULT 'game',    -- 'game', 'tool', 'web', 'sim', 'library'
    engine TEXT DEFAULT 'custom',        -- 'unity', 'godot', 'unreal', 'custom', 'none'
    language TEXT,                       -- 'csharp', 'cpp', 'rust', 'python', 'typescript'
    local_path TEXT NOT NULL,            -- Root workspace path on host
    default_spawn_profile_id TEXT REFERENCES spawn_profiles(id) ON DELETE SET NULL,
    github_repo TEXT,                    -- 'owner/repo'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Development Environments (Referencing Nodes)
CREATE TABLE development_environments (
    id TEXT PRIMARY KEY,                 -- UUIDv4
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    name TEXT NOT NULL,                  -- e.g. 'Primary Workstation', 'Gaming Rig'
    role TEXT NOT NULL DEFAULT 'dev',    -- 'dev', 'sync', 'build', 'playtest'
    spawn_profile_id TEXT REFERENCES spawn_profiles(id) ON DELETE SET NULL,
    network_route TEXT DEFAULT 'auto',   -- 'auto', 'lan', 'tailscale'
    kvm_role TEXT DEFAULT 'none',        -- 'server', 'client', 'none'
    sync_local_path TEXT,                -- Local Mutagen sync directory
    sync_remote_path TEXT,               -- Remote Mutagen sync target
    auto_launch_app TEXT,                -- App ID from apps.json (e.g. 'unity')
    remote_stream_role TEXT DEFAULT 'none', -- 'sunshine_host', 'moonlight_client', 'none'
    stream_quality_preset TEXT DEFAULT '1080p60' -- '1080p60', '1440p60', '1080p120', '1440p120'
);

-- 8. Milestones
CREATE TABLE milestones (
    id TEXT PRIMARY KEY,                 -- UUIDv4
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'open',          -- 'open', 'closed'
    github_milestone_id INTEGER
);

-- 9. Tasks
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,                 -- Project-scoped ID: 'WKR-042'
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
    environment_id TEXT REFERENCES development_environments(id) ON DELETE SET NULL,
    assigned_node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog', -- 'backlog', 'todo', 'doing', 'blocked', 'done'
    priority TEXT NOT NULL DEFAULT 'medium',-- 'low', 'medium', 'high', 'urgent'
    due_date TEXT,
    github_issue_number INTEGER,
    github_issue_url TEXT,
    git_branch TEXT,                     -- e.g. 'feature/WKR-042-inventory'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Task Dependencies & Tags
CREATE TABLE task_dependencies (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_id)
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3b82f6'
);

CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

-- 11. GitHub Local Offline Cache
CREATE TABLE github_cache (
    id TEXT PRIMARY KEY,                 -- Composite: '<project_id>:<entity_type>:<entity_id>'
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,           -- 'issue', 'pr', 'commit', 'branch'
    entity_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Activity Log & Audit Trail
CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,            -- 'spawn_executed', 'task_status_changed', 'sync_completed'
    description TEXT NOT NULL,
    metadata_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Work Session Workflow Templates
CREATE TABLE work_session_templates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Performance Indexes
CREATE INDEX idx_nodes_identity ON nodes(id);
CREATE INDEX idx_spawn_profile_items_profile ON spawn_profile_items(profile_id);
CREATE INDEX idx_application_overrides_lookup ON application_overrides(node_id, app_id);
CREATE INDEX idx_projects_default_profile ON projects(default_spawn_profile_id);
CREATE INDEX idx_environments_project ON development_environments(project_id);
CREATE INDEX idx_environments_node ON development_environments(node_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_milestone ON tasks(milestone_id);
CREATE INDEX idx_tasks_environment ON tasks(environment_id);
CREATE INDEX idx_tasks_assigned_node ON tasks(assigned_node_id);
CREATE INDEX idx_github_cache_lookup ON github_cache(project_id, entity_type);
CREATE INDEX idx_activity_project ON activity_log(project_id);
CREATE INDEX idx_activity_task ON activity_log(task_id);
```

---

## 🔒 8. Security & Credential Architecture

### Separation of Credentials from SQLite
Sensitive credentials (such as GitHub Personal Access Tokens and remote node pairing keys) are **strictly prohibited** from plaintext storage in `stalink.db`.

```text
SQLite (stalink.db)
    ↓
Public Account Metadata (username, token_id, granted_scopes, expiration)

OS Credential Store (keyring)
    ↓
Sensitive Secrets (GitHub PAT, Node Pairing Secret, Session Keys)
```

* **Storage Engine (`services/credentials.py`)**:
  * **Linux**: Secret Service API via `keyring` (integrates with GNOME Keyring / KWallet over D-Bus).
  * **Windows**: Windows Credential Manager (`wincred`).
  * **Headless / CI Fallback**: AES-256-GCM encrypted local store keyed to a machine-derived seed (`/etc/machine-id` or Windows `MachineGuid`).
* **Retrieval Workflow**:
  * The frontend UI **never** sees or requests the raw GitHub PAT.
  * When a background sync runs, `services/github.py` fetches the token directly from `keyring.get_password("stalink", "github_pat")` in-memory.
  * Tokens are scrubbed from all logging, IPC event payloads, and diagnostic outputs.

### Authentication & Authorization Tiers

```text
Authentication
├── Local Desktop      → Implicit trust (Neutralino random auth token over stdio)
├── Paired Nodes       → Mutual Pre-Shared Key (PSK) via 'X-StaLink-Node-Token' header
├── Mobile Clients     → Ephemeral Bearer Token (exchanged via QR code pairing)
└── WAN Clients        → Mandatory Bearer Token + Cloudflare Access protection

Authorization Tiers
├── Tier 1 (Read-Only) → Device status, peer list, task list, project metadata, read clipboard
├── Tier 2 (Control)   → Start/stop sync, trigger stream, execute spawn plan, move Kanban card
├── Tier 3 (Sensitive) → File upload, emergency STOP_ALL killswitch, config updates, node pairing
└── Tier 4 (Forbidden) → Arbitrary shell execution over network, remote credential reads
```

---

## 🔌 9. API / IPC Architecture

### Unified Command & Service Model
Both desktop and mobile frontends trigger the **same backend service methods** through a unified Command Router:

```text
Desktop React UI                       Mobile Companion / Web Hub
       │                                            │
Neutralino stdio IPC                       HTTP REST / WebSocket (:18383)
       │                                            │
       └────────────────────┬───────────────────────┘
                            ▼
               [Command Router (main.py)]
                            │
               [Auth & ACL Check (auth.py)]
                            │
                            ▼
               [Backend Services Layer]
     (app_registry, app_resolver, spawner, nodes,
      route_resolver, kvm, sync, workspace, tasks)
                            │
                            ▼
               [Event Broadcaster]
         (Emits to stdio + WebSockets)
```

### Modular Python Backend Structure
```text
extensions/backend/
├── main.py                  # IPC stdio loop, HTTP REST / WS server, command router
├── env_detector.py          # OS, CPU, RAM, display server profiler
├── apps.json                # Authoritative static Application & Game Registry
├── bin/                     # Auto-downloaded binaries (mutagen, deskflow, cloudflared)
└── services/
    ├── db.py                # SQLite WAL connection, migrations, base queries
    ├── app_registry.py      # apps.json parser & validator
    ├── app_resolver.py      # Dynamic OS executable, service & game detector
    ├── spawner.py           # Preflight validation, dependency ordering, execution
    ├── nodes.py             # Node identity, registry, capability detection
    ├── discovery.py         # UDP broadcast beacon & listener (:18382)
    ├── route_resolver.py    # Intelligent LAN vs Tailscale route decision engine
    ├── kvm.py               # Deskflow supervisor (with Game Mode cursor lock)
    ├── sync.py              # Mutagen session lifecycle & conflict monitoring
    ├── tailscale.py         # Tailscale CLI wrapper & auto-installer
    ├── stream.py            # Sunshine host REST API & Moonlight client launcher
    ├── workspace.py         # Projects & Development Environments CRUD
    ├── tasks.py             # Tasks, milestones, Kanban state engine
    ├── github.py            # GitHub REST client, offline cache, rate limiter
    ├── credentials.py       # OS keyring / Secret Service bridge
    ├── activity.py          # Audit trail & activity logger
    ├── sessions.py          # Work session orchestration runner
    └── auth.py              # Node pairing, token validation & ACL checks
```

---

## 🌐 10. Tailscale + LAN Route Resolver

The `RouteResolver` (`services/route_resolver.py`) is a centralized backend service. Rather than hardcoding network checks inside individual utilities, KVM, Mutagen, Streaming, and Remote Spawning query the Route Resolver for a target `node_id`.

```text
Service Request (e.g. Remote Spawn or Game Stream to node_id)
            ↓
RouteResolver.resolve(node_id)
            ↓
1. Lookup Node in DB (get last_lan_ip and tailscale_ip)
2. Probe LAN endpoint (TCP connect probe on port with 200ms timeout)
3. If reachable on LAN:
       → Return Route(type="lan", endpoint=last_lan_ip, latency_ms=1.2)
4. If LAN unreachable:
       → Probe Tailscale IP (100.x.y.z)
       → If reachable:
             → Return Route(type="tailscale", endpoint=tailscale_ip, latency_ms=28.4)
5. If neither reachable:
       → Return Route(type="unreachable", endpoint=None)
```

---

## ⚡ 11. Work Session & Mass Spawner Integration

Work Sessions and the Mass App Spawner operate in seamless harmony:
* **The Mass App Spawner is fully usable on its own**: A user can open StaLink, choose "Sim Racing & Streaming", check ACC, SimHub, and Discord, and click `SPAWN SELECTED` without starting KVM, sync, or VPNs.
* **Work Sessions consume the Mass App Spawner**: For full end-to-end automation, a project or gaming workflow includes spawning as a discrete step (`spawner:execute_plan`).

```json
{
  "name": "Wunderkraft Full Dev & Playtest Session",
  "steps": [
    {
      "id": "step_1",
      "action": "node:verify_reachable",
      "params": { "node_id": "laptop-node-uuid" },
      "timeout_sec": 5,
      "optional": false
    },
    {
      "id": "step_2",
      "action": "kvm:start",
      "params": { "role": "server", "target_node_id": "laptop-node-uuid", "game_mode_cursor_lock": true },
      "timeout_sec": 10,
      "optional": true
    },
    {
      "id": "step_3",
      "action": "sync:start",
      "params": { "env_id": "env-wkr-laptop" },
      "timeout_sec": 15,
      "optional": false
    },
    {
      "id": "step_4",
      "action": "spawner:execute_plan",
      "params": {
        "profile_id": "unity-playtest",
        "target_node_id": "laptop-node-uuid",
        "selected_app_ids": ["unity", "obs-studio", "discord"]
      },
      "timeout_sec": 30,
      "optional": false
    },
    {
      "id": "step_5",
      "action": "stream:start",
      "params": { "target_node_id": "laptop-node-uuid", "preset": "1440p120" },
      "timeout_sec": 15,
      "optional": true
    }
  ]
}
```

---

## 📅 12. Detailed Phase Specifications (With Incremental Cockpit Evolution)

### Phase 1: Vite + React Scaffolding & Desktop Integration (`[COMPLETED]`)
* React 18, Vite 5, Tailwind CSS, `@neutralinojs/lib` configured.
* Window setup (1000x720, dark sci-fi aesthetic theme), custom Vite dev reload plugin.

### Phase 2: Binary Auto-Installer & System Environment Detection (`[COMPLETED]`)
* Hardware & OS profiler (`env_detector.py`): CPU, RAM, OS/Kernel, Wayland/X11, Network IP.
* Multi-tier accelerated downloader (`aria2c` 16-channel + CDN mirrors → `curl` watchdog → `urllib`).
* In-memory archive extraction (.tar.gz, .zip, .deb Debian AR parser).
* **All 3 dependencies verified & installed**: Mutagen v0.18.1, Deskflow v1.26.0, Cloudflared.

### Phase 3: Core Multi-Device Services & IPC Bridge (`[IN PROGRESS]`)
* **Backend Complete**: Subprocess supervisor (`KVM_PROCESS`, `SYNC_PROCESSES`, `TUNNEL_PROC`), `atexit` zero-zombie cleanup, `STOP_ALL` master kill switch, UDP LAN discovery beacon (`:18382`), HTTP REST server on `:18383`.
* **KVM Game Mode Cursor Lock**:
  * Configurable hotkey (e.g. `Scroll Lock` or `Ctrl+Alt+L`) locking cursor to active machine during 3D/FPS games to prevent mouse escaping to secondary screens.
* **UI In Progress**:
  * `KvmPanel.jsx`: Server/Client mode toggle, target peer auto-bind, port configuration, Game Mode toggle, Start/Stop toggle.
  * `SyncPanel.jsx`: Local/remote path inputs, game engine ignore rule presets, Start/Stop sync session.
  * Header Emergency Kill Switch button.
* **Incremental Cockpit Addition**: Cockpit displays the **Local Node Specs Grid** and **Discovered LAN Peer Fleet**.

### Phase 4: Application Registry, Resolver & Mass App Spawner (`[PLANNED]`)
* **Authoritative Registry (`apps.json`)**: Expanded schema defining discovery rules, services, tools, and game platforms (Steam `steam://`, Lutris, Heroic, OBS, Discord, MangoHud).
* **Dynamic OS Resolver (`services/app_resolver.py`)**:
  * Linux: PATH scanner, `.desktop` entry reader, flatpak/snap detection, Steam library scanner.
  * Windows: Registry lookup (App Paths, Uninstall keys, Steam), `vswhere.exe` for Visual Studio, Unity Hub editor scanner.
  * Version detection (e.g. VS 2022 Community vs. Professional) and user overrides in SQLite.
* **Mass Spawner Engine (`services/spawner.py`)**:
  * Dependency sorter (Starts background services/drivers before launching GUI apps or games).
  * Preflight check validator (Ready / Missing / Stopped status).
  * Detached process execution with stdout/stderr pipe isolation.
* **Remote Spawning RPC**: `POST /api/spawner/execute` validates `app_id` on target peer; executes locally without shell injection.
* **Frontend UI (`MassSpawnerPanel.jsx`)**:
  * Profile dropdown with quick presets ("C# Development", "Unity Game Dev", "Sim Racing & Streaming", "Web Fullstack").
  * Checkbox list with "Select All", "Select Defaults", "Clear All".
  * Target machine selector (`This PC` vs. paired peer nodes).
  * Live preflight indicators and one-click `SPAWN SELECTED` button.
* **Incremental Cockpit Addition**: Cockpit gains the **Quick Spawner Widget** allowing instant 1-click launch of the default profile.

### Phase 5: Local Web Hub, Shared Clipboard & WAN File Transfer (`[PLANNED]`)
* **Local Web Hub**: Browser-accessible mobile UI served directly on `http://<LAN_IP>:18383/`.
* **Shared Clipboard (`WebClipboardPanel.jsx`)**: In-memory text buffer synced across connected devices.
* **Direct File Transfer (`FileTransferPanel.jsx`)**: `POST /upload_file` accepting drag-and-drop bytes into `transfers/`.
* **Cloudflare WAN Quick Tunnel**: `cloudflared` process supervisor emitting public HTTPS URL and QR pairing code.
* **Incremental Cockpit Addition**: Cockpit gains **Quick Clipboard Snippet widget** and **WAN Tunnel Status badge**.

### Phase 6: Node Identity, Tailscale Mesh & Route Resolver (`[PLANNED]`)
* **Persistent Node Identity**: Generates `node_id` (UUIDv4) and registers capabilities in SQLite `nodes` table.
* **Tailscale Automated Installer**:
  * Linux: Official script with `pkexec`/`sudo` or standalone portable user-space binary fallback (`--tun=userspace-networking`).
  * Windows: Official MSI installer / `winget install Tailscale.Tailscale`.
  * In-App Authentication: Scrapes `tailscale up --qr` and displays QR code / auth URL in UI.
* **Intelligent Route Resolver (`services/route_resolver.py`)**: Central service resolving optimal transport (LAN `192.168.x.x` vs Tailscale `100.x.y.z`).
* **Frontend UI (`TailscalePanel.jsx`)**: Peer connection badges, MagicDNS names, and active route indicators.
* **Incremental Cockpit Addition**: Peer cards in Cockpit now show **Active Route Badges (`[LAN]` vs `[MESH]`)** and **Ping Latency**.

### Phase 7: Ultra-Low Latency Remote Streaming (Sunshine & Moonlight) (`[PLANNED]`)
* **Host End (Sunshine Server - `services/stream.py`)**:
  * Daemon detection (`sunshine.exe` on Windows, systemd/binary on Linux).
  * 1-Click In-App PIN Pairing helper submitting client PIN to `https://localhost:47990/api/pin`.
  * Encoder presets (NVENC, AMF, QuickSync, VAAPI) and streaming profiles (1080p60, 1440p60, 1080p120, 1440p120, 4K).
  * Virtual Gamepad / Controller Passthrough (Xbox/PlayStation gamepad emulation).
  * Headless display detection & virtual monitor advice.
* **Client End (Moonlight Client)**:
  * Client binary detection (`moonlight-qt`, `moonlight` CLI, `Moonlight.exe`).
  * CLI stream launcher injecting optimal Route Resolver IP.
* **Frontend UI (`StreamHubPanel.jsx`)**: Host/Client switcher, paired host list, launch presets.
* **Incremental Cockpit Addition**: 1-click **"Stream Desktop / Game" button directly on Cockpit Peer Cards**.

### Phase 8: Core Workspace, SQLite Engine & Cockpit Foundation (`[PLANNED]`)
* SQLite initialization (`services/db.py`) with WAL mode, foreign keys, and indexes.
* Project CRUD operations (`GET_PROJECTS`, `CREATE_PROJECT`, `UPDATE_PROJECT`, `DELETE_PROJECT`).
* Projects bind to a default **Spawn Profile** (`default_spawn_profile_id`).
* Development Environment profiles referencing `node_id` and storing role presets.
* **Incremental Cockpit Addition**: Cockpit gains **Active Projects Carousel** and **Environment Assignment HUD**.

### Phase 9: Lightweight Task & Kanban System (`[PLANNED]`)
* 5-column Kanban board (`Backlog`, `Todo`, `Doing`, `Blocked`, `Done`).
* Project-scoped Task IDs (`WKR-042`), priority levels, milestone tags, assigned node.
* Filtering by project, milestone, priority, and assigned environment.
* **Incremental Cockpit Addition**: Cockpit gains **"Tasks Needing Attention" widget** showing tasks in `Doing` and `Blocked`.

### Phase 10: GitHub Integration Layer & Activity Subsystem (`[PLANNED]`)
* OS Keyring integration (`services/credentials.py`) for secure GitHub PAT storage.
* Offline-first cache (`github_cache` table) storing Issues, PRs, Commits, and Branches.
* Background rate-limited polling worker with exponential backoff.
* Association engine linking tasks (`WKR-042`) with GitHub issues and branches.
* **Incremental Cockpit Addition**: Cockpit gains **"Recent Repository Activity" stream** and **Active PR Tracker**.

### Phase 11: Work Session Automation & Unified Command Center Cockpit (`[PLANNED]`)
* Orchestration engine (`services/sessions.py`) executing JSON-defined session steps sequentially with timeouts and rollback (consumes `spawner:execute_plan`).
* Pre-configured templates (e.g. "Start Dev Session", "Launch Sim Racing Rig", "Sync & Build", "Emergency Stop").
* **Full Cockpit Unification**: Cockpit answers all 4 core questions:
  1. *What am I currently working on?* (Active project & Git branch)
  2. *What tasks need attention?* (Urgent & blocked tasks)
  3. *What changed recently?* (Activity feed & GitHub commits)
  4. *Which devices/environments are available?* (Node fleet & route latency)
* One-click **"Start Work Session" macro button** prominently positioned in the Cockpit header.

### Phase 12: Mobile Companion App (Capacitor for Android & iOS) (`[PLANNED]`)
* **Mobile MVP**:
  * Capacitor core integration (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`).
  * Platform Abstraction Layer (`platform.js`) routing IPC to HTTP REST / WebSockets.
  * QR code pairing with host desktop.
  * Mobile Cockpit view: live device fleet status, active project view, and Spawner trigger.
  * Task / Kanban viewing & quick status progression.
  * Native shared clipboard sync (`@capacitor/clipboard`).
  * Direct photo / file upload to host `transfers/` folder.
  * Basic service toggles & Emergency Killswitch (`STOP_ALL`).
* **Later (Future Enhancements)**:
  * **Stream Deck / Game Macro Pad**: Hotkeys for Discord Mute/Deafen, OBS clip trigger, volume mixer, and game launch tiles.
  * Virtual trackpad & media remote.
  * Deep-link Moonlight mobile streaming.
  * Biometric FaceID/Fingerprint authentication.
  * Haptic feedback & push notifications.

### Phase 13: Production Packaging & Multi-Platform Release Distribution (`[PLANNED]`)
* **Desktop**: `npm run build` + `neu build` generating standalone Linux (`x64`, `arm64`) and Windows (`x64`) executables.
* **Mobile**: `npx cap sync` producing signed Android APKs/AABs and iOS Xcode archives.
* **Testing**: Automated headless smoke tests for IPC communication and WebViews.

---

## 🎯 13. Subsystem MVP Boundaries

| Subsystem | MVP (Must Exist First) | Enhanced (Next Iteration) | Future (Long-Term Vision) |
| :--- | :--- | :--- | :--- |
| **Mass App Spawner**| Checkbox selection, apps.json registry, dynamic resolution, services/apps/games, preflight | Reusable profile editor, argument templates, Steam/Lutris URI launcher, dependency ordering | Version override picker, remote peer spawning |
| **Workspace** | Project CRUD, local paths, engine/language tags, Dev Environments referencing `node_id` | Default spawn profile binding, project templates | Multi-user team workspace sync |
| **Tasks & Kanban** | 5-column Kanban, project-scoped IDs (`WKR-042`), priority, milestone assignment | Task dependencies, tag filtering, search bar | Time tracking, burndown charts |
| **GitHub** | Keyring PAT storage, offline cache of open issues & PRs, manual refresh | Auto-link branch to task, background polling (15m) | In-app PR code review, issue creation |
| **Work Sessions** | Sequential action runner (KVM, Sync, Spawner, Stream) with timeouts | Reusable session templates, UI step progress bar | Conditional branching, failure recovery scripts |
| **Tailscale** | CLI status probe, 100.x.y.z resolution, auto-installer script / winget | Background daemon health monitor, QR login bridge | Exit node routing, subnet router controls |
| **Streaming** | Sunshine service check, in-app PIN pairing modal, Moonlight CLI launcher, 120 FPS game stream | Quality presets (1080p/1440p/4K), encoder selector, virtual gamepad passthrough | Virtual display driver auto-configuration |
| **Mobile (Capacitor)**| Connect via QR, view devices/tasks, clipboard, file upload, killswitch | Macro pad buttons (Discord/OBS), trackpad mode, Moonlight link | Camera whiteboard scanner, biometrics |
| **Web Hub & WAN** | HTTP server on `:18383`, clipboard snippet, file upload, `cloudflared` tunnel | In-app QR code generator, password protection | Custom domain Cloudflare Tunnel routing |

---

## 🛡️ 14. Architectural Risk Management

| Risk | Impact | Practical Mitigation |
| :--- | :--- | :--- |
| **1. Application Path / Version Drift** | Executable moved or updated; profile breaks. | Never store hardcoded paths in profiles. Store `app_id`; dynamic resolver searches known registry/PATH locations. Allow manual path overrides as fallback in SQLite. |
| **2. Background Service Startup Delays** | Dependent app opens before database/service is ready. | Spawner executes services first, verifies readiness (port ping or service status), and applies short polling delay before spawning dependent GUI tools. |
| **3. Remote Spawn Command Injection** | Malicious peer sends arbitrary shell commands. | Disallow arbitrary commands over network. Remote requests accept only whitelisted `app_id` keys from static `apps.json`. |
| **4. KVM Cursor Drift in Fullscreen/3D Games** | Mouse slips off gaming screen to secondary PC during gameplay. | Provide Deskflow "Game Mode" toggle with hotkey (e.g. `Scroll Lock`) locking cursor strictly to active gaming monitor. |
| **5. SQLite Concurrency** | Database locked errors when UI reads during backend background writes. | Enable SQLite WAL mode (`PRAGMA journal_mode=WAL;`). Restrict all write transactions to a single Python backend thread queue. Keep transactions short. |
| **6. Database Migrations** | Schema changes break existing user data on update. | Include `schema_migrations` table. Apply incremental SQL migration scripts (`001_initial.sql`, `002_add_spawner.sql`) on startup before mounting services. |
| **7. Backend Monolithic Growth** | `main.py` becomes unmaintainable (>2,000 lines). | Enforce strict modularization: `main.py` acts strictly as IPC/API router. All logic lives in dedicated `services/*.py` modules (`spawner.py`, `app_resolver.py`, etc.). |
| **8. Node Identity Collisions** | Duplicate node IDs cause routing conflicts. | Generate permanent UUIDv4 on first boot and store in OS user config directory. Use UUIDv4 collision-resistant keys. |
| **9. LAN Discovery Spoofing** | Rogue device on network advertises fake StaLink services. | Require explicit user pairing approval on first contact. Exchange a shared pairing secret (`X-StaLink-Node-Token`) before accepting control commands. |
| **10. RPC Authentication** | Unauthorized network client triggers app launch or service stop. | Enforce Bearer token / PSK authentication on all non-read HTTP endpoints. Restrict dangerous actions to paired nodes. |
| **11. WAN Exposure via Cloudflare** | Public tunnel exposes backend to web scanners/attackers. | Require Bearer authentication on WAN endpoints. Enforce upload size caps (500MB). Disable command execution over WAN. |
| **12. Credential Storage & Leaks** | GitHub PAT leaked via SQLite database copy or logs. | Never store PAT in SQLite. Use OS Keyring (`keyring` library). Scrub tokens from all logs, error traces, and IPC responses. |
| **13. GitHub Rate Limiting** | Exceeding 5,000 req/hr limits or IP bans when offline. | Cache-first design: UI only reads from SQLite `github_cache`. Background worker throttles polling to 10–15m intervals with exponential backoff on HTTP 403/429. |
| **14. Dynamic IP & DHCP Churn** | IP change breaks KVM, sync, or streaming bindings. | Development Environments bind to `node_id`, not IP. Route Resolver dynamically resolves the latest discovered IP on demand. |
| **15. Route Selection & Firewall Blocks** | Direct LAN fails due to OS firewall; VPN routing adds lag. | Central `RouteResolver` probes LAN first (200ms timeout) before falling back to WireGuard mesh. Diagnostic helper detects blocked ports. |
| **16. Malicious File Uploads** | Web upload overwrites critical system files. | Sanitize filenames with `os.path.basename`. Confine all uploads strictly to `transfers/` sandbox. Block executable extensions (`.sh`, `.exe`) unless explicitly whitelisted. |
| **17. Process Lifecycle Failures** | Crashed or zombie KVM/Sync processes lock ports. | Subprocess supervisor maintains active PID references, attaches `atexit` cleanup handlers, and provides a top-level `STOP_ALL` killswitch. |
| **18. Mobile/Desktop IPC Divergence** | Duplicated application logic for Neutralino vs Mobile. | Platform abstraction layer (`platform.js`) detects runtime; unified Command Router in backend serves both stdio and HTTP/WS. |

---

## 🚀 15. Final Recommended Implementation Order

```
[Phase 3 UI Completion] ──► [Phase 4: Mass App Spawner] ──► [Phase 5: Web Hub & Clipboard]
                                                                        │
                                                                        ▼
[Phase 8: Workspace & Projects] ◄── [Phase 7: Sunshine / Moon] ◄── [Phase 6: Node ID & Tailscale]
         │
         ▼
[Phase 9: Kanban & Tasks] ──► [Phase 10: GitHub & Keyring] ──► [Phase 11: Work Sessions & Cockpit]
                                                                        │
                                                                        ▼
[Phase 13: Multi-Platform Release] ◄──────────────────────── [Phase 12: Mobile Companion MVP]
```

1. **Step 1 (Immediate)**: Complete Phase 3 UI panels (`KvmPanel.jsx` with Game Mode cursor-lock, `SyncPanel.jsx`, header killswitch) to finalize the core desktop workstation controls.
2. **Step 2**: Implement Phase 4 **Application Registry, Dynamic Resolver & Mass App Spawner** (`apps.json`, `services/app_registry.py`, `services/app_resolver.py`, `services/spawner.py`, and `MassSpawnerPanel.jsx` with dev and game launch profiles).
3. **Step 3**: Implement Phase 5 Web Hub, Shared Clipboard, and Cloudflare WAN quick tunnel.
4. **Step 4**: Implement Phase 6 Node Identity (`services/nodes.py`), Tailscale auto-installer, and the centralized `RouteResolver`.
5. **Step 5**: Implement Phase 7 Sunshine & Moonlight Remote Streaming Hub with in-app PIN pairing and 120/144 FPS game streaming / virtual gamepad passthrough.
6. **Step 6**: Implement Phase 8 SQLite Database Engine (`services/db.py`), Project/Game Profiles (linking to default Spawn Profiles), and the Cockpit Project HUD.
7. **Step 7**: Implement Phase 9 Lightweight Kanban & Task System with project-scoped IDs (`WKR-042`).
8. **Step 8**: Implement Phase 10 OS Keyring integration (`services/credentials.py`) and GitHub offline cache engine.
9. **Step 9**: Implement Phase 11 Work Session Automation runner (`services/sessions.py` consuming `spawner:execute_plan`) and finalize the unified Cockpit HUD.
10. **Step 10**: Implement Phase 12 Mobile Companion MVP using Capacitor (status, tasks, clipboard, file drop, killswitch, and game macro pad triggers).
11. **Step 11**: Finalize Phase 13 Multi-Platform Packaging (`neu build` desktop executables + Android/iOS builds) and smoke tests.
