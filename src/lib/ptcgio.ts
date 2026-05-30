// Pokemon TCG IO image resolution
// Fetches set metadata once per 24 h and caches in localStorage.
// No API key required for the public CDN / set-list endpoint.

const API_BASE = "https://api.pokemontcg.io/v2";
const TTL = 86_400_000; // 24 h

interface CacheEntry<T> {
  ts: number;
  data: T;
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.ts > TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, data: T) {
  try {
    const entry: CacheEntry<T> = { ts: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {}
}

interface PtcgioSetImages {
  symbol: string;
  logo: string;
}

interface PtcgioSet {
  id: string;
  name: string;
  images: PtcgioSetImages;
}

type SetListCache = PtcgioSet[];

const SET_LIST_KEY = "ptcgio:sets";

let _setListPromise: Promise<PtcgioSet[]> | null = null;

async function fetchSetList(): Promise<PtcgioSet[]> {
  const cached = cacheGet<SetListCache>(SET_LIST_KEY);
  if (cached) return cached;

  if (_setListPromise) return _setListPromise;

  _setListPromise = fetch(`${API_BASE}/sets?select=id,name,images`, {
    headers: { Accept: "application/json" },
  })
    .then((r) => r.json() as Promise<{ data: PtcgioSet[] }>)
    .then(({ data }) => {
      cacheSet(SET_LIST_KEY, data);
      _setListPromise = null;
      return data;
    })
    .catch(() => {
      _setListPromise = null;
      return [] as PtcgioSet[];
    });

  return _setListPromise;
}

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function matchSet(setName: string): Promise<PtcgioSet | null> {
  const cacheKey = `ptcgio:match:${normalize(setName)}`;
  const cached = cacheGet<PtcgioSet>(cacheKey);
  if (cached) return cached;

  const sets = await fetchSetList();
  const target = normalize(setName);
  const match = sets.find((s) => normalize(s.name) === target) ?? null;
  if (match) cacheSet(cacheKey, match);
  return match;
}

// Returns the logo URL for a Pokemon set, or null if not found.
export async function getPokemonSetLogo(
  setName: string,
): Promise<string | null> {
  const match = await matchSet(setName);
  return match?.images.logo ?? null;
}

// Returns the CDN image URL for a card given the PTCGIO set ID and card number.
// Numbers like "001" are stripped to "1" to match the CDN pattern.
export function ptcgioCardUrl(ptcgioSetId: string, cardNumber: string): string {
  const num = cardNumber.replace(/^0+/, "") || cardNumber;
  return `https://images.pokemontcg.io/${ptcgioSetId}/${num}.png`;
}

// Resolves the PTCGIO set ID for a given set name (cached).
export async function getPokemonSetId(
  setName: string,
): Promise<string | null> {
  const match = await matchSet(setName);
  return match?.id ?? null;
}
