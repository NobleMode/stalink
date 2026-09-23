const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let nlPort = process.env.NL_PORT || '';
let nlToken = process.env.NL_TOKEN || '';
let nlConnectToken = process.env.NL_CONNECT_TOKEN || '';
let nlExtensionId = process.env.NL_EXTENSION_ID || 'js.neutralino.installer';

// Parse command line arguments
for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--nl-port') nlPort = process.argv[i + 1];
    if (arg === '--nl-token') nlToken = process.argv[i + 1];
    if (arg === '--nl-connect-token') nlConnectToken = process.argv[i + 1];
    if (arg === '--nl-extension-id') nlExtensionId = process.argv[i + 1];
    if (arg.startsWith('--nl-port=')) nlPort = arg.split('=')[1];
    if (arg.startsWith('--nl-token=')) nlToken = arg.split('=')[1];
    if (arg.startsWith('--nl-connect-token=')) nlConnectToken = arg.split('=')[1];
    if (arg.startsWith('--nl-extension-id=')) nlExtensionId = arg.split('=')[1];
}

let started = false;
let backendProcess = null;
let lastInstancePort = null;
let lastEnvData = null;
let lastBinaryStatus = null;
let lastInstallerStatus = null;

function broadcastToApp(ws, event, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            id: Date.now().toString(),
            method: 'app.broadcast',
            accessToken: nlToken,
            data: {
                event: event,
                data: data
            }
        }));
    }
}

function startBackendProcess(ws) {
    if (backendProcess) return;

    const mainPyPath = path.join(__dirname, '..', 'backend', 'main.py');
    console.log(`Spawning StaLink Python Engine: python3 ${mainPyPath}`);
    backendProcess = spawn('python3', [mainPyPath]);

    let stdoutBuffer = '';
    backendProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop();

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed.event === 'INSTANCE_STARTED') {
                    lastInstancePort = parsed.port;
                } else if (parsed.event === 'ENV_INFO') {
                    lastEnvData = parsed;
                } else if (parsed.event === 'BINARY_STATUS') {
                    lastBinaryStatus = parsed;
                } else if (parsed.event === 'INSTALLER_STATUS') {
                    lastInstallerStatus = parsed;
                }

                // Broadcast parsed JSON event to Neutralino frontend
                if (parsed.event) {
                    broadcastToApp(ws, parsed.event, parsed);
                }
            } catch (e) {
                console.log(`[StaLink Engine Log] ${trimmed}`);
            }
        });
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`[StaLink Engine Error] ${data.toString()}`);
    });

    backendProcess.on('close', (code) => {
        console.log(`StaLink Engine exited with code ${code}`);
        backendProcess = null;
    });
}

function cleanup() {
    console.log("Cleaning up StaLink Engine process...");
    if (backendProcess) {
        try {
            backendProcess.stdin.write(JSON.stringify({ command: 'STOP_ALL' }) + '\n');
            backendProcess.kill();
        } catch (e) {
            // ignore
        }
        backendProcess = null;
    }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

function connectAndStart() {
    if (started) return;
    if (!nlPort || !nlToken || !nlConnectToken) {
        return;
    }
    started = true;
    process.stdin.pause();

    const wsUrl = `ws://127.0.0.1:${nlPort}?extensionId=${nlExtensionId}&connectToken=${nlConnectToken}`;
    console.log(`Connecting to Neutralino WebSocket at: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log('Connected to Neutralino WebSocket server successfully.');
        broadcastToApp(ws, 'extensionReady', 'installer_wrapper');

        // Start backend engine
        startBackendProcess(ws);
    });

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());

            // Ignore internal RPC acknowledgements from Neutralino server
            if (parsed.id && parsed.data?.success !== undefined) {
                return;
            }

            console.log('Received WebSocket message:', parsed);

            const eventData = (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) ? parsed.data : {};
            const eventName = parsed.event || eventData.event;
            const cmd = parsed.command || parsed.action || eventData.command || eventData.action || eventName;

            if (eventName === 'appReady' || cmd === 'appReady') {
                console.log('Received appReady event from frontend.');
                if (!backendProcess) {
                    startBackendProcess(ws);
                }
                if (lastEnvData) {
                    broadcastToApp(ws, 'ENV_INFO', lastEnvData);
                }
                if (lastBinaryStatus) {
                    broadcastToApp(ws, 'BINARY_STATUS', lastBinaryStatus);
                }
                if (lastInstallerStatus) {
                    broadcastToApp(ws, 'INSTALLER_STATUS', lastInstallerStatus);
                }
                if (lastBinaryStatus && lastBinaryStatus.all_ready) {
                    broadcastToApp(ws, 'INSTALLER_READY', {});
                }
                if (lastInstancePort) {
                    broadcastToApp(ws, 'INSTANCE_STARTED', { event: 'INSTANCE_STARTED', port: lastInstancePort });
                }
                return;
            }

            if (eventName === 'forceRetry' || cmd === 'forceRetry') {
                console.log('Received forceRetry event from frontend. Resetting binaries...');
                lastBinaryStatus = {
                    mutagen: 'missing',
                    deskflow: 'missing',
                    cloudflared: 'missing',
                    all_ready: false
                };
                lastInstallerStatus = {
                    status: 'MISSING',
                    payload: 'Core binaries wiped. Ready to install.'
                };

                const platformDir = process.platform === 'win32' ? 'windows' : 'linux';
                const binDir = path.join(__dirname, '..', 'backend', 'bin', platformDir);
                try {
                    const mutagenDir = path.join(binDir, 'mutagen');
                    const deskflowDir = path.join(binDir, 'deskflow');
                    const cloudflaredDir = path.join(binDir, 'cloudflared');
                    if (fs.existsSync(mutagenDir)) fs.rmSync(mutagenDir, { recursive: true, force: true });
                    if (fs.existsSync(deskflowDir)) fs.rmSync(deskflowDir, { recursive: true, force: true });
                    if (fs.existsSync(cloudflaredDir)) fs.rmSync(cloudflaredDir, { recursive: true, force: true });
                } catch (err) {
                    console.error('Failed to clean binary directories:', err);
                }

                // Immediately inform frontend of missing state
                broadcastToApp(ws, 'BINARY_STATUS', lastBinaryStatus);
                broadcastToApp(ws, 'INSTALLER_STATUS', lastInstallerStatus);

                if (backendProcess) {
                    backendProcess.stdin.write(JSON.stringify({ command: 'CHECK_BINARIES' }) + '\n');
                }
                return;
            }

            if (eventName === 'cancelInstall' || cmd === 'cancelInstall') {
                console.log('Received cancelInstall event from frontend.');
                cleanup();
                return;
            }

            // Forward IPC commands directly to main.py stdin with flattened command
            if (cmd && backendProcess) {
                console.log(`Forwarding command ${cmd} to StaLink Engine stdin.`);
                const flatPayload = {
                    command: cmd,
                    ...eventData
                };
                backendProcess.stdin.write(JSON.stringify(flatPayload) + '\n');
            }
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        process.exit(1);
    });

    ws.on('close', () => {
        console.log('Neutralino disconnected.');
        process.exit(0);
    });
}

// Check for stdin data stream
let stdinData = '';
process.stdin.on('data', (chunk) => {
    stdinData += chunk;
    try {
        const data = JSON.parse(stdinData.trim());
        if (data.port || data.nlPort) {
            nlPort = data.nlPort || data.port;
            nlToken = data.nlToken || data.accessToken || data.token;
            nlConnectToken = data.nlConnectToken || data.connectToken;
            nlExtensionId = data.nlExtensionId || data.extensionId || nlExtensionId;
            connectAndStart();
        }
    } catch (e) {
        // incomplete JSON, wait
    }
});

function readAuthInfoFile() {
    const authInfoPath = path.join(__dirname, '..', '..', '.tmp', 'auth_info.json');
    if (fs.existsSync(authInfoPath)) {
        try {
            const content = fs.readFileSync(authInfoPath, 'utf8');
            if (content.trim()) {
                const authInfo = JSON.parse(content);
                return {
                    port: authInfo.nlPort,
                    token: authInfo.nlToken,
                    connectToken: authInfo.nlConnectToken
                };
            }
        } catch (e) {
            // ignore
        }
    }
    return null;
}

let retries = 0;
const maxRetries = 50;

function checkConfigAndConnect() {
    if (started) return;
    if (nlPort && nlToken && nlConnectToken) {
        connectAndStart();
        return;
    }
    const fileInfo = readAuthInfoFile();
    if (fileInfo && fileInfo.port && fileInfo.token && fileInfo.connectToken) {
        nlPort = fileInfo.port;
        nlToken = fileInfo.token;
        nlConnectToken = fileInfo.connectToken;
        connectAndStart();
        return;
    }
    retries++;
    if (retries < maxRetries) {
        setTimeout(checkConfigAndConnect, 100);
    } else {
        console.error("Failed to obtain port, token, and connectToken.");
        process.exit(1);
    }
}

checkConfigAndConnect();
