import {
  parseStoryManifest,
  parseCharacterMarkdown,
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

export async function loadStoryPackage(basePath = './story', cityMap = null) {
  const cleanBase = basePath.replace(/\/+$/, '');
  const manifestUrl = `${cleanBase}/story.md`;
  const cacheBust = typeof window !== 'undefined' ? `?v=${Date.now()}` : '';
  const withBust = (url) => (url && cacheBust ? `${url}${cacheBust}` : url);

  const manifestRaw = await fetchText(manifestUrl, 'story.md');
  const manifest = parseStoryManifest(manifestRaw, 'story.md');

  let locationNames = new Map();
  const mapUrl = `${cleanBase}/map/map.md`;
  if (await checkAssetExists(mapUrl)) {
    const mapRaw = await fetchText(mapUrl, 'map/map.md');
    locationNames = parseMapMarkdown(mapRaw, 'map/map.md');
  }

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
    }),
  );

  const missions = [];
  for (const missionId of manifest.missions) {
    const missionFile = `missions/${missionId}.md`;
    const raw = await fetchText(`${cleanBase}/${missionFile}`, missionFile);
    const mission = parseMissionMarkdown(raw, missionFile, cityMap);

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
    missions.push(mission);
  }

  console.info(
    `[StoryLoader] História "${manifest.title}" carregada (${characters.size} personagens, ${missions.length} missões, ${locationNames.size} locais nomeados).`,
  );

  return {
    title: replaceLocationCodesWithNames(manifest.title, locationNames),
    subtitle: replaceLocationCodesWithNames(manifest.subtitle, locationNames),
    splashUrl: withBust(splashUrl),
    characters,
    missions,
    locationNames,
  };
}
