# Phonetics Trainer

> ⚡ **Note:** This project was created with an AI-vibe coding approach, incorporating automated assistance and generative tools throughout development.


A browser-based vowel pronunciation analyser built with TypeScript and Vite.
Record yourself, compare your vowel formants against reference values or a
Wiktionary audio sample, and see where your pronunciation lands on a standard
vowel diagram — all in real time, entirely in the browser.

## Features

- **Vowel space diagram** — F1/F2 plot with IPA reference bubbles (Peterson &
  Barney / Hillenbrand formant targets), per-frame scatter, trajectory line, and
  an IQR-averaged "you" point
- **Male / Female toggle** — shifts reference bubbles to match measured male or
  female vocal-tract averages
- **Mel filterbank spectrogram** — 40-filter log-Mel heatmap for your recording
  and the reference audio side by side
- **LPC spectral envelope** — order-14 LPC on a decimated signal (~11 kHz) with
  detected F1/F2/F3 markers; useful for diagnosing formant tracking quality
- **Debug stats panel** — frame count, F1/F2 ranges and standard deviations,
  LPC order, and effective sample rate
- **Wiktionary audio** — fetches a native-speaker recording from the Wiktionary
  API and analyses it alongside your own recording
- **Three languages** — Swedish (12 vowels, 10 words), German (8 vowels,
  8 words), English (10 vowels, 9 words)

## Live demo

Deployed via GitHub Pages: see the **Deployments** section of this repository.

## Development

```sh
npm install
npm run dev       # start Vite dev server at http://localhost:5173
npm run build     # production build → dist/
npm run preview   # locally preview the production build
```

Requires Node.js 18 or later.

## Deployment

The [GitHub Actions workflow](.github/workflows/deploy.yml) builds the project
on every push to `main`/`master` and deploys the `dist/` folder to GitHub Pages.

To deploy manually:

```sh
npm run build
# serve the dist/ directory with any static file server
```

Because all processing runs in the browser (Web Audio API, typed arrays, Canvas
2D), no server-side component is needed.

## Creating a release

Push a version tag to trigger an automatic GitHub Release that includes a
prebuilt zip of the `dist/` folder:

```sh
git tag v1.0.0
git push origin v1.0.0
```

## Project structure

```
phonetics-trainer/
├── src/
│   ├── audio/
│   │   ├── recorder.ts       # MediaRecorder wrapper
│   │   ├── formants.ts       # LPC decimation, Levinson-Durbin, IQR filtering
│   │   └── mel.ts            # Cooley-Tukey FFT, Mel filterbank
│   ├── ui/
│   │   ├── vowelChart.ts     # F1/F2 vowel space canvas
│   │   ├── melChart.ts       # Mel spectrogram heatmap canvas
│   │   └── lpcChart.ts       # LPC spectral envelope canvas
│   ├── data/
│   │   └── languages.ts      # Vowel references + example words
│   ├── main.ts               # App bootstrap and UI wiring
│   └── styles.css
├── index.html
├── vite.config.ts
└── package.json
```

## Algorithm notes

- **LPC**: Signal is decimated from 44.1 kHz to ~11 kHz before applying
  order-14 LPC to ensure all spectral poles cover the speech formant range
  (0–5.5 kHz). The Levinson-Durbin recursion computes the filter coefficients;
  formants are detected as local peaks in `1/|A(e^jω)|²`.
- **Formant averaging**: Middle 50% of voiced frames are taken (to trim
  onset/offset noise), then IQR outlier rejection (1.5 × IQR fence on both F1
  and F2) removes frames where the tracker jumped to a wrong spectral peak.
  The final "you" point is the simple mean of the survivors.
- **Mel spectrogram**: 40 triangular filters equally spaced on the Mel scale,
  applied to 512-sample Hamming-windowed frames.

## Third-party data

Vowel formant targets (F1/F2 for male and female speakers) are derived from
published acoustic phonetics measurements:

- **Peterson & Barney (1952)** — "Control methods used in a study of the vowels",
  *JASA* 24(2):175–184.
- **Hillenbrand et al. (1995)** — "Acoustic characteristics of American English
  vowels", *JASA* 97(5):3099–3111.

Scientific measurement data is factual information and is not subject to
copyright. The scaling factors used in the code are original work.

## License

MIT — see [LICENSE](LICENSE).

See also [DISCLAIMER.md](DISCLAIMER.md) for information about third-party
content retrieved at runtime.
