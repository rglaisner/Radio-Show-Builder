import type { GenerationProgress } from '../generationProgress';
import { getProgressPercent } from '../generationProgress';

interface GenerationProgressBarProps {
  progress: GenerationProgress;
  compact?: boolean;
  complete?: boolean;
  finalizing?: boolean;
}

export function GenerationProgressBar({ progress, compact = false, complete = false, finalizing = false }: GenerationProgressBarProps) {
  const percent = getProgressPercent(progress, { complete, finalizing });
  const stepNum = complete ? progress.stepTotal : Math.max(1, progress.stepIndex);

  return (
    <div className={`w-full space-y-2 ${compact ? 'max-w-md mx-auto' : 'max-w-lg mx-auto'}`}>
      <div className="flex flex-col gap-0.5 text-center">
        <p className={`font-mono uppercase tracking-widest text-white/70 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          Step {stepNum} of {progress.stepTotal} — {progress.stepLabel}
        </p>
        {progress.subLabel ? (
          <p className={`text-io-blue/90 font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {progress.subLabel}
          </p>
        ) : null}
      </div>

      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div
          className="h-full bg-gradient-to-r from-io-blue to-io-green transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {progress.subCurrent !== undefined && progress.subTotal !== undefined && progress.subTotal > 0 ? (
        <div className="w-full h-0.5 bg-white/[0.03] rounded-full overflow-hidden">
          <div
            className="h-full bg-io-blue/60 transition-all duration-300 ease-out"
            style={{ width: `${(progress.subCurrent / progress.subTotal) * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
