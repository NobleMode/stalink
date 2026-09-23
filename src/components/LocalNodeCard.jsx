import React from 'react';

export default function LocalNodeCard({ localNode = {}, env }) {
  const envData = env || localNode?.env;
  const host = localNode.hostname || envData?.hostname || 'localhost';
  const ip = localNode.ip || envData?.ip || '127.0.0.1';
  const port = localNode.port || '18383';
  const mode = localNode.mode || 'Bg/Tray';

  const osLabel = envData?.os?.pretty_name || envData?.os?.name || 'Linux';
  const cpuLabel = envData?.cpu?.cores
    ? `${envData.cpu.cores}C • ${envData.cpu.arch || 'x86_64'}`
    : 'Detecting...';
  const ramLabel = envData?.memory?.total_gb
    ? `${envData.memory.available_gb || 0}G / ${envData.memory.total_gb}G`
    : 'N/A';
  const displayLabel = envData?.display?.session_type && envData.display.session_type !== 'unknown'
    ? `${envData.display.session_type.toUpperCase()} (${envData.display.desktop_environment || 'Desktop'})`
    : 'Desktop';

  return (
    <div className="box-panel p-3 flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Local Node
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700/60 uppercase">
              {mode}
            </span>
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-700/60 uppercase">
              ONLINE
            </span>
          </div>
        </div>

        {/* Compact 2-Column Specs Grid */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
          <div className="bg-slate-950/70 px-2 py-1.5 border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Host</span>
            <span className="text-slate-200 font-bold truncate block text-xs" title={host}>
              {host}
            </span>
          </div>

          <div className="bg-slate-950/70 px-2 py-1.5 border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Endpoint</span>
            <span className="text-blue-400 font-bold truncate block text-xs" title={`${ip}:${port}`}>
              {ip}:{port}
            </span>
          </div>

          <div className="bg-slate-950/70 px-2 py-1.5 border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">OS</span>
            <span className="text-slate-300 font-semibold truncate block" title={osLabel}>
              {osLabel}
            </span>
          </div>

          <div className="bg-slate-950/70 px-2 py-1.5 border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">CPU</span>
            <span className="text-slate-300 font-semibold truncate block" title={envData?.cpu?.model || cpuLabel}>
              {cpuLabel}
            </span>
          </div>

          <div className="bg-slate-950/70 px-2 py-1.5 border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">RAM Avail</span>
            <span className="text-slate-300 font-semibold truncate block">
              {ramLabel}
            </span>
          </div>

          <div className="bg-slate-950/70 px-2 py-1.5 border border-slate-800">
            <span className="text-[9px] text-slate-500 uppercase block tracking-wider">Session</span>
            <span className="text-blue-300 font-semibold truncate block text-[10px] uppercase" title={displayLabel}>
              {displayLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Sleek Micro Footer */}
      <div className="mt-2.5 pt-1.5 flex items-center justify-between border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
        <span>Channel: <strong className="text-slate-300">LAN / P2P</strong></span>
        <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[9px] uppercase">
          <span className="w-1.5 h-1.5 bg-emerald-400 animate-ping inline-block" />
          Background Core
        </span>
      </div>
    </div>
  );
}
