import type { LpcSpectrum } from '../audio/formants';

/** Renders the LPC spectral envelope for a single representative frame,
 *  with vertical markers at each detected formant and F1/F2/F3 labelled.
 */
export class LpcChart {
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
    if (rect.width < 1 || rect.height < 1) {
      requestAnimationFrame(() => this.resize());
      return;
    }
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
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LPC spectrum will appear after recording', W / 2, H / 2);
  }

  draw(lpc: LpcSpectrum) {
    const { ctx, canvas } = this;
    const padL = 46, padR = 12, padT = 22, padB = 28;
    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1117');
    bg.addColorStop(1, '#161b22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const { spectrum, formants, sampleRate, N } = lpc;
    const maxFreq = sampleRate / 2;

    // Normalise spectrum to [0, 1]
    let maxVal = 0;
    for (let i = 0; i < N; i++) if (spectrum[i] > maxVal) maxVal = spectrum[i];
    if (maxVal === 0) { this.drawEmpty(); return; }

    // ── Frequency axis grid ────────────────────────────────────────────────────
    const freqTicks = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000].filter(
      (f) => f <= maxFreq,
    );
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    for (const f of freqTicks) {
      const x = padL + (f / maxFreq) * plotW;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, padT + plotH + 14);
    }

    // ── Y axis ─────────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('↑ power', padL - 4, padT + 8);

    // ── Axis titles ────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (Hz)', W / 2, H - 2);

    // ── Spectrum fill ──────────────────────────────────────────────────────────
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, 'rgba(0,212,255,0.7)');
    grad.addColorStop(1, 'rgba(0,212,255,0.05)');

    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    for (let k = 0; k < N; k++) {
      const x = padL + (k / N) * plotW;
      const y = padT + plotH - (spectrum[k] / maxVal) * plotH;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Spectrum outline
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const x = padL + (k / N) * plotW;
      const y = padT + plotH - (spectrum[k] / maxVal) * plotH;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(0,212,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Formant markers ────────────────────────────────────────────────────────
    const fColors = ['#ff6b35', '#ffeb3b', '#4caf50', '#ab47bc', '#26c6da', '#ef5350', '#ffa726'];
    const voiced = formants.filter((f) => f.frequency > 200);

    voiced.forEach((fm, idx) => {
      const x = padL + (fm.frequency / maxFreq) * plotW;
      const color = fColors[idx] ?? '#fff';
      const label = `F${idx + 1}`;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label at top
      ctx.fillStyle = color;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = idx % 2 === 0 ? 'left' : 'right';
      const offset = idx % 2 === 0 ? 3 : -3;
      ctx.fillText(`${label}`, x + offset, padT + 10 + (idx % 3) * 12);

      // Frequency value below line
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(fm.frequency)}`, x, padT + plotH - 4);
    });

    // ── Border ─────────────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(padL, padT, plotW, plotH);

    // ── Legend ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`LPC envelope (sr ≈ ${Math.round(sampleRate)} Hz, representative frame)`, padL + 4, padT - 4);
  }
}
