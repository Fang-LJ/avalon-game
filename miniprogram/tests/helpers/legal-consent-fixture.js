const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = function createConsent(wx, documents = {}) {
  const root = path.resolve(__dirname, '../..'), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/legal-consent.js'), 'utf8'), {
    module, wx, require: name => documents[name] || require(path.resolve(root, 'utils', name)),
  });
  return module.exports;
};
