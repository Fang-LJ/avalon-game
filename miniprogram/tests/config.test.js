const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('app registers the complete MVP pages', () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  assert.deepEqual(app.pages, ['pages/index/index', 'pages/create/create', 'pages/join/join', 'pages/room/room']);
});

test('service exposes every game operation', () => {
  global.wx = { request() {} };
  const api = require('../services/avalon');
  ['createRoom','joinRoom','leaveRoom','start','myRole','confirmRole','submitTeam','vote','mission','continueRound','assassinate','restart'].forEach(name => assert.equal(typeof api[name], 'function'));
});

test('all page JSON and WXML/WXSS files are structurally balanced', () => {
  const root = path.join(__dirname, '..');
  const files = [];
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target); else files.push(target);
    });
  }
  walk(root);
  files.filter(file => file.endsWith('.json')).forEach(file => assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), file));
  files.filter(file => file.endsWith('.wxml')).forEach(file => {
    const stack = [];
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g)) {
      const token = match[0]; const tag = match[1];
      if (token.startsWith('</')) assert.equal(stack.pop(), tag, `${file}: mismatched ${token}`);
      else if (!token.endsWith('/>')) stack.push(tag);
    }
    assert.deepEqual(stack, [], `${file}: unclosed tag`);
  });
  files.filter(file => file.endsWith('.wxss')).forEach(file => {
    const css = fs.readFileSync(file, 'utf8');
    assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length, `${file}: unbalanced braces`);
  });
});
