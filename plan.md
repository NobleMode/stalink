# Phase 1: Configure React + Vite & Recreate Existing UI (Completed)

Configure Vite, React, and Tailwind CSS for StaLink, update `neutralino.config.json` for frontend dev/build integration, and rewrite the current UI (`resources/index.html` and `resources/js/main.js`) into clean React components while preserving 100% of the current sci-fi styling, animations, and functionality.

---

## Proposed Architectural Setup

1. **Vite + React Core:**
   - Root `package.json` with React 18/19, Vite, `@vitejs/plugin-react`, and `@neutralinojs/lib`.
   - `vite.config.js` configured with React plugin, strict dev port `5173`, and output directory `dist`.
   - Root `index.html` with root element, fonts, and module entry `/src/main.jsx`.

2. **Tailwind CSS & Styling:**
   - `tailwind.config.js` and `postcss.config.js` preserving the current styling palette:
     - Background: `#020617` (slate-950)
     - Panels: `#0f172a` (slate-900) with `#334155` borders
     - Accent: Electric blue (`#3b82f6` / `#60a5fa`) and emerald/rose status indicators
     - Sci-fi corner cut accents (`.box-panel::after`, `.btn-triangle::after`)
     - Monospace typography & custom terminal scrollbars
     - Indeterminate & fade animations

3. **Component Architecture (`src/`):**
   - `src/main.jsx`: Mounts React app and initializes Neutralino.
   - `src/App.jsx`: Root state orchestrator:
     - Listens to Neutralino events (`INSTALLER_STATUS`, `INSTALLER_PROGRESS`, `INSTANCE_STARTED`).
     - Manages global state: `isInstalled`, `installStatus`, `installLogs`, `localNode`, `peers`, `linkedPeer`.
     - Controls view switching (Splash Screen vs. Main Dashboard).
     - Configures System Tray via `Neutralino.os.setTray()` and window close-to-tray logic.
   - `src/components/InstallerSplash.jsx`:
     - Status card ("Connecting...", "Installing Systems...", "Systems Ready", "Installation Error").
     - Live installation timer (`00:00`).
     - Indeterminate / solid progress bar with animated transitions.
     - Live terminal logs with toggle button (`[+] Show Logs` / `[-] Hide Logs`).
     - "Retry Installation" button.
     - Automatic 1.5s fade-out into the main dashboard upon `COMPLETE`.
   - `src/components/Dashboard.jsx`:
     - Top Nav: Brand logo, title ("StaLink Control"), "Reinstall" (force retry) button, "Online" status pill.
     - Header: "System Dashboard", "Core binaries verified and linked."
     - Feature quick-cards: "Deskflow Engine" and "Mutagen Sync".
     - `src/components/LocalNodeCard.jsx`: Displays Hostname, IP, Port, Mode (`Bg/Tray`), and pulse indicator.
     - `src/components/NetworkPeersCard.jsx`: "Scan LAN" button with loading spinner, active link banner with "Drop" disconnect button, peers list with "Self", "Linked", or "Connect" actions.

4. **Neutralino Configuration (`neutralino.config.json`):**
   - Configure `cli.frontendLibrary`:
     - `patchFile`: `"/index.html"`
     - `devUrl`: `"http://localhost:5173"`
     - `devCommand`: `"npm run dev"`
     - `buildCommand`: `"npm run build"`
   - Set `cli.resourcesPath`: `"/dist"`
   - Update window dimensions (1000x720, min 800x600) and title ("StaLink Command Center").
   - Retain existing extension configuration (`js.neutralino.installer`) so existing backend scripts continue working seamlessly.

5. **Whitelist Apps Seed File (`apps.json`):**
   - Create root `apps.json` as specified in Phase 1 checklist to establish target layout.

---

## Verification Plan

### Automated / Build Verification
- Run `npm install` to ensure all packages resolve.
- Run `npm run build` to verify Vite successfully compiles JSX, bundles Tailwind CSS, and outputs to `/dist`.

### Functional Verification
- Verify that `dist/index.html` and bundled assets exist and contain all necessary styles.
- Test that all UI states (Connecting, Installing, Complete, Error, Logs toggle, Scanning peers, Connecting to peer) render and match the existing design pixel-for-pixel.
