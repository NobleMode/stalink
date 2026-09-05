import React, { useState, useEffect, useRef } from 'react';

export default function InstallerSplash({
  status,
  logs,
  elapsedTime,
  isTimerActive,
  onRetry,
  isFadingOut
}) {
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [logs, showLogs]);

  const isComplete = status.status === 'COMPLETE';
  const isError = status.status === 'ERROR';
  const isInstalling = status.status === 'INSTALLING';
  const isMissing = status.status === 'MISSING';

  return (
    <div
      id="splash-screen"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#020617] ${
        isFadingOut ? 'animate-fade-out' : ''
      }`}
    >
      {/* Logo / Branding */}
      <div className="mb-8 flex flex-col items-center">
        <div className="h-12 w-12 bg-blue-600 flex items-center justify-center mb-4 border border-blue-400">
          <svg
            className="w-6 h-6 text-white"
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
        <h1 className="text-2xl font-bold tracking-widest text-blue-400 uppercase">
          StaLink
        </h1>
        <p className="text-slate-500 text-xs mt-1 tracking-widest uppercase">
          Initializing Core Systems
        </p>
      </div>

      {/* Status Card */}
      <div className="box-panel p-6 w-full max-w-sm flex flex-col">
        <div className="flex justify-between items-end mb-2">
          <h2
            className={`text-base font-bold uppercase ${
              isError
                ? 'text-red-500'
                : isComplete
                ? 'text-emerald-500'
                : 'text-slate-100'
            }`}
          >
            {status.title}
          </h2>
          {isTimerActive && (
            <span className="text-blue-400 text-[10px] font-mono font-bold">
              {elapsedTime}
            </span>
          )}
        </div>

        <p className="text-slate-400 text-xs mb-4 h-8 flex items-start">
          {status.desc}
        </p>

        {/* Progress Bar */}
        {(isInstalling || isComplete) && (
          <div className="w-full h-1.5 bg-[#020617] border border-slate-700 mb-4 overflow-hidden relative">
            <div className="h-full w-full relative overflow-hidden">
              <div
                className={`absolute top-0 bottom-0 ${
                  isComplete
                    ? 'w-full bg-emerald-500 transition-all duration-300'
                    : 'w-[40%] bg-blue-500 animate-indeterminate'
                }`}
              />
            </div>
          </div>
        )}

        {/* Retry Button */}
        {isError && (
          <button
            onClick={onRetry}
            className="mb-4 self-center px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold border border-blue-400 transition-colors text-xs uppercase cursor-pointer btn-triangle active:scale-95"
          >
            Retry Installation
          </button>
        )}

        {/* Log Toggle Button */}
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="self-end text-[10px] text-slate-500 hover:text-slate-300 uppercase font-bold mb-2 cursor-pointer focus:outline-none"
        >
          {showLogs ? '[-] Hide Logs' : '[+] Show Logs'}
        </button>

        {/* Mini Terminal */}
        {showLogs && (
          <div className="w-full bg-black p-3 text-[10px] border border-slate-700">
            <div
              ref={logsEndRef}
              className="h-24 overflow-y-auto text-slate-400 flex flex-col gap-1 pr-2"
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
                      ? 'text-blue-500'
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
  );
}
