import React from 'react';
import LocalNodeCard from './LocalNodeCard.jsx';
import NetworkPeersCard from './NetworkPeersCard.jsx';

export default function Dashboard({
  localNode,
  env,
  peers,
  linkedPeer,
  isScanning,
  onScan,
  onConnect,
  onDisconnect,
  onForceReinstall
}) {
  return (
    <div id="main-dashboard" className="h-full w-full flex flex-col animate-fade-in">
      {/* Top Navigation */}
      <nav className="h-12 border-b border-slate-800 bg-[#0f172a] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 bg-blue-600 flex items-center justify-center border border-blue-400">
            <svg
              className="w-3 h-3 text-white"
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
          <span className="font-bold text-sm tracking-widest uppercase text-slate-200">
            StaLink Control
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider">
          <button
            onClick={onForceReinstall}
            className="flex items-center gap-1.5 text-rose-500 hover:text-white hover:bg-rose-600 px-2 py-1 border border-rose-500/50 transition-colors cursor-pointer"
          >
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
            Reinstall
          </button>
          <div className="flex items-center gap-1.5 text-emerald-500 px-2 py-1 border border-emerald-500/30 bg-[#020617]">
            <div className="w-1.5 h-1.5 bg-emerald-500" />
            Online
          </div>
        </div>
      </nav>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="w-full max-w-5xl mx-auto space-y-4">
          <header className="mb-4 flex justify-between items-end border-b border-slate-800 pb-2">
            <div>
              <h2 className="text-xl font-bold uppercase text-slate-100">
                System Dashboard
              </h2>
              <p className="text-slate-500 text-xs uppercase tracking-wide">
                Core binaries verified and linked.
              </p>
            </div>
          </header>

          {/* Grid Layout - Quick Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1 */}
            <div className="box-panel p-4 hover:bg-slate-800 transition-colors cursor-pointer group flex gap-4 items-start">
              <div className="h-10 w-10 bg-blue-900 border border-blue-500 text-blue-400 flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    strokeWidth="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1 uppercase text-blue-300 tracking-wide">
                  Deskflow Engine
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Manage remote KVM instances and control mappings natively.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="box-panel p-4 hover:bg-slate-800 transition-colors cursor-pointer group flex gap-4 items-start">
              <div className="h-10 w-10 bg-purple-900 border border-purple-500 text-purple-400 flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="square"
                    strokeLinejoin="miter"
                    strokeWidth="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1 uppercase text-purple-300 tracking-wide">
                  Mutagen Sync
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Real-time bi-directional file synchronization metrics.
                </p>
              </div>
            </div>
          </div>

          {/* Local Instance and Peer Linking Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <LocalNodeCard localNode={localNode} env={env} />
            <NetworkPeersCard
              peers={peers}
              linkedPeer={linkedPeer}
              isScanning={isScanning}
              onScan={onScan}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
