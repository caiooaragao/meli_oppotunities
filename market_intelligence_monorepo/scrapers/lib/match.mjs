// Bump when the rules change, so the next run redoes every search done with the old ones.
export const MATCHER_VERSION = 11;

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "com", "para", "pra", "por", "a", "o", "os", "as",
  "um", "uma", "no", "na", "nos", "nas", "ao", "ou", "que", "seu", "sua", "the", "for", "and",
  "with", "of", "c", "p", "s", "x",
  "original", "novo", "nova", "promocao", "oferta", "envio", "imediato", "pronta", "entrega",
  "frete", "gratis", "barato", "qualidade", "top", "melhor", "lancamento", "atacado", "fabrica",
  "direto", "fornecedor", "venda", "quente", "moda", "estilo", "premium", "luxo", "super",
  "produto", "modelo", "tipo", "linha", "nf", "garantia", "pronto", "hot", "new",
  "varias", "cores", "tamanho", "tamanhos", "chegada",
]);

const COLORS = new Set([
  "cor", "preto", "preta", "branco", "branca", "azul", "vermelho", "vermelha", "verde",
  "amarelo", "amarela", "rosa", "roxo", "roxa", "cinza", "prata", "dourado", "dourada",
  "marrom", "bege", "laranja", "transparente", "colorido", "colorida", "incolor", "grafite",
  "nude", "escuro", "escura", "claro", "clara", "black", "white", "navy", "marinho", "vinho",
  "lilas", "turquesa", "caramelo", "creme", "salmao", "mostarda", "petroleo", "champagne",
]);

const PACK_WORDS = new Set([
  "kit", "jogo", "conjunto", "combo", "par", "pares", "pacote", "caixa", "lote", "unidade",
  "unidades", "und", "un", "unid", "pcs", "pc", "pecas", "peca",
]);

const SYNONYMS = new Map(
  Object.entries({
    headphone: "fone", headset: "fone", auricular: "fone", earbud: "fone", earphone: "fone",
    smartphone: "celular", telemovel: "celular",
    notebook: "laptop",
    tenis: "tenis", sapatilha: "tenis",
    lampada: "lampada", bulbo: "lampada",
    garrafa: "garrafa", squeeze: "garrafa",
    mochila: "mochila",
    smartwatch: "relogio",
    caixinha: "caixa",
    tv: "televisao", televisor: "televisao",
    escova: "escova",
    oculo: "oculos",
  }),
);

// Units whose values must agree when both titles mention them. "mm", "hz" and friends show up
// as secondary measurements in supplier titles too often to veto a match on their own.
const HARD_UNITS = new Set([
  "w", "v", "a", "mah", "ml", "g", "gb", "mb", "mbps", "in", "btu", "hp", "psi", "bar", "mpa",
  "portas", "tomadas", "canais", "bocas", "gavetas", "lugares",
]);

const UNIT_CANON = {
  kw: ["w", 1000], w: ["w", 1], watt: ["w", 1], watts: ["w", 1],
  mah: ["mah", 1], ah: ["mah", 1000],
  v: ["v", 1], volt: ["v", 1], volts: ["v", 1],
  ml: ["ml", 1], l: ["ml", 1000], lt: ["ml", 1000], lts: ["ml", 1000], litro: ["ml", 1000], litros: ["ml", 1000],
  mg: ["g", 0.001], g: ["g", 1], grama: ["g", 1], gramas: ["g", 1], kg: ["g", 1000],
  mm: ["mm", 1], cm: ["mm", 10], m: ["mm", 1000], mt: ["mm", 1000], mts: ["mm", 1000],
  metro: ["mm", 1000], metros: ["mm", 1000],
  psi: ["psi", 1], bar: ["bar", 1], mpa: ["mpa", 1],
  hp: ["hp", 1], cv: ["hp", 1],
  gb: ["gb", 1], tb: ["gb", 1024],
  pol: ["in", 1], polegada: ["in", 1], polegadas: ["in", 1],
  hz: ["hz", 1], btu: ["btu", 1], btus: ["btu", 1], rpm: ["rpm", 1],
  lm: ["lm", 1], lumens: ["lm", 1], led: ["leds", 1], leds: ["leds", 1],
  amp: ["a", 1],
  mb: ["mb", 1], mbps: ["mbps", 1], gbps: ["mbps", 1000], ghz: ["ghz", 1],
  porta: ["portas", 1], portas: ["portas", 1], tomada: ["tomadas", 1], tomadas: ["tomadas", 1],
  canal: ["canais", 1], canais: ["canais", 1], boca: ["bocas", 1], bocas: ["bocas", 1],
  gaveta: ["gavetas", 1], gavetas: ["gavetas", 1], lugar: ["lugares", 1], lugares: ["lugares", 1],
};

const SPEC_PATTERN = new RegExp(
  `(?<![a-z0-9.])(\\d+(?:\\.\\d+)?)\\s*(${Object.keys(UNIT_CANON).sort((a, b) => b.length - a.length).join("|")})(?![a-z0-9])`,
  "g",
);

// Standards that look like model codes: connectors, threads, bulb bases, oil viscosity, resolutions
// and the generation/resolution tokens normalize() builds. They tell products apart (the prefix
// clash below) without counting as a stated model.
const STANDARD_CODE =
  /^(ip|ipx|ddr|lpddr|usb|mp|cat|rj|wifi|qc|pd|hdmi|dp|bt|v|m|e|gu|mr|st)\d{1,2}$|^\d+(k|p|hz|fps|mp|x|w|v|g)$|^\d+w\d+$|^(gen|res)\d+$/;

// Variant words: "Watch 5 Active" and "Watch 5" are different products.
const VARIANTS = new Set(["pro", "max", "plus", "ultra", "lite", "mini", "active", "air", "neo", "fe", "edge"]);

// Product lines where the number after the name is the model: "iPhone 15" and "iPhone 13" differ.
const NUMBERED_LINES =
  /\b(iphone|ipad|galaxy|redmi|poco|moto|note|watch|band|pixel|airpods|hero|series|serie|buds)\s+(\d{1,3})(?![\d.,])/g;

export function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\*\*/g, " ")
    .replace(/\b(\d{1,3})(?:\.(\d{3}))+(?![\d,])/g, (match) => match.replace(/\./g, ""))
    .replace(/(\d),(\d)/g, "$1.$2")
    // "5a geração", "4ª Geração", "2nd gen": a generation, not 5 amps and not a loose number.
    .replace(/\b(\d{1,2})\s*[aªº°]?\s*geracao\b/g, "gen$1")
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s*gen(?:eration)?\b/g, "gen$1")
    // Resolutions in one family, so "4K" against "1080p" is a different product.
    .replace(/\b(?:full\s*hd|fullhd|fhd)\b/g, "res1080")
    .replace(/\b(?:4k|uhd|ultra\s*hd)\b/g, "res2160")
    .replace(/\b(?:2k|qhd)\b/g, "res1440")
    .replace(/\b(480|720|1080|1440|2160)p\b/g, "res$1")
    .replace(NUMBERED_LINES, "$1$2")
    .replace(/(\d+)\s*\/\s*(\d+)\s*v\b/g, "$1v $2v")
    .replace(/\bbivolt\b/g, "bivolt 127v 220v")
    .replace(/\b([2-5])g\b/g, "rede$1g")
    .replace(/(?<![a-z0-9.])(\d{1,2}(?:\.\d+)?)a\b/g, "$1amp")
    .replace(/\b([a-z]{1,5})-(\d)/g, "$1$2")
    .replace(/(\d)-([a-z]{1,3})\b/g, "$1$2");
}

function stem(token) {
  let base = token;
  if (base.length > 4) {
    if (/(oes|aes)$/.test(base)) base = `${base.slice(0, -3)}ao`;
    else if (base.endsWith("ais")) base = `${base.slice(0, -3)}al`;
    else if (base.endsWith("ns")) base = `${base.slice(0, -2)}m`;
    else if (base.endsWith("s") && !base.endsWith("ss")) base = base.slice(0, -1);
  }
  return SYNONYMS.get(base) || SYNONYMS.get(token) || base;
}

function isSpecToken(token) {
  const match = token.match(/^\d+(?:\.\d+)?([a-z]+)$/);
  return Boolean(match && UNIT_CANON[match[1]]);
}

function isCode(token) {
  return /[a-z]/.test(token) && /\d/.test(token) && token.length >= 3 && !isSpecToken(token);
}

function isStrongCode(token) {
  return isCode(token) && (token.match(/\d/g) || []).length >= 2 && !STANDARD_CODE.test(token);
}

function codePrefix(code) {
  return code.match(/^[a-z]*/)[0];
}

function extractSpecs(text) {
  const specs = new Map();
  const labels = [];
  for (const match of text.matchAll(SPEC_PATTERN)) {
    const [unit, factor] = UNIT_CANON[match[2]];
    const value = Number(match[1]) * factor;
    if (!Number.isFinite(value) || value <= 0) continue;
    const values = specs.get(unit) || [];
    values.push(value);
    specs.set(unit, values);
    labels.push(`${match[1]}${match[2]}`);
  }
  return { specs, labels: [...new Set(labels)] };
}

// Loose numbers that name the item rather than measure it: "LiDE 300", "TV 50", "Serie 7".
// Decimals, dimension pairs ("128x64"), percentages and the numbers glued to a unit stay out,
// as do steel grades and years, which describe the material or the season, not the model.
const NUMBER_NOISE = new Set([100, 201, 304, 316, 360, 1000, 2023, 2024, 2025, 2026, 2027]);

function extractNumbers(text) {
  const numbers = new Set();
  const pattern = /(?<![\d.,a-z])(\d{2,4})(?![\d.,%a-z]|\s*(?:x|×)\s*\d)/g;
  for (const match of text.replace(SPEC_PATTERN, " ").matchAll(pattern)) {
    const value = Number(match[1]);
    if (!NUMBER_NOISE.has(value)) numbers.add(value);
  }
  return [...numbers];
}

function extractPack(text, isTitleStart) {
  const patterns = [
    /\bkit\s*(?:com|c\/|de)?\s*(\d{1,3})\b(?!\s*(?:kg|g|ml|l|m|cm|mm|w|v)\b)/,
    /\b(?:conjunto|jogo|pacote|caixa|lote|combo)\s*(?:com|de|c\/)?\s*(\d{1,3})\b(?!\s*(?:kg|g|ml|l|m|cm|mm|w|v)\b)/,
    /\b(\d{1,3})\s*(?:unidades|unidade|unid|und|un|pcs|pc|pecas|peca|pares|rolos|pacotes|latas|garrafas|frascos|potes|caixas|resmas)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]) * (/pares/.test(match[0]) ? 2 : 1);
  }
  if (isTitleStart) {
    const leading = text.match(/^\s*(\d{1,2})\s*x\s+[a-z]/);
    if (leading) return Number(leading[1]);
  }
  if (/\b(?:par|pares) de\b/.test(text)) return 2;
  return 1;
}

export function features(title) {
  const text = normalize(title);
  const { specs, labels } = extractSpecs(text);
  const raw = text.replace(SPEC_PATTERN, " ").split(/[^a-z0-9]+/).filter(Boolean);

  const tokens = [];
  const codes = [];
  const seen = new Set();
  for (const token of raw) {
    if (isCode(token)) {
      if (!codes.includes(token)) codes.push(token);
      continue;
    }
    if (token.length < 2 || /^\d/.test(token)) continue;
    if (STOP.has(token) || COLORS.has(token) || PACK_WORDS.has(token)) continue;
    const stemmed = stem(token);
    if (seen.has(stemmed)) continue;
    seen.add(stemmed);
    tokens.push({ raw: token, stem: stemmed });
  }

  return {
    text,
    tokens,
    variants: new Set(raw.filter((token) => VARIANTS.has(token))),
    stems: new Set(tokens.map((token) => token.stem)),
    codes,
    strongCodes: codes.filter(isStrongCode),
    numbers: extractNumbers(text),
    specs,
    specLabels: labels,
    pack: extractPack(text, true),
  };
}

export function offerFeatures(title) {
  const base = features(title);
  return { ...base, pack: extractPack(base.text, false) };
}

// A word in at most this share of the Mercado Livre titles is a brand, a line or a character,
// not a description ("infantil", "bluetooth" and "silicone" each sit in well over 1%).
const RARE_SHARE = 0.01;

// How many titles each word stem appears in, as [stem, count] pairs that survive a worker message.
export function wordFrequency(titles) {
  const counts = new Map();
  for (const title of titles) {
    for (const stem of features(title).stems) counts.set(stem, (counts.get(stem) || 0) + 1);
  }
  return { total: titles.length, counts: [...counts] };
}

export function shareFunction(frequency) {
  if (!frequency || !frequency.total) return null;
  const counts = new Map(frequency.counts);
  return (stem) => (counts.get(stem) || 0) / frequency.total;
}

// Codes glued by normalize() go back to how the sites index them: "iphone 15", not "iphone15".
function searchableCode(code) {
  return code.replace(/^(iphone|ipad|galaxy|redmi|poco|moto|note|watch|band|pixel|airpods|hero|series|serie|buds)(\d+)$/, "$1 $2");
}

// `share(stem)` is how often the word shows up across every Mercado Livre title; with it, the
// first query names the product and then its rarest words, so "Fone de Ouvido Sem Fio Xiaomi
// Redmi Buds 6" searches for the Redmi Buds instead of for any wireless earphone.
export function buildQueries(ml, share = null) {
  const words = ml.tokens.map((token) => token.raw);
  const specs = ml.specLabels
    .filter((label) => !/\dv$/.test(label))
    .slice(0, 2)
    .map((label) => label.replace(/amp$/, "a"));
  const code = ml.strongCodes.slice(0, 1).map(searchableCode);
  const queries = [];

  if (share) {
    const rare = ml.tokens
      .slice(2)
      .map((token, index) => ({ token, index, share: share(token.stem) }))
      .filter((entry) => entry.share <= RARE_SHARE)
      .sort((left, right) => left.share - right.share || left.index - right.index)
      .slice(0, 2)
      .sort((left, right) => left.index - right.index)
      .map((entry) => entry.token.raw);
    if (rare.length > 0) {
      queries.push([...words.slice(0, 2), ...rare, ...code, ...specs.slice(0, 1)].join(" "));
    }
  }
  queries.push([...words.slice(0, 4), ...code, ...specs].join(" "));
  queries.push([...words.slice(0, 3), ...specs].join(" "));
  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

function sameValue(left, right) {
  return Math.abs(left - right) <= Math.max(left, right) * 0.02;
}

const weight = (index) => 1 / (1 + 0.25 * index);

// "Bateria ... para Xiaomi Redmi Watch": the offer opens with another object and only names the
// ML product after "para"/"compatível".
function looksLikeAccessory(ml, offer) {
  const first = offer.tokens[0];
  if (!first || ml.stems.has(first.stem)) return false;
  const forAt = offer.text.search(/\b(para|compativel|for|p\/)\s/);
  if (forAt === -1) return false;
  const headAt = offer.text.search(new RegExp(`\\b${ml.tokens[0].stem.slice(0, 5)}`));
  return headAt === -1 || forAt < headAt;
}

// Text gate: everything that can prove two titles are different products.
// Returns null when the offer survives, or the reason it was dropped.
export function compareText(ml, offer, mlPrice, offerPriceBrl) {
  const mlTokens = ml.tokens.slice(0, 10);
  if (mlTokens.length === 0) return { rejected: "título sem palavras" };

  // The first two words of a title name the product ("Papel Sulfite", "Calça Jeans"). The first
  // one is mandatory; a match without a photo also needs both titles to open with the same pair.
  if (!offer.stems.has(mlTokens[0].stem)) return { rejected: "tipo de produto diferente" };
  const mlHead = mlTokens.slice(0, 2).every((token) => offer.stems.has(token.stem));
  const offerHead = offer.tokens.slice(0, 2).every((token) => ml.stems.has(token.stem));

  for (const code of offer.codes) {
    if (ml.codes.includes(code)) continue;
    const prefix = codePrefix(code);
    const strong = offer.strongCodes.includes(code);
    const clash = ml.codes.some(
      (mlCode) =>
        codePrefix(mlCode) === prefix &&
        (prefix.length >= 2 || (prefix.length === 1 && strong && ml.strongCodes.includes(mlCode))),
    );
    if (clash) return { rejected: `modelo diferente (${code})` };
  }

  const statedModels = ml.strongCodes.length > 0 && ml.strongCodes.length <= 3 && offer.strongCodes.length > 0;
  if (statedModels && !ml.strongCodes.some((code) => offer.codes.includes(code))) {
    return { rejected: `modelo diferente (${offer.strongCodes[0]})` };
  }

  // "LiDE 300" against "LiDE 400": when both titles carry loose numbers they must share one.
  if (
    ml.numbers.length > 0 &&
    offer.numbers.length > 0 &&
    !ml.numbers.some((value) => offer.numbers.includes(value))
  ) {
    return { rejected: `numeração diferente (${offer.numbers[0]})` };
  }

  if (looksLikeAccessory(ml, offer)) return { rejected: "acessório para o produto" };

  const variantMismatch = [...ml.variants, ...offer.variants].find(
    (word) => ml.variants.has(word) !== offer.variants.has(word),
  );
  if (variantMismatch) return { rejected: `versão diferente (${variantMismatch})` };

  let specMatched = 0;
  let specTotal = 0;
  for (const [unit, mlValues] of ml.specs) {
    specTotal += 1;
    const offerValues = offer.specs.get(unit);
    if (!offerValues) continue;
    const agrees = mlValues.some((value) => offerValues.some((other) => sameValue(value, other)));
    if (agrees) specMatched += 1;
    else if (HARD_UNITS.has(unit)) return { rejected: `especificação diferente (${unit})` };
  }

  let packRatio = 1;
  if (ml.pack !== offer.pack) {
    if (offer.pack !== 1) return { rejected: `quantidade diferente (${ml.pack} × ${offer.pack})` };
    packRatio = ml.pack;
  }

  const priceBrl = offerPriceBrl * packRatio;
  const priceRatio = mlPrice > 0 ? priceBrl / mlPrice : null;
  if (priceRatio == null || priceRatio < 0.08 || priceRatio > 2.5) {
    return { rejected: "preço fora da faixa do produto" };
  }

  let total = 0;
  let hit = 0;
  mlTokens.forEach((token, index) => {
    total += weight(index);
    if (offer.stems.has(token.stem)) hit += weight(index);
  });
  const textScore = hit / total;
  if (textScore < 0.35) return { rejected: "poucas palavras em comum" };

  // More than three model codes is a compatibility list ("para S20 S21 S22 ..."), not the item itself.
  const modelMatch =
    ml.strongCodes.length <= 3 && ml.strongCodes.some((code) => offer.codes.includes(code));

  // Only one side names a model ("Pistola SGT3011B" against a generic gun, or a generic ML title
  // against "Webcam C925e"): the titles alone can't tell the branded item from the look-alike.
  const codeGap =
    (ml.strongCodes.length === 0 && offer.strongCodes.length > 0) ||
    (ml.strongCodes.length > 0 && ml.strongCodes.length <= 3 && offer.strongCodes.length === 0);

  return {
    rejected: null,
    mlHead,
    sameHead: mlHead && offerHead,
    textScore,
    specMatched,
    specTotal,
    modelMatch,
    codeGap,
    packRatio,
    priceBrl: Math.round(priceBrl * 100) / 100,
  };
}

// Words of the ML title that appear in at most about a third of what the site returned for the search:
// brand, product line, character. Generic words ("hidratante", "corporal") show up in most results.
// "absent" are words no result has at all: the site doesn't carry that brand or line. Past the
// first five words only longer ones count, so a trailing brand ("... Penalty", "... Buba") still
// vetoes while a short filler word doesn't.
export function distinctiveStems(ml, results) {
  if (results.length === 0) return { rare: [], absent: [] };
  const rare = [];
  const absent = [];
  ml.tokens.slice(0, 8).forEach((token, index) => {
    const frequency = results.filter((offer) => offer.stems.has(token.stem)).length;
    if (index < 6 && frequency / results.length <= 0.35) rare.push(token.stem);
    if (frequency === 0 && (index < 5 || token.stem.length >= 4)) absent.push(token.stem);
  });
  return { rare, absent };
}

// Hamming distance over the 64-bit hash. Unrelated photos land around 32; the same photo at another
// size or crop stays under 6. Between 7 and 10 similar-looking objects of the same kind start to
// collide, so that band needs the text to agree too.
export const IMAGE_SAME = 6;
export const IMAGE_CLOSE = 10;
export const IMAGE_COMPATIBLE = 16;
export const IMAGE_CODE_GAP = 12;
export const IMAGE_MODEL = 22;

// Final verdict after the image check. Order: same photo, same model code, strong text match.
// A text-only match must carry the distinctive words, so a generic item of the same kind
// ("azeite extra virgem" for "Azeite Gallo") never passes as the branded one, and its photo has
// to look like the same object, not just the same kind of object.
export function verdict(check, imageDistance, offer, distinctive) {
  const specsOk = check.specTotal === 0 || check.specMatched > 0;
  const carried = distinctive.rare.filter((stem) => offer.stems.has(stem)).length;
  const noAbsent = distinctive.absent.length === 0;
  const brandOk = noAbsent && carried >= Math.ceil(distinctive.rare.length / 2);
  // Every distinctive word, allowing one miss only on long titles.
  const brandStrict =
    noAbsent && carried >= distinctive.rare.length - (distinctive.rare.length >= 4 ? 1 : 0);
  const distance = imageDistance ?? Infinity;

  // Brands reuse one stock photo across a line (every Ryzen box looks alike), so even the same
  // photo needs a few words in common.
  if (distance <= IMAGE_SAME && check.textScore >= 0.4) return "foto";
  if (distance <= IMAGE_CLOSE && check.mlHead && check.textScore >= 0.6 && brandOk && !check.codeGap) {
    return "foto";
  }
  if (check.modelMatch && check.mlHead && check.textScore >= 0.4 && distance <= IMAGE_MODEL && brandOk) {
    return "modelo";
  }
  const photoLimit = check.codeGap ? IMAGE_CODE_GAP : IMAGE_COMPATIBLE;
  if (check.sameHead && check.textScore >= 0.65 && specsOk && brandStrict && distance <= photoLimit) {
    return "provavel";
  }
  return null;
}

export function score(check, imageDistance) {
  const image = imageDistance == null ? 0 : Math.max(0, 1 - imageDistance / 32);
  const specs = check.specTotal === 0 ? 0.5 : check.specMatched / check.specTotal;
  const value =
    check.textScore * 0.45 + specs * 0.2 + (check.modelMatch ? 0.15 : 0) + image * 0.2;
  return Math.round(value * 1000) / 1000;
}

export const VERDICT_RANK = { foto: 3, modelo: 2, provavel: 1 };
