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
let processSpawned = false;
let instanceProcess = null;
let instancePort = null;

// Spawns the background Python discovery instance and forwards its port/events
function startBackgroundInstance(ws) {
    if (instanceProcess) return;
    
    const pyInstancePath = path.join(__dirname, '..', 'backend', 'python_utils', 'instance.py');
    console.log(`Spawning Python Instance process: python3 ${pyInstancePath}`);
    instanceProcess = spawn('python3', [pyInstancePath]);
    
    instanceProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        const lines = output.split('\n');
        
        lines.forEach(line => {
            try {
                const parsed = JSON.parse(line.trim());
                if (parsed.event === 'INSTANCE_STARTED') {
                    instancePort = parsed.port;
                    console.log(`Background Instance started on port ${instancePort}`);
                }
                
                // Broadcast all instance events to Neutralino app
                if (parsed.event) {
                    ws.send(JSON.stringify({
                        id: Date.now().toString(),
                        method: 'app.broadcast',
                        accessToken: nlToken,
                        data: {
                            event: parsed.event,
                            data: parsed
                        }
                    }));
                }
            } catch (e) {
                console.log(`[Python Instance Log] ${line}`);
            }
        });
    });
    
    instanceProcess.stderr.on('data', (data) => {
        console.error(`[Python Instance Error] ${data.toString()}`);
    });
    
    instanceProcess.on('close', (code) => {
        console.log(`Python Instance exited with code ${code}`);
        instanceProcess = null;
    });
}

function cleanup() {
    console.log("Cleaning up child processes...");
    if (instanceProcess) {
        instanceProcess.kill();
        instanceProcess = null;
    }
}

// Ensure cleanup runs on exit/termination signal
process.on('exit', cleanup);
process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
});
process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
});

// Spawns Python process and forwards stdout logs as app.broadcast events
function startExtensionProcess(ws) {
    // Spawn the Python extraction script
    const pyScriptPath = path.join(__dirname, '..', 'utils', 'requirement_check.py');
    console.log(`Spawning Python process: python3 ${pyScriptPath}`);
    const pyProcess = spawn('python3', [pyScriptPath]);

    pyProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        const lines = output.split('\n');
        
        lines.forEach(line => {
            try {
                // Check if python printed a JSON payload
                const parsed = JSON.parse(line.trim());
                if (parsed.event) {
                    // Send it exactly as broadcast to frontend
                    ws.send(JSON.stringify({
                        id: Date.now().toString(),
                        method: 'app.broadcast',
                        accessToken: nlToken,
                        data: {
                            event: parsed.event,
                            data: {
                                status: parsed.status,
                                payload: parsed.payload
                            }
                        }
                    }));
                }
            } catch (e) {
                // Not JSON, log it
                console.log(`[Python Script] ${line}`);
            }
        });
    });

    pyProcess.stderr.on('data', (data) => {
        console.error(`[Python Error] ${data.toString()}`);
    });

    pyProcess.on('close', (code) => {
        console.log(`Python script exited with code ${code}`);
        processSpawned = false;
    });
}

function connectAndStart() {
    if (started) return;
    if (!nlPort || !nlToken || !nlConnectToken) {
        return; // Need all parameters to connect safely
    }
    started = true;
    
    // Stop listening to stdin to let process execute cleanly
    process.stdin.pause();

    const wsUrl = `ws://127.0.0.1:${nlPort}?extensionId=${nlExtensionId}&connectToken=${nlConnectToken}`;
    console.log(`Connecting to Neutralino WebSocket at: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log('Connected to Neutralino WebSocket server successfully.');
        
        // Notify application frontend that the extension is ready
        ws.send(JSON.stringify({
            id: 'auth',
            method: 'app.broadcast',
            accessToken: nlToken,
            data: {
                event: 'extensionReady',
                data: 'installer_wrapper'
            }
        }));

        // Start the background discovery instance immediately
        startBackgroundInstance(ws);
    });

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());
            console.log('Received WebSocket message:', parsed);
            if (parsed.event === 'appReady') {
                console.log('Received appReady event from frontend. Initiating Python process.');
                if (!processSpawned) {
                    processSpawned = true;
                    startExtensionProcess(ws);
                }
                
                // Re-broadcast instance port if background service is already running
                if (instancePort) {
                    console.log(`Re-broadcasting INSTANCE_STARTED port: ${instancePort}`);
                    ws.send(JSON.stringify({
                        id: Date.now().toString(),
                        method: 'app.broadcast',
                        accessToken: nlToken,
                        data: {
                            event: 'INSTANCE_STARTED',
                            data: {
                                event: 'INSTANCE_STARTED',
                                port: instancePort
                            }
                        }
                    }));
                }
            } else if (parsed.event === 'forceRetry') {
                console.log('Received forceRetry event from frontend. Resetting and initiating Python process.');
                
                const platformDir = process.platform === 'win32' ? 'windows' : 'linux';
                const mutagenDir = path.join(__dirname, '..', 'backend', 'bin', platformDir, 'mutagen');
                const deskflowDir = path.join(__dirname, '..', 'backend', 'bin', platformDir, 'deskflow');

                try {
                    if (fs.existsSync(mutagenDir)) {
                        fs.rmSync(mutagenDir, { recursive: true, force: true });
                        console.log(`Cleaned directory: ${mutagenDir}`);
                    }
                    if (fs.existsSync(deskflowDir)) {
                        fs.rmSync(deskflowDir, { recursive: true, force: true });
                        console.log(`Cleaned directory: ${deskflowDir}`);
                    }
                } catch (err) {
                    console.error('Failed to clean binary directories:', err);
                }

                if (!processSpawned) {
                    processSpawned = true;
                    startExtensionProcess(ws);
                }

                // Re-broadcast instance port if background service is already running
                if (instancePort) {
                    console.log(`Re-broadcasting INSTANCE_STARTED port: ${instancePort}`);
                    ws.send(JSON.stringify({
                        id: Date.now().toString(),
                        method: 'app.broadcast',
                        accessToken: nlToken,
                        data: {
                            event: 'INSTANCE_STARTED',
                            data: {
                                event: 'INSTANCE_STARTED',
                                port: instancePort
                            }
                        }
                    }));
                }
            } else if (parsed.event === 'cancelInstall') {
                console.log('Received cancelInstall event from frontend. Cleaning up binaries and exiting.');
                const platformDir = process.platform === 'win32' ? 'windows' : 'linux';
                const mutagenDir = path.join(__dirname, '..', 'backend', 'bin', platformDir, 'mutagen');
                const deskflowDir = path.join(__dirname, '..', 'backend', 'bin', platformDir, 'deskflow');

                try {
                    if (fs.existsSync(mutagenDir)) fs.rmSync(mutagenDir, { recursive: true, force: true });
                    if (fs.existsSync(deskflowDir)) fs.rmSync(deskflowDir, { recursive: true, force: true });
                } catch (err) {
                    console.error('Failed to clean binary directories on cancel:', err);
                }
            }
            
            // If the message contains a command for KVM or sync automation, pipe it to instance.py stdin
            if (parsed.command && instanceProcess) {
                console.log(`Forwarding command ${parsed.command} to Python Instance stdin.`);
                instanceProcess.stdin.write(JSON.stringify(parsed) + '\n');
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
        // Incomplete JSON or other stdin payload, wait for more data or fallback
    }
});

// Try reading auth info from .tmp/auth_info.json as a fallback
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
            // Log parse or read error quietly
        }
    }
    return null;
}

let retries = 0;
const maxRetries = 50; // Try for up to 5 seconds

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
        console.error("Failed to obtain port, token, and connectToken from args, env, stdin, or auth_info.json.");
        process.exit(1);
    }
}

// Start handshake resolution check loop
checkConfigAndConnect();

