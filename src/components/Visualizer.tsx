import { useEffect, useRef } from "react";

type Props = { playing: boolean; seed: number };

const BARS = 42;

/**
 * Idle waveform. Not driven by the audio signal: Web Audio's
 * createMediaElementSource would route playback through an AudioContext, and on a
 * cross-origin asset URL that risks silent output. The native engine in a later
 * phase takes over for a real analyser.
 */
export function Visualizer({ playing, seed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playingRef = useRef(playing);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let phase = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      phase += playingRef.current ? 0.05 : 0.012;

      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (BARS - 1)) / BARS);
      ctx.fillStyle = "rgba(243, 240, 234, 0.42)";

      for (let i = 0; i < BARS; i += 1) {
        const wave =
          Math.sin(phase * 1.6 + i * 0.55 + seed) * 0.5 +
          Math.sin(phase * 0.7 + i * 0.21) * 0.5;
        const energy = playingRef.current ? 0.55 + Math.abs(wave) * 0.45 : 0.18;
        const barHeight = Math.max(3, energy * height * (0.35 + Math.abs(wave) * 0.65));
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const radius = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [seed]);

  return <canvas ref={canvasRef} className="visualizer" />;
}
