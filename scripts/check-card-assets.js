// Explicit deployment smoke check, not part of offline npm test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CARDS, CARD_BASE } = require('../miniprogram/utils/cards');
// --version=v2 verifies publication before the frontend switches its current base.
const version = (process.argv.find(arg => arg.startsWith('--version=')) || '').slice('--version='.length)
  || CARD_BASE.split('/').at(-1);
assert.ok(['v1', 'v2'].includes(version), 'Unsupported asset version');
const base = CARD_BASE.replace(/\/v\d+$/, '/' + version);
const directory = path.join(__dirname, '../static-assets/avalon/cards', version);
const paths = version === 'v2'
  ? JSON.parse(fs.readFileSync(path.join(__dirname, '../static-assets/avalon/card-export-v2.json'), 'utf8')).assets.map(asset => asset.asset)
  : Object.values(CARDS).flatMap(Object.values).map(url => url.slice(CARD_BASE.length + 1).replace(/\.png$/, '.jpg'));
assert.equal(paths.length, 19); assert.equal(new Set(paths).size, 19);
const type = version === 'v2' ? 'image/png' : 'image/jpeg';
(async () => {
  for (const relative of paths) {
    assert.match(relative, /^(roles|actions|back|special)\/[a-z-]+\.(png|jpg)$/);
    const url = base + '/' + relative;
    for (const method of ['HEAD', 'GET']) {
      const response = await fetch(url, { method, signal: AbortSignal.timeout(15000), redirect: 'error' });
      assert.equal(response.status, 200, `${method} ${url}`);
      assert.equal((response.headers.get('content-type') || '').split(';')[0], type);
      const cache = response.headers.get('cache-control') || '';
      assert.match(cache, /public/); assert.match(cache, /max-age=31536000/); assert.match(cache, /immutable/);
      if (method === 'GET') {
        const bytes = Buffer.from(await response.arrayBuffer());
        const source = fs.readFileSync(path.join(directory, relative));
        const hash = value => crypto.createHash('sha256').update(value).digest('hex');
        assert.equal(hash(bytes), hash(source), `GET content mismatch: ${url}`);
      }
    }
    console.log(`HEAD/GET 200 ${type} immutable: ${url}`);
  }
  const listing = await fetch('https://api.playmatespace.cloud/avalon-assets/?list-type=2', { signal: AbortSignal.timeout(15000) });
  assert.equal(listing.status, 403, 'Anonymous ListBucket must be forbidden');
  console.log(`${version}: 19/19 objects verified; anonymous bucket listing denied.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
