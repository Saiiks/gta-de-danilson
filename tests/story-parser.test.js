import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CityMap } from '../src/world/city-map.js';
import {
  parseStoryManifest,
  parseCharacterMarkdown,
  parseMissionMarkdown,
  validateAssetPath,
  StoryParseError
} from '../src/story/story-parser.js';
import {
  getCharacterSidePngCandidates,
  getSplashPngCandidates,
  resolveFirstExistingAsset
} from '../src/story/story-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storyDir = path.resolve(__dirname, '../story');

test('carrega e valida o pacote de história de exemplo completo contra a cidade-base', () => {
  const cityMap = new CityMap();
  const manifest = parseStoryManifest(fs.readFileSync(path.join(storyDir, 'story.md'), 'utf8'), 'story.md');

  assert.equal(manifest.title, 'Encomenda Urgente');
  assert.ok(manifest.characters.length >= 3);
  assert.ok(manifest.missions.length >= 2);

  for (const charId of manifest.characters) {
    const raw = fs.readFileSync(path.join(storyDir, 'characters', `${charId}.md`), 'utf8');
    const charDef = parseCharacterMarkdown(raw, `characters/${charId}.md`);
    assert.equal(charDef.id, charId);
    assert.ok(charDef.sprites.top);
    assert.ok(charDef.sprites.front);
    assert.ok(charDef.sprites.left);
    assert.ok(charDef.sprites.right);
  }

  const m1 = parseMissionMarkdown(
    fs.readFileSync(path.join(storyDir, 'missions', '01-encomenda-urgente.md'), 'utf8'),
    'missions/01-encomenda-urgente.md',
    cityMap
  );
  assert.equal(m1.startLocation, 'CASA-01');
  assert.equal(m1.targetLocation, 'COM-05');
  assert.ok(m1.introCutscene.steps.length >= 2);
  const lastOutroStep = m1.outroCutscene.steps.at(-1);
  assert.equal(lastOutroStep.choices.length, 2);
  assert.equal(lastOutroStep.choices[0].outcome, 'complete');
  assert.equal(lastOutroStep.choices[1].outcome, 'gameover');
});

test('rejeita caminhos de assets externos ou com traversal', () => {
  assert.throws(() => validateAssetPath('../fora.png', 'story.md', 4), StoryParseError);
  assert.throws(() => validateAssetPath('https://exemplo.com/img.png', 'story.md', 4), StoryParseError);
  assert.throws(() => validateAssetPath('/etc/passwd', 'story.md', 4), StoryParseError);
  assert.equal(validateAssetPath('./assets/alex-top.svg', 'alex.md', 5), 'assets/alex-top.svg');
});

test('sinaliza erro descritivo para frontmatter inválido ou código de local inexistente', () => {
  const cityMap = new CityMap();
  assert.throws(
    () => parseStoryManifest('title: Sem delimitador', 'story.md'),
    (err) => err instanceof StoryParseError && err.message.includes('story.md:1')
  );

  const badMission = `---
id: m-err
title: Missão Inválida
start: CASA-01
target: NAO-EXISTE-99
---
`;
  assert.throws(
    () => parseMissionMarkdown(badMission, 'missions/err.md', cityMap),
    (err) => err instanceof StoryParseError && err.message.includes('NAO-EXISTE-99')
  );
});

test('prioriza PNG na pasta do personagem para visão lateral e faz fallback quando ausente', async () => {
  const candidates = getCharacterSidePngCandidates('./story', 'alex', 'left');
  assert.equal(candidates[0], './story/characters/alex-left.png');
  assert.equal(candidates[2], './story/characters/alex.png');
  assert.equal(candidates[3], './story/characters/alex/alex.png');

  const found = await resolveFirstExistingAsset(candidates, async (url) => url.endsWith('characters/alex.png'));
  assert.equal(found, './story/characters/alex.png');

  const none = await resolveFirstExistingAsset(candidates, async () => false);
  assert.equal(none, '');
});

test('prioriza PNG personalizado para tela de abertura e faz fallback para padrão quando ausente', async () => {
  const candidates = getSplashPngCandidates('./story', 'assets/splash.svg');
  assert.deepEqual(candidates, ['./story/splash.png', './story/assets/splash.png']);

  const customCandidates = getSplashPngCandidates('./story', 'assets/capa.svg');
  assert.deepEqual(customCandidates, [
    './story/splash.png',
    './story/assets/splash.png',
    './story/assets/capa.png',
  ]);

  const found = await resolveFirstExistingAsset(candidates, async (url) => url === './story/splash.png');
  assert.equal(found, './story/splash.png');

  const fallback = await resolveFirstExistingAsset(candidates, async () => false);
  assert.equal(fallback, '');
});
