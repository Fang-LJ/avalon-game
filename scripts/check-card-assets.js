// Explicit deployment smoke check, not part of offline npm test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CARDS, CARD_BASE } = require('../miniprogram/utils/cards');
(async () => {
  for (const url of Object.values(CARDS).flatMap(Object.values)) {
    for (const method of ['HEAD', 'GET']) {
      const response = await fetch(url, { method, signal: AbortSignal.timeout(15000), redirect: 'error' });
      assert.equal(response.status, 200, `${method} ${url}`);
      assert.match(response.headers.get('content-type') || '', /^image\/jpeg\b/);
      const cache = response.headers.get('cache-control') || '';
      assert.match(cache, /public/); assert.match(cache, /max-age=31536000/); assert.match(cache, /immutable/);
      if (method === 'GET') {
        const bytes = Buffer.from(await response.arrayBuffer());
        const source = fs.readFileSync(path.join(__dirname, '../static-assets/avalon/cards/v1', url.slice(CARD_BASE.length + 1)));
        const hash = value => crypto.createHash('sha256').update(value).digest('hex');
        assert.equal(hash(bytes), hash(source), `GET content mismatch: ${url}`);
      }
    }
    console.log(`HEAD/GET 200 image/jpeg immutable: ${url}`);
  }
  const listing = await fetch('https://api.playmatespace.cloud/avalon-assets/?list-type=2', { signal: AbortSignal.timeout(15000) });
  assert.equal(listing.status, 403, 'Anonymous ListBucket must be forbidden');
  console.log('19/19 objects verified; anonymous bucket listing denied.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
