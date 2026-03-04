/** Renders a Mel filterbank spectrogram as a colourful heatmap. */
export class MelChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.drawEmpty();
  }

  drawEmpty() {
    const { ctx, canvas } = this;
    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1117');
    bg.addColorStop(1, '#161b22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Record a word to see Mel filterbank output', W / 2, H / 2);
  }

  /**
   * Draw normalised mel frames.
   * @param frames  array of frames, each is array of numFilters values in [0,1]
   * @param label   optional label
   * @param sampleRate  for frequency axis
   * @param hopSamples  hop size in samples, for time axis
   */
  draw(
    frames: number[][],
    label = '',
    sampleRate = 44100,
    hopSamples = 256,
    numFilters = 40,
  ) {
    if (frames.length === 0) { this.drawEmpty(); return; }

    const { ctx, canvas } = this;
    const padL = 50, padR = 12, padT = 28, padB = 32;
    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    // ── Background ───────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1117');
    bg.addColorStop(1, '#161b22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Heatmap ──────────────────────────────────────────────────────────────
    const cellW = plotW / frames.length;
    const cellH = plotH / numFilters;

    for (let t = 0; t < frames.length; t++) {
      for (let m = 0; m < numFilters; m++) {
        const v = frames[t][m] ?? 0;
        ctx.fillStyle = magmaColor(v);
        // Mel filters: draw lowest frequency at bottom
        ctx.fillRect(
          padL + t * cellW,
          padT + (numFilters - 1 - m) * cellH,
          Math.ceil(cellW) + 1,
          Math.ceil(cellH) + 1,
        );
      }
    }

    // ── Border ───────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);

    // ── Y axis (Mel filter index → approx Hz) ────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';

    const melTicks = [100, 500, 1000, 2000, 4000, 8000].filter(
      (hz) => hz <= sampleRate / 2,
    );
    for (const hz of melTicks) {
      const mel = 2595 * Math.log10(1 + hz / 700);
      const melMax = 2595 * Math.log10(1 + (sampleRate / 2) / 700);
      const frac = mel / melMax;
      const y = padT + plotH * (1 - frac);
      ctx.fillText(`${hz < 1000 ? hz : hz / 1000 + 'k'}`, padL - 4, y + 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // Axis title
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (Hz)', 0, 0);
    ctx.restore();

    // ── X axis (time) ─────────────────────────────────────────────────────────
    const totalTime = (frames.length * hopSamples) / sampleRate;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const timeTicks = 5;
    for (let i = 0; i <= timeTicks; i++) {
      const t2 = (i / timeTicks) * totalTime;
      const x = padL + (i / timeTicks) * plotW;
      ctx.fillText(`${t2.toFixed(2)}s`, x, H - padB + 14);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time →', W / 2, H - 4);

    // ── Label ─────────────────────────────────────────────────────────────────
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, padL + 6, padT + 16);
    }
  }
}

/** Magma colourmap (perceptually uniform, dark→light) */
function magmaColor(v: number): string {
  // Simplified magma: black → purple → orange → yellow-white
  const stops: [number, number, number, number][] = [
    [0.0,   0,   0,   4],
    [0.15, 40,  11,  84],
    [0.35, 120, 28, 109],
    [0.55, 200, 70,  90],
    [0.75, 252, 137, 55],
    [0.90, 253, 210, 95],
    [1.0,  252, 253, 191],
  ];

  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i][0] && v <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const t = lo[0] === hi[0] ? 0 : (v - lo[0]) / (hi[0] - lo[0]);
  const r = Math.round(lo[1] + t * (hi[1] - lo[1]));
  const g = Math.round(lo[2] + t * (hi[2] - lo[2]));
  const b = Math.round(lo[3] + t * (hi[3] - lo[3]));
  return `rgb(${r},${g},${b})`;
}
