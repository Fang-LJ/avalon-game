const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cards = require('../utils/cards');
const ui = require('../utils/presentation');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function componentAt(file, data = {}) {
  let definition;
  let now = 0;
  let serial = 0;
  const timers = new Map();
  vm.runInNewContext(read(file), {
    require: (request) => require(path.resolve(root, path.dirname(file), request)),
    Component: (value) => { definition = value; },
    setTimeout(callback, delay) {
      const id = ++serial;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  const instance = {
    data: { ...structuredClone(definition.data || {}), ...data },
    events: [],
    setData(values) { Object.assign(this.data, values); },
    triggerEvent(name, detail) { this.events.push({ name, detail }); },
    ...definition.methods,
  };
  return {
    instance,
    definition,
    timers,
    tick(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
  };
}

function deal(role = {}) {
  const fixture = componentAt('components/card-deal-stage/card-deal-stage.js', {
    gameId: 7,
    role: { roleCode: 'MERLIN', confirmed: false, visiblePlayers: [], ...role },
    busy: false,
  });
  fixture.definition.lifetimes.attached.call(fixture.instance);
  return fixture;
}

for (const [code, name] of Object.entries({
  MERLIN: 'merlin', PERCIVAL: 'percival', LOYAL_SERVANT: 'loyal-servant',
  MORGANA: 'morgana', ASSASSIN: 'assassin', MINION: 'minion',
  MORDRED: 'mordred', OBERON: 'oberon',
})) {
  test(`${code} maps to its supplied role artwork`, () => {
    assert.equal(cards.roleCard(code), `/assets/cards/roles/${name}.webp`);
  });
}

test('unknown card codes including inherited object keys use safe fallbacks', () => {
  for (const unknown of ['OTHER', '', null, undefined, 'toString', '__proto__']) {
    assert.equal(cards.roleCard(unknown), cards.CARDS.back.ROLE);
    assert.equal(cards.actionCard(unknown), cards.CARDS.back.ACTION);
    assert.equal(cards.specialCard(unknown), cards.CARDS.special.GENERIC_EMBLEM);
  }
});

test('all 19 mapped images exist as nonempty WebP files and role back exists', () => {
  const images = Object.values(cards.CARDS).flatMap(Object.values);
  assert.equal(images.length, 19);
  assert.equal(new Set(images).size, 19);
  for (const image of images) {
    const bytes = fs.readFileSync(path.join(root, image));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', image);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', image);
    assert.ok(bytes.length > 1000 && bytes.length < 300 * 1024, image);
  }
});

test('play-card has back and front faces, native 3D flip and uncropped aspectFit', () => {
  const markup = read('components/play-card/play-card.wxml');
  const css = read('components/play-card/play-card.wxss');
  assert.match(markup, /card-face card-back/);
  assert.match(markup, /card-face card-front/);
  assert.match(markup, /flipped \? 'is-flipped'/);
  assert.equal((markup.match(/mode="aspectFit"/g) || []).length, 2);
  assert.match(css, /transform-style:\s*preserve-3d/);
  assert.match(css, /backface-visibility:\s*hidden/);
  assert.match(css, /\.card-inner\.is-flipped\s*\{\s*transform:\s*rotateY\(180deg\)/);
  assert.match(css, /620ms/);
  ['small', 'large'].forEach((size) => assert.match(css, new RegExp(`size-${size}`)));
});

test('play-card ignores disabled and noninteractive taps without changing flipped prop', () => {
  const { instance } = componentAt('components/play-card/play-card.js', {
    flipped: false, interactive: false, disabled: false,
  });
  instance.choose();
  instance.data.interactive = true;
  instance.data.disabled = true;
  instance.choose();
  assert.equal(instance.events.length, 0);
  instance.data.disabled = false;
  instance.choose();
  assert.equal(instance.events[0].name, 'select');
  assert.equal(instance.data.flipped, false);
});

test('mission selection uses the supplied success and fail artworks with an action-card size', () => {
  const page = pageAt({});
  assert.equal(page.data.missionSuccessCard, cards.actionCard('SUCCESS'));
  assert.equal(page.data.missionFailCard, cards.actionCard('FAIL'));
  assert.equal(page.data.missionCardBack, cards.CARDS.back.ACTION);
  const markup = read('pages/room/room.wxml');
  assert.match(markup, /successCard="\{\{missionSuccessCard\}\}"/);
  assert.match(markup, /failCard="\{\{missionFailCard\}\}"/);
  assert.match(markup, /bind:success="missionSuccess" bind:fail="missionFail" bind:submit="submitMission"/);
  const overlay = read('components/mission-card-overlay/mission-card-overlay.wxml');
  assert.match(overlay, /front="\{\{successCard\}\}"/);
  assert.match(overlay, /front="\{\{failCard\}\}"/);
  assert.match(overlay, /selected="\{\{choice === 'SUCCESS'\}\}"[^>]*bind:select="chooseSuccess"/);
  assert.match(overlay, /selected="\{\{choice === 'FAIL'\}\}"[^>]*bind:select="chooseFail"/);
  assert.match(overlay, /wx:if="\{\{evil\}\}" class="mission-card-option/);
  assert.doesNotMatch(markup, /SUCCESS · 成功|FAIL · 失败|mission-role/);
  assert.match(read('components/play-card/play-card.wxss'), /size-action/);
});

test('mission cards select locally; only explicit confirm submits and GOOD cannot choose FAIL', async () => {
  const calls = [];
  const page = pageAt({ mission: async (...args) => calls.push(args) });
  page.setData({ game: { gameId: 7, phase: 'MISSION_EXECUTING', onMission: true, evil: true } });
  page.missionFail();
  assert.equal(page.data.missionChoice, 'FAIL');
  assert.equal(calls.length, 0);
  page.missionSuccess();
  assert.equal(page.data.missionChoice, 'SUCCESS');
  await page.submitMission();
  assert.deepEqual(calls, [[7, 'SUCCESS']]);
  assert.equal(page.data.missionChoice, '');
  page.data.game.evil = false;
  page.missionFail();
  assert.equal(page.data.missionChoice, '');
  page.data.missionChoice = 'FAIL';
  await page.submitMission();
  assert.equal(calls.length, 1);
});

test('hidden or disabled mission cards ignore taps and cannot submit', async () => {
  for (const patch of [
    { busy: true }, { viewVotes: true },
    { game: null }, { game: { phase: 'TEAM_BUILDING', onMission: true } },
    { game: { phase: 'MISSION_EXECUTING', onMission: false } },
    { game: { phase: 'MISSION_EXECUTING', onMission: true, hasSubmittedMission: true } },
  ]) {
    const calls = [];
    const page = pageAt({ mission: async () => calls.push('submitted') });
    page.setData({ game: { gameId: 7, phase: 'MISSION_EXECUTING', onMission: true, evil: true }, ...patch });
    page.missionSuccess();
    page.missionFail();
    assert.equal(page.data.missionChoice, '');
    page.data.missionChoice = 'SUCCESS';
    await page.submitMission();
    assert.equal(calls.length, 0);
  }
});

test('a refresh switching phase game or mission cannot submit a stale selected card', async () => {
  for (const patch of [
    { phase: 'TEAM_BUILDING' }, { gameId: 8 }, { missionNo: 2 },
    { proposalNo: 2 }, { hasSubmittedMission: true }, { onMission: false },
  ]) {
    const calls = [];
    const page = pageAt({ mission: async () => calls.push('submitted') });
    page.setData({ game: { gameId: 7, missionNo: 1, proposalNo: 1, phase: 'MISSION_EXECUTING', onMission: true } });
    page.missionSuccess();
    page.run = async task => { page.data.game = { ...page.data.game, ...patch }; return task(); };
    await page.submitMission();
    assert.equal(calls.length, 0);
  }
});

test('identity deal starts with only backs and completes shuffle then dealing then BACK', () => {
  const { instance, tick, definition } = deal();
  definition.pageLifetimes.show.call(instance);
  assert.equal(instance.data.dealStage, 'SHUFFLE');
  assert.equal(instance.data.front, '');
  assert.equal(instance.data.flipped, false);
  instance.flip();
  instance.confirm();
  assert.equal(instance.events.length, 0);
  tick(849);
  assert.equal(instance.data.dealStage, 'SHUFFLE');
  tick(1);
  assert.equal(instance.data.dealStage, 'DEALING');
  tick(550);
  assert.equal(instance.data.dealStage, 'BACK');
  assert.equal(instance.data.front, '');
  const markup = read('components/card-deal-stage/card-deal-stage.wxml');
  assert.match(markup, /dealStage === 'REVEALED'/);
  assert.match(markup, /你的身份已经送达/);
  assert.match(markup, /点击卡牌查看身份/);
});

test('BACK tap flips private identity and permits confirmation only after reveal finishes', () => {
  const { instance, tick } = deal();
  tick(1400);
  instance.confirm();
  assert.equal(instance.events.length, 0);
  instance.flip();
  assert.equal(instance.data.dealStage, 'FLIPPING');
  assert.equal(instance.data.front, cards.roleCard('MERLIN'));
  instance.confirm();
  tick(619);
  assert.equal(instance.events.length, 0);
  tick(1);
  assert.equal(instance.data.dealStage, 'REVEALED');
  assert.equal(instance.events[0].name, 'reveal');
  instance.confirm();
  instance.confirm();
  assert.equal(instance.events.filter((e) => e.name === 'confirm').length, 1);
  assert.equal(instance.events[1].detail.gameId, 7);
});

test('role refresh does not replay shuffle, delay progress or turn revealed card back', () => {
  const { instance, tick } = deal();
  tick(400);
  instance.data.role = { ...instance.data.role };
  instance.syncIdentity();
  tick(450);
  assert.equal(instance.data.dealStage, 'DEALING');
  tick(550);
  instance.flip();
  instance.syncIdentity();
  tick(620);
  instance.syncIdentity();
  assert.equal(instance.data.dealStage, 'REVEALED');
  assert.equal(instance.data.flipped, true);
  assert.equal(instance.events.filter((e) => e.name === 'reveal').length, 1);
});

test('new game cancels old animation and starts a new private deal', () => {
  const { instance, tick } = deal();
  tick(1400);
  instance.flip();
  instance.data.gameId = 8;
  instance.data.role = { roleCode: 'PERCIVAL', confirmed: false };
  instance.syncIdentity();
  tick(620);
  assert.equal(instance.data.dealStage, 'SHUFFLE');
  assert.equal(instance.data.front, '');
  assert.equal(instance.events.length, 0);
  tick(780);
  instance.flip();
  tick(620);
  assert.equal(instance.data.front, cards.roleCard('PERCIVAL'));
  assert.equal(instance.events[0].detail.gameId, 8);
});

test('confirmed identity restores revealed state and cannot emit repeated confirm', () => {
  const { instance, tick } = deal({ confirmed: true });
  assert.equal(instance.data.dealStage, 'REVEALED');
  tick(3000);
  instance.confirm();
  instance.syncIdentity();
  assert.equal(instance.events.filter((e) => e.name === 'confirm').length, 0);
});

test('background interrupts shuffle or dealing to a usable BACK state', () => {
  for (const elapsed of [300, 1000]) {
    const { instance, tick, definition, timers } = deal();
    tick(elapsed);
    definition.pageLifetimes.hide.call(instance);
    assert.equal(instance.data.dealStage, 'BACK');
    assert.equal(timers.size, 0);
    definition.pageLifetimes.show.call(instance);
    instance.flip();
    tick(620);
    assert.equal(instance.data.dealStage, 'REVEALED');
  }
});

test('background interrupts flipping to revealed state and detaching clears all timers', () => {
  const { instance, tick, definition, timers } = deal();
  tick(1400);
  instance.flip();
  definition.pageLifetimes.hide.call(instance);
  assert.equal(instance.data.dealStage, 'REVEALED');
  assert.equal(timers.size, 0);
  const fresh = deal();
  fresh.definition.lifetimes.detached.call(fresh.instance);
  fresh.tick(3000);
  assert.equal(fresh.timers.size, 0);
  assert.equal(fresh.instance.events.length, 0);
});

test('failed confirm becomes retryable after busy ends and acknowledged confirm stays disabled', () => {
  const { instance, definition } = deal({ confirmed: false });
  instance.reveal();
  instance.confirm();
  instance.data.busy = true;
  instance.confirm();
  instance.data.busy = false;
  definition.observers.busy.call(instance, false);
  instance.confirm();
  assert.equal(instance.events.filter((e) => e.name === 'confirm').length, 2);
  instance.data.role.confirmed = true;
  instance.confirm();
  assert.equal(instance.events.filter((e) => e.name === 'confirm').length, 2);
});

function pageAt(api) {
  let page;
  vm.runInNewContext(read('pages/room/room.js'), {
    require: (request) => {
      if (request === '../../services/avalon') return api;
      if (request === '../../services/auth') return {};
      if (request === '../../utils/socket') return {};
      return require(path.resolve(root, 'pages/room', request));
    },
    Page: (value) => { page = value; },
  });
  page.data = structuredClone(page.data);
  page.setData = (values) => Object.assign(page.data, values);
  page.run = (task) => task();
  return page;
}

test('page gates confirmation by phase current game reveal and unconfirmed identity', async () => {
  const calls = [];
  const page = pageAt({ confirmRole: async (id) => calls.push(id) });
  page.setData({ game: { gameId: 7, phase: 'ROLE_CONFIRM' }, role: { confirmed: false } });
  await page.confirmRole({ detail: { gameId: 7 } });
  page.identityRevealed({ detail: { gameId: 6 } });
  assert.equal(page.data.identityRevealedGameId, null);
  page.identityRevealed({ detail: { gameId: 7 } });
  await page.confirmRole({ detail: { gameId: 6 } });
  await page.confirmRole({ detail: { gameId: 7 } });
  page.data.role.confirmed = true;
  await page.confirmRole({ detail: { gameId: 7 } });
  page.data.role.confirmed = false;
  page.data.game.phase = 'TEAM_BUILDING';
  await page.confirmRole({ detail: { gameId: 7 } });
  assert.deepEqual(calls, [7]);
});

test('a pending refresh switching games cannot confirm the next game using an old reveal', async () => {
  const calls = [];
  const page = pageAt({ confirmRole: async (id) => calls.push(id) });
  page.setData({
    game: { gameId: 7, phase: 'ROLE_CONFIRM' }, role: { confirmed: false },
    identityRevealedGameId: 7,
  });
  page.run = async (task) => {
    page.data.game = { gameId: 8, phase: 'ROLE_CONFIRM' };
    await task();
  };
  await page.confirmRole({ detail: { gameId: 7 } });
  assert.deepEqual(calls, []);
});

test('my identity card comes exclusively from myRole response; public players retain no identity', async () => {
  const publicPlayers = [
    { playerId: 1, seatNo: 1, nickname: '甲' },
    { playerId: 2, seatNo: 2, nickname: '乙' },
  ];
  const page = pageAt({
    room: async () => ({ roomId: 1, currentGameId: 7, maxPlayers: 5, players: publicPlayers }),
    game: async () => ({ gameId: 7, phase: 'TEAM_BUILDING', missionNo: 1, proposalNo: 1, selectedPlayerIds: [] }),
    timeline: async () => ({ missions: [], proposals: [] }),
    myRole: async () => ({ roleCode: 'PERCIVAL', confirmed: true, visiblePlayers: [] }),
  });
  page.active = true;
  await page.fetchState();
  assert.equal(page.data.roleCardFront, cards.roleCard('PERCIVAL'));
  assert.equal(publicPlayers.some((player) => 'roleCode' in player || 'alignment' in player), false);
  assert.equal(page.data.displayPlayers.some((player) => 'roleCode' in player), false);
  const markup = read('pages/room/room.wxml');
  assert.match(markup, /front="\{\{roleCardFront\}\}"/);
  assert.match(markup, /size="medium" interactive="\{\{false\}\}"/);
  assert.doesNotMatch(markup, /item\.roleCode/);
});

test('Percival candidates retain identical knowledge class symbol and hint with no role metadata', () => {
  const candidates = [1, 6].map((seatNo) => ui.privateKnowledge({
    playerId: seatNo, seatNo, knowledgeType: 'MERLIN_OR_MORGANA', hint: '梅林或莫甘娜',
  }));
  assert.equal(candidates[0].knowledgeSymbol, '?');
  assert.equal(candidates[0].knowledgeClass, candidates[1].knowledgeClass);
  assert.equal(candidates[0].hint, candidates[1].hint);
  assert.equal(candidates.some((player) => 'roleCode' in player || 'alignment' in player), false);
});

test('conservative uncompressed production package remains below 2 MiB excluding configured tests', () => {
  const project = JSON.parse(read('project.config.json'));
  assert.ok(project.packOptions.ignore.some((entry) => entry.type === 'folder' && entry.value === 'tests'));
  let bytes = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = path.relative(root, path.join(dir, entry.name));
      if (relative.startsWith('tests') || relative.startsWith('node_modules')) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (!['project.private.config.json', 'package.json'].includes(relative))
        bytes += fs.statSync(path.join(dir, entry.name)).size;
    }
  }
  walk(root);
  assert.ok(bytes < 2 * 1024 * 1024, `raw package: ${bytes} bytes`);
});
