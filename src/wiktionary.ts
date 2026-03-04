const WIKI_API = 'https://en.wiktionary.org/w/api.php';
const WIKI_COMMONS = 'https://commons.wikimedia.org/w/api.php';

export interface WiktionaryAudio {
  url: string;
  fileName: string;
  language: string;
}

export interface WordAudioResult {
  arrayBuffer: ArrayBuffer;
  /** Direct link to the Wikimedia Commons file page (for licence attribution) */
  commonsPageUrl: string;
  fileName: string;
}

/**
 * Fetch pronunciation audio links for a word from Wiktionary.
 * Uses the parse API to get HTML, then scrapes audio file names.
 */
export async function fetchWiktionaryAudio(
  word: string,
  langCode: string,
): Promise<WiktionaryAudio[]> {
  const params = new URLSearchParams({
    action: 'parse',
    page: word,
    prop: 'wikitext',
    format: 'json',
    origin: '*',
  });

  const res = await fetch(`${WIKI_API}?${params}`);
  if (!res.ok) throw new Error(`Wiktionary API error: ${res.status}`);
  const data = await res.json();

  const wikitext: string = data?.parse?.wikitext?.['*'] ?? '';
  if (!wikitext) return [];

  // Find audio file references in wikitext: {{audio|sv|Sv-vit.ogg|...}}
  const audioRegex = /\{\{audio\s*\|\s*([^|]+)\s*\|\s*([^|}\s]+)/gi;
  const results: WiktionaryAudio[] = [];
  let match: RegExpExecArray | null;

  while ((match = audioRegex.exec(wikitext)) !== null) {
    const lang = match[1].trim().toLowerCase();
    const fileName = match[2].trim();
    if (lang === langCode || lang.startsWith(langCode + '-')) {
      const url = await resolveCommonsFileUrl(fileName);
      if (url) results.push({ url, fileName, language: lang });
    }
  }

  // Also try language-agnostic audio blocks near language sections
  if (results.length === 0) {
    while ((match = audioRegex.exec(wikitext)) !== null) {
      const lang = match[1].trim().toLowerCase();
      const fileName = match[2].trim();
      const url = await resolveCommonsFileUrl(fileName);
      if (url) results.push({ url, fileName, language: lang });
      if (results.length >= 3) break;
    }
  }

  return results.slice(0, 3);
}

/** Resolve a Wikimedia Commons file name to a direct URL */
async function resolveCommonsFileUrl(fileName: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      titles: `File:${fileName}`,
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`${WIKI_COMMONS}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as { imageinfo?: { url: string }[] };
    return page?.imageinfo?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

/** Fetch first available audio for a word, returning the buffer and Commons attribution info */
export async function fetchWordAudio(
  word: string,
  langCode: string,
): Promise<WordAudioResult | null> {
  const audioList = await fetchWiktionaryAudio(word, langCode);
  if (audioList.length === 0) return null;

  for (const audio of audioList) {
    try {
      const res = await fetch(audio.url);
      if (res.ok) {
        return {
          arrayBuffer: await res.arrayBuffer(),
          commonsPageUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(audio.fileName)}`,
          fileName: audio.fileName,
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}
