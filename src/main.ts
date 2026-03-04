import './styles.css';
import { AudioRecorder } from './audio/recorder';
import { extractFormants, averageFormants, computeRepresentativeLpcSpectrum } from './audio/formants';
import { computeMelSpectrogram, normalizeMelFrames } from './audio/mel';
import { VowelChart } from './ui/vowelChart';
import { MelChart } from './ui/melChart';
import { LpcChart } from './ui/lpcChart';
import { languages, type Language, type SpeakerType } from './data/languages';
import { fetchWordAudio } from './wiktionary';

// ─── State ─────────────────────────────────────────────────────────────────────
let recorder: AudioRecorder;
let vowelChart: VowelChart;
let userMelChart: MelChart;
let refMelChart: MelChart;
let lpcChart: LpcChart;
let isRecording = false;
let currentLanguage: Language = languages[0];

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T;
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

function init() {
  recorder = new AudioRecorder();

  const recordBtn    = $<HTMLButtonElement>('record-btn');
  const recordLabel  = $('record-label');
  const statusText   = $('status-text');
  const langSelect   = $<HTMLSelectElement>('lang-select');
  const wordList     = $('word-list');
  const userFormants = $('user-formants');
  const refFormants  = $('ref-formants');
  const refAudioBtn  = $<HTMLButtonElement>('ref-audio-btn');
  const wikiStatus   = $('wiki-status');
  const debugInfo    = $('debug-info');
  const wikiLicense  = $<HTMLAnchorElement>('wiki-license');
  const speakerBtns  = document.querySelectorAll<HTMLButtonElement>('.speaker-btn');

  for (const lang of languages) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    langSelect.appendChild(opt);
  }

  vowelChart   = new VowelChart($<HTMLCanvasElement>('vowel-canvas'));
  userMelChart = new MelChart($<HTMLCanvasElement>('user-mel-canvas'));
  refMelChart  = new MelChart($<HTMLCanvasElement>('ref-mel-canvas'));
  lpcChart     = new LpcChart($<HTMLCanvasElement>('lpc-canvas'));

  let selectedWordIndex = -1;
  let speakerType: SpeakerType = 'male';

  // ── Speaker type toggle ────────────────────────────────────────────────────
  function setSpeakerType(type: SpeakerType) {
    speakerType = type;
    speakerBtns.forEach((b) => b.classList.toggle('active', b.dataset.speaker === type));
    vowelChart.setSpeakerType(type);
    // Re-render reference point with appropriate formant values
    if (selectedWordIndex >= 0) {
      const word = currentLanguage.exampleWords[selectedWordIndex];
      const vowelRef = currentLanguage.vowels.find((v) => v.ipa === word.vowelIpa);
      if (vowelRef) {
        const rf1 = type === 'female' ? vowelRef.f1f : vowelRef.f1;
        const rf2 = type === 'female' ? vowelRef.f2f : vowelRef.f2;
        vowelChart.setReferenceFormants(rf1, rf2, word.word);
        refFormants.textContent = `F1 ${Math.round(rf1)} Hz  /  F2 ${Math.round(rf2)} Hz`;
      }
    }
  }

  // ── Language setup ─────────────────────────────────────────────────────────
  function setLanguage(lang: Language) {
    currentLanguage = lang;
    vowelChart.setVowelReferences(lang.vowels);
    vowelChart.clearUser();
    vowelChart.clearReference();
    buildWordList(lang);
    selectedWordIndex = -1;
    refFormants.textContent = '—';
    refAudioBtn.disabled = true;
    refMelChart.drawEmpty();
    lpcChart.drawEmpty();
    debugInfo.innerHTML = '';
    wikiLicense.hidden = true;
  }

  // ── Word list ──────────────────────────────────────────────────────────────
  function buildWordList(lang: Language) {
    wordList.innerHTML = '';
    lang.exampleWords.forEach((w, i) => {
      const card = document.createElement('div');
      card.className = 'word-card';
      card.innerHTML = `
        <span class="word-text">${w.word}</span>
        <span class="word-ipa">${w.ipa}</span>
        ${w.description ? `<span class="word-desc">${w.description}</span>` : ''}
      `;
      card.addEventListener('click', () => selectWord(i, card));
      wordList.appendChild(card);
    });
  }

  function selectWord(index: number, card: HTMLElement) {
    document.querySelectorAll('.word-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedWordIndex = index;
    const word = currentLanguage.exampleWords[index];
    const vowelRef = currentLanguage.vowels.find((v) => v.ipa === word.vowelIpa);
    if (vowelRef) {
      const rf1 = speakerType === 'female' ? vowelRef.f1f : vowelRef.f1;
      const rf2 = speakerType === 'female' ? vowelRef.f2f : vowelRef.f2;
      vowelChart.setReferenceFormants(rf1, rf2, word.word);
      refFormants.textContent = `F1 ${Math.round(rf1)} Hz  /  F2 ${Math.round(rf2)} Hz`;
    }
    refAudioBtn.disabled = false;
    wikiStatus.textContent = '';
    wikiLicense.hidden = true;
    refMelChart.drawEmpty();
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  async function toggleRecording() {
    if (isRecording) {
      isRecording = false;
      recordBtn.classList.remove('recording');
      recordLabel.textContent = 'Record';
      setStatus('Processing…');
      try {
        const result = await recorder.stop();
        processAudio(result.buffer, result.sampleRate, 'user');
      } catch (err) {
        setStatus(`Error: ${err}`);
      }
    } else {
      try {
        await recorder.start();
        isRecording = true;
        recordBtn.classList.add('recording');
        recordLabel.textContent = 'Stop';
        setStatus('Recording… speak now');
      } catch (err) {
        setStatus(`Microphone error: ${err}`);
      }
    }
  }

  // ── Audio processing ───────────────────────────────────────────────────────
  function processAudio(buffer: AudioBuffer, _sampleRate: number, target: 'user' | 'ref') {
    const { frames, downsampleRate } = extractFormants(buffer);
    const avg = averageFormants(frames, downsampleRate);
    const { f1, f2, f3, debug } = avg;

    const melFrames = computeMelSpectrogram(buffer);
    const normalized = normalizeMelFrames(melFrames);

    if (target === 'user') {
      // Scatter first, then average point on top
      vowelChart.setUserScatter(debug.allPoints, debug.usedPoints);
      vowelChart.setUserFormants(f1, f2, 'you');

      userFormants.textContent =
        `F1 ${Math.round(f1)} Hz  /  F2 ${Math.round(f2)} Hz  /  F3 ${Math.round(f3)} Hz`;
      userMelChart.draw(normalized, 'Your recording', buffer.sampleRate, 256);
      setStatus(`Done — F1 ${Math.round(f1)} Hz, F2 ${Math.round(f2)} Hz`);

      // LPC spectrum
      const lpcSpec = computeRepresentativeLpcSpectrum(buffer);
      if (lpcSpec) lpcChart.draw(lpcSpec);
      else lpcChart.drawEmpty();

      // Debug panel
      renderDebug(debugInfo, debug, buffer);
    } else {
      const word = currentLanguage.exampleWords[selectedWordIndex];
      if (word) {
        const vowelRef = currentLanguage.vowels.find((v) => v.ipa === word.vowelIpa);
        if (vowelRef) {
          const rf1 = speakerType === 'female' ? vowelRef.f1f : vowelRef.f1;
          const rf2 = speakerType === 'female' ? vowelRef.f2f : vowelRef.f2;
          vowelChart.setReferenceFormants(rf1, rf2, word.word);
          refFormants.textContent =
            `F1 ${Math.round(rf1)} Hz / F2 ${Math.round(rf2)} Hz (target)` +
            `  |  audio: F1 ${Math.round(f1)} Hz, F2 ${Math.round(f2)} Hz`;
        }
        refMelChart.draw(normalized, `Reference: ${word.word}`, buffer.sampleRate, 256);
      }
      // status already updated in fetchReferenceAudio (file name/license display)
    }
  }

  // ── Debug info renderer ────────────────────────────────────────────────────
  function renderDebug(
    el: HTMLElement,
    debug: ReturnType<typeof averageFormants>['debug'],
    buffer: AudioBuffer,
  ) {
    const dur = buffer.duration.toFixed(2);
    const sr = buffer.sampleRate;
    const f1Spread = Math.round(debug.f1Max - debug.f1Min);
    const f2Spread = Math.round(debug.f2Max - debug.f2Min);

    el.innerHTML = `
      <div class="debug-row">
        <span class="debug-key">Duration</span>
        <span class="debug-val">${dur} s  (${sr / 1000}k Hz orig → ${Math.round(debug.downsampleRate / 1000 * 10) / 10}k Hz dec)</span>
      </div>
      <div class="debug-row">
        <span class="debug-key">Frames</span>
        <span class="debug-val">${debug.totalFrames} voiced  |  ${debug.usedFrames} used for avg (middle 50%)</span>
      </div>
      <div class="debug-row">
        <span class="debug-key">LPC order</span>
        <span class="debug-val">${debug.lpcOrder}</span>
      </div>
      <div class="debug-row">
        <span class="debug-key">F1 range</span>
        <span class="debug-val">${Math.round(debug.f1Min)}–${Math.round(debug.f1Max)} Hz  (σ ${Math.round(debug.f1Std)} Hz, spread ${f1Spread} Hz)</span>
      </div>
      <div class="debug-row">
        <span class="debug-key">F2 range</span>
        <span class="debug-val">${Math.round(debug.f2Min)}–${Math.round(debug.f2Max)} Hz  (σ ${Math.round(debug.f2Std)} Hz, spread ${f2Spread} Hz)</span>
      </div>
      <div class="debug-row debug-note">
        Scatter on chart: dim dots = all frames, bright dots = frames used for average.
        Large spread / σ means unstable (consonants mixed in, or short recording).
      </div>
    `;
  }

  // ── Wiktionary ─────────────────────────────────────────────────────────────
  async function fetchReferenceAudio() {
    if (selectedWordIndex < 0) return;
    const word = currentLanguage.exampleWords[selectedWordIndex];
    refAudioBtn.disabled = true;
    wikiStatus.textContent = `Fetching "${word.word}" audio from Wiktionary…`;
    try {
      const audioResult = await fetchWordAudio(word.word, word.wiktLang);
      if (!audioResult) {
        wikiStatus.textContent =
          'No audio found on Wiktionary. Showing reference formant values only.';
        refAudioBtn.disabled = false;
        return;
      }
      const result = await recorder.decodeArrayBuffer(audioResult.arrayBuffer);
      processAudio(result.buffer, result.sampleRate, 'ref');

      // update status and licence info
      wikiStatus.textContent =
        `Loaded audio '${audioResult.fileName}'` +
        (audioResult.license ? `  (${audioResult.license})` : '');
      wikiLicense.href = audioResult.commonsPageUrl;
      wikiLicense.textContent = audioResult.license || 'Commons file';
      if (audioResult.licenseUrl) {
        wikiLicense.title = `License details: ${audioResult.licenseUrl}`;
      }
      wikiLicense.hidden = false;
    } catch (err) {
      wikiStatus.textContent = `Wiktionary fetch failed: ${err}`;
    } finally {
      refAudioBtn.disabled = false;
    }
  }

  function setStatus(msg: string) { statusText.textContent = msg; }

  langSelect.addEventListener('change', () => {
    const lang = languages.find((l) => l.code === langSelect.value);
    if (lang) setLanguage(lang);
  });
  recordBtn.addEventListener('click', () => toggleRecording());
  refAudioBtn.addEventListener('click', () => fetchReferenceAudio());
  speakerBtns.forEach((btn) =>
    btn.addEventListener('click', () => setSpeakerType(btn.dataset.speaker as SpeakerType)),
  );

  setLanguage(languages[0]);
}

init();
