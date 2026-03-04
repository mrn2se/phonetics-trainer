import type { VowelReference, SpeakerType } from '../data/languages';

export interface VowelPoint {
  f1: number;
  f2: number;
  label: string;
  color: string;
  isUser?: boolean;
  isReference?: boolean;
}

const F1_MIN = 200;
const F1_MAX = 1000;
const F2_MIN = 700;
const F2_MAX = 2900;

function f1ToY(f1: number, h: number, pad: number): number {
  return pad + ((f1 - F1_MIN) / (F1_MAX - F1_MIN)) * (h - 2 * pad);
}

function f2ToX(f2: number, w: number, pad: number): number {
  return pad + ((F2_MAX - f2) / (F2_MAX - F2_MIN)) * (w - 2 * pad);
}

export class VowelChart {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private vowelRefs: VowelReference[] = [];
  private userPoints: VowelPoint[] = [];
  private referencePoints: VowelPoint[] = [];
  private animFrame = 0;
  private speakerType: SpeakerType = 'male';

  // Per-frame scatter: all frames (grey) and used-for-average frames (dimmer cyan)
  private allScatter: Array<{ f1: number; f2: number }> = [];
  private usedScatter: Array<{ f1: number; f2: number }> = [];

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
    this.draw();
  }

  setVowelReferences(refs: VowelReference[]) {
    this.vowelRefs = refs;
    this.draw();
  }

  setSpeakerType(type: SpeakerType) {
    this.speakerType = type;
    this.draw();
  }

  /** Draw individual frame positions as scatter + connect with a trajectory line */
  setUserScatter(
    allPoints: Array<{ f1: number; f2: number }>,
    usedPoints: Array<{ f1: number; f2: number }>,
  ) {
    this.allScatter = allPoints;
    this.usedScatter = usedPoints;
  }

  setUserFormants(f1: number, f2: number, label = 'you') {
    this.userPoints = [{ f1, f2, label, color: '#00d4ff', isUser: true }];
    this.animatePulse();
  }

  setReferenceFormants(f1: number, f2: number, label: string) {
    this.referencePoints = [{ f1, f2, label, color: '#ff6b35', isReference: true }];
    this.draw();
  }

  clearUser() {
    this.userPoints = [];
    this.allScatter = [];
    this.usedScatter = [];
    cancelAnimationFrame(this.animFrame);
    this.draw();
  }

  clearReference() {
    this.referencePoints = [];
    this.draw();
  }

  private animatePulse() {
    let t = 0;
    const step = () => {
      this.draw(t);
      t += 0.06;
      this.animFrame = requestAnimationFrame(step);
      if (t > Math.PI * 6) {
        cancelAnimationFrame(this.animFrame);
        this.draw(0);
      }
    };
    step();
  }

  draw(t = 0) {
    const { canvas, ctx } = this;
    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    const pad = 48;

    ctx.clearRect(0, 0, W, H);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1117');
    bg.addColorStop(1, '#161b22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Grid lines ──────────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let f1 = 200; f1 <= 1000; f1 += 100) {
      const y = f1ToY(f1, H, pad);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    }
    for (let f2 = 800; f2 <= 2900; f2 += 200) {
      const x = f2ToX(f2, W, pad);
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
    }

    // ── Axis labels ──────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    for (let f2 = 800; f2 <= 2900; f2 += 400) {
      ctx.fillText(`${f2}`, f2ToX(f2, W, pad), pad - 8);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('F₂ (Hz) →', W / 2, 14);
    ctx.save();
    ctx.translate(14, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('← F₁ (Hz)', 0, 0);
    ctx.restore();
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let f1 = 200; f1 <= 1000; f1 += 100) {
      ctx.fillText(`${f1}`, pad - 6, f1ToY(f1, H, pad) + 4);
    }

    // ── Vowel reference bubbles ───────────────────────────────────────────────
    for (const v of this.vowelRefs) {
      const vf1 = this.speakerType === 'female' ? v.f1f : v.f1;
      const vf2 = this.speakerType === 'female' ? v.f2f : v.f2;
      const x = f2ToX(vf2, W, pad);
      const y = f1ToY(vf1, H, pad);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 22);
      grd.addColorStop(0, v.color + '55');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = v.color + 'cc'; ctx.fill();
      ctx.strokeStyle = v.color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px serif'; ctx.textAlign = 'center';
      ctx.fillText(v.ipa, x, y + 5);
    }

    // ── Frame scatter: all frames (trajectory) ────────────────────────────────
    if (this.allScatter.length > 1) {
      // Thin trajectory line through all frames
      ctx.beginPath();
      ctx.moveTo(f2ToX(this.allScatter[0].f2, W, pad), f1ToY(this.allScatter[0].f1, H, pad));
      for (let i = 1; i < this.allScatter.length; i++) {
        ctx.lineTo(f2ToX(this.allScatter[i].f2, W, pad), f1ToY(this.allScatter[i].f1, H, pad));
      }
      ctx.strokeStyle = 'rgba(0,212,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Individual frame dots (all frames, dim)
      for (const p of this.allScatter) {
        ctx.beginPath();
        ctx.arc(f2ToX(p.f2, W, pad), f1ToY(p.f1, H, pad), 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,212,255,0.18)';
        ctx.fill();
      }
    }

    // ── Used-for-average frames (brighter dots) ───────────────────────────────
    if (this.usedScatter.length > 0) {
      for (const p of this.usedScatter) {
        ctx.beginPath();
        ctx.arc(f2ToX(p.f2, W, pad), f1ToY(p.f1, H, pad), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,212,255,0.45)';
        ctx.fill();
      }
    }

    // ── Reference point ───────────────────────────────────────────────────────
    for (const p of this.referencePoints) {
      const x = f2ToX(p.f2, W, pad);
      const y = f1ToY(p.f1, H, pad);
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff6b35'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff6b3588';
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.label, x, y - 22);
    }

    // ── User average point (animated pulse) ───────────────────────────────────
    for (const p of this.userPoints) {
      const x = f2ToX(p.f2, W, pad);
      const y = f1ToY(p.f1, H, pad);
      const pulse = t > 0 ? 14 + 10 * Math.abs(Math.sin(t)) : 14;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, pulse * 2);
      grd.addColorStop(0, '#00d4ff88'); grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(x, y, pulse * 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#00d4ff'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.label, x, y - pulse - 6);
    }
  }
}
