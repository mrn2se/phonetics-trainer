export interface VowelReference {
  ipa: string;
  f1: number;   // male Hz
  f2: number;   // male Hz
  f1f: number;  // female Hz
  f2f: number;  // female Hz
  color: string;
}

export interface ExampleWord {
  word: string;
  ipa: string;
  vowelIpa: string;
  description?: string;
  wiktLang: string;
}

export interface Language {
  code: string;
  name: string;
  vowels: VowelReference[];
  exampleWords: ExampleWord[];
}

export type SpeakerType = 'male' | 'female';

// ─── Female scaling helper ────────────────────────────────────────────────────
// Based on Peterson & Barney (1952) and Hillenbrand et al. (1995)
// Female formants are consistently higher due to shorter vocal tract (~15 cm vs 17 cm).
// F2 difference is larger for front/high vowels; F1 difference is fairly uniform.
function ff(f1: number, f2: number): { f1f: number; f2f: number } {
  const f1s = f1 < 400 ? 1.13 : f1 < 650 ? 1.14 : 1.11;
  const f2s = f2 > 1800 ? 1.19 : f2 > 1200 ? 1.16 : 1.10;
  return { f1f: Math.round(f1 * f1s), f2f: Math.round(f2 * f2s) };
}

function v(ipa: string, f1: number, f2: number, color: string): VowelReference {
  return { ipa, f1, f2, ...ff(f1, f2), color };
}

// ─── Languages ────────────────────────────────────────────────────────────────

const swedish: Language = {
  code: 'sv',
  name: 'Swedish',
  vowels: [
    v('iː',  270, 2300, '#e74c3c'),
    v('yː',  290, 1880, '#e67e22'),
    v('eː',  370, 2100, '#f39c12'),
    v('øː',  390, 1680, '#2ecc71'),
    v('ɛː',  620, 1850, '#16a085'),
    v('aː',  780, 1400, '#3498db'),
    v('ɑː',  750,  950, '#9b59b6'),
    v('oː',  380,  870, '#8e44ad'),
    v('ʉː',  270, 1550, '#c0392b'),
    v('ʊ',   450,  900, '#27ae60'),
    v('ɪ',   390, 1950, '#d35400'),
    v('ɵ',   380, 1550, '#1abc9c'),
  ],
  exampleWords: [
    { word: 'vit',   ipa: '/viːt/',   vowelIpa: 'iː', description: 'white',  wiktLang: 'sv' },
    { word: 'ny',    ipa: '/nyː/',    vowelIpa: 'yː', description: 'new',    wiktLang: 'sv' },
    { word: 'se',    ipa: '/seː/',    vowelIpa: 'eː', description: 'to see', wiktLang: 'sv' },
    { word: 'höst',  ipa: '/høst/',   vowelIpa: 'øː', description: 'autumn', wiktLang: 'sv' },
    { word: 'här',   ipa: '/hɛːr/',   vowelIpa: 'ɛː', description: 'here',   wiktLang: 'sv' },
    { word: 'dag',   ipa: '/dɑːɡ/',   vowelIpa: 'aː', description: 'day',    wiktLang: 'sv' },
    { word: 'vård',  ipa: '/vɑːrd/',  vowelIpa: 'ɑː', description: 'care',   wiktLang: 'sv' },
    { word: 'sol',   ipa: '/suːl/',   vowelIpa: 'oː', description: 'sun',    wiktLang: 'sv' },
    { word: 'hus',   ipa: '/hʉːs/',   vowelIpa: 'ʉː', description: 'house',  wiktLang: 'sv' },
    { word: 'ord',   ipa: '/uːrd/',   vowelIpa: 'ʊ',  description: 'word',   wiktLang: 'sv' },
  ],
};

const german: Language = {
  code: 'de',
  name: 'German',
  vowels: [
    v('iː',  270, 2290, '#e74c3c'),
    v('yː',  290, 1870, '#e67e22'),
    v('eː',  400, 2020, '#f39c12'),
    v('øː',  400, 1660, '#2ecc71'),
    v('ɛː',  560, 1850, '#16a085'),
    v('aː',  780, 1480, '#3498db'),
    v('oː',  380,  950, '#9b59b6'),
    v('uː',  290,  840, '#1abc9c'),
  ],
  exampleWords: [
    { word: 'Bier',  ipa: '/biːr/',  vowelIpa: 'iː', description: 'beer',  wiktLang: 'de' },
    { word: 'Tür',   ipa: '/tyːr/',  vowelIpa: 'yː', description: 'door',  wiktLang: 'de' },
    { word: 'See',   ipa: '/zeː/',   vowelIpa: 'eː', description: 'lake',  wiktLang: 'de' },
    { word: 'schön', ipa: '/ʃøːn/',  vowelIpa: 'øː', description: 'nice',  wiktLang: 'de' },
    { word: 'Bär',   ipa: '/bɛːr/',  vowelIpa: 'ɛː', description: 'bear',  wiktLang: 'de' },
    { word: 'Tag',   ipa: '/taːk/',  vowelIpa: 'aː', description: 'day',   wiktLang: 'de' },
    { word: 'Boot',  ipa: '/boːt/',  vowelIpa: 'oː', description: 'boat',  wiktLang: 'de' },
    { word: 'Buch',  ipa: '/buːx/',  vowelIpa: 'uː', description: 'book',  wiktLang: 'de' },
  ],
};

const english: Language = {
  code: 'en',
  name: 'English',
  vowels: [
    v('iː',  280, 2250, '#e74c3c'),
    v('ɪ',   400, 1920, '#e67e22'),
    v('e',   530, 1840, '#f39c12'),
    v('æ',   860, 1550, '#2ecc71'),
    v('ɑː',  760,  990, '#16a085'),
    v('ɒ',   620,  880, '#3498db'),
    v('ɔː',  560,  830, '#9b59b6'),
    v('ʊ',   440,  910, '#8e44ad'),
    v('uː',  290,  870, '#1abc9c'),
    v('ʌ',   640, 1190, '#c0392b'),
  ],
  exampleWords: [
    { word: 'beat',   ipa: '/biːt/',  vowelIpa: 'iː', wiktLang: 'en' },
    { word: 'bit',    ipa: '/bɪt/',   vowelIpa: 'ɪ',  wiktLang: 'en' },
    { word: 'bed',    ipa: '/bɛd/',   vowelIpa: 'e',  wiktLang: 'en' },
    { word: 'bad',    ipa: '/bæd/',   vowelIpa: 'æ',  wiktLang: 'en' },
    { word: 'father', ipa: '/fɑːðr/', vowelIpa: 'ɑː', wiktLang: 'en' },
    { word: 'boot',   ipa: '/buːt/',  vowelIpa: 'uː', wiktLang: 'en' },
    { word: 'book',   ipa: '/bʊk/',   vowelIpa: 'ʊ',  wiktLang: 'en' },
    { word: 'bought', ipa: '/bɔːt/',  vowelIpa: 'ɔː', wiktLang: 'en' },
    { word: 'but',    ipa: '/bʌt/',   vowelIpa: 'ʌ',  wiktLang: 'en' },
  ],
};

export const languages: Language[] = [swedish, german, english];
export { swedish, german, english };
