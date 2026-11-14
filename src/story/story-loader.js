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
      cutscene.backgroundImage = withBust(await resolveFirstExistingAsset(
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

export async function preloadStoryAssets(storyPackage, options = {}) {
  const { onProgress, loadImageFn = null } = options;
  const urls = collectStoryAssetUrls(storyPackage);
  const total = urls.length;
  if (total === 0) {
    if (typeof onProgress === 'function') {
      onProgress({ loaded: 0, total: 0, ratio: 1, url: '' });
    }
    return { total: 0, loaded: 0, failed: [] };
  }

  let loaded = 0;
  const failed = [];
  await Promise.all(
    urls.map(async (url) => {
      const result = await preloadImageAsset(url, loadImageFn);
      if (!result.ok) {
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
