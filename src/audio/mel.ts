export interface MelFrame {
  time: number;
  energies: Float64Array; // log mel energies, shape [numFilters]
}

// ─── FFT (Cooley-Tukey, radix-2) ──────────────────────────────────────────────
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const tmp = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = tmp;
      }
    }
  }
}

// ─── Mel conversions ──────────────────────────────────────────────────────────
const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number) => 700 * (10 ** (mel / 2595) - 1);

// ─── Hamming window ───────────────────────────────────────────────────────────
function hamming(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/**
 * Build Mel filterbank matrix [numFilters × (nfft/2+1)]
 */
function buildMelFilters(numFilters: number, nfft: number, sampleRate: number): Float64Array[] {
  const melMin = hzToMel(80);
  const melMax = hzToMel(sampleRate / 2);
  const melPoints = new Float64Array(numFilters + 2);
  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = melMin + (i / (numFilters + 1)) * (melMax - melMin);
  }
  const binFreqs = melPoints.map(melToHz);
  const bins = binFreqs.map((f) => Math.floor(((nfft + 1) * f) / sampleRate));

  const filters: Float64Array[] = [];
  const halfN = nfft / 2 + 1;

  for (let m = 1; m <= numFilters; m++) {
    const filt = new Float64Array(halfN);
    for (let k = bins[m - 1]; k < bins[m]; k++) {
      if (k >= 0 && k < halfN)
        filt[k] = (k - bins[m - 1]) / (bins[m] - bins[m - 1]);
    }
    for (let k = bins[m]; k <= bins[m + 1]; k++) {
      if (k >= 0 && k < halfN)
        filt[k] = (bins[m + 1] - k) / (bins[m + 1] - bins[m]);
    }
    filters.push(filt);
  }
  return filters;
}

/**
 * Compute log-mel spectrogram frames from an AudioBuffer.
 */
export function computeMelSpectrogram(
  buffer: AudioBuffer,
  numFilters = 40,
  frameSize = 1024,
  hopSize = 256,
): MelFrame[] {
  const signal = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = hamming(frameSize);
  const filters = buildMelFilters(numFilters, frameSize, sr);
  const frames: MelFrame[] = [];

  for (let start = 0; start + frameSize <= signal.length; start += hopSize) {
    const re = new Float64Array(frameSize);
    const im = new Float64Array(frameSize);
    for (let i = 0; i < frameSize; i++) re[i] = signal[start + i] * win[i];

    fft(re, im);

    const halfN = frameSize / 2 + 1;
    const powerSpec = new Float64Array(halfN);
    for (let k = 0; k < halfN; k++) powerSpec[k] = re[k] * re[k] + im[k] * im[k];

    const energies = new Float64Array(numFilters);
    for (let m = 0; m < numFilters; m++) {
      let energy = 0;
      for (let k = 0; k < halfN; k++) energy += powerSpec[k] * filters[m][k];
      energies[m] = Math.log(Math.max(energy, 1e-10));
    }

    frames.push({ time: start / sr, energies });
  }

  return frames;
}

/** Normalise mel frames to [0, 1] for display */
export function normalizeMelFrames(frames: MelFrame[]): number[][] {
  if (frames.length === 0) return [];

  let min = Infinity, max = -Infinity;
  for (const f of frames) {
    for (const v of f.energies) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;

  return frames.map((f) => Array.from(f.energies).map((v) => (v - min) / range));
}
