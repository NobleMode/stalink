import React, { useState, useEffect, useRef, useCallback } from 'react';
import InstallerSplash from './components/InstallerSplash.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const [status, setStatus] = useState({
    status: 'CONNECTING',
    title: 'Connecting...',
    desc: 'Waiting for backend extension.'
  });

  const [logs, setLogs] = useState([
    { text: 'Booting StaLink Host...', type: 'system' }
  ]);

  const [isTimerActive, setIsTimerActive] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const timerStartRef = useRef(null);
  const timerIntervalRef = useRef(null);

  const [localInstancePort, setLocalInstancePort] = useState(null);
  const [localNode, setLocalNode] = useState({
    hostname: 'Loading...',
    ip: 'Loading...',
    port: 'Loading...',
    mode: 'Bg/Tray'
  });
  const [peers, setPeers] = useState([]);
  const [linkedPeer, setLinkedPeer] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  const isInstalledRef = useRef(isInstalled);
  useEffect(() => {
    isInstalledRef.current = isInstalled;
  }, [isInstalled]);

  const appendLog = useCallback((text, type = 'info') => {
    setLogs((prev) => [...prev, { text, type, time: Date.now() }]);
  }, []);

  // Timer helpers
  const startTimer = useCallback(() => {
    if (!timerStartRef.current) {
      timerStartRef.current = Date.now();
      setIsTimerActive(true);
      timerIntervalRef.current = setInterval(() => {
        const totalSeconds = Math.floor((Date.now() - timerStartRef.current) / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        setElapsedTime(
          `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }, 1000);
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsTimerActive(false);
  }, []);

  // Query status from Python HTTP server
  const updateLocalStatus = useCallback(async (portToUse) => {
    const port = portToUse || localInstancePort;
    if (!port) return;
    try {
      const res = await fetch(`http://localhost:${port}/api/status`);
      const data = await res.json();
      setLocalNode({
        hostname: data.hostname || 'Unknown',
        ip: data.ip || '127.0.0.1',
        port: data.port || port,
        mode: 'Bg/Tray'
      });
      if (data.linked_peer) {
        setLinkedPeer(data.linked_peer);
      }
    } catch (err) {
      console.error('Failed to fetch local node status:', err);
    }
  }, [localInstancePort]);

  // Scan LAN for peers
  const handleScanPeers = useCallback(async () => {
    if (!localInstancePort) {
      appendLog('Local instance port not yet resolved. Cannot scan.', 'error');
      return;
    }

    appendLog('Scanning local network for StaLink peers...');
    setIsScanning(true);

    try {
      const res = await fetch(`http://localhost:${localInstancePort}/api/scan`);
      const data = await res.json();
      setPeers(data.peers || []);
      appendLog(`Scan complete. Found ${(data.peers || []).length} peers.`);
    } catch (err) {
      console.error('Failed to scan network:', err);
      appendLog('Network scan failed.', 'error');
    } finally {
      setIsScanning(false);
    }
  }, [localInstancePort, appendLog]);

  // Connect to a peer
  const handleConnectPeer = useCallback(async (peer) => {
    if (!localInstancePort) return;
    appendLog(`Linking KVM control desk with ${peer.hostname}...`);

    try {
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
        setLinkedPeer(peer);
        appendLog(`Successfully linked peer: ${peer.hostname}`, 'success');
      } else {
        appendLog(`Connection refused: ${data.message}`, 'error');
      }
    } catch (err) {
      console.error('Failed to connect to peer:', err);
      appendLog('Failed to link peer. Interface unreachable.', 'error');
    }
  }, [localInstancePort, appendLog]);

  // Disconnect from current peer
  const handleDisconnectPeer = useCallback(async () => {
    if (!localInstancePort || !linkedPeer) return;
    appendLog('Unlinking peer connection...');

    try {
      const res = await fetch(`http://localhost:${localInstancePort}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect: true })
      });
      const data = await res.json();

      if (data.status === 'disconnected') {
        appendLog(`Successfully disconnected from ${linkedPeer.hostname}.`, 'info');
        setLinkedPeer(null);
      }
    } catch (err) {
      console.error('Failed to disconnect peer:', err);
      appendLog('Failed to unlink peer.', 'error');
    }
  }, [localInstancePort, linkedPeer, appendLog]);

  // Retry installation
  const handleRetry = useCallback(() => {
    appendLog('Retrying installer...');
    setStatus({
      status: 'CONNECTING',
      title: 'Connecting...',
      desc: 'Re-initializing requirement checks...'
    });
    setElapsedTime('00:00');
    timerStartRef.current = null;

    if (typeof window !== 'undefined' && window.Neutralino && window.Neutralino.extensions) {
      window.Neutralino.extensions
        .dispatch('js.neutralino.installer', 'appReady')
        .then(() => {
          appendLog('appReady successfully dispatched for retry.');
        })
        .catch((err) => {
          appendLog(`Failed to dispatch retry: ${JSON.stringify(err)}`, 'error');
        });
    }
  }, [appendLog]);

  // Force reinstallation
  const handleForceReinstall = useCallback(() => {
    appendLog('Initiating user-requested force reinstall...');
    setIsInstalled(false);
    setIsFadingOut(false);
    setStatus({
      status: 'INSTALLING',
      title: 'Resetting Binaries...',
      desc: 'Wiping local binary installations...'
    });
    setElapsedTime('00:00');
    timerStartRef.current = null;
    setLogs([{ text: 'Resetting local bin environment...', type: 'system' }]);

    if (typeof window !== 'undefined' && window.Neutralino && window.Neutralino.extensions) {
      window.Neutralino.extensions
        .dispatch('js.neutralino.installer', 'forceRetry')
        .then(() => {
          appendLog('forceRetry event successfully dispatched.');
        })
        .catch((err) => {
          appendLog(`Failed to dispatch forceRetry: ${JSON.stringify(err)}`, 'error');
        });
    }
  }, [appendLog]);

  // Neutralino listeners and system setup
  useEffect(() => {
    if (typeof window === 'undefined' || !window.Neutralino) {
      console.warn('Running outside Neutralino runtime (browser mock mode).');
      return;
    }

    const { Neutralino } = window;

    // Window close behavior
    const onWindowClose = async () => {
      if (!isInstalledRef.current) {
        if (Neutralino.extensions) {
          try {
            await Neutralino.extensions.dispatch('js.neutralino.installer', 'cancelInstall');
          } catch (err) {
            console.error('Failed to dispatch cancelInstall:', err);
          }
        }
        Neutralino.app.exit();
      } else {
        Neutralino.window.hide().catch((err) => {
          console.error('Failed to hide window on close:', err);
        });
      }
    };

    // System Tray setup
    const setupTray = async () => {
      if (Neutralino.os) {
        try {
          await Neutralino.os.setTray({
            icon: '/icons/trayIcon.png',
            menuItems: [
              { id: 'SHOW', text: 'Show Dashboard' },
              { id: 'QUIT', text: 'Quit StaLink' }
            ]
          });
        } catch (err) {
          console.error('Failed to setup tray menu:', err);
        }
      }
    };

    const onTrayClick = (event) => {
      const id = event.detail.id;
      if (id === 'SHOW') {
        Neutralino.window.show().catch((err) => {
          console.error('Failed to show window from tray:', err);
        });
      } else if (id === 'QUIT') {
        Neutralino.app.exit().catch((err) => {
          console.error('Failed to exit app from tray:', err);
        });
      }
    };

    // Installer events
    const onInstallerStatus = (evt) => {
      const data = evt.detail;
      appendLog(`[${data.status}] ${data.payload}`);

      if (data.status === 'ERROR') {
        setStatus({
          status: 'ERROR',
          title: 'Installation Error',
          desc: data.payload
        });
        stopTimer();
      } else if (data.status === 'MISSING') {
        setStatus({
          status: 'MISSING',
          title: 'Dependencies Missing',
          desc: data.payload
        });
      } else if (data.status === 'INSTALLING') {
        setStatus({
          status: 'INSTALLING',
          title: 'Installing Systems...',
          desc: data.payload
        });
        startTimer();
      } else if (data.status === 'COMPLETE') {
        setStatus({
          status: 'COMPLETE',
          title: 'Systems Ready',
          desc: data.payload
        });
        stopTimer();

        // 1.5 second pause, then fade to dashboard
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            setIsInstalled(true);
            setIsFadingOut(false);
          }, 800);
        }, 1500);
      }
    };

    const onInstallerProgress = (evt) => {
      const data = evt.detail;
      if (data.log) {
        setStatus((prev) => ({ ...prev, desc: data.log }));
        appendLog(data.log);
      }
    };

    const onInstanceStarted = (evt) => {
      const port = evt.detail.port;
      setLocalInstancePort(port);
      appendLog(`Background Instance Port resolved: ${port}. Status: ACTIVE.`);
      updateLocalStatus(port);
    };

    Neutralino.events.on('windowClose', onWindowClose);
    Neutralino.events.on('trayMenuItemClicked', onTrayClick);
    Neutralino.events.on('INSTALLER_STATUS', onInstallerStatus);
    Neutralino.events.on('INSTALLER_PROGRESS', onInstallerProgress);
    Neutralino.events.on('INSTANCE_STARTED', onInstanceStarted);

    setupTray();

    // Notify backend extension that frontend is ready
    appendLog('UI Initialized. Dispatching appReady event to installer...');
    if (Neutralino.extensions) {
      Neutralino.extensions
        .dispatch('js.neutralino.installer', 'appReady')
        .then(() => {
          appendLog('appReady event acknowledged.');
        })
        .catch((err) => {
          appendLog(`Failed to dispatch appReady: ${JSON.stringify(err)}`, 'error');
        });
    }

    return () => {
      stopTimer();
      Neutralino.events.off('windowClose', onWindowClose);
      Neutralino.events.off('trayMenuItemClicked', onTrayClick);
      Neutralino.events.off('INSTALLER_STATUS', onInstallerStatus);
      Neutralino.events.off('INSTALLER_PROGRESS', onInstallerProgress);
      Neutralino.events.off('INSTANCE_STARTED', onInstanceStarted);
    };
  }, [appendLog, startTimer, stopTimer, updateLocalStatus]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020617] text-slate-300 font-mono text-sm select-none">
      {!isInstalled && (
        <InstallerSplash
          status={status}
          logs={logs}
          elapsedTime={elapsedTime}
          isTimerActive={isTimerActive}
          onRetry={handleRetry}
          isFadingOut={isFadingOut}
        />
      )}

      {isInstalled && (
        <Dashboard
          localNode={localNode}
          peers={peers}
          linkedPeer={linkedPeer}
          isScanning={isScanning}
          onScan={handleScanPeers}
          onConnect={handleConnectPeer}
          onDisconnect={handleDisconnectPeer}
          onForceReinstall={handleForceReinstall}
        />
      )}
    </div>
  );
}
