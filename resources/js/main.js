function initApp() {
    Neutralino.init();

    let isInstallComplete = false;

    // Close-to-tray behavior if complete, otherwise quit app and clean up if mid-install
    Neutralino.events.on('windowClose', async () => {
        if (!isInstallComplete) {
            // Cancel install and wipe partial tools to force reinstall on next boot
            if (typeof Neutralino !== 'undefined' && Neutralino.extensions) {
                try {
                    await Neutralino.extensions.dispatch('js.neutralino.installer', 'cancelInstall');
                } catch (err) {
                    console.error("Failed to dispatch cancelInstall:", err);
                }
            }
            Neutralino.app.exit();
        } else {
            Neutralino.window.hide().catch(err => {
                console.error("Failed to hide window on close:", err);
            });
        }
    });

    // Setup tray menu
    async function setupTray() {
        if (typeof Neutralino !== 'undefined' && Neutralino.os) {
            try {
                await Neutralino.os.setTray({
                    icon: '/resources/icons/trayIcon.png',
                    menuItems: [
                        { id: "SHOW", text: "Show Dashboard" },
                        { id: "QUIT", text: "Quit StaLink" }
                    ]
                });
            } catch (err) {
                console.error("Failed to setup tray menu:", err);
            }
        }
    }

    // Handle tray item clicks
    Neutralino.events.on('trayMenuItemClicked', (event) => {
        const id = event.detail.id;
        if (id === 'SHOW') {
            Neutralino.window.show().catch(err => {
                console.error("Failed to show window from tray:", err);
            });
        } else if (id === 'QUIT') {
            Neutralino.app.exit().catch(err => {
                console.error("Failed to exit app from tray:", err);
            });
        }
    });

    setupTray();

    const splashScreen = document.getElementById('splash-screen');
    const mainDashboard = document.getElementById('main-dashboard');
    const statusTitle = document.getElementById('installer-status-title');
    const statusDesc = document.getElementById('installer-status-desc');
    const logsContainer = document.getElementById('installer-logs');
    const terminalContainer = document.getElementById('terminal-container');
    const toggleLogBtn = document.getElementById('toggle-log-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const timerEl = document.getElementById('install-timer');
    const retryBtn = document.getElementById('retry-btn');
    const forceRetryBtn = document.getElementById('force-retry-btn');

    let installStartTime = null;
    let installTimerInterval = null;

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function startTimer() {
        if (!installStartTime) {
            installStartTime = Date.now();
            timerEl.classList.remove('hidden');
            installTimerInterval = setInterval(() => {
                timerEl.innerText = formatTime(Date.now() - installStartTime);
            }, 1000);
        }
    }

    function stopTimer() {
        if (installTimerInterval) {
            clearInterval(installTimerInterval);
            installTimerInterval = null;
        }
    }

    toggleLogBtn.addEventListener('click', () => {
        if (terminalContainer.classList.contains('hidden')) {
            terminalContainer.classList.remove('hidden');
            toggleLogBtn.innerText = '[-] Hide Logs';
        } else {
            terminalContainer.classList.add('hidden');
            toggleLogBtn.innerText = '[+] Show Logs';
        }
    });

    function appendLog(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = type === 'error' ? 'text-red-400' : 
                        type === 'success' ? 'text-emerald-400' : 'text-slate-500';
        div.innerText = `> ${msg}`;
        logsContainer.appendChild(div);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    Neutralino.events.on('INSTALLER_STATUS', (evt) => {
        const data = evt.detail;
        
        appendLog(`[${data.status}] ${data.payload}`);

        if (data.status === 'ERROR') {
            statusTitle.innerText = "Installation Error";
            statusTitle.className = "text-base font-bold text-red-500 uppercase";
            statusDesc.innerText = data.payload;
            isInstallComplete = false;
            progressContainer.classList.add('hidden');
            stopTimer();
            retryBtn.classList.remove('hidden'); // Show retry button
            toggleLogBtn.classList.remove('hidden');
            appendLog(data.payload, 'error');
        } 
        else if (data.status === 'MISSING') {
            statusTitle.innerText = "Dependencies Missing";
            statusTitle.className = "text-base font-bold text-slate-100 uppercase";
            statusDesc.innerText = data.payload;
            progressContainer.classList.add('hidden');
            retryBtn.classList.add('hidden');
            toggleLogBtn.classList.remove('hidden');
        }
        else if (data.status === 'INSTALLING') {
            statusTitle.innerText = "Installing Systems...";
            statusTitle.className = "text-base font-bold text-slate-100 uppercase";
            statusDesc.innerText = data.payload;
            progressContainer.classList.remove('hidden');
            progressBar.classList.remove('bg-red-500', 'bg-emerald-500', 'w-full');
            progressBar.classList.add('bg-blue-500', 'w-[40%]', 'animate-indeterminate');
            retryBtn.classList.add('hidden');
            toggleLogBtn.classList.remove('hidden');
            startTimer();
        }
        else if (data.status === 'COMPLETE') {
            statusTitle.innerText = "Systems Ready";
            statusTitle.className = "text-base font-bold text-emerald-500 uppercase";
            statusDesc.innerText = data.payload;
            isInstallComplete = true;
            progressContainer.classList.remove('hidden');
            progressBar.classList.remove('animate-indeterminate', 'w-[40%]', 'bg-blue-500', 'bg-red-500');
            progressBar.classList.add('w-full', 'bg-emerald-500');
            stopTimer();
            retryBtn.classList.add('hidden');
            appendLog(data.payload, 'success');

            // Wait 1.5 seconds for users to see success state, then fade to main dashboard
            setTimeout(() => {
                splashScreen.classList.add('animate-fade-out');
                
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                    mainDashboard.classList.remove('hidden');
                    mainDashboard.classList.add('animate-fade-in');
                }, 800); // Wait for fadeOut animation
            }, 1500);
        }
    });

    Neutralino.events.on('INSTALLER_PROGRESS', (evt) => {
        const data = evt.detail;
        if (data.log) {
            statusDesc.innerText = data.log; // Display generic text right above the bar
            appendLog(data.log);
        }
    });

    retryBtn.addEventListener('click', () => {
        appendLog("Retrying installer...");
        statusTitle.innerText = "Connecting...";
        statusTitle.className = "text-base font-bold text-slate-100 uppercase";
        statusDesc.innerText = "Re-initializing requirement checks...";
        progressContainer.classList.add('hidden');
        progressBar.classList.remove('w-full', 'bg-red-500', 'bg-emerald-500');
        progressBar.classList.add('w-[40%]', 'animate-indeterminate', 'bg-blue-500');
        timerEl.innerText = "00:00";
        retryBtn.classList.add('hidden');
        
        if (typeof Neutralino !== 'undefined' && Neutralino.extensions) {
            Neutralino.extensions.dispatch('js.neutralino.installer', 'appReady')
                .then(() => {
                    appendLog("appReady successfully dispatched for retry.");
                })
                .catch((err) => {
                    appendLog(`Failed to dispatch retry: ${JSON.stringify(err)}`, 'error');
                });
        }
    });

    forceRetryBtn.addEventListener('click', () => {
        appendLog("Initiating user-requested force reinstall...");
        
        // Show splash screen, hide dashboard
        splashScreen.style.display = 'flex';
        splashScreen.classList.remove('animate-fade-out');
        splashScreen.style.opacity = '1';
        mainDashboard.classList.add('hidden');
        mainDashboard.classList.remove('animate-fade-in');
        
        // Reset splash screen UI state
        statusTitle.innerText = "Resetting Binaries...";
        statusTitle.className = "text-base font-bold text-slate-100 uppercase";
        statusDesc.innerText = "Wiping local binary installations...";
        progressContainer.classList.add('hidden');
        progressBar.classList.remove('w-full', 'bg-red-500', 'bg-emerald-500');
        progressBar.classList.add('w-[40%]', 'animate-indeterminate', 'bg-blue-500');
        timerEl.innerText = "00:00";
        retryBtn.classList.add('hidden');
        
        // Reset terminal logs
        logsContainer.innerHTML = '<div class="text-blue-500">> Resetting local bin environment...</div>';
        
        // Dispatch forceRetry event
        if (typeof Neutralino !== 'undefined' && Neutralino.extensions) {
            Neutralino.extensions.dispatch('js.neutralino.installer', 'forceRetry')
                .then(() => {
                    appendLog("forceRetry event successfully dispatched.");
                })
                .catch((err) => {
                    appendLog(`Failed to dispatch forceRetry: ${JSON.stringify(err)}`, 'error');
                });
        }
    });

    let localInstancePort = null;
    let localHostname = '';
    let localIp = '';
    let peers = [];
    let linkedPeer = null;

    const hostnameEl = document.getElementById('local-hostname');
    const ipEl = document.getElementById('local-ip');
    const portEl = document.getElementById('local-port');
    const peersListEl = document.getElementById('peers-list');
    const scanBtn = document.getElementById('scan-peers-btn');
    const activeConnectionStatus = document.getElementById('active-connection-status');
    const connectedPeerName = document.getElementById('connected-peer-name');
    const connectedPeerAddress = document.getElementById('connected-peer-address');
    const disconnectBtn = document.getElementById('disconnect-peer-btn');

    // Query status from Python HTTP server
    async function updateLocalStatus() {
        if (!localInstancePort) return;
        try {
            const res = await fetch(`http://localhost:${localInstancePort}/api/status`);
            const data = await res.json();
            
            localHostname = data.hostname;
            localIp = data.ip;
            
            hostnameEl.innerText = data.hostname;
            ipEl.innerText = data.ip;
            portEl.innerText = data.port;
            
            linkedPeer = data.linked_peer;
            renderActiveConnection();
        } catch (err) {
            console.error("Failed to fetch local node status:", err);
        }
    }

    function renderActiveConnection() {
        if (linkedPeer) {
            activeConnectionStatus.classList.remove('hidden');
            connectedPeerName.innerText = linkedPeer.hostname;
            connectedPeerAddress.innerText = `${linkedPeer.ip}:${linkedPeer.port}`;
        } else {
            activeConnectionStatus.classList.add('hidden');
        }
    }

    async function scanPeers() {
        if (!localInstancePort) {
            appendLog("Local instance port not yet resolved. Cannot scan.", 'error');
            return;
        }
        
        appendLog("Scanning local network for StaLink peers...");
        scanBtn.disabled = true;
        scanBtn.innerHTML = `
            <svg class="animate-spin h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            SCANNING...
        `;
        
        try {
            const res = await fetch(`http://localhost:${localInstancePort}/api/scan`);
            const data = await res.json();
            peers = data.peers || [];
            renderPeersList();
            appendLog(`Scan complete. Found ${peers.length} peers.`);
        } catch (err) {
            console.error("Failed to scan network:", err);
            appendLog("Network scan failed.", 'error');
        } finally {
            scanBtn.disabled = false;
            scanBtn.innerHTML = `
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.253 8H18"></path></svg>
                Scan LAN
            `;
        }
    }

    function renderPeersList() {
        peersListEl.innerHTML = '';
        if (peers.length === 0) {
            peersListEl.innerHTML = '<div class="text-slate-600 text-xs text-center py-4 border border-dashed border-slate-800 font-bold uppercase mt-2">No peers found. Click "SCAN LAN".</div>';
            return;
        }
        
        peers.forEach(peer => {
            const isConnected = linkedPeer && linkedPeer.ip === peer.ip && linkedPeer.port === peer.port;
            
            const item = document.createElement('div');
            item.className = "flex items-center justify-between p-2 bg-[#020617] border border-slate-800 hover:border-slate-700 transition-colors";
            
            const info = document.createElement('div');
            info.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-slate-200 uppercase">${peer.hostname}</span>
                    ${peer.is_self ? '<span class="px-1 py-0.5 text-[9px] font-bold bg-slate-900 text-slate-400 border border-slate-800 uppercase">Self</span>' : ''}
                </div>
                <span class="text-[10px] text-slate-500 font-mono">${peer.ip}:${peer.port}</span>
            `;
            
            const btn = document.createElement('button');
            if (peer.is_self) {
                btn.className = "px-2 py-1 bg-[#020617] text-slate-600 border border-slate-800 text-[10px] font-bold uppercase cursor-not-allowed";
                btn.innerText = "Connect";
                btn.disabled = true;
            } else if (isConnected) {
                btn.className = "px-2 py-1 bg-[#020617] text-emerald-500 border border-emerald-500/50 text-[10px] font-bold uppercase cursor-default";
                btn.innerText = "Linked";
            } else {
                btn.className = "px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 text-[10px] font-bold uppercase active:scale-95 transition-all cursor-pointer btn-triangle";
                btn.innerText = "Connect";
                btn.addEventListener('click', () => connectToPeer(peer));
            }
            
            item.appendChild(info);
            item.appendChild(btn);
            peersListEl.appendChild(item);
        });
    }

    async function connectToPeer(peer) {
        if (!localInstancePort) return;
        appendLog(`Linking KVM control desk with ${peer.hostname}...`);
        
        try {
            // Inform our own local server of the link
            const res = await fetch(`http://localhost:${localInstancePort}/api/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostname: peer.hostname,
                    ip: peer.ip,
                    port: peer.port
                })
            });
            const data = await res.json();
            
            if (data.status === 'linked') {
                linkedPeer = peer;
                renderActiveConnection();
                renderPeersList();
                appendLog(`Successfully linked peer: ${peer.hostname}`, 'success');
            } else {
                appendLog(`Connection refused: ${data.message}`, 'error');
            }
        } catch (err) {
            console.error("Failed to connect to peer:", err);
            appendLog("Failed to link peer. Interface unreachable.", 'error');
        }
    }

    async function disconnectPeer() {
        if (!localInstancePort || !linkedPeer) return;
        appendLog(`Unlinking peer connection...`);
        
        try {
            const res = await fetch(`http://localhost:${localInstancePort}/api/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disconnect: true })
            });
            const data = await res.json();
            
            if (data.status === 'disconnected') {
                appendLog(`Successfully disconnected from ${linkedPeer.hostname}.`, 'info');
                linkedPeer = null;
                renderActiveConnection();
                renderPeersList();
            }
        } catch (err) {
            console.error("Failed to disconnect peer:", err);
            appendLog("Failed to unlink peer.", 'error');
        }
    }

    scanBtn.addEventListener('click', scanPeers);
    disconnectBtn.addEventListener('click', disconnectPeer);

    // Listen for INSTANCE_STARTED events broadcast from background Python service
    Neutralino.events.on('INSTANCE_STARTED', (evt) => {
        const port = evt.detail.port;
        localInstancePort = port;
        appendLog(`Background Instance Port resolved: ${port}. Status: ACTIVE.`);
        updateLocalStatus();
    });

    // Send a message that UI is ready and dispatch appReady to the extension
    appendLog("UI Initialized. Dispatching appReady event to installer...");
    if (typeof Neutralino !== 'undefined' && Neutralino.extensions) {
        Neutralino.extensions.dispatch('js.neutralino.installer', 'appReady')
            .then(() => {
                appendLog("appReady event acknowledged.");
            })
            .catch((err) => {
                appendLog(`Failed to dispatch appReady: ${JSON.stringify(err)}`, 'error');
            });
    } else {
        appendLog("Neutralino extensions API not available.", 'error');
    }
}

window.addEventListener('DOMContentLoaded', initApp);
