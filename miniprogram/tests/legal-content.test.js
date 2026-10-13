const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const normalize = text => text.replace(/\[([^\]]+)\]\(mailto:[^)]+\)/g, '$1').replace(/\*\*|`/g, '').replace(/\s+/g, '');
function sections(markdown) {
  const result = []; let section;
  for (const line of markdown.split('\n').filter(s => s.trim())) {
    if (line.startsWith('## ')) { section = { title: line.slice(3), blocks: [] }; result.push(section); }
    else if (section) section.blocks.push({ kind: line.startsWith('### ') ? 'subheading' : line.startsWith('- ') ? 'bullet' : 'paragraph',
      text: normalize(line.replace(/^### |^- /, '')) });
  }
  return result;
}
for (const [file, title] of [['user-agreement', '圆桌秘境-用户服务协议'], ['privacy-policy', '圆桌秘境-隐私政策']]) {
  test(`${file}: public JS and Markdown have identical sections, versions, dates and contact details`, () => {
    const document = require(`../utils/legal/${file}`), markdown = fs.readFileSync(path.join(root, `../docs/legal/${title}.md`), 'utf8');
    assert.equal(document.version, '1.0.1'); assert.ok(markdown.includes(`**版本号：${document.version}**`));
    assert.ok(markdown.startsWith(`# 《${document.title}》`));
    for (const [field, label] of [['publishedAt', '发布日期'], ['effectiveAt', '生效日期']]) {
      const [year, month, day] = document[field].split('-'); assert.ok(markdown.includes(`${label}：${year}年${Number(month)}月${Number(day)}日`));
    }
    assert.deepEqual(sections(markdown), document.sections.map(s => ({ ...s, blocks: s.blocks.map(b => ({ ...b, text: normalize(b.text) })) })));
    for (const text of [markdown, JSON.stringify(document)]) {
      assert.match(text, /方良军/); assert.match(text, /\[842515974@qq\.com\]\(mailto:842515974@qq\.com\)/);
      assert.match(text, /个人开发者/); assert.doesNotMatch(text, /【开发者真实姓名】|【联系邮箱】|协议初稿|发布前必须补全|发布前必须核对/);
    }
  });
}
test('public legal page displays contact label without showing Markdown syntax or altering the canonical source', () => {
  let page; const document = require('../utils/legal/privacy-policy'), original = JSON.stringify(document);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages/legal/legal.js'), 'utf8'), {
    Page: value => { page = value; }, require: name => require(path.resolve(root, 'pages/legal', name)),
  });
  page.setData = value => { page.data = value; }; page.onLoad({ type: 'privacy' });
  const blocks = page.data.document.sections.flatMap(s => s.blocks), contacts = blocks.filter(b => b.text.includes('842515974@qq.com'));
  assert.ok(contacts.length > 0); assert.ok(contacts.every(b => b.displayText.includes('842515974@qq.com') && !b.displayText.includes('mailto:')));
  assert.equal(JSON.stringify(document), original);
});
test('unverified log retention remains explicitly marked; round consent keeps accessible checkbox semantics and separate link events', () => {
  const privacy = require('../utils/legal/privacy-policy'); assert.match(JSON.stringify(privacy), /【运行日志保存期限/);
  const wxml = fs.readFileSync(path.join(root, 'pages/login/login.wxml'), 'utf8');
  assert.match(wxml, /aria-role="checkbox"/); assert.match(wxml, /aria-checked="{{agreed}}"/); assert.match(wxml, /class="agreement-circle"/);
  assert.match(wxml, /catchtap="openLegal"/); assert.doesNotMatch(wxml, /agreement-hint|请先阅读并同意协议/);
  assert.doesNotMatch(wxml, /首次登录将自动创建阿瓦隆账号/);
});
