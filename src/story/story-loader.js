import {
  parseStoryManifest,
  parseCharacterMarkdown,
  parseMissionMarkdown,
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
  return [
    `${cleanBase}/characters/${charId}-${view}.png`,
    `${cleanBase}/characters/${charId}/${charId}-${view}.png`,
    `${cleanBase}/characters/${charId}.png`,
    `${cleanBase}/characters/${charId}/${charId}.png`,
  ];
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

  const manifestRaw = await fetchText(manifestUrl, 'story.md');
  const manifest = parseStoryManifest(manifestRaw, 'story.md');

  let splashUrl = '';
  if (manifest.splash) {
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
            resolvedSprites[view] = pngOverride;
            continue;
          }
        }
        if (!relPath) {
          resolvedSprites[view] = '';
          continue;
        }
        const fullUrl = `${cleanBase}/${relPath}`;
        if (await checkAssetExists(fullUrl)) {
          resolvedSprites[view] = fullUrl;
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

    for (const cutscene of [mission.introCutscene, mission.outroCutscene]) {
      if (cutscene.leftChar && !characters.has(cutscene.leftChar)) {
        throw new StoryParseError(missionFile, 0, `Personagem "${cutscene.leftChar}" não declarado em story.md.`);
      }
      if (cutscene.rightChar && !characters.has(cutscene.rightChar)) {
        throw new StoryParseError(missionFile, 0, `Personagem "${cutscene.rightChar}" não declarado em story.md.`);
      }
    }

    missions.push(mission);
  }

  console.info(
    `[StoryLoader] História "${manifest.title}" carregada (${characters.size} personagens, ${missions.length} missões).`,
  );

  return {
    title: manifest.title,
    subtitle: manifest.subtitle,
    splashUrl,
    characters,
    missions,
  };
}
