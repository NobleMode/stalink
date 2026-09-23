import React, { useState, useEffect, useRef, useCallback } from 'react';
import InstallerSplash from './components/InstallerSplash.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
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

  const transitionTimeout1Ref = useRef(null);
  const transitionTimeout2Ref = useRef(null);

  const clearAllTransitionTimeouts = useCallback(() => {
    if (transitionTimeout1Ref.current) {
      clearTimeout(transitionTimeout1Ref.current);
      transitionTimeout1Ref.current = null;
    }
    if (transitionTimeout2Ref.current) {
      clearTimeout(transitionTimeout2Ref.current);
      transitionTimeout2Ref.current = null;
    }
  }, []);

  const [isInstalled, setIsInstalled] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const isInstalledRef = useRef(isInstalled);
  useEffect(() => {
    isInstalledRef.current = isInstalled;
  }, [isInstalled]);

  const triggerDashboardTransition = useCallback((delay = 1000) => {
    if (isInstalledRef.current) return;
    if (transitionTimeout1Ref.current || transitionTimeout2Ref.current) return;
    transitionTimeout1Ref.current = setTimeout(() => {
      setIsFadingOut(true);
      transitionTimeout2Ref.current = setTimeout(() => {
        setIsInstalled(true);
        setIsFadingOut(false);
        transitionTimeout1Ref.current = null;
        transitionTimeout2Ref.current = null;
      }, 800);
    }, delay);
  }, []);

  const [env, setEnv] = useState(null);
  const envRef = useRef(env);
  useEffect(() => {
    envRef.current = env;
  }, [env]);

  const [binaryStatus, setBinaryStatus] = useState({
    mutagen: 'checking',
    deskflow: 'checking',
    cloudflared: 'checking',
    all_ready: false
  });
  const [localInstancePort, setLocalInstancePort] = useState(null);
  const localInstancePortRef = useRef(localInstancePort);
  useEffect(() => {
    localInstancePortRef.current = localInstancePort;
  }, [localInstancePort]);

  const [localNode, setLocalNode] = useState({
    hostname: 'Loading...',
    ip: 'Loading...',
    port: 'Loading...',
    mode: 'Bg/Tray'
  });
  const [peers, setPeers] = useState([]);
  const [linkedPeer, setLinkedPeer] = useState(null);
  const linkedPeerRef = useRef(linkedPeer);
  useEffect(() => {
    linkedPeerRef.current = linkedPeer;
  }, [linkedPeer]);

  const [isScanning, setIsScanning] = useState(false);
  const appReadySentRef = useRef(false);

  const [progress, setProgress] = useState({
    percent: 0,
    currentApp: '',
    appName: '',
    step: '',
    transferredMb: 0,
    totalMb: 0
  });
  const lastInstallerLogRef = useRef('');
  const lastLogPercentRef = useRef(-1);

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

  // Backend IPC Dispatch Helper
  const sendBackendCommand = useCallback(async (command, payload = {}) => {
    if (typeof window !== 'undefined' && window.Neutralino && window.Neutralino.extensions) {
      try {
        await window.Neutralino.extensions.dispatch('js.neutralino.installer', command, {
          command,
          ...payload
        });
      } catch (err) {
        console.error(`Failed to dispatch ${command}:`, err);
      }
    }
  }, []);

  // Query status from Python HTTP server
  const updateLocalStatus = useCallback(async (portToUse) => {
    const port = portToUse || localInstancePortRef.current;
    if (!port) return;
    try {
      const res = await fetch(`http://localhost:${port}/api/status`);
      const data = await res.json();
      setLocalNode({
        hostname: data.hostname || 'Unknown',
        ip: data.ip || '127.0.0.1',
        port: data.port || port,
        mode: 'Bg/Tray',
        env: data.env || envRef.current
      });
      if (data.env && !envRef.current) {
        setEnv(data.env);
      }
      if (data.linked_peer) {
        setLinkedPeer(data.linked_peer);
      }
    } catch (err) {
      console.error('Failed to fetch local node status:', err);
    }
  }, []);

  // Scan LAN for peers
  const handleScanPeers = useCallback(async () => {
    const port = localInstancePortRef.current;
    if (!port) {
      appendLog('Local instance port not yet resolved. Cannot scan.', 'error');
      return;
    }

    appendLog('Scanning local network for StaLink peers...');
    setIsScanning(true);

    try {
      const res = await fetch(`http://localhost:${port}/api/scan`);
      const data = await res.json();
      setPeers(data.peers || []);
      appendLog(`Scan complete. Found ${(data.peers || []).length} peers.`);
    } catch (err) {
      console.error('Failed to scan network:', err);
      appendLog('Network scan failed.', 'error');
    } finally {
      setIsScanning(false);
    }
  }, [appendLog]);

  // Connect to a peer
  const handleConnectPeer = useCallback(async (peer) => {
    const port = localInstancePortRef.current;
    if (!port) return;
    appendLog(`Linking KVM control desk with ${peer.hostname}...`);

    try {
      const res = await fetch(`http://localhost:${port}/api/connect`, {
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
  }, [appendLog]);

  // Disconnect from current peer
  const handleDisconnectPeer = useCallback(async () => {
    const port = localInstancePortRef.current;
    const currentLinked = linkedPeerRef.current;
    if (!port || !currentLinked) return;
    appendLog('Unlinking peer connection...');

    try {
      const res = await fetch(`http://localhost:${port}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disconnect: true })
      });
      const data = await res.json();

      if (data.status === 'disconnected') {
        appendLog(`Successfully disconnected from ${currentLinked.hostname || 'peer'}.`, 'info');
        setLinkedPeer(null);
      }
    } catch (err) {
      console.error('Failed to disconnect peer:', err);
      appendLog('Failed to unlink peer.', 'error');
    }
  }, [appendLog]);

  // KVM IPC Handlers
  const handleStartKvm = useCallback((options = {}) => {
    appendLog(`Starting KVM (${options.role || 'server'})...`);
    sendBackendCommand('START_KVM', options);
  }, [appendLog, sendBackendCommand]);

  const handleStopKvm = useCallback(() => {
    appendLog('Stopping KVM...');
    sendBackendCommand('STOP_KVM');
  }, [appendLog, sendBackendCommand]);

  // Sync IPC Handlers
  const handleStartSync = useCallback((options = {}) => {
    appendLog(`Starting file synchronization: ${options.name || 'stalink-session'}...`);
    sendBackendCommand('START_SYNC', options);
  }, [appendLog, sendBackendCommand]);

  const handleStopSync = useCallback((name = 'stalink-session') => {
    appendLog(`Terminating sync session: ${name}...`);
    sendBackendCommand('STOP_SYNC', { name });
  }, [appendLog, sendBackendCommand]);

  // Master kill switch
  const handleStopAll = useCallback(() => {
    appendLog('Master Kill Switch engaged. Stopping all processes...', 'error');
    sendBackendCommand('STOP_ALL');
  }, [appendLog, sendBackendCommand]);

  // Start downloading missing dependencies
  const handleStartDownload = useCallback(() => {
    lastInstallerLogRef.current = '';
    lastLogPercentRef.current = -1;
    appendLog('User initiated dependency download sequence. Requesting binaries...');
    clearAllTransitionTimeouts();
    setStatus({
      status: 'INSTALLING',
      title: 'Installing Systems...',
      desc: 'Downloading and unpacking required core binaries...'
    });
    startTimer();
    sendBackendCommand('START_DOWNLOAD');
  }, [appendLog, clearAllTransitionTimeouts, startTimer, sendBackendCommand]);

  // Retry installation
  const handleRetry = useCallback(() => {
    lastInstallerLogRef.current = '';
    lastLogPercentRef.current = -1;
    appendLog('Retrying installer...');
    clearAllTransitionTimeouts();
    setStatus({
      status: 'CONNECTING',
      title: 'Connecting...',
      desc: 'Re-initializing requirement checks...'
    });
    setElapsedTime('00:00');
    timerStartRef.current = null;

    sendBackendCommand('CHECK_BINARIES');
  }, [appendLog, clearAllTransitionTimeouts, sendBackendCommand]);

  // Force reinstallation
  const handleForceReinstall = useCallback(() => {
    lastInstallerLogRef.current = '';
    lastLogPercentRef.current = -1;
    appendLog('Initiating user-requested force reinstall...');
    clearAllTransitionTimeouts();
    stopTimer();
    setIsInstalled(false);
    setIsFadingOut(false);
    setBinaryStatus({
      mutagen: 'missing',
      deskflow: 'missing',
      cloudflared: 'missing',
      all_ready: false
    });
    setStatus({
      status: 'MISSING',
      title: 'Dependencies Missing',
      desc: 'Local binaries wiped. Ready to download.'
    });
    setElapsedTime('00:00');
    timerStartRef.current = null;
    setProgress({ percent: 0, currentApp: '', appName: '', step: '', transferredMb: 0, totalMb: 0 });
    setLogs([{ text: 'Resetting local bin environment...', type: 'system' }]);

    sendBackendCommand('forceRetry');
  }, [appendLog, clearAllTransitionTimeouts, stopTimer, sendBackendCommand]);

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
        handleStopAll();
        Neutralino.app.exit().catch((err) => {
          console.error('Failed to exit app from tray:', err);
        });
      }
    };

    // Environment info
    const onEnvInfo = (evt) => {
      const data = evt.detail.payload || evt.detail.data || evt.detail;
      if (data && data.cpu) {
        setEnv(data);
        appendLog(`Environment detected: ${data.cpu.cores}C ${data.cpu.model} | ${data.os?.pretty_name || data.os?.name}`);
      }
    };

    // Installer events
    const onInstallerStatus = (evt) => {
      const data = evt.detail;
      appendLog(`[${data.status}] ${data.payload}`);

      if (data.status === 'ERROR') {
        clearAllTransitionTimeouts();
        setStatus({
          status: 'ERROR',
          title: 'Installation Error',
          desc: data.payload
        });
        stopTimer();
      } else if (data.status === 'MISSING') {
        clearAllTransitionTimeouts();
        setStatus((prev) => {
          if (prev.status === 'INSTALLING') {
            // Keep downloading state active, ignore stale missing event
            return prev;
          }
          return {
            status: 'MISSING',
            title: 'Dependencies Missing',
            desc: data.payload
          };
        });
      } else if (data.status === 'INSTALLING') {
        setStatus({
          status: 'INSTALLING',
          title: 'Installing Systems...',
          desc: data.payload
        });
        startTimer();
      } else if (data.status === 'COMPLETE') {
        setProgress({ percent: 100, currentApp: '', appName: '', step: '3/3', transferredMb: 0, totalMb: 0 });
        setStatus({
          status: 'COMPLETE',
          title: 'Systems Ready',
          desc: data.payload
        });
        stopTimer();
        triggerDashboardTransition(1000);
      }
    };

    const onInstallerReady = () => {
      setProgress({ percent: 100, currentApp: '', appName: '', step: '3/3', transferredMb: 0, totalMb: 0 });
      setStatus({
        status: 'COMPLETE',
        title: 'Systems Ready',
        desc: 'All core systems verified and ready.'
      });
      stopTimer();
      triggerDashboardTransition(1000);
    };

    const onInstallerProgress = (evt) => {
      const data = evt.detail;
      if (data.percent !== undefined) {
        setProgress((prev) => ({
          ...prev,
          percent: data.percent >= 0 ? data.percent : prev.percent,
          currentApp: data.app_id || prev.currentApp,
          appName: data.app_name || prev.appName,
          step: data.step || prev.step,
          transferredMb: data.transferred_mb !== undefined ? data.transferred_mb : prev.transferredMb,
          totalMb: data.total_mb !== undefined ? data.total_mb : prev.totalMb
        }));
      }
      if (data.app_id && (data.installed === true || (data.log && data.log.toLowerCase().includes('installed')))) {
        setBinaryStatus((prev) => ({
          ...prev,
          [data.app_id]: 'installed'
        }));
      }
      if (data.log) {
        setStatus((prev) => ({
          ...prev,
          desc: data.log,
          title: data.app_name ? `Installing ${data.app_name}...` : prev.title
        }));

        const isRawProgressTick = data.log.includes('%') && (data.log.includes('Downloading') || data.log.includes('Streaming'));
        const shouldLog = !isRawProgressTick || (data.percent !== undefined && (data.percent % 25 === 0 || data.percent === 100) && data.percent !== lastLogPercentRef.current);

        if (shouldLog && data.log !== lastInstallerLogRef.current) {
          lastInstallerLogRef.current = data.log;
          if (isRawProgressTick && data.percent !== undefined) {
            lastLogPercentRef.current = data.percent;
          }
          appendLog(data.log);
        }
      }
    };

    const onInstanceStarted = (evt) => {
      const port = evt.detail.port;
      setLocalInstancePort(port);
      appendLog(`Background Instance Port resolved: ${port}. Status: ACTIVE.`);
      updateLocalStatus(port);
    };

    const onKvmStatus = (evt) => {
      appendLog(`KVM: [${evt.detail.status}] ${evt.detail.message || ''}`);
    };

    const onSyncStatus = (evt) => {
      appendLog(`Sync [${evt.detail.name}]: [${evt.detail.status}] ${evt.detail.message || ''}`);
    };

    // Binary dependency inspection
    const onBinaryStatus = (evt) => {
      const data = evt.detail.status || evt.detail.data?.status || evt.detail.data || evt.detail;
      if (data && (data.mutagen || data.deskflow || data.cloudflared)) {
        const allReady = !!data.all_ready;
        setBinaryStatus({
          mutagen: data.mutagen || 'missing',
          deskflow: data.deskflow || 'missing',
          cloudflared: data.cloudflared || 'missing',
          all_ready: allReady
        });
        appendLog(`Dependencies evaluated: Mutagen [${data.mutagen}], Deskflow [${data.deskflow}], Cloudflared [${data.cloudflared}]`);
        if (allReady && !isInstalledRef.current) {
          setStatus({
            status: 'COMPLETE',
            title: 'Systems Ready',
            desc: 'All core systems verified and ready.'
          });
          stopTimer();
          triggerDashboardTransition(1000);
        }
      }
    };

    Neutralino.events.on('windowClose', onWindowClose);
    Neutralino.events.on('trayMenuItemClicked', onTrayClick);
    Neutralino.events.on('ENV_INFO', onEnvInfo);
    Neutralino.events.on('BINARY_STATUS', onBinaryStatus);
    Neutralino.events.on('INSTALLER_STATUS', onInstallerStatus);
    Neutralino.events.on('INSTALLER_READY', onInstallerReady);
    Neutralino.events.on('INSTALLER_PROGRESS', onInstallerProgress);
    Neutralino.events.on('INSTANCE_STARTED', onInstanceStarted);
    Neutralino.events.on('KVM_STATUS', onKvmStatus);
    Neutralino.events.on('SYNC_STATUS', onSyncStatus);

    setupTray();

    if (!appReadySentRef.current) {
      appReadySentRef.current = true;
      appendLog('UI Initialized. Dispatching appReady event to installer...');
      sendBackendCommand('appReady');
    }

    return () => {
      Neutralino.events.off('windowClose', onWindowClose);
      Neutralino.events.off('trayMenuItemClicked', onTrayClick);
      Neutralino.events.off('ENV_INFO', onEnvInfo);
      Neutralino.events.off('BINARY_STATUS', onBinaryStatus);
      Neutralino.events.off('INSTALLER_STATUS', onInstallerStatus);
      Neutralino.events.off('INSTALLER_READY', onInstallerReady);
      Neutralino.events.off('INSTALLER_PROGRESS', onInstallerProgress);
      Neutralino.events.off('INSTANCE_STARTED', onInstanceStarted);
      Neutralino.events.off('KVM_STATUS', onKvmStatus);
      Neutralino.events.off('SYNC_STATUS', onSyncStatus);
    };
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020617] text-slate-300 font-mono text-sm select-none">
      {!isInstalled && (
        <InstallerSplash
          status={status}
          env={env}
          binaryStatus={binaryStatus}
          logs={logs}
          elapsedTime={elapsedTime}
          isTimerActive={isTimerActive}
          onStartDownload={handleStartDownload}
          onRetry={handleRetry}
          isFadingOut={isFadingOut}
          progress={progress}
        />
      )}

      {isInstalled && (
        <Dashboard
          localNode={localNode}
          env={env}
          peers={peers}
          linkedPeer={linkedPeer}
          isScanning={isScanning}
          onScan={handleScanPeers}
          onConnect={handleConnectPeer}
          onDisconnect={handleDisconnectPeer}
          onForceReinstall={handleForceReinstall}
          onStartKvm={handleStartKvm}
          onStopKvm={handleStopKvm}
          onStartSync={handleStartSync}
          onStopSync={handleStopSync}
          onStopAll={handleStopAll}
        />
      )}
    </div>
  );
}
