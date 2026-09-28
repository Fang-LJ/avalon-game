const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('app registers login and all V1 pages', () => {
  const app = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'),
  );
  assert.deepEqual(
    app.pages,
    ['login', 'index', 'create', 'join', 'room', 'history', 'replay', 'me'].map(
      (p) => `pages/${p}/${p}`,
    ),
  );
});

test('service exposes every game operation', () => {
  global.wx = { request() {} };
  const api = require('../services/avalon');
  [
    'createRoom',
    'joinRoom',
    'leaveRoom',
    'start',
    'myRole',
    'confirmRole',
    'submitTeam',
    'vote',
    'mission',
    'inspectLady',
    'assassinate',
    'restart',
  ].forEach((name) => assert.equal(typeof api[name], 'function'));
  assert.equal(api.continueRound, undefined);
});

test('creation page exposes every supported player count', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'pages', 'create', 'create.js'),
    'utf8',
  );
  assert.match(source, /counts:\s*\[5, 6, 7, 8, 9, 10\]/);
});

test('room page includes Lady of the Lake without a continue-round action', () => {
  const js = fs.readFileSync(
    path.join(__dirname, '..', 'pages', 'room', 'room.js'),
    'utf8',
  );
  const wxml = fs.readFileSync(
    path.join(__dirname, '..', 'pages', 'room', 'room.wxml'),
    'utf8',
  );
  assert.match(js, /LADY_OF_LAKE/);
  assert.match(wxml, /湖中仙女结果（仅你可见）/);
  assert.doesNotMatch(js, /continueRound/);
  assert.doesNotMatch(wxml, /continueRound/);
});

test('all page JSON and WXML/WXSS files are structurally balanced', () => {
  const root = path.join(__dirname, '..');
  const files = [];
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else files.push(target);
    });
  }
  walk(root);
  files
    .filter((file) => file.endsWith('.json'))
    .forEach((file) =>
      assert.doesNotThrow(
        () => JSON.parse(fs.readFileSync(file, 'utf8')),
        file,
      ),
    );
  files
    .filter((file) => file.endsWith('.wxml'))
    .forEach((file) => {
      const stack = [];
      for (const match of fs
        .readFileSync(file, 'utf8')
        .matchAll(/<\/?([a-zA-Z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
        const token = match[0];
        const tag = match[1];
        if (token.startsWith('</'))
          assert.equal(stack.pop(), tag, `${file}: mismatched ${token}`);
        else if (!token.endsWith('/>')) stack.push(tag);
      }
      assert.deepEqual(stack, [], `${file}: unclosed tag`);
    });
  files
    .filter((file) => file.endsWith('.wxss'))
    .forEach((file) => {
      const css = fs.readFileSync(file, 'utf8');
      assert.equal(
        (css.match(/{/g) || []).length,
        (css.match(/}/g) || []).length,
        `${file}: unbalanced braces`,
      );
    });
});
