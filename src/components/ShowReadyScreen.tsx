import { useState, type ReactNode } from 'react';
import { CheckCircle2, Play, TerminalSquare, ChevronDown, ChevronUp, Maximize2, X } from 'lucide-react';
import type { RadioShow } from '../types';
import { RainbowBackground } from './RainbowBackground';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface ShowReadyScreenProps {
  show: RadioShow;
  activePrompt?: string;
  showLog: boolean;
  onToggleLog: () => void;
  onListenNow: () => void;
  onBackToHome: () => void;
  onDownloadLogs: () => void;
  logPanel?: ReactNode;
}

export function ShowReadyScreen({
  show,
  activePrompt,
  showLog,
  onToggleLog,
  onListenNow,
  onBackToHome,
  onDownloadLogs,
  logPanel,
}: ShowReadyScreenProps) {
  const [logExpanded, setLogExpanded] = useState(false);

  const logPanelContent = logPanel ? (
    <div
      data-testid="show-ready-log-panel"
      className="rounded-2xl sm:rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-md overflow-hidden flex flex-col min-h-[50dvh] max-h-[70dvh] sm:max-h-[65dvh]"
    >
      {logPanel}
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 w-full h-dvh bg-black text-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden">
      <RainbowBackground />

      <div className="w-full max-w-lg relative z-10 flex flex-col gap-4 sm:gap-6 max-h-full overflow-y-auto overscroll-contain">
        <div className="rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-2xl p-6 sm:p-8 space-y-6 text-center shrink-0">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-io-green/15 border border-io-green/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-io-green" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white/95">Show Ready</h2>
            {activePrompt ? (
              <p className="text-white/40 text-sm font-medium max-w-sm">
                Your show about &ldquo;{activePrompt}&rdquo; is ready to play.
              </p>
            ) : null}
          </div>

          <div className="relative mx-auto w-48 h-48 rounded-2xl overflow-hidden border border-white/10 shadow-xl">
            <img src={show.coverImage} alt="" className="w-full h-full object-cover" />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white/95 leading-snug">{show.title}</h3>
            <p className="text-white/45 text-sm font-mono">
              {formatDuration(show.duration)} · saved to your library
            </p>
          </div>

          <button
            type="button"
            data-testid="listen-now"
            onClick={onListenNow}
            className="w-full py-4 px-6 bg-white text-black rounded-2xl font-bold text-sm tracking-widest uppercase transition-all hover:scale-[1.02] active:scale-[0.98] inline-flex items-center justify-center gap-2.5 shadow-lg cursor-pointer"
          >
            <Play className="w-5 h-5 fill-black" />
            Listen Now
          </button>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onToggleLog}
              className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/15 text-white rounded-xl font-bold text-xs tracking-widest uppercase transition-colors border border-white/10 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <TerminalSquare className="w-4 h-4" />
              {showLog ? 'Hide' : 'View'} Process Log
              {showLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={onDownloadLogs}
              className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl font-bold text-xs tracking-widest uppercase transition-colors border border-white/5 cursor-pointer"
            >
              Download Logs
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToHome}
            className="text-white/40 hover:text-white/70 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
          >
            Back to Home
          </button>
        </div>

        {showLog && logPanelContent ? (
          <div className="relative shrink-0">
            <button
              type="button"
              data-testid="expand-log-fullscreen"
              onClick={() => setLogExpanded(true)}
              className="sm:hidden absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/70 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              Expand
            </button>
            {logPanelContent}
          </div>
        ) : null}
      </div>

      {logExpanded && logPanel ? (
        <div
          data-testid="show-ready-log-fullscreen"
          className="fixed inset-0 z-20 bg-black/95 flex flex-col p-3 pt-4"
        >
          <div className="flex items-center justify-between mb-2 shrink-0 px-1">
            <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest font-bold">
              Process Log
            </span>
            <button
              type="button"
              data-testid="close-log-fullscreen"
              onClick={() => setLogExpanded(false)}
              className="p-2 rounded-lg bg-white/10 border border-white/10 text-white/70 cursor-pointer"
              aria-label="Close full screen log"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden flex flex-col">
            {logPanel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
