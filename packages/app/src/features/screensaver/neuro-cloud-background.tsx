import { useEffect, useRef } from 'react';

export function NeuroCloudBackground({ animate = true }: { animate?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', onResize);

    const blobs = [
      { x: width * 0.3, y: height * 0.4, r: Math.min(width, height) * 0.4, vx: 0.3, vy: 0.2, hue: 220 },
      { x: width * 0.7, y: height * 0.6, r: Math.min(width, height) * 0.45, vx: -0.2, vy: 0.3, hue: 280 },
      { x: width * 0.5, y: height * 0.8, r: Math.min(width, height) * 0.35, vx: 0.25, vy: -0.2, hue: 340 },
    ];

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      blobs.forEach((b) => {
        if (animate) {
          b.x += b.vx;
          b.y += b.vy;
          if (b.x < 0 || b.x > width) b.vx *= -1;
          if (b.y < 0 || b.y > height) b.vy *= -1;
        }

        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `hsla(${b.hue}, 80%, 60%, 0.15)`);
        grad.addColorStop(0.5, `hsla(${b.hue}, 70%, 50%, 0.05)`);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      });

      if (animate) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', onResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [animate]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 opacity-80"
    />
  );
}
