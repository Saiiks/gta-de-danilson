import {
  parseStoryManifest,
  parseCharacterMarkdown,
  parseItemMarkdown,
  parseMissionMarkdown,
  parseMapMarkdown,
  replaceLocationCodesWithNames,
  validateAssetPath,
  StoryParseError,
} from './story-parser.js';

async function fetchText(url, label) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (err) {
    throw new Error(`Falha de rede ao carregar "${label}" (${url}): ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`Arquivo não encontrado ou inacessível: "${label}" (${url}, status ${response.status}).`);
  }
  return response.text();
}

async function checkAssetExists(url) {
  if (!url) return false;
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

export function getCharacterSidePngCandidates(basePath, charId, view) {
  const cleanBase = String(basePath || '').replace(/\/+$/, '');
  const candidates = [
    `${cleanBase}/characters/${charId}-${view}.png`,
    `${cleanBase}/characters/${charId}/${charId}-${view}.png`,
    `${cleanBase}/characters/${charId}.png`,
    `${cleanBase}/characters/${charId}/${charId}.png`,
  ];
  if (view === 'left') {
    candidates.push(
      `${cleanBase}/characters/${charId}-right.png`,
      `${cleanBase}/characters/${charId}/${charId}-right.png`,
    );
  }
  return candidates;
}

export function getSplashPngCandidates(basePath, manifestSplash = '') {
  const cleanBase = String(basePath || '').replace(/\/+$/, '');
  const candidates = [
    `${cleanBase}/splash/splash-start.png`,
    `${cleanBase}/splash.png`,
    `${cleanBase}/assets/splash.png`,
  ];
  if (manifestSplash) {
    const pngVariant = manifestSplash.replace(/\.[^./]+$/, '.png');
    const fullVariant = `${cleanBase}/${pngVariant}`;
    if (!candidates.includes(fullVariant)) {
      candidates.push(fullVariant);
    }
  }
  return candidates;
}

export function getCutsceneBackgroundCandidates(basePath, bgText = '', fallbackCode = '') {
  const cleanBase = String(basePath || '').replace(/\/+$/, '');
  const candidates = [];
  const rawBg = String(bgText || '').trim();

  if (/\.(jpe?g|png|webp)$/i.test(rawBg)) {
    const safeRel = validateAssetPath(rawBg, 'cutscene.bg');
    candidates.push(`${cleanBase}/${safeRel}`);
  }

  const codeMatch = rawBg.match(/\b((?:RUA|CASA|COM|PRACA)-\d+)\b/i);
  const code = (codeMatch ? codeMatch[1] : String(fallbackCode || '')).trim().toUpperCase();
  if (code) {
    const typePrefix = code.split('-')[0].toLowerCase();
    for (const rel of [
      `${cleanBase}/map/${code}.png`,
      `${cleanBase}/map/${code}.jpg`,
      `${cleanBase}/map/${code.toLowerCase()}.png`,
      `${cleanBase}/map/${code.toLowerCase()}.jpg`,
      `${cleanBase}/map/${typePrefix}.png`,
      `${cleanBase}/map/${typePrefix}.jpg`,
    ]) {
      if (!candidates.includes(rel)) {
        candidates.push(rel);
      }
    }
  }

  return candidates;
}

export async function resolveFirstExistingAsset(candidates, existsFn = checkAssetExists) {
  for (const url of candidates) {
    if (await existsFn(url)) return url;
  }
  return '';
}

export function extractCutsceneLocationType(bgText = '', fallbackCode = '') {
  const rawBg = String(bgText || '').trim();
  const codeMatch = rawBg.match(/\b((?:RUA|CASA|COM|PRACA)-\d+)\b/i);
  const code = (codeMatch ? codeMatch[1] : String(fallbackCode || '')).trim().toUpperCase();
  if (!code) return '';
  return code.split('-')[0].toLowerCase();
}

export async function discoverTypeBackgroundPool(basePath, typePrefix, existsFn = checkAssetExists, maxProbe = 50) {
  const cleanBase = String(basePath || '').replace(/\/+$/, '');
  const prefix = String(typePrefix || '').trim().toLowerCase();
  if (!prefix) return [];

  const pool = [];
  for (let n = 1; n <= maxProbe; n += 1) {
    const pngUrl = `${cleanBase}/map/${prefix}-${n}.png`;
    if (await existsFn(pngUrl)) {
      pool.push(pngUrl);
      continue;
    }
    const jpgUrl = `${cleanBase}/map/${prefix}-${n}.jpg`;
    if (await existsFn(jpgUrl)) {
      pool.push(jpgUrl);
      continue;
    }
    break;
  }

  if (pool.length === 0) {
    for (const fallbackUrl of [`${cleanBase}/map/${prefix}.png`, `${cleanBase}/map/${prefix}.jpg`]) {
      if (await existsFn(fallbackUrl)) {
        pool.push(fallbackUrl);
        break;
      }
    }
  }

  return pool;
}

export function pickCutsceneBackground(pool = [], recentList = [], rng = Math.random) {
  if (!Array.isArray(pool) || pool.length === 0) {
    return { url: '', nextRecent: [] };
  }
  if (pool.length === 1) {
    return { url: pool[0], nextRecent: [pool[0]] };
  }

  const recentSet = new Set(recentList);
  let candidates = pool.filter((url) => !recentSet.has(url));
  let baseRecent = [...recentList];

  if (candidates.length === 0) {
    const lastShown = recentList[recentList.length - 1];
    candidates = pool.filter((url) => url !== lastShown);
    baseRecent = lastShown ? [lastShown] : [];
    if (candidates.length === 0) {
      candidates = [...pool];
    }
  }

  const idx = Math.min(candidates.length - 1, Math.max(0, Math.floor(rng() * candidates.length)));
  const chosen = candidates[idx];
  return {
    url: chosen,
    nextRecent: [...baseRecent, chosen],
  };
}

export async function loadStoryPackage(basePath = './story', cityMap = null, options = {}) {
  const { onProgress } = options;
  const reportProgress = (ratio, message) => {
    if (typeof onProgress === 'function') {
      onProgress({ ratio: Math.max(0, Math.min(1, ratio)), message });
    }
  };

  const cleanBase = basePath.replace(/\/+$/, '');
  const manifestUrl = `${cleanBase}/story.md`;
  const cacheBust = typeof window !== 'undefined' ? `?v=${Date.now()}` : '';
  const withBust = (url) => (url && cacheBust ? `${url}${cacheBust}` : url);

  reportProgress(0.05, 'Lendo manifesto da história...');
  const manifestRaw = await fetchText(manifestUrl, 'story.md');
  const manifest = parseStoryManifest(manifestRaw, 'story.md');

  let locationNames = new Map();
  const mapUrl = `${cleanBase}/map/map.md`;
  if (await checkAssetExists(mapUrl)) {
    reportProgress(0.15, 'Carregando mapa de locais...');
    const mapRaw = await fetchText(mapUrl, 'map/map.md');
    locationNames = parseMapMarkdown(mapRaw, 'map/map.md');
  }

  reportProgress(0.25, 'Resolvendo imagem de abertura...');
  let splashUrl = await resolveFirstExistingAsset(
    getSplashPngCandidates(cleanBase, manifest.splash),
  );
  if (!splashUrl && manifest.splash) {
    const candidateSplash = `${cleanBase}/${manifest.splash}`;
    if (await checkAssetExists(candidateSplash)) {
      splashUrl = candidateSplash;
    } else {
      console.warn(`[StoryLoader] Imagem de abertura ausente: ${candidateSplash}. Usando padrão.`);
    }
  }

  const totalChars = Math.max(1, manifest.characters.length);
  let loadedChars = 0;
  const characters = new Map();
  await Promise.all(
    manifest.characters.map(async (charId) => {
      const charFile = `characters/${charId}.md`;
      const raw = await fetchText(`${cleanBase}/${charFile}`, charFile);
      const character = parseCharacterMarkdown(raw, charFile);

      const resolvedSprites = {};
      for (const [view, relPath] of Object.entries(character.sprites)) {
        if (view === 'left' || view === 'right') {
          const pngOverride = await resolveFirstExistingAsset(
            getCharacterSidePngCandidates(cleanBase, charId, view),
          );
          if (pngOverride) {
            resolvedSprites[view] = withBust(pngOverride);
            continue;
          }
        }
        if (!relPath) {
          resolvedSprites[view] = '';
          continue;
        }
        const fullUrl = `${cleanBase}/${relPath}`;
        if (await checkAssetExists(fullUrl)) {
          resolvedSprites[view] = withBust(fullUrl);
        } else {
          console.warn(`[StoryLoader] Sprite "${view}" de "${charId}" ausente (${fullUrl}). Aplicando fallback.`);
          resolvedSprites[view] = '';
        }
      }

      characters.set(character.id, {
        ...character,
        sprites: resolvedSprites,
      });
      loadedChars += 1;
      reportProgress(0.3 + (loadedChars / totalChars) * 0.25, `Carregando personagens (${loadedChars}/${totalChars})...`);
    }),
  );

  const items = new Map();
  const itemIds = manifest.items || [];
  const totalItems = Math.max(1, itemIds.length);
  let loadedItems = 0;
  await Promise.all(
    itemIds.map(async (itemId) => {
      const itemFile = `items/${itemId}.md`;
      const raw = await fetchText(`${cleanBase}/${itemFile}`, itemFile);
      const item = parseItemMarkdown(raw, itemFile);
      let imageUrl = '';
      if (item.image) {
        const fullUrl = `${cleanBase}/${item.image}`;
        if (await checkAssetExists(fullUrl)) {
          imageUrl = withBust(fullUrl);
        } else {
          console.warn(`[StoryLoader] Imagem do item "${itemId}" ausente (${fullUrl}).`);
        }
      }
      items.set(item.id, {
        ...item,
        imageUrl,
      });
      loadedItems += 1;
      reportProgress(0.55 + (loadedItems / totalItems) * 0.1, `Carregando itens (${loadedItems}/${totalItems})...`);
    }),
  );

  const typePools = new Map();
  await Promise.all(
    ['casa', 'com', 'praca', 'rua'].map(async (typePrefix) => {
      const discovered = await discoverTypeBackgroundPool(cleanBase, typePrefix);
      typePools.set(typePrefix, discovered.map((url) => withBust(url)));
    }),
  );

  const totalMissions = Math.max(1, manifest.missions.length);
  const missions = [];
  for (let i = 0; i < manifest.missions.length; i += 1) {
    const missionId = manifest.missions[i];
    const missionFile = `missions/${missionId}.md`;
    const raw = await fetchText(`${cleanBase}/${missionFile}`, missionFile);
    const mission = parseMissionMarkdown(raw, missionFile, cityMap);

    if (mission.giveItem && !items.has(mission.giveItem)) {
      throw new StoryParseError(missionFile, 2, `Item "${mission.giveItem}" (give_item) não declarado em story.md.`);
    }
    if (mission.requireItem && !items.has(mission.requireItem)) {
      throw new StoryParseError(missionFile, 2, `Item "${mission.requireItem}" (require_item) não declarado em story.md.`);
    }

    const cutsceneConfigs = [
      { cutscene: mission.introCutscene, fallbackCode: mission.startLocation },
      { cutscene: mission.outroCutscene, fallbackCode: mission.targetLocation },
    ];

    for (const { cutscene, fallbackCode } of cutsceneConfigs) {
      if (cutscene.leftChar && !characters.has(cutscene.leftChar)) {
        throw new StoryParseError(missionFile, 0, `Personagem "${cutscene.leftChar}" não declarado em story.md.`);
      }
      if (cutscene.rightChar && !characters.has(cutscene.rightChar)) {
        throw new StoryParseError(missionFile, 0, `Personagem "${cutscene.rightChar}" não declarado em story.md.`);
      }
      const bgType = extractCutsceneLocationType(cutscene.background, fallbackCode);
      const pool = typePools.get(bgType) || [];
      const explicitCandidates = getCutsceneBackgroundCandidates(cleanBase, cutscene.background, fallbackCode)
        .filter((url) => !/\/map\/(?:casa|com|praca|rua)\.(?:png|jpe?g)$/i.test(url));
      const explicitBg = withBust(await resolveFirstExistingAsset(explicitCandidates));

      cutscene.backgroundType = bgType;
      cutscene.backgroundPool = explicitBg ? [explicitBg] : pool;
      cutscene.backgroundImage = explicitBg || pool[0] || withBust(await resolveFirstExistingAsset(
        getCutsceneBackgroundCandidates(cleanBase, cutscene.background, fallbackCode),
      ));
      cutscene.background = replaceLocationCodesWithNames(cutscene.background, locationNames);
      for (const step of cutscene.steps) {
        step.text = replaceLocationCodesWithNames(step.text, locationNames);
        if (step.choices) {
          for (const choice of step.choices) {
            choice.label = replaceLocationCodesWithNames(choice.label, locationNames);
            choice.reason = replaceLocationCodesWithNames(choice.reason, locationNames);
          }
        }
      }
    }

    mission.objective = replaceLocationCodesWithNames(mission.objective, locationNames);
    if (mission.pickupObjective) {
      mission.pickupObjective = replaceLocationCodesWithNames(mission.pickupObjective, locationNames);
    }
    if (mission.deliveryPrompt) {
      mission.deliveryPrompt = replaceLocationCodesWithNames(mission.deliveryPrompt, locationNames);
    }
    if (mission.wrongItemMessage) {
      mission.wrongItemMessage = replaceLocationCodesWithNames(mission.wrongItemMessage, locationNames);
    }
    missions.push(mission);
    reportProgress(
      0.65 + ((i + 1) / totalMissions) * 0.35,
      `Carregando missões (${i + 1}/${totalMissions})...`,
    );
  }

  console.info(
    `[StoryLoader] História "${manifest.title}" carregada (${characters.size} personagens, ${items.size} itens, ${missions.length} missões, ${locationNames.size} locais nomeados).`,
  );

  return {
    title: replaceLocationCodesWithNames(manifest.title, locationNames),
    pageTitle: replaceLocationCodesWithNames(manifest.pageTitle || manifest.title, locationNames),
    subtitle: replaceLocationCodesWithNames(manifest.subtitle, locationNames),
    splashUrl: withBust(splashUrl),
    characters,
    items,
    missions,
    locationNames,
  };
}

export function collectStoryAssetUrls(storyPackage) {
  if (!storyPackage) return [];
  const urls = new Set();
  if (storyPackage.splashUrl) {
    urls.add(storyPackage.splashUrl);
  }
  if (storyPackage.characters instanceof Map) {
    for (const character of storyPackage.characters.values()) {
      for (const spriteUrl of Object.values(character?.sprites || {})) {
        if (spriteUrl) urls.add(spriteUrl);
      }
    }
  }
  if (storyPackage.items instanceof Map) {
    for (const item of storyPackage.items.values()) {
      if (item?.imageUrl) urls.add(item.imageUrl);
    }
  }
  for (const mission of storyPackage.missions || []) {
    if (mission?.introCutscene?.backgroundImage) {
      urls.add(mission.introCutscene.backgroundImage);
    }
    if (mission?.outroCutscene?.backgroundImage) {
      urls.add(mission.outroCutscene.backgroundImage);
    }
  }
  return [...urls];
}

export function collectMissionAssetUrls(storyPackage, missionIndex = 0, options = {}) {
  const { includeSplash = missionIndex === 0, essentialOnly = false } = options;
  if (!storyPackage) return [];
  const urls = new Set();

  if (includeSplash && storyPackage.splashUrl) {
    urls.add(storyPackage.splashUrl);
  }

  const mission = storyPackage.missions?.[missionIndex];
  if (!mission) return [...urls];

  const cutscenes = essentialOnly
    ? [mission.introCutscene]
    : [mission.introCutscene, mission.outroCutscene];
  const charIds = new Set();
  for (const cs of cutscenes) {
    if (!cs) continue;
    if (essentialOnly) {
      const firstBg = cs.backgroundImage || (Array.isArray(cs.backgroundPool) ? cs.backgroundPool[0] : '');
      if (firstBg) urls.add(firstBg);
    } else {
      if (cs.backgroundImage) urls.add(cs.backgroundImage);
      if (Array.isArray(cs.backgroundPool)) {
        for (const bgUrl of cs.backgroundPool) {
          if (bgUrl) urls.add(bgUrl);
        }
      }
    }
    if (cs.leftChar) charIds.add(cs.leftChar);
    if (cs.rightChar) charIds.add(cs.rightChar);
  }

  if (storyPackage.characters instanceof Map) {
    for (const charId of charIds) {
      const character = storyPackage.characters.get(charId);
      for (const spriteUrl of Object.values(character?.sprites || {})) {
        if (spriteUrl) urls.add(spriteUrl);
      }
    }
  }

  if (storyPackage.items instanceof Map) {
    for (const itemId of [mission.giveItem, mission.requireItem]) {
      if (!itemId) continue;
      const item = storyPackage.items.get(itemId);
      if (item?.imageUrl) urls.add(item.imageUrl);
    }
  }

  return [...urls];
}

export function getPendingMissionAssetUrls(storyPackage, missionIndex = 0, preloadedUrls = null, options = {}) {
  const urls = collectMissionAssetUrls(storyPackage, missionIndex, options);
  if (!(preloadedUrls instanceof Set)) return urls;
  return urls.filter((url) => !preloadedUrls.has(url));
}

export function preloadImageAsset(url, loadImageFn = null) {
  if (!url) return Promise.resolve({ url, ok: false });
  if (typeof loadImageFn === 'function') {
    return Promise.resolve(loadImageFn(url))
      .then((ok) => ({ url, ok: ok !== false }))
      .catch(() => ({ url, ok: false }));
  }
  if (typeof Image === 'undefined') {
    return Promise.resolve({ url, ok: true });
  }
  return new Promise((resolve) => {
    const img = new Image();
    const finish = (ok) => resolve({ url, ok });
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => finish(true)).catch(() => finish(true));
      } else {
        finish(true);
      }
    };
    img.onerror = () => finish(false);
    img.src = url;
  });
}

async function preloadUrlList(urls, options = {}) {
  const { onProgress, loadImageFn = null, preloadedUrls = null } = options;
  const pending = preloadedUrls instanceof Set
    ? urls.filter((url) => !preloadedUrls.has(url))
    : urls;
  const total = pending.length;
  if (total === 0) {
    if (typeof onProgress === 'function') {
      onProgress({ loaded: 0, total: 0, ratio: 1, url: '' });
    }
    return { total: 0, loaded: 0, failed: [] };
  }

  let loaded = 0;
  const failed = [];
  await Promise.all(
    pending.map(async (url) => {
      const result = await preloadImageAsset(url, loadImageFn);
      if (result.ok) {
        preloadedUrls?.add(url);
      } else {
        failed.push(url);
        console.warn(`[StoryLoader] Falha ao pré-carregar imagem: ${url}`);
      }
      loaded += 1;
      if (typeof onProgress === 'function') {
        onProgress({
          loaded,
          total,
          ratio: loaded / total,
          url,
        });
      }
    }),
  );

  return { total, loaded, failed };
}

export async function preloadStoryAssets(storyPackage, options = {}) {
  const urls = collectStoryAssetUrls(storyPackage);
  return preloadUrlList(urls, options);
}

export async function preloadMissionAssets(storyPackage, missionIndex = 0, options = {}) {
  const { includeSplash = missionIndex === 0, essentialOnly = false, ...rest } = options;
  const urls = collectMissionAssetUrls(storyPackage, missionIndex, { includeSplash, essentialOnly });
  return preloadUrlList(urls, rest);
}
