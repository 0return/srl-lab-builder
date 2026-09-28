// Generate every preset (plus variants) into out/<preset>/ for validation.
const fs = require('fs');
const path = require('path');
const S = require('../src/engine.js');

const variants = [];
const clos = S.buildClos();
variants.push(['clos-ebgp', clos]);
const closU = S.buildClos({ underlay: 'ebgp-unnumbered' }); closU.design.bfd = true;
closU.services.filter(s => s.kind === 'mac-vrf').forEach(s => { s.proxyArp = true; });
variants.push(['clos-unnumbered', closU]);
const closI = S.buildClos({ underlay: 'isis' }); closI.design.bfd = true;
variants.push(['clos-isis', closI]);
const closO = S.buildClos({ underlay: 'ospf', spineType: 'ixr-h3', leafType: 'ixr-d3l' }); closO.design.bfd = true;
variants.push(['clos-ospf', closO]);
variants.push(['ai', S.buildAiFabric()]);
// breakout variant
const bo = S.buildClos({ spineType: 'ixr-d5', leafType: 'ixr-d3l' });
const sp1 = bo.nodes.find(n => n.name === 'spine1');
sp1.breakouts = { 1: '4x100G' };
bo.links.filter(l => l.b.n === sp1.id).forEach((l, i) => { l.b.p = `ethernet-1/1/${i + 1}`; });
variants.push(['breakout', bo]);

const out = path.join(__dirname, '..', 'out');
fs.rmSync(out, { recursive: true, force: true });
variants.forEach(([name, pr]) => {
  const r = S.generate(pr);
  const dir = path.join(out, name);
  r.files.forEach(f => { const p = path.join(dir, f.name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.code); });
  fs.writeFileSync(path.join(dir, 'issues.json'), JSON.stringify(r.issues, null, 1));
  const lv = r.issues.reduce((a, i) => (a[i.level] = (a[i.level] || 0) + 1, a), {});
  console.log(name.padEnd(16), r.files.length, 'files', JSON.stringify(lv));
  r.issues.filter(i => i.level !== 'info').forEach(i => console.log('   ', i.level, i.msg));
});
