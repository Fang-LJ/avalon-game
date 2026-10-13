const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function luminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255)
    .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
for(const color of ['#A93447','#94701B','#7046A6','#176E78'])test(`white badge text on ${color} meets 4.5:1 contrast`,()=>{
  const css=read('components/knowledge-mark/knowledge-mark.wxss');
  assert.ok(css.includes('background: '+color));
  assert.ok(1.05/(luminance(color)+.05)>=4.5);
});
test('Merlin faction mark and Percival ambiguity are literal symbols sharing the same badge body',()=>{
  const markup=read('components/knowledge-mark/knowledge-mark.wxml');
  assert.match(markup,/markType === 'EVIL'[^\n]+class="knowledge-mark role-mark evil-mark">红<\/view>/);
  assert.match(markup,/markType === 'MERLIN_OR_MORGANA'[^\n]+class="knowledge-mark role-mark candidate-mark">\?<\/view>/);
  assert.doesNotMatch(markup,/roleCode|roleName|alignment|crescent/);
  // A private guess retains an explicit independent uncertainty indicator.
  assert.match(markup,/markType === 'GUESS'[\s\S]*class="guess-question">\?/);
});
test('central board retains every phase and rejection cue without global card decoration or clipping',()=>{
  const markup=read('pages/room/room.wxml'),css=read('pages/room/room.wxss');
  const center=markup.split('class="board-center')[1].split('\n    </view>')[0];
  for(const phase of ['TEAM_BUILDING','TEAM_VOTING','MISSION_EXECUTING','ASSASSINATION','LADY_OF_LAKE'])assert.ok(center.includes(phase));
  for(const data of ['game.requiredTeamSize','selectedText','assassinationText','rejection.dots','game.hasVoted','game.hasSubmittedMission','game.ladyHolder'])assert.ok(center.includes(data));
  assert.ok(center.includes('本轮若再次否决，邪恶阵营直接获胜'));
  assert.doesNotMatch(markup,/class="card board-center/);
  const container=css.match(/\.board-center \{([^}]+)\}/)[1];
  for(const declaration of ['background: transparent','border: 0','border-radius: 0','padding: 0','text-align: center'])assert.ok(container.includes(declaration));
  for(const name of ['assassination-rule','assassination-selection','forced-description']){
    const rule=css.match(new RegExp(`\\.${name} \\{([^}]+)\\}`))[1];
    assert.match(rule,/white-space: normal/);assert.doesNotMatch(rule,/ellipsis|hidden|max-height/);
  }
  assert.match(read('pages/demo-room/demo-room.wxss'),/@import "\.\.\/room\/room.wxss"/);
  assert.doesNotMatch(read('pages/demo-room/demo-room.wxml'),/class="card board-center/);
});
