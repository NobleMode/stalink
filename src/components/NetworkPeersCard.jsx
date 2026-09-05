import React from 'react';

export default function NetworkPeersCard({
  peers,
  linkedPeer,
  isScanning,
  onScan,
  onConnect,
  onDisconnect
}) {
  return (
    <div className="box-panel p-4 lg:col-span-2 flex flex-col justify-between min-h-[220px]">
      <div className="w-full flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            Network Peers
          </h3>
          <button
            onClick={onScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase border border-blue-400 cursor-pointer transition-colors active:scale-95 btn-triangle disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isScanning ? (
              <>
                <svg
                  className="animate-spin h-3 w-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                SCANNING...
              </>
            ) : (
              <>
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.253 8H18"
                  />
                </svg>
                Scan LAN
              </>
            )}
          </button>
        </div>

        {/* Active Connection Status */}
        {linkedPeer && (
          <div className="mb-3 p-2 bg-[#020617] border border-emerald-500/50 text-emerald-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-emerald-500" />
              <span>
                Link: <strong>{linkedPeer.hostname}</strong> ({linkedPeer.ip}:
                {linkedPeer.port})
              </span>
            </div>
            <button
              onClick={onDisconnect}
              className="px-2 py-0.5 bg-rose-900/30 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/50 text-[10px] font-bold uppercase transition-colors cursor-pointer"
            >
              Drop
            </button>
          </div>
        )}

        {/* Peer list container */}
        <div className="space-y-1 overflow-y-auto flex-1 pr-2 max-h-[140px]">
          {peers.length === 0 ? (
            <div className="text-slate-600 text-xs text-center py-6 border border-dashed border-slate-800 font-bold uppercase mt-2">
              No peers found. Click &quot;SCAN LAN&quot;.
            </div>
          ) : (
            peers.map((peer, idx) => {
              const isConnected =
                linkedPeer &&
                linkedPeer.ip === peer.ip &&
                linkedPeer.port === peer.port;

              return (
                <div
                  key={`${peer.ip}-${peer.port}-${idx}`}
                  className="flex items-center justify-between p-2 bg-[#020617] border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-200 uppercase">
                        {peer.hostname}
                      </span>
                      {peer.is_self && (
                        <span className="px-1 py-0.5 text-[9px] font-bold bg-slate-900 text-slate-400 border border-slate-800 uppercase">
                          Self
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {peer.ip}:{peer.port}
                    </span>
                  </div>

                  {peer.is_self ? (
                    <button
                      disabled
                      className="px-2 py-1 bg-[#020617] text-slate-600 border border-slate-800 text-[10px] font-bold uppercase cursor-not-allowed"
                    >
                      Connect
                    </button>
                  ) : isConnected ? (
                    <button
                      disabled
                      className="px-2 py-1 bg-[#020617] text-emerald-500 border border-emerald-500/50 text-[10px] font-bold uppercase cursor-default"
                    >
                      Linked
                    </button>
                  ) : (
                    <button
                      onClick={() => onConnect(peer)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 text-[10px] font-bold uppercase active:scale-95 transition-all cursor-pointer btn-triangle"
                    >
                      Connect
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
