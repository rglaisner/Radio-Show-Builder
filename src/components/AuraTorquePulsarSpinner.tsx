import { useEffect, useRef } from 'react';

interface AuraTorquePulsarSpinnerProps {
  size?: number;
  className?: string;
}

function hsbToRgba(h: number, s: number, b: number, a: number): string {
  const saturation = s / 100;
  const brightness = b / 100;
  const chroma = brightness * saturation;
  const hPrime = h / 60;
  const x = chroma * (1 - Math.abs((hPrime % 2) - 1));
  let r = 0;
  let g = 0;
  let bl = 0;

  if (hPrime >= 0 && hPrime < 1) {
    r = chroma; g = x;
  } else if (hPrime < 2) {
    r = x; g = chroma;
  } else if (hPrime < 3) {
    g = chroma; bl = x;
  } else if (hPrime < 4) {
    g = x; bl = chroma;
  } else if (hPrime < 5) {
    r = x; bl = chroma;
  } else {
    r = chroma; bl = x;
  }

  const m = brightness - chroma;
  return `rgba(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((bl + m) * 255)}, ${a})`;
}

export function AuraTorquePulsarSpinner({ size = 160, className = '' }: AuraTorquePulsarSpinnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const scale = size / 400;
    let frameId = 0;

    const draw = (now: number) => {
      const t = now * 0.002;
      const half = size / 2;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(half, half);

      const numRings = 3;
      const halfPi = Math.PI / 2;
      const quarterPi = Math.PI / 4;

      for (let i = 0; i < numRings; i++) {
        ctx.save();
        const dir = i % 2 === 0 ? 1 : -1;
        ctx.rotate(t * (0.8 + i * 0.5) * dir);

        const hueVal = (180 + i * 40 + Math.sin(t * 0.5) * 60) % 360;
        const ringSize = (320 - i * 80) * scale;
        const arcLength = halfPi + Math.sin(t + i) * quarterPi;

        ctx.lineCap = 'round';

        ctx.lineWidth = 50 * scale;
        ctx.strokeStyle = hsbToRgba(hueVal, 100, 50, 0.2);
        ctx.beginPath();
        ctx.arc(0, 0, ringSize / 2, 0, arcLength);
        ctx.stroke();

        ctx.lineWidth = 30 * scale;
        ctx.strokeStyle = hsbToRgba(hueVal, 100, 100, 1);
        ctx.beginPath();
        ctx.arc(0, 0, ringSize / 2, 0, arcLength);
        ctx.stroke();

        ctx.strokeStyle = hsbToRgba(0, 0, 100, 1);
        ctx.beginPath();
        ctx.arc(0, 0, ringSize / 2, arcLength - 0.2, arcLength);
        ctx.stroke();

        ctx.restore();
      }

      ctx.save();
      ctx.rotate(-t * 2);
      const pulse = Math.sin(t * 4) * 20 * scale;
      const innerSize = (60 + pulse) * scale;

      ctx.lineWidth = 20 * scale;
      ctx.strokeStyle = hsbToRgba(0, 0, 100, 1);
      for (let j = 0; j < 4; j++) {
        ctx.save();
        ctx.rotate(j * halfPi);
        ctx.beginPath();
        ctx.moveTo(innerSize * 0.5, -innerSize * 0.5);
        ctx.lineTo(innerSize * 0.5, innerSize * 0.5);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = hsbToRgba(0, 0, 100, 1);
      ctx.beginPath();
      ctx.arc(0, 0, (10 + Math.abs(pulse) * 0.5) * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
      frameId = requestAnimationFrame(draw);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`pointer-events-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
