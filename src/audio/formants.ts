export interface Formant {
  frequency: number;
  bandwidth: number;
}

export interface FormantFrame {
  time: number;
  formants: Formant[];
  f1: number;
  f2: number;
  f3: number;
  rms: number;
}

export interface FormantDebug {
  totalFrames: number;       // frames passing energy threshold
  voicedFrames: number;      // frames with valid F1+F2
  usedFrames: number;        // frames in middle-50% used for average
  f1Min: number; f1Max: number; f1Std: number;
  f2Min: number; f2Max: number; f2Std: number;
  allPoints: Array<{ f1: number; f2: number; time: number }>;
  usedPoints: Array<{ f1: number; f2: number; time: number }>;
  downsampleRate: number;    // effective sample rate after decimation
  lpcOrder: number;
}

export interface AvgResult {
  f1: number;
  f2: number;
  f3: number;
  debug: FormantDebug;
}

export interface LpcSpectrum {
  spectrum: Float64Array;       // power spectrum of LPC envelope, N points
  formants: Formant[];          // detected formant peaks
  sampleRate: number;           // effective (downsampled) sample rate
  N: number;                    // spectrum length (covers 0 … sampleRate/2)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hamming(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

function preEmphasis(signal: Float64Array, coeff = 0.97): Float64Array {
  const out = new Float64Array(signal.length);
  out[0] = signal[0];
  for (let i = 1; i < signal.length; i++) out[i] = signal[i] - coeff * signal[i - 1];
  return out;
}

function autocorrelation(signal: Float64Array, maxLag: number): Float64Array {
  const r = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < signal.length - lag; i++) sum += signal[i] * signal[i + lag];
    r[lag] = sum;
  }
  return r;
}

function levinsonDurbin(r: Float64Array, order: number): Float64Array {
  const a = new Float64Array(order + 1);
  const e = new Float64Array(order + 1);
  a[0] = 1.0;
  e[0] = r[0];
  for (let i = 1; i <= order; i++) {
    let lambda = 0;
    for (let j = 0; j < i; j++) lambda -= a[j] * r[i - j];
    lambda /= e[i - 1] || 1e-30;
    const aNew = new Float64Array(order + 1);
    aNew[0] = 1.0;
    for (let j = 1; j < i; j++) aNew[j] = a[j] + lambda * a[i - j];
    aNew[i] = lambda;
    for (let j = 0; j <= order; j++) a[j] = aNew[j];
    e[i] = e[i - 1] * (1 - lambda * lambda);
  }
  return a;
}

/**
 * Evaluate the LPC spectral envelope and return both the power spectrum
 * and detected formant peaks.
 * N = number of frequency bins (covers 0 … effectiveSampleRate/2)
 */
function lpcToSpectrum(
  lpcCoeffs: Float64Array,
  sampleRate: number,
  N = 512,
): { formants: Formant[]; spectrum: Float64Array } {
  const response = new Float64Array(N);

  for (let k = 0; k < N; k++) {
    const theta = (Math.PI * k) / N;
    let reA = 0, imA = 0;
    for (let i = 0; i < lpcCoeffs.length; i++) {
      reA += lpcCoeffs[i] * Math.cos(i * theta);
      imA -= lpcCoeffs[i] * Math.sin(i * theta);
    }
    response[k] = 1.0 / (reA * reA + imA * imA);
  }

  const formants: Formant[] = [];
  for (let k = 1; k < N - 1; k++) {
    if (response[k] > response[k - 1] && response[k] > response[k + 1]) {
      const freq = (k / N) * (sampleRate / 2);
      if (freq > 80 && freq < sampleRate / 2 - 100) {
        const peakPow = response[k];
        let leftK = k, rightK = k;
        while (leftK > 0 && response[leftK] > peakPow / 2) leftK--;
        while (rightK < N - 1 && response[rightK] > peakPow / 2) rightK++;
        const bw = ((rightK - leftK) / N) * (sampleRate / 2);
        if (bw < 800) {
          formants.push({ frequency: freq, bandwidth: bw });
        }
      }
    }
  }

  return { formants: formants.sort((a, b) => a.frequency - b.frequency), spectrum: response };
}

// ─── Simple decimation (box-filter + downsample) ───────────────────────────────
function decimate(signal: Float32Array, factor: number): Float64Array {
  const outLen = Math.floor(signal.length / factor);
  const out = new Float64Array(outLen);
  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += signal[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract formant frames. Decimates the signal to ~TARGET_SR before LPC
 * so that LPC order 14 covers the speech range well.
 */
const TARGET_SR = 11025;
const LPC_ORDER = 14;

export function extractFormants(buffer: AudioBuffer): {
  frames: FormantFrame[];
  downsampleRate: number;
} {
  const rawSignal = buffer.getChannelData(0);
  const origSR = buffer.sampleRate;
  const decFactor = Math.max(1, Math.round(origSR / TARGET_SR));
  const effectiveSR = origSR / decFactor;

  const signal = decFactor > 1 ? decimate(rawSignal, decFactor) : new Float64Array(rawSignal);

  const frameSize = 512;
  const hopSize = 128;
  const win = hamming(frameSize);
  const frames: FormantFrame[] = [];

  for (let start = 0; start + frameSize <= signal.length; start += hopSize) {
    const frame = new Float64Array(frameSize);
    let rms = 0;
    for (let i = 0; i < frameSize; i++) {
      frame[i] = signal[start + i] * win[i];
      rms += signal[start + i] ** 2;
    }
    rms = Math.sqrt(rms / frameSize);

    if (rms < 1e-4) continue; // skip near-silence frames

    const emphasized = preEmphasis(frame);
    const r = autocorrelation(emphasized, LPC_ORDER);
    if (r[0] < 1e-10) continue;

    const lpc = levinsonDurbin(r, LPC_ORDER);
    const { formants } = lpcToSpectrum(lpc, effectiveSR);

    const voiced = formants.filter((f) => f.frequency > 200);
    const f1 = voiced[0]?.frequency ?? 0;
    const f2 = voiced[1]?.frequency ?? 0;
    const f3 = voiced[2]?.frequency ?? 0;

    if (f1 > 0 && f2 > 0) {
      frames.push({ time: (start * decFactor) / origSR, formants, f1, f2, f3, rms });
    }
  }

  return { frames, downsampleRate: effectiveSR };
}

// ─── IQR outlier rejection ────────────────────────────────────────────────────
function iqrFilter(frames: FormantFrame[]): FormantFrame[] {
  if (frames.length < 4) return frames;

  const sorted1 = frames.map((f) => f.f1).sort((a, b) => a - b);
  const sorted2 = frames.map((f) => f.f2).sort((a, b) => a - b);

  const q1 = (arr: number[]) => arr[Math.floor(arr.length * 0.25)];
  const q3 = (arr: number[]) => arr[Math.floor(arr.length * 0.75)];

  const q1f1 = q1(sorted1), q3f1 = q3(sorted1), iqr1 = q3f1 - q1f1;
  const q1f2 = q1(sorted2), q3f2 = q3(sorted2), iqr2 = q3f2 - q1f2;

  const lo1 = q1f1 - 1.5 * iqr1, hi1 = q3f1 + 1.5 * iqr1;
  const lo2 = q1f2 - 1.5 * iqr2, hi2 = q3f2 + 1.5 * iqr2;

  const filtered = frames.filter(
    (f) => f.f1 >= lo1 && f.f1 <= hi1 && f.f2 >= lo2 && f.f2 <= hi2,
  );
  return filtered.length >= 3 ? filtered : frames;
}

/**
 * Average formants:
 *  1. Take the middle 50% of frames (trim onset/offset noise)
 *  2. IQR-filter outliers (removes frames where F1/F2 jumped to a wrong peak)
 *  3. Simple mean of the remaining frames
 *
 * The IQR filtering is the key fix: it ensures the final "you" dot sits
 * inside the cluster of dots rather than being pulled toward outliers.
 */
export function averageFormants(
  frames: FormantFrame[],
  downsampleRate: number,
): AvgResult {
  const fallback: AvgResult = {
    f1: 500, f2: 1500, f3: 2500,
    debug: {
      totalFrames: 0, voicedFrames: 0, usedFrames: 0,
      f1Min: 0, f1Max: 0, f1Std: 0,
      f2Min: 0, f2Max: 0, f2Std: 0,
      allPoints: [], usedPoints: [],
      downsampleRate, lpcOrder: LPC_ORDER,
    },
  };
  if (frames.length === 0) return fallback;

  const allPoints = frames.map((f) => ({ f1: f.f1, f2: f.f2, time: f.time }));

  // Step 1: middle 80%
  const s = Math.floor(frames.length * 0.1);
  const e = Math.floor(frames.length * 0.9);
  const midSlice = frames.length >= 4 ? frames.slice(s, e) : frames;

  // Step 2: IQR outlier rejection
  const clean = iqrFilter(midSlice);

  const usedPoints = clean.map((f) => ({ f1: f.f1, f2: f.f2, time: f.time }));

  const sorted = (vals: number[]) => [...vals].sort((a, b) => a - b);
  const median = (vals: number[]) => {
    const s = sorted(vals);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // Step 3: median of the remaining frames
  const f1Vals = clean.map((f) => f.f1);
  const f2Vals = clean.map((f) => f.f2);
  const f3Vals = clean.map((f) => f.f3);
  const f1 = median(f1Vals);
  const f2 = median(f2Vals);
  const f3 = median(f3Vals);

  const std = (vals: number[], mean: number) =>
    Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);

  return {
    f1, f2, f3,
    debug: {
      totalFrames: frames.length,
      voicedFrames: frames.length,
      usedFrames: clean.length,
      f1Min: Math.min(...f1Vals), f1Max: Math.max(...f1Vals), f1Std: std(f1Vals, f1),
      f2Min: Math.min(...f2Vals), f2Max: Math.max(...f2Vals), f2Std: std(f2Vals, f2),
      allPoints, usedPoints,
      downsampleRate, lpcOrder: LPC_ORDER,
    },
  };
}

/**
 * Compute the LPC spectrum for the most representative (loudest middle) frame.
 * Used for the LPC debug visualisation.
 */
export function computeRepresentativeLpcSpectrum(
  buffer: AudioBuffer,
): LpcSpectrum | null {
  const rawSignal = buffer.getChannelData(0);
  const origSR = buffer.sampleRate;
  const decFactor = Math.max(1, Math.round(origSR / TARGET_SR));
  const effectiveSR = origSR / decFactor;
  const signal = decFactor > 1 ? decimate(rawSignal, decFactor) : new Float64Array(rawSignal);

  const frameSize = 512;
  const hopSize = 128;
  const win = hamming(frameSize);

  // Collect all viable frames with their RMS
  const candidates: { start: number; rms: number }[] = [];
  for (let start = 0; start + frameSize <= signal.length; start += hopSize) {
    let rms = 0;
    for (let i = 0; i < frameSize; i++) rms += signal[start + i] ** 2;
    rms = Math.sqrt(rms / frameSize);
    if (rms >= 1e-4) candidates.push({ start, rms });
  }
  if (candidates.length === 0) return null;

  // Pick the loudest frame in the middle third
  const ms = Math.floor(candidates.length * 0.33);
  const me = Math.floor(candidates.length * 0.66);
  const midCandidates = candidates.slice(ms, me + 1);
  const best = midCandidates.reduce((a, b) => (b.rms > a.rms ? b : a));

  const frame = new Float64Array(frameSize);
  for (let i = 0; i < frameSize; i++) frame[i] = signal[best.start + i] * win[i];

  const emphasized = preEmphasis(frame);
  const r = autocorrelation(emphasized, LPC_ORDER);
  if (r[0] < 1e-10) return null;

  const lpc = levinsonDurbin(r, LPC_ORDER);
  const { formants, spectrum } = lpcToSpectrum(lpc, effectiveSR, 1024);

  return { spectrum, formants, sampleRate: effectiveSR, N: 1024 };
}
