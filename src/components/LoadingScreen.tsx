import type { ReactNode } from 'react';
import { AuraTorquePulsarSpinner } from './AuraTorquePulsarSpinner';
import { RainbowBackground } from './RainbowBackground';

interface LoadingScreenProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  fullScreen?: boolean;
  spinnerSize?: number;
}

export function LoadingScreen({
  title,
  subtitle,
  children,
  fullScreen = true,
  spinnerSize = 160,
}: LoadingScreenProps) {
  const containerClass = fullScreen
    ? 'fixed inset-0 w-full h-full bg-black text-white flex flex-col items-center justify-center p-6 overflow-hidden'
    : 'relative w-full flex flex-col items-center justify-center p-6';

  return (
    <div className={containerClass}>
      <RainbowBackground />
      <div className="space-y-6 text-center max-w-md relative z-10 w-full">
        <div className="flex justify-center">
          <AuraTorquePulsarSpinner size={spinnerSize} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-white/90">{title}</h2>
          {subtitle ? (
            <p className="text-white/40 text-sm font-medium leading-relaxed">{subtitle}</p>
          ) : null}
        </div>
        {children ? <div className="space-y-4">{children}</div> : null}
      </div>
    </div>
  );
}
