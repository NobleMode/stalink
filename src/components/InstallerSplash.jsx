import React, { useState, useEffect, useRef } from 'react';

export default function InstallerSplash({
  status,
  env,
  binaryStatus = { mutagen: 'checking', deskflow: 'checking', cloudflared: 'checking', all_ready: false },
  logs,
  elapsedTime,
  isTimerActive,
  onStartDownload,
  onRetry,
  isFadingOut,
  progress = { percent: 0, currentApp: '', appName: '', step: '', transferredMb: 0, totalMb: 0 }
}) {
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [logs, showLogs]);

  const isInstalling = status.status === 'INSTALLING';
  const isComplete = status.status === 'COMPLETE' || (binaryStatus.all_ready && !isInstalling);
  const isError = status.status === 'ERROR' && !binaryStatus.all_ready;

  const dependencies = [
    {
      id: 'mutagen',
      name: 'Mutagen Sync Engine',
      version: 'v0.18.1',
      role: 'Bi-directional workspace & code file synchronization',
      size: '~15 MB',
      status: binaryStatus.mutagen || 'checking'
    },
    {
      id: 'deskflow',
      name: 'Deskflow KVM Switch',
      version: 'v1.26.0',
      role: 'Virtual mouse & keyboard seamless border traversal',
      size: '~25 MB',
      status: binaryStatus.deskflow || 'checking'
    },
    {
      id: 'cloudflared',
      name: 'Cloudflare Tunnel CLI',
      version: 'latest',
      role: 'Encrypted WAN quick-tunnel for mobile hub & remote transfers',
      size: '~18 MB',
      status: binaryStatus.cloudflared || 'checking'
    }
  ];

  const missingCount = dependencies.filter((d) => d.status !== 'installed').length;
  const allInstalled = (missingCount === 0 || binaryStatus.all_ready || isComplete) && !isInstalling;

  // RAM percentage calculation
  const totalRam = env?.memory?.total_gb || 0;
  const availRam = env?.memory?.available_gb || 0;
  const usedRam = totalRam > 0 ? Math.max(0, totalRam - availRam) : 0;
  const ramPercent = totalRam > 0 ? Math.min(100, Math.round((usedRam / totalRam) * 100)) : 0;

  return (
    <div
      id="splash-screen"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#020617] px-4 py-3.5 overflow-y-auto ${
        isFadingOut ? 'animate-fade-out' : 'animate-fade-in'
      }`}
    >
      {/* Top Header & Branding */}
      <div className="mb-3.5 flex flex-col items-center text-center max-w-4xl w-full">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="h-8 w-8 bg-blue-600 flex items-center justify-center border border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.4)]">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="square"
                strokeLinejoin="miter"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-bold tracking-[0.25em] text-blue-400 uppercase font-mono">
            STALINK <span className="text-slate-500 text-xs font-normal tracking-widest">// INITIALIZATION</span>
          </h1>
        </div>
        <p className="text-slate-500 text-[11px] tracking-wider uppercase font-mono">
          System Environment Inspection & Core Dependency Resolver
        </p>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full max-w-4xl">
        
        {/* Left Column: Device Environment Profile */}
        <div className="box-panel p-3 flex flex-col justify-between border border-slate-700 bg-slate-900/90 text-xs font-mono">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="font-bold text-slate-200 tracking-wider uppercase text-xs">
                  Device Environment
                </span>
              </div>
              <span className="text-[10px] text-blue-400 bg-blue-950/60 px-2 py-0.5 border border-blue-800/60">
                {env ? 'Profile Active' : 'Inspecting...'}
              </span>
            </div>

            <div className="space-y-2">
              {/* Operating System */}
              <div className="bg-slate-950/60 p-2 border border-slate-800">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">
                  Operating System & Session
                </div>
                <div className="text-slate-200 font-semibold truncate text-xs">
                  {env?.os?.pretty_name || env?.os?.name || 'Detecting OS...'}
                </div>
                <div className="text-[10px] text-blue-400/90 mt-0.5 flex items-center gap-2">
                  <span>Display: {env?.display?.session_type?.toUpperCase() || 'UNKNOWN'}</span>
                  <span>•</span>
                  <span>Desktop: {env?.display?.desktop_environment || 'Desktop'}</span>
                </div>
              </div>

              {/* CPU & Arch */}
              <div className="bg-slate-950/60 p-2 border border-slate-800">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">
                  Processor (CPU)
                </div>
                <div className="text-slate-200 font-semibold truncate text-xs">
                  {env?.cpu?.model || 'Detecting Processor...'}
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-1 text-[9px]">
                  <span className="bg-slate-800 px-1.5 py-0.5 text-slate-300 border border-slate-700">
                    {env?.cpu?.cores || 1} Cores
                  </span>
                  <span className="bg-slate-800 px-1.5 py-0.5 text-slate-300 border border-slate-700">
                    Arch: {env?.cpu?.arch || 'x86_64'}
                  </span>
                  <span className="bg-blue-950/80 text-blue-300 px-1.5 py-0.5 border border-blue-800">
                    Target ABI: {env?.cpu?.binary_arch || 'amd64'}
                  </span>
                </div>
              </div>

              {/* Memory (RAM) */}
              <div className="bg-slate-950/60 p-2 border border-slate-800">
                <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                  <span>Memory (RAM)</span>
                  <span className="text-slate-300 font-semibold">
                    {availRam} GB Free / {totalRam} GB Total
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 border border-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${ramPercent}%` }}
                  />
                </div>
              </div>

              {/* Network Identifier */}
              <div className="bg-slate-950/60 p-2 border border-slate-800 flex justify-between items-center text-[11px]">
                <div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                    Node Host / IP
                  </div>
                  <div className="text-slate-200 font-semibold text-xs">
                    {env?.hostname || 'sandbox'}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-emerald-400 font-mono font-bold bg-emerald-950/40 px-2 py-0.5 border border-emerald-800/60 text-xs">
                    {env?.ip || '127.0.0.1'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-slate-800 flex justify-between text-[9px] text-slate-500">
            <span>Runtime: Python {env?.python_version || '3.x'}</span>
            <span>Platform ABI: {env?.os?.system || 'linux'}</span>
          </div>
        </div>

        {/* Right Column: Required Dependencies & Action */}
        <div className="box-panel p-3 flex flex-col justify-between border border-slate-700 bg-slate-900/90 text-xs font-mono">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    allInstalled
                      ? 'bg-emerald-500'
                      : isInstalling
                      ? 'bg-blue-500 animate-pulse'
                      : 'bg-amber-500 animate-pulse'
                  }`}
                />
                <span className="font-bold text-slate-200 tracking-wider uppercase text-xs">
                  Required Core Subsystems
                </span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 border font-semibold ${
                  allInstalled
                    ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
                    : isInstalling
                    ? 'text-blue-400 bg-blue-950/60 border-blue-800/60'
                    : 'text-amber-400 bg-amber-950/60 border-amber-800/80'
                }`}
              >
                {allInstalled
                  ? '3/3 Ready'
                  : isInstalling
                  ? `${dependencies.filter((d) => 
                      d.status === 'installed' || 
                      (d.id === 'mutagen' && (progress.step === '2/3' || progress.step === '3/3' || progress.currentApp === 'deskflow' || progress.currentApp === 'cloudflared')) ||
                      (d.id === 'deskflow' && (progress.step === '3/3' || progress.currentApp === 'cloudflared'))
                    ).length}/3 Installed`
                  : `${missingCount} Required`}
              </span>
            </div>

            {/* Subsystems List */}
            <div className="space-y-1.5 mb-2.5">
              {dependencies.map((dep) => {
                const isStepPassed = (
                  (dep.id === 'mutagen' && (progress.step === '2/3' || progress.step === '3/3' || progress.currentApp === 'deskflow' || progress.currentApp === 'cloudflared')) ||
                  (dep.id === 'deskflow' && (progress.step === '3/3' || progress.currentApp === 'cloudflared'))
                );
                const isItemInstalled = dep.status === 'installed' || isStepPassed;
                const isItemActive = isInstalling && !isItemInstalled && (
                  progress.currentApp === dep.id || (!progress.currentApp && dep.id === 'mutagen')
                );
                const isItemMissing = dep.status === 'missing' && !isItemInstalled && !isItemActive;

                return (
                  <div
                    key={dep.id}
                    className={`p-2 border transition-all ${
                      isItemActive
                        ? 'bg-blue-950/60 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.25)]'
                        : isItemInstalled
                        ? 'bg-emerald-950/20 border-emerald-900/60'
                        : 'bg-slate-950/80 border-slate-700 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {isItemActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                        )}
                        <span className={`font-bold text-[11px] ${
                          isItemActive 
                            ? 'text-blue-300' 
                            : isItemInstalled 
                            ? 'text-emerald-300' 
                            : 'text-slate-100'
                        }`}>
                          {dep.name}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {dep.version}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 border uppercase ${
                          isItemInstalled
                            ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/80 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                            : isItemActive
                            ? 'text-cyan-300 bg-blue-900/60 border-cyan-500/80 animate-pulse'
                            : isItemMissing
                            ? 'text-amber-400 bg-amber-950/40 border-amber-800/80'
                            : 'text-slate-400 bg-slate-900 border-slate-700'
                        }`}
                      >
                        {isItemInstalled
                          ? '✓ Installed'
                          : isItemActive
                          ? `Downloading${progress.percent > 0 ? ` (${progress.percent}%)` : '...'}`
                          : isItemMissing
                          ? `Missing (${dep.size})`
                          : 'Checking...'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">
                      {dep.role}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action / Progress Zone */}
          <div className="pt-2 border-t border-slate-800">
            {/* Installing State */}
            {isInstalling && (
              <div className="mb-2 bg-blue-950/40 p-2.5 border border-blue-800/80 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                <div className="flex justify-between items-center mb-1 text-[11px]">
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
                    <span className="text-blue-300 font-bold uppercase truncate">
                      {progress.appName ? `${progress.step ? `[${progress.step}] ` : ''}Installing ${progress.appName}` : status.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono">
                    {progress.percent >= 0 && (
                      <span className="text-cyan-400 font-bold text-xs">
                        {progress.percent}%
                      </span>
                    )}
                    {isTimerActive && (
                      <span className="text-slate-400 font-bold text-[10px] bg-slate-900 px-1.5 py-0.5 border border-slate-700">
                        {elapsedTime}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar container */}
                <div className="w-full h-2 bg-slate-950 border border-slate-700 overflow-hidden relative my-2">
                  {progress.percent >= 0 ? (
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 transition-all duration-200 ease-out shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                      style={{ width: `${Math.max(2, Math.min(100, progress.percent))}%` }}
                    />
                  ) : (
                    <div className="w-[45%] h-full bg-blue-500 animate-indeterminate" />
                  )}
                </div>

                {/* Real-time status description & Byte count */}
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <p className="truncate pr-2 font-mono">
                    {status.desc}
                  </p>
                  {progress.totalMb > 0 && (
                    <span className="shrink-0 text-slate-500 font-mono text-[9px]">
                      {progress.transferredMb} / {progress.totalMb} MB
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Error State */}
            {isError && (
              <div className="mb-3 bg-rose-950/40 p-3 border border-rose-800/80 text-rose-300">
                <div className="font-bold text-xs uppercase mb-1">
                  Installation Error
                </div>
                <div className="text-[10px] text-rose-200/80 mb-2.5">
                  {status.desc}
                </div>
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold border border-rose-400 transition-colors text-xs uppercase cursor-pointer btn-triangle"
                >
                  Retry Installation
                </button>
              </div>
            )}

            {/* Complete State */}
            {isComplete && (
              <div className="mb-3 bg-emerald-950/40 p-3 border border-emerald-800/80 text-emerald-300 flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs uppercase">
                    All Systems Operational
                  </div>
                  <div className="text-[10px] text-emerald-200/80">
                    Launching StaLink Command Center...
                  </div>
                </div>
                <div className="h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  ✓
                </div>
              </div>
            )}

            {/* Ready to Download State (Missing Dependencies) */}
            {!allInstalled && !isInstalling && !isError && (
              <div className="mb-3">
                <button
                  onClick={onStartDownload}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-widest border border-blue-400 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] btn-triangle cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-4 h-4 text-white animate-bounce"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span>Download Required Dependencies (~58 MB)</span>
                </button>
                <div className="text-[10px] text-slate-500 text-center mt-1.5">
                  Downloads to extensions/backend/bin/{env?.cpu?.binary_arch ? `${env?.os?.system || 'linux'}` : 'local'}
                </div>
              </div>
            )}

            {/* Bottom Terminal Drawer Toggle */}
            <div className="flex justify-between items-center pt-1">
              <span className="text-[10px] text-slate-500">
                {logs.length} events logged
              </span>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-[10px] text-slate-400 hover:text-blue-400 uppercase font-bold cursor-pointer focus:outline-none"
              >
                {showLogs ? '[-] Hide Logs' : '[+] Show Logs'}
              </button>
            </div>

            {/* Mini Terminal Logs */}
            {showLogs && (
              <div className="mt-2 w-full bg-black/90 p-2.5 text-[10px] border border-slate-700">
                <div
                  ref={logsEndRef}
                  className="h-20 overflow-y-auto text-slate-400 flex flex-col gap-0.5 pr-2 font-mono"
                >
                  {logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.type === 'error'
                          ? 'text-red-400'
                          : log.type === 'success'
                          ? 'text-emerald-400'
                          : log.type === 'system'
                          ? 'text-blue-400'
                          : 'text-slate-500'
                      }
                    >
                      &gt; {log.text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
