import React from 'react';

export default function LocalNodeCard({ localNode }) {
  return (
    <div className="box-panel p-4 flex flex-col justify-between min-h-[220px]">
      <div>
        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            Local Node
          </h3>
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-900 text-blue-300 border border-blue-500 uppercase">
            Active
          </span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Host:</span>
            <span
              className="text-slate-300 font-bold truncate max-w-[120px]"
              title={localNode.hostname}
            >
              {localNode.hostname}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">IP:</span>
            <span className="text-slate-300 font-bold">{localNode.ip}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Port:</span>
            <span className="text-blue-400 font-bold">{localNode.port}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Mode:</span>
            <span className="text-emerald-500 font-bold">{localNode.mode}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-3 flex items-center justify-between border-t border-slate-800">
        <span className="text-[10px] text-slate-500 uppercase font-bold">
          Sys Background
        </span>
        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-none animate-pulse" />
      </div>
    </div>
  );
}
