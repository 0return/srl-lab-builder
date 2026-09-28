(function () {
  'use strict';
  const S = window.SRL;
  const STORE = 'srl-lab-builder:v1';
  const AUTHOR = 'Jesus Gomez';
  const AUTHOR_URL = 'https://www.linkedin.com/in/jes%C3%BAs-g%C3%B3mez-53702a220/';
  const REPO_URL = 'https://github.com/0return/srl-lab-builder';
  const extLink = (href, text) => href ? h('a', { href, target: '_blank', rel: 'noopener' }, text) : text;

  // ───────────── tiny DOM helper ─────────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    let value;
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach(c => { if (c === null || c === undefined || c === false) return; el.append(c instanceof Node ? c : document.createTextNode(String(c))); });
    if (value !== undefined) el.value = value;
    return el;
  }
  const ICONS = {
    plus: '<path d="M8 3v10M3 8h10"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
    down: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
    up: '<path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M3.5 10.5v-7a1 1 0 0 1 1-1h7"/>',
    ports: '<rect x="2" y="4.5" width="12" height="7" rx="1"/><path d="M4.5 7h2v2h-2zM9.5 7h2v2h-2z"/>',
    save: '<path d="M3 2.5h8l2 2v9H3zM5.5 2.5v3h5v-3M5 13.5v-4h6v4"/>',
  };
  const icon = n => h('span', { 'aria-hidden': 'true', style: 'display:inline-flex', html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>` });

  // ───────────── state ─────────────
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return isProject(p) ? p : null;
    } catch (e) { return null; }
  }
  function saveLocal() { try { localStorage.setItem(STORE, JSON.stringify(project)); } catch (e) { /* storage unavailable */ } }
  function isProject(p) { return p && typeof p === 'object' && Array.isArray(p.nodes) && Array.isArray(p.links) && Array.isArray(p.services) && p.design && typeof p.design === 'object'; }

  let project = S.normalize(loadLocal() || S.buildClos());
  const ui = { tab: 'design', portSel: {}, open: new Set(), file: null, focus: null, prev: null,
    wiz: { spines: 2, leaves: 4, spineType: 'ixr-d3l', leafType: 'ixr-d2l', hostsPerLeaf: 1, dualHomed: true, underlay: 'ebgp' } };
  try { const t = localStorage.getItem(STORE + ':tab'); if (['design', 'nodes', 'links', 'services'].includes(t)) ui.tab = t; } catch (e) { }
  let gen = null;

  function regen() {
    try { gen = S.generate(project); }
    catch (e) { gen = { files: [], issues: [{ level: 'error', msg: 'The generator stopped: ' + e.message }], plan: null }; console.error(e); }
  }
  function commit() { saveLocal(); regen(); renderEditor(); renderPreview(); }
  let softT = null;
  function soft() { saveLocal(); clearTimeout(softT); softT = setTimeout(() => { regen(); renderPreview(); }, 160); }

  const byId = id => project.nodes.find(n => n.id === id);
  const srlNodes = () => project.nodes.filter(n => n.kind === 'srl');

  // ───────────── form controls ─────────────
  function txt(id, value, set, o = {}) {
    return h('input', { type: 'text', id, class: o.mono ? 'mono' : null, value: value == null ? '' : String(value), placeholder: o.ph || null,
      spellcheck: 'false', autocomplete: 'off', inputmode: o.num ? 'numeric' : null, 'aria-label': o.label || null,
      oninput: e => { set(e.target.value); soft(); }, onchange: () => setTimeout(commit, 0) });
  }
  function opt(o) { return typeof o === 'string' ? h('option', { value: o }, o) : h('option', { value: o.v, disabled: o.disabled || null }, o.l); }
  function sel(id, value, options, set, o = {}) {
    const s = h('select', { id, class: o.mono ? 'mono' : null, 'aria-label': o.label || null, onchange: e => { set(e.target.value); commit(); } });
    options.forEach(x => {
      if (x && x.group) { const g = h('optgroup', { label: x.group }); x.items.forEach(it => g.append(opt(it))); s.append(g); }
      else s.append(opt(x));
    });
    s.value = value == null ? '' : String(value);
    return s;
  }
  function chk(id, checked, set, label) {
    return h('label', { class: 'check' }, h('input', { type: 'checkbox', id, checked, onchange: e => { set(e.target.checked); commit(); } }), label);
  }
  function seg(value, options, set, label) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': label || null },
      options.map(o => h('button', { type: 'button', 'aria-pressed': String(o.v === value), disabled: o.disabled || null, title: o.title || null,
        onclick: () => { if (o.v !== value) { set(o.v); commit(); } } }, o.l)));
  }
  const field = (label, control, hint) => h('label', { class: 'f' }, h('span', null, label), control, hint ? h('em', null, hint) : null);
  const fieldDiv = (label, control, hint) => h('div', { class: 'f' }, h('span', null, label), control, hint ? h('em', null, hint) : null);
  const btn = (label, onclick, o = {}) => h('button', { type: 'button', class: 'btn ' + (o.cls || ''), onclick, title: o.title || null, disabled: o.disabled || null }, o.icon ? icon(o.icon) : null, label);
  const delBtn = (onclick, label) => h('button', { type: 'button', class: 'iconbtn', onclick, title: label, 'aria-label': label }, icon('trash'));

  // ───────────── hardware labels ─────────────
  function groupSummary(groups) {
    const acc = [];
    groups.forEach(g => {
      const n = g.to - g.from + 1;
      const prev = acc.find(a => a.media === g.media && a.speed === g.speed);
      if (prev) prev.n += n; else acc.push({ media: g.media, speed: g.speed, n });
    });
    return acc.map(a => `${a.n}×${a.speed}`).join(' + ');
  }
  function platformOptions() {
    return S.FAMILIES.map(f => ({ group: f, items: S.PLATFORMS.filter(p => p.family === f).map(p => ({
      v: p.type, l: `${p.name.replace(/^\d{4} /, '')} · ${p.modular ? (p.fixedCard ? groupSummary(S.LINECARDS[p.defaultCard].ports) : 'modular, line card below') : groupSummary(p.ports)}`,
    })) }));
  }
  const MEDIA_VAR = { 'RJ45': '--m-rj45', 'SFP+': '--m-sfpp', 'SFP28': '--m-sfp28', 'SFP-DD': '--m-sfpdd', 'QSFP28': '--m-qsfp28', 'QSFP-DD': '--m-qsfpdd', 'QSFP56-DD': '--m-qsfp56', 'QSFP112-DD': '--m-qsfp112', 'OSFP': '--m-osfp' };
  const mediaColor = m => `var(${MEDIA_VAR[m] || '--m-rj45'})`;
  const ROLE_LABEL = { superspine: 'Super-spine', spine: 'Spine', leaf: 'Leaf', borderleaf: 'Border leaf' };

  // ───────────── top bar ─────────────
  const topEl = document.getElementById('top');
  let dlLabel = null, labInput = null;
  function buildTop() {
    labInput = txt('labname', project.design.lab, v => { project.design.lab = v.trim() || 'srl-lab'; }, { mono: true, label: 'Lab name' });
    labInput.addEventListener('change', () => { if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(project.design.lab)) toast('Lab names should use letters, digits, “-”, “_” and “.”.'); });
    const dl = btn('Download ZIP', downloadZip, { icon: 'down', cls: 'primary', title: 'Topology, configs/*.cli, README and project.json in one archive' });
    dlLabel = dl.lastChild;
    topEl.replaceChildren(
      h('div', { class: 'brand' }, h('b', null, 'SRL ', h('i', null, 'Lab'), ' Builder'), h('span', { class: 'by' }, 'by ', extLink(AUTHOR_URL, AUTHOR))),
      h('div', { class: 'labname' }, h('label', { for: 'labname' }, 'Lab'), labInput),
      h('div', { class: 'grow' }),
      h('div', { class: 'actions' },
        btn('Import', () => fileInput.click(), { icon: 'up', cls: 'ghost', title: 'Load a project JSON exported from this builder' }),
        btn('Export project', exportProject, { icon: 'save', cls: 'ghost', title: 'Save this design as JSON to re-import later' }),
        dl));
  }
  function renderTop() {
    if (!dlLabel) buildTop();
    const errs = gen ? gen.issues.filter(i => i.level === 'error').length : 0;
    dlLabel.textContent = errs ? `Download ZIP · ${errs} error${errs > 1 ? 's' : ''}` : 'Download ZIP';
    if (document.activeElement !== labInput && labInput.value !== project.design.lab) labInput.value = project.design.lab;
  }

  // ───────────── editor ─────────────
  const edEl = document.getElementById('editor');
  function renderEditor() {
    const ae = document.activeElement;
    const fid = ae && ae.id && edEl.contains(ae) ? ae.id : null;
    let s0 = null, s1 = null;
    try { if (fid && typeof ae.selectionStart === 'number') { s0 = ae.selectionStart; s1 = ae.selectionEnd; } } catch (e) { }
    const tabs = [
      { id: 'design', l: 'Design' },
      { id: 'nodes', l: 'Nodes', c: project.nodes.length },
      { id: 'links', l: 'Links', c: project.links.length },
      { id: 'services', l: 'Services', c: project.services.length },
    ];
    const body = { design: renderDesign, nodes: renderNodes, links: renderLinks, services: renderServices }[ui.tab]();
    edEl.replaceChildren(
      h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t => h('button', { type: 'button', class: 'tab', role: 'tab', id: 'tab-' + t.id, 'aria-selected': String(ui.tab === t.id),
        onclick: () => { ui.tab = t.id; try { localStorage.setItem(STORE + ':tab', t.id); } catch (e) { } renderEditor(); } }, t.l, t.c != null ? h('span', { class: 'count' }, t.c) : null))),
      h('div', { role: 'tabpanel', 'aria-labelledby': 'tab-' + ui.tab }, body));
    if (fid) {
      const el = document.getElementById(fid);
      if (el) { el.focus({ preventScroll: true }); try { if (s0 !== null) el.setSelectionRange(s0, s1); } catch (e) { } }
    }
  }

  // ── Design tab ──
  function replaceProject(p, msg) {
    ui.prev = JSON.parse(JSON.stringify(project));
    project = S.normalize(p);
    ui.file = null; ui.open.clear(); ui.portSel = {};
    commit(); renderTop();
    toast(msg, 'Undo', () => { if (ui.prev) { project = ui.prev; ui.prev = null; commit(); renderTop(); } });
  }
  function fixedTypes() {
    return S.FAMILIES.filter(f => !/IXR-e|gen1/.test(f)).map(f => ({ group: f, items: S.PLATFORMS.filter(p => p.family === f && !p.modular).map(p => ({ v: p.type, l: p.name.replace(/^\d{4} /, '') })) }));
  }
  function renderDesign() {
    const d = project.design, w = ui.wiz;
    const n = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
    const tpls = h('div', { class: 'tpls' },
      h('div', { class: 'tpl' },
        h('h4', null, 'EVPN-VXLAN Clos'),
        h('p', null, 'Spines and leafs, eBGP or IGP underlay, spines as EVPN route reflectors, one dual-homed host on an all-active ES, two MAC-VRFs routed through one IP-VRF.'),
        h('div', { class: 'mini' },
          field('Spines', sel('w-sp', w.spines, n(1, 4), v => { w.spines = +v; })),
          field('Leafs', sel('w-lf', w.leaves, n(2, 8), v => { w.leaves = +v; })),
          field('Spine type', sel('w-st', w.spineType, fixedTypes(), v => { w.spineType = v; })),
          field('Leaf type', sel('w-lt', w.leafType, fixedTypes(), v => { w.leafType = v; })),
          field('Hosts / leaf', sel('w-h', w.hostsPerLeaf, n(0, 3), v => { w.hostsPerLeaf = +v; })),
          field('Underlay', sel('w-u', w.underlay, [{ v: 'ebgp', l: 'eBGP' }, { v: 'ebgp-unnumbered', l: 'eBGP unnumbered' }, { v: 'isis', l: 'IS-IS' }, { v: 'ospf', l: 'OSPFv2' }], v => { w.underlay = v; }))),
        chk('w-dh', w.dualHomed, v => { w.dualHomed = v; }, 'Dual-home host1 to leaf1 + leaf2 (ESI LAG)'),
        btn('Build this fabric', () => replaceProject(S.buildClos(Object.assign({}, w)), `Built a ${w.spines}×${w.leaves} Clos.`), { cls: 'primary' })),
      h('div', { class: 'tpl' },
        h('h4', null, 'DC fabric · IXR-H + border leaf'),
        h('p', null, '7220 IXR-H5-64D spines, IXR-H4-32D leafs and a 7250 IXR-X3b border leaf. BGP unnumbered underlay over IPv6 link-local, EVPN-VXLAN overlay.'),
        btn('Load template', () => replaceProject(S.buildAiFabric(), 'Loaded the IXR-H fabric template.'))),
      h('div', { class: 'tpl' },
        h('h4', null, 'Empty lab'),
        h('p', null, 'Two 7220 IXR-D2L nodes and nothing else. Add nodes, links and services by hand.'),
        btn('Start empty', () => {
          const a = S.mkNode('srl1', 'srl', 'ixr-d2l', 'leaf'), b = S.mkNode('srl2', 'srl', 'ixr-d2l', 'leaf');
          replaceProject({ design: Object.assign(S.defaultDesign(), { lab: 'srl-lab', overlay: 'none' }), nodes: [a, b], links: [S.mkLink(a, 'ethernet-1/49', b, 'ethernet-1/49')], services: [] }, 'Started an empty lab.');
        })));

    const verOpts = S.SRL_VERSIONS.includes(d.version) ? S.SRL_VERSIONS : [d.version, ...S.SRL_VERSIONS];
    const lab = h('div', { class: 'block' },
      h('h2', null, 'Images and lab'),
      h('div', { class: 'grid2' },
        field('SR Linux release', sel('d-ver', d.version, verOpts, v => { d.version = v; }, { mono: true }), 'Tag on ghcr.io/nokia/srlinux'),
        field('Custom image', txt('d-img', d.image, v => { d.image = v; }, { mono: true, ph: `ghcr.io/nokia/srlinux:${d.version}` }), 'Leave empty to use the release tag'),
        field('License file', txt('d-lic', d.license, v => { d.license = v; }, { mono: true, ph: './license.key' }), 'Needed by 7250 IXR and 7730 SXR types'),
        field('Linux host image', txt('d-lin', d.linuxImage, v => { d.linuxImage = v; }, { mono: true })),
        field('Management subnet', txt('d-mgmt', d.mgmt, v => { d.mgmt = v; }, { mono: true, ph: 'containerlab default' }), 'Set it to pin mgmt-ipv4 per node')));

    const addr = h('div', { class: 'block' },
      h('h2', null, 'Addressing'),
      h('div', { class: 'grid2' },
        field('Loopbacks (system0)', txt('d-lb', d.loopbacks, v => { d.loopbacks = v; }, { mono: true }), 'Node n gets .n (in node order)'),
        field('Fabric point-to-point', txt('d-p2p', d.p2p, v => { d.p2p = v; }, { mono: true }), d.underlay === 'ebgp-unnumbered' ? 'Unused with BGP unnumbered' : 'Carved per link in link order'),
        fieldDiv('Link prefix length', seg(Number(d.p2pLen) === 30 ? 30 : 31, [{ v: 31, l: '/31' }, { v: 30, l: '/30' }], v => { d.p2pLen = v; }, 'Link prefix length')),
        field('Routed attachments', txt('d-rt', d.routedPool, v => { d.routedPool = v; }, { mono: true }), 'One /24 per host link into an IP-VRF')));

    const isEbgp = d.underlay === 'ebgp' || d.underlay === 'ebgp-unnumbered';
    const under = h('div', { class: 'block' },
      h('h2', null, 'Underlay'),
      seg(d.underlay, [{ v: 'ebgp', l: 'eBGP' }, { v: 'ebgp-unnumbered', l: 'eBGP unnumbered' }, { v: 'isis', l: 'IS-IS' }, { v: 'ospf', l: 'OSPFv2' }, { v: 'none', l: 'None' }], v => { d.underlay = v; }, 'Underlay protocol'),
      h('p', { class: 'lede' }, {
        ebgp: 'Numbered eBGP on every fabric link. Spines share one AS; every other node gets its own. Only /32 system loopbacks are exchanged.',
        'ebgp-unnumbered': 'eBGP over IPv6 link-local addresses discovered with router advertisements. IPv4 loopbacks ride with IPv6 next hops (RFC 8950), so fabric links need no IPv4.',
        isis: 'IS-IS point-to-point adjacencies on fabric links, system0 passive. NET is derived from the system IP.',
        ospf: 'OSPFv2 point-to-point on fabric links, system0 passive.',
        none: 'Fabric links get addresses but no routing protocol.',
      }[d.underlay]),
      isEbgp ? h('div', { class: 'grid2' },
        field('Spine AS', txt('d-as-s', d.asnSpine, v => { d.asnSpine = v; }, { mono: true, num: true })),
        field('Super-spine AS', txt('d-as-ss', d.asnSuperspine, v => { d.asnSuperspine = v; }, { mono: true, num: true })),
        field('First leaf AS', txt('d-as-l', d.asnLeafBase, v => { d.asnLeafBase = v; }, { mono: true, num: true }), 'Increments per node')) : null,
      d.underlay === 'isis' ? h('div', { class: 'grid2' },
        field('Area', txt('d-isa', d.isisArea, v => { d.isisArea = v; }, { mono: true })),
        field('Level', sel('d-isl', d.isisLevel, [{ v: 'L2', l: 'Level 2' }, { v: 'L1', l: 'Level 1' }, { v: 'L1L2', l: 'Level 1-2' }], v => { d.isisLevel = v; }))) : null,
      d.underlay === 'ospf' ? h('div', { class: 'grid2' }, field('Area', txt('d-osa', d.ospfArea, v => { d.ospfArea = v; }, { mono: true }))) : null,
      d.underlay !== 'none' ? chk('d-bfd', d.bfd, v => { d.bfd = v; }, 'BFD on fabric links (100 ms × 3)') : null);

    const over = h('div', { class: 'block' },
      h('h2', null, 'EVPN-VXLAN overlay'),
      h('div', { class: 'row' },
        fieldDiv('EVPN overlay', seg(d.overlay, [{ v: 'ibgp', l: 'iBGP EVPN' }, { v: 'none', l: 'None' }], v => { d.overlay = v; }, 'Overlay')),
        field('Overlay AS', txt('d-oas', d.overlayAsn, v => { d.overlayAsn = v; }, { mono: true, num: true }))),
      h('p', { class: 'lede' }, d.overlay === 'ibgp'
        ? 'Nodes marked RR reflect EVPN routes to every leaf. With no RR the leafs form a full iBGP mesh. Services ride VXLAN on vxlan1. ' + (isEbgp ? 'The overlay group uses local-as so it stays iBGP on top of per-node underlay ASNs.' : '')
        : 'No overlay: services stay local to each leaf.'));

    return h('div', { class: 'stack' },
      h('div', { class: 'block' }, h('h2', null, 'Start from a template'), h('p', { class: 'lede' }, 'Templates replace the current lab. Everything stays editable afterwards, and Undo brings the previous lab back.'), tpls),
      lab, addr, under, over);
  }

  // ── Nodes tab ──
  function linkUsage(node) {
    const m = new Map();
    project.links.forEach(l => ['a', 'b'].forEach(e => {
      if (l[e].n !== node.id) return;
      const o = l[e === 'a' ? 'b' : 'a'];
      const peer = byId(o.n);
      m.set(l[e].p, { link: l, peer: peer ? peer.name : '?', peerPort: o.p });
    }));
    return m;
  }
  function setBreakout(node, port, mode) {
    const old = (node.breakouts || {})[port];
    node.breakouts = node.breakouts || {};
    if (mode) node.breakouts[port] = mode; else delete node.breakouts[port];
    const parent = `ethernet-1/${port}`;
    project.links.forEach(l => ['a', 'b'].forEach(e => {
      const ep = l[e];
      if (ep.n !== node.id) return;
      if (mode && !old && ep.p === parent) ep.p = parent + '/1';
      else if (!mode && ep.p === parent + '/1') ep.p = parent;
    }));
  }
  function faceplate(node) {
    const hwi = S.hw(node);
    if (!hwi) return h('div', { class: 'empty' }, 'Unknown type.');
    const used = linkUsage(node);
    const usedParents = new Set([...used.keys()].map(p => (S.parsePort(p) || {}).port));
    const selPort = ui.portSel[node.id];
    const groups = hwi.ports.map((g, gi) => h('div', { class: 'cages', style: gi ? 'margin-left:10px' : null },
      Array.from({ length: g.to - g.from + 1 }, (_, k) => {
        const i = g.from + k;
        const bo = (node.breakouts || {})[i];
        const cls = ['cage', usedParents.has(i) ? 'used' : '', bo ? 'bo' : '', selPort === i ? 'sel' : ''].join(' ');
        return h('button', { type: 'button', class: cls, style: `--m:${mediaColor(g.media)}`, title: `ethernet-1/${i} · ${g.media} ${g.speed}${bo ? ' · breakout ' + bo : ''}${usedParents.has(i) ? ' · in use' : ''}`,
          'aria-label': `Port ${i}`, onclick: () => { ui.portSel[node.id] = selPort === i ? undefined : i; renderEditor(); } }, i < 100 ? i : '');
      })));
    const medias = [...new Set(hwi.ports.map(g => g.media + ' ' + g.speed))];
    const cols = hwi.ports.reduce((a, g) => a + Math.ceil((g.to - g.from + 1) / 2), 0);
    const plate = h('div', { class: 'face' + (cols > 26 ? ' compact' : '') },
      h('div', { class: 'face-top' }, h('span', null, hwi.platform.name + (hwi.card ? ' · ' + hwi.card : '')), h('span', null, `${S.portCount(node)} ports · slot 1`)),
      h('div', { style: 'display:flex;align-items:flex-start' }, groups),
      h('div', { class: 'legend' }, medias.map(m => h('span', null, h('i', { style: `--m:${mediaColor(m.split(' ')[0])}` }), m)),
        h('span', { style: 'color:#5CE08A' }, '● linked')));
    let info = null;
    if (selPort) {
      const g = S.portGroup(node, selPort);
      const o = S.breakoutOptions(node, selPort);
      const bo = (node.breakouts || {})[selPort] || '';
      const uses = [...used.entries()].filter(([p]) => (S.parsePort(p) || {}).port === selPort);
      const modes = o.modes.includes(bo) || !bo ? o.modes : [bo, ...o.modes];
      info = h('div', { class: 'portinfo' },
        h('div', null, h('div', { class: 'pname' }, `ethernet-1/${selPort}`), h('div', { class: 'pdesc' }, g ? `${g.media} · ${g.speed}` : 'outside this hardware')),
        h('div', { class: 'pdesc' }, uses.length ? uses.map(([p, u]) => h('div', null, `${p} → ${u.peer} ${u.peerPort}`)) : 'Not linked'),
        modes.length ? field('Breakout', sel(`bo-${node.id}-${selPort}`, bo, [{ v: '', l: 'None' }, ...modes.map(m => ({ v: m, l: m + (o.verified ? '' : ' (unverified)') }))], v => setBreakout(node, selPort, v), { mono: true }),
          o.note || (bo ? `Creates ethernet-1/${selPort}/1–${S.parseMode(bo).num}` : null)) : h('div', { class: 'pdesc' }, 'No breakout on this port.'));
    }
    return h('div', { class: 'stack', style: 'gap:10px' }, plate, info);
  }
  function renderNodeCard(n) {
    const d = project.design;
    const p = S.PLATFORM[n.type];
    const hwi = S.hw(n);
    const plan = gen && gen.plan;
    const open = ui.open.has(n.id);
    const isEbgp = d.underlay === 'ebgp' || d.underlay === 'ebgp-unnumbered';
    const card = h('div', { class: 'node' + (ui.focus === n.id ? ' focus' : ''), id: 'node-' + n.id },
      h('div', { class: 'node-h' },
        field('Name', txt(`n-${n.id}-name`, n.name, v => { n.name = v.trim(); }, { mono: true })),
        field('Role', sel(`n-${n.id}-role`, n.role, S.ROLES.map(r => ({ v: r, l: ROLE_LABEL[r] })), v => { n.role = v; n.rr = v === 'spine' || v === 'superspine'; })),
        field('Hardware (containerlab type)', sel(`n-${n.id}-type`, n.type, platformOptions(), v => { n.type = v; n.card = null; n.breakouts = {}; ui.portSel[n.id] = undefined; })),
        h('div', { class: 'tail' },
          h('button', { type: 'button', class: 'btn small ghost', 'aria-expanded': String(open), onclick: () => { open ? ui.open.delete(n.id) : ui.open.add(n.id); renderEditor(); } }, icon('ports'), open ? 'Hide ports' : 'Ports'),
          delBtn(() => removeNode(n), `Delete ${n.name}`))),
      h('div', { class: 'node-b' },
        h('div', { class: 'node-meta' },
          p && p.modular ? field('Line card (slot 1)', sel(`n-${n.id}-card`, hwi.card, p.cards.map(c => ({ v: c, l: `${c} — ${S.LINECARDS[c].label}` })), v => { n.card = v; n.breakouts = {}; }, { mono: true }), p.fixedCard ? 'Fixed on gen1 chassis' : null) : null,
          field('System IP', txt(`n-${n.id}-sys`, n.sys, v => { n.sys = v.trim(); }, { mono: true, ph: plan && plan.sys.get(n.id) ? plan.sys.get(n.id) + ' (auto)' : 'auto' })),
          isEbgp ? field('Underlay AS', txt(`n-${n.id}-asn`, n.asn, v => { n.asn = v.trim(); }, { mono: true, num: true, ph: plan && plan.asn.get(n.id) ? plan.asn.get(n.id) + ' (auto)' : 'auto' })) : null,
          d.overlay === 'ibgp' ? h('div', { class: 'f' }, h('span', null, 'EVPN'), chk(`n-${n.id}-rr`, n.rr, v => { n.rr = v; }, 'Route reflector')) : null,
          h('div', { class: 'f' }, h('span', null, 'Platform'), h('div', { class: 'kindtag' }, p ? `${p.family} · ${p.license === true ? 'license needed' : p.license === false ? 'no license' : 'license: check'}` : '—'))),
        open ? faceplate(n) : null));
    return card;
  }
  function renderHostCard(n) {
    const plan = gen && gen.plan;
    const c = plan && plan.hostCfg.get(n.id);
    const sum = c && c.ifaces.length ? c.ifaces.map(f => `${f.vlan ? f.dev + '.' + f.vlan : f.dev} ${f.ip || ''} → ${f.svc.name}`).join(' · ') : 'No service attached yet';
    return h('div', { class: 'node hostcard' + (ui.focus === n.id ? ' focus' : ''), id: 'node-' + n.id },
      h('div', { class: 'node-h' },
        field('Linux host', txt(`n-${n.id}-name`, n.name, v => { n.name = v.trim(); }, { mono: true })),
        h('div', { class: 'hostsum' }, sum),
        h('div', { class: 'tail' }, delBtn(() => removeNode(n), `Delete ${n.name}`))));
  }
  function uniqueName(base) {
    const names = new Set(project.nodes.map(n => n.name));
    let i = 1; while (names.has(base + i)) i++;
    return base + i;
  }
  function removeNode(n) {
    const snap = JSON.parse(JSON.stringify(project));
    project.nodes = project.nodes.filter(x => x !== n);
    project.links = project.links.filter(l => l.a.n !== n.id && l.b.n !== n.id);
    project.services.forEach(s => { s.extra = (s.extra || []).filter(id => id !== n.id); });
    commit();
    toast(`Deleted ${n.name} and its links.`, 'Undo', () => { project = snap; commit(); });
  }
  function renderNodes() {
    const srl = srlNodes(), hosts = project.nodes.filter(n => n.kind === 'linux');
    return h('div', { class: 'stack' },
      h('div', { class: 'bar' },
        h('p', { class: 'lede', style: 'margin:0' }, 'Pick the hardware each node emulates. Open Ports to see the faceplate and set breakouts.'),
        h('div', { class: 'actions' },
          btn('SR Linux node', () => { const n = S.mkNode(uniqueName('leaf'), 'srl', 'ixr-d2l', 'leaf'); project.nodes.splice(srlNodes().length, 0, n); ui.focus = n.id; commit(); }, { icon: 'plus' }),
          btn('Linux host', () => { project.nodes.push(S.mkNode(uniqueName('host'), 'linux')); commit(); }, { icon: 'plus' }))),
      srl.length ? h('div', { class: 'nodes' }, srl.map(renderNodeCard)) : h('div', { class: 'empty' }, 'No SR Linux nodes yet.'),
      hosts.length ? h('div', { class: 'nodes' }, hosts.map(renderHostCard)) : null);
  }

  // ── Links tab ──
  function usedPorts(exceptLink) {
    const u = new Set();
    project.links.forEach(l => { if (l === exceptLink) return; u.add(l.a.n + '|' + l.a.p); u.add(l.b.n + '|' + l.b.p); });
    return u;
  }
  function portOptions(node, current, exceptLink) {
    if (!node) return [{ v: '', l: '—' }];
    const u = usedPorts(exceptLink);
    let list;
    if (node.kind === 'linux') list = Array.from({ length: 16 }, (_, i) => ({ v: `eth${i + 1}`, l: `eth${i + 1}` + (u.has(node.id + '|eth' + (i + 1)) ? ' · in use' : '') }));
    else list = S.portList(node).map(p => ({ v: p.name, l: `${p.name} · ${p.media} ${p.speed}` + (u.has(node.id + '|' + p.name) ? ' · in use' : '') }));
    if (current && !list.some(o => o.v === current)) list.unshift({ v: current, l: `${current} (not on this hardware)` });
    return list;
  }
  function firstFree(node, exceptLink) {
    if (!node) return '';
    const u = usedPorts(exceptLink);
    if (node.kind === 'linux') { for (let i = 1; i < 64; i++) if (!u.has(node.id + '|eth' + i)) return 'eth' + i; return 'eth1'; }
    const p = S.portList(node).find(x => !u.has(node.id + '|' + x.name));
    return p ? p.name : '';
  }
  function renderLinks() {
    const plan = gen && gen.plan;
    const nodeOpts = [{ v: '', l: '— node —' }, ...project.nodes.map(n => ({ v: n.id, l: n.name + (n.kind === 'linux' ? ' (host)' : '') }))];
    const badLinks = new Set((gen ? gen.issues : []).filter(i => i.link && i.level === 'error').map(i => i.link));
    const rows = project.links.map((l, idx) => {
      const A = byId(l.a.n), B = byId(l.b.n);
      const kind = A && B ? (A.kind === 'srl' && B.kind === 'srl' ? 'fabric' : (A.kind !== B.kind ? 'access' : 'other')) : 'other';
      let extra;
      if (kind === 'fabric') {
        const f = plan && plan.fabric.find(x => x.link === l || x.link.id === l.id);
        const d = project.design;
        extra = h('div', { class: 'extra fabric' }, h('span', { class: 'kind fabric' }, 'Fabric'),
          h('span', { class: 'fabricinfo' }, d.underlay === 'ebgp-unnumbered' ? 'IPv6 link-local · BGP unnumbered' : f && f.ipA ? `${A.name} ${f.ipA}  ↔  ${B.name} ${f.ipB}` : '—'));
      } else if (kind === 'access') {
        const svcOpts = [{ v: '', l: '— no service —' }, ...project.services.map(s => ({ v: s.id, l: `${s.name} (${s.kind === 'mac-vrf' ? 'L2' : 'L3'})` }))];
        extra = h('div', { class: 'extra' }, h('span', { class: 'kind access' }, 'Access'),
          sel(`l-${l.id}-svc`, l.svc, svcOpts, v => { l.svc = v; }, { label: 'Service' }),
          txt(`l-${l.id}-vlan`, l.vlan, v => { l.vlan = v.trim(); }, { mono: true, ph: 'untagged', num: true, label: 'VLAN' }),
          txt(`l-${l.id}-bond`, l.bond, v => { l.bond = v.trim(); }, { mono: true, ph: 'no bond', label: 'Host bond name (bond0)' }));
      } else extra = h('div', { class: 'extra fabric' }, h('span', { class: 'kind other' }, 'L1 only'), h('span', { class: 'fabricinfo' }, 'Pick nodes on both ends'));
      return h('div', { class: 'link' + (badLinks.has(l.id) ? ' bad' : '') },
        sel(`l-${l.id}-an`, l.a.n, nodeOpts, v => { l.a.n = v; l.a.p = firstFree(byId(v), l); }, { label: `Link ${idx + 1} node A` }),
        sel(`l-${l.id}-ap`, l.a.p, portOptions(A, l.a.p, l), v => { l.a.p = v; }, { mono: true, label: `Link ${idx + 1} port A` }),
        h('span', { class: 'swap', 'aria-hidden': 'true' }, '⟷'),
        sel(`l-${l.id}-bn`, l.b.n, nodeOpts, v => { l.b.n = v; l.b.p = firstFree(byId(v), l); }, { label: `Link ${idx + 1} node B` }),
        sel(`l-${l.id}-bp`, l.b.p, portOptions(B, l.b.p, l), v => { l.b.p = v; }, { mono: true, label: `Link ${idx + 1} port B` }),
        delBtn(() => { project.links = project.links.filter(x => x !== l); commit(); }, `Delete link ${idx + 1}`),
        extra);
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'bar' },
        h('p', { class: 'lede', style: 'margin:0' }, 'SR Linux ↔ SR Linux links become routed fabric links. SR Linux ↔ host links are access ports: pick the service, an optional VLAN, and the same bond name on several links to build a LAG (an EVPN all-active ES when it spans nodes).'),
        btn('Link', () => {
          const s = srlNodes();
          const A = s[0] || project.nodes[0], B = s[1] || project.nodes[1] || A;
          const l = S.mkLink(A || { id: '' }, firstFree(A), B || { id: '' }, '');
          project.links.push(l); l.b.p = firstFree(B);
          commit();
        }, { icon: 'plus' })),
      rows.length ? h('div', { class: 'links' }, rows) : h('div', { class: 'empty' }, 'No links yet.'));
  }

  // ── Services tab ──
  function nextEvi() { const used = new Set(project.services.map(s => Number(s.evi))); let e = 10; while (used.has(e)) e += 10; return e; }
  function renderServices() {
    const d = project.design;
    const plan = gen && gen.plan;
    const ipvrfs = project.services.filter(s => s.kind === 'ip-vrf');
    const cards = project.services.map(s => {
      const attached = plan ? plan.attachments.filter(a => a.svc === s).map(a => `${a.srl.name} ${a.subif || (a.lag || a.port)}`) : [];
      const sp = plan && plan.svcPlan.get(s.id);
      const common = [
        field('EVI', txt(`s-${s.id}-evi`, s.evi, v => { s.evi = v.trim(); }, { mono: true, num: true }), 'Also the RT: target:' + d.overlayAsn + ':' + s.evi),
        field('VNI', txt(`s-${s.id}-vni`, s.vni, v => { s.vni = v.trim(); }, { mono: true, num: true, ph: String(s.evi) })),
        field('Description', txt(`s-${s.id}-desc`, s.description, v => { s.description = v; })),
      ];
      const specific = s.kind === 'mac-vrf' ? [
        field('Subnet', txt(`s-${s.id}-sub`, s.subnet, v => { s.subnet = v.trim(); }, { mono: true }), 'Hosts get .1, .2… in link order'),
        field('IRB into', sel(`s-${s.id}-irb`, s.irb, [{ v: '', l: 'None (pure L2)' }, ...ipvrfs.map(v => ({ v: v.id, l: v.name }))], v => { s.irb = v; })),
        s.irb ? field('Anycast gateway', txt(`s-${s.id}-gw`, s.gw, v => { s.gw = v.trim(); }, { mono: true, ph: sp && sp.gw ? sp.gw + ' (auto)' : 'auto' })) : null,
        s.irb ? h('div', { class: 'f' }, h('span', null, 'ARP'), chk(`s-${s.id}-parp`, !!s.proxyArp, v => { s.proxyArp = v; }, 'Proxy-ARP on the gateway'),
          h('em', null, 'The gateway answers every ARP with the anycast MAC, so traffic inside the subnet is routed too.')) : null,
      ] : [
        h('div', { class: 'f' }, h('span', null, 'Signalling'), h('div', { class: 'kindtag', style: 'padding-top:8px' }, 'EVPN IFL (RT5) over VXLAN')),
      ];
      return h('div', { class: 'svc' },
        h('div', { class: 'svc-h' },
          h('div', { class: 'row', style: 'align-items:center;flex-wrap:nowrap;min-width:0;flex:1' },
            h('span', { class: 'kind ' + (s.kind === 'mac-vrf' ? 'mac' : 'ip') }, s.kind === 'mac-vrf' ? 'MAC-VRF' : 'IP-VRF'),
            txt(`s-${s.id}-name`, s.name, v => { s.name = v.trim(); }, { mono: true, label: 'Network-instance name' })),
          delBtn(() => {
            const snap = JSON.parse(JSON.stringify(project));
            project.services = project.services.filter(x => x !== s);
            project.services.forEach(x => { if (x.irb === s.id) x.irb = ''; });
            project.links.forEach(l => { if (l.svc === s.id) l.svc = ''; });
            commit(); toast(`Deleted ${s.name}.`, 'Undo', () => { project = snap; commit(); });
          }, `Delete ${s.name}`)),
        h('div', { class: 'grid2' }, common, specific),
        h('div', { class: 'f' }, h('span', null, 'Also instantiate on'),
          h('div', { class: 'chips' }, srlNodes().map(n => {
            const on = (s.extra || []).includes(n.id);
            return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), onclick: () => { s.extra = on ? s.extra.filter(x => x !== n.id) : [...(s.extra || []), n.id]; commit(); } }, n.name);
          })),
          h('em', null, s.kind === 'ip-vrf' ? 'Nodes with attachments (or IRB MAC-VRFs) get it automatically. Add border leafs here.' : 'Nodes with attachments get it automatically.')),
        h('div', { class: 'attached' }, attached.length ? 'Attached: ' + attached.join(' · ') : 'No access links use this service yet (Links tab).'));
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'bar' },
        h('p', { class: 'lede', style: 'margin:0' }, 'Services ride EVPN-VXLAN on vxlan1. A MAC-VRF with an IRB gets a distributed anycast gateway in its IP-VRF (symmetric IRB).'),
        h('div', { class: 'actions' },
          btn('MAC-VRF', () => { const e = nextEvi(); project.services.push({ id: S.nid('s'), kind: 'mac-vrf', name: `mac-vrf-${e}`, evi: e, vni: e, subnet: `172.16.${e % 256}.0/24`, gw: '', irb: ipvrfs[0] ? ipvrfs[0].id : '', extra: [], description: '' }); commit(); }, { icon: 'plus' }),
          btn('IP-VRF', () => { const e = nextEvi(); project.services.push({ id: S.nid('s'), kind: 'ip-vrf', name: `ip-vrf-${e}`, evi: e, vni: e, signaling: 'evpn', extra: [], description: '' }); commit(); }, { icon: 'plus' }))),
      cards.length ? h('div', { class: 'stack' }, cards) : h('div', { class: 'empty' }, 'No services yet.'));
  }

  // ───────────── preview ─────────────
  const pvEl = document.getElementById('preview');
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hlCli(src) {
    return src.split('\n').map(line => {
      if (/^\s*#/.test(line)) return `<span class="c">${esc(line)}</span>`;
      let e = esc(line);
      e = e.replace(/^set \//, '<span class="k">set /</span>');
      e = e.replace(/(&quot;[^&]*(?:&(?!quot;)[^&]*)*&quot;)/g, '<span class="s">$1</span>');
      e = e.replace(/\b(\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?)(?![\w.])/g, '<span class="n">$1</span>');
      e = e.replace(/\b((?:ethernet-\d+\/\d+(?:\/\d+)?|lag\d+|irb0|system0|vxlan1)(?:\.\d+)?)\b/g, '<span class="i">$1</span>');
      return e;
    }).join('\n');
  }
  function hlYaml(src) {
    return src.split('\n').map(line => {
      const m = line.match(/^(\s*-?\s*)([\w.-]+)(:)(.*)$/);
      const tail = s => { const ci = s.indexOf('  #'); return ci >= 0 ? esc(s.slice(0, ci)) + `<span class="c">${esc(s.slice(ci))}</span>` : esc(s).replace(/(&quot;.*?&quot;)/g, '<span class="s">$1</span>'); };
      if (m) return esc(m[1]) + `<span class="y">${esc(m[2])}</span>${m[3]}` + tail(m[4]);
      return tail(line);
    }).join('\n');
  }
  const hlMd = src => src.split('\n').map(l => /^#/.test(l) ? `<span class="h">${esc(l)}</span>` : /^```/.test(l) ? `<span class="c">${esc(l)}</span>` : esc(l)).join('\n');

  function topoSvg() {
    const W = 820, rowH = 100, boxH = 42;
    const tierOf = n => n.kind === 'linux' ? 3 : (S.ROLE_TIER[n.role] ?? 2);
    const tiers = [...new Set(project.nodes.map(tierOf))].sort();
    if (!project.nodes.length) return '';
    const pos = new Map();
    const H = tiers.length * rowH + 16;
    const TL = { 0: 'Super-spine', 1: 'Spine', 2: 'Leaf', 3: 'Hosts' };
    let out = '';
    tiers.forEach((t, ri) => {
      const ns = project.nodes.filter(n => tierOf(n) === t);
      const y = 22 + ri * rowH;
      const avail = W - 100;
      const w = Math.min(124, avail / ns.length - 10);
      ns.forEach((n, i) => {
        const cx = 90 + avail * (i + 0.5) / ns.length;
        pos.set(n.id, { cx, y, w });
      });
      out += `<text class="tier" x="8" y="${y + boxH / 2 + 4}">${esc(TL[t] || '')}</text>`;
    });
    // links
    const plan = gen && gen.plan;
    const bondLinks = new Set(); const esLinks = new Set();
    if (plan) plan.bonds.forEach(b => b.members.forEach(m => { bondLinks.add(m.link.id); if (b.es) esLinks.add(m.link.id); }));
    let lines = '';
    const pairCount = new Map();
    project.links.forEach(l => {
      const A = byId(l.a.n), B = byId(l.b.n);
      if (!A || !B || !pos.get(A.id) || !pos.get(B.id)) return;
      let pa = pos.get(A.id), pb = pos.get(B.id);
      const kind = A.kind === 'srl' && B.kind === 'srl' ? 'fabric' : 'access';
      const cls = 'l ' + (bondLinks.has(l.id) ? 'bond' : kind);
      const key = [A.id, B.id].sort().join('|');
      const k = pairCount.get(key) || 0; pairCount.set(key, k + 1);
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5;
      const title = `<title>${esc(A.name + ' ' + l.a.p + ' ↔ ' + B.name + ' ' + l.b.p)}</title>`;
      if (pa.y === pb.y) {
        const mid = (pa.cx + pb.cx) / 2, dip = pa.y + boxH + 14 + Math.min(26, Math.abs(pa.cx - pb.cx) / 14) + off;
        lines += `<path class="${cls}" d="M${pa.cx} ${pa.y + boxH} Q ${mid} ${dip} ${pb.cx} ${pb.y + boxH}">${title}</path>`;
      } else {
        if (pa.y > pb.y) [pa, pb] = [pb, pa];
        lines += `<line class="${cls}" x1="${pa.cx + off}" y1="${pa.y + boxH}" x2="${pb.cx + off}" y2="${pb.y}">${title}</line>`;
      }
    });
    let boxes = '';
    project.nodes.forEach(n => {
      const p = pos.get(n.id); if (!p) return;
      const hwi = n.kind === 'srl' ? S.hw(n) : null;
      const maxc = Math.max(4, Math.floor(p.w / 7.2));
      const cut = (s, m) => s.length > m ? s.slice(0, m - 1) + '…' : s;
      const ty = n.kind === 'linux' ? 'linux' : (hwi ? hwi.platform.name.replace(/^\d{4} /, '') : n.type) + (n.rr && project.design.overlay === 'ibgp' ? ' · RR' : '');
      boxes += `<g class="n ${n.kind === 'srl' ? 'srl' : 'hostn'}${n.rr && n.kind === 'srl' && project.design.overlay === 'ibgp' ? ' rr' : ''}" data-id="${n.id}" tabindex="0" role="button" aria-label="${esc(n.name)}">`
        + `<rect x="${p.cx - p.w / 2}" y="${p.y}" width="${p.w}" height="${boxH}" rx="5"/>`
        + `<text class="nm" x="${p.cx}" y="${p.y + 17}" text-anchor="middle">${esc(cut(n.name, maxc))}</text>`
        + `<text class="ty" x="${p.cx}" y="${p.y + 32}" text-anchor="middle">${esc(cut(ty, Math.floor(p.w / 6.2)))}</text></g>`;
    });
    return `<svg class="topo" viewBox="0 0 ${W} ${H}" role="img" aria-label="Topology diagram">${lines}${boxes}</svg>`;
  }

  function renderPreview() {
    renderTop();
    if (!gen) regen();
    const files = gen.files;
    if (!ui.file || !files.some(f => f.name === ui.file)) ui.file = files[0] ? files[0].name : null;
    const f = files.find(x => x.name === ui.file);
    const plan = gen.plan;
    const errs = gen.issues.filter(i => i.level === 'error'), warns = gen.issues.filter(i => i.level === 'warn');
    const srl = srlNodes();
    const lic = srl.some(n => S.PLATFORM[n.type] && S.PLATFORM[n.type].license === true);

    const summary = h('div', { class: 'panel' },
      h('div', { class: 'panel-top' },
        h('div', { class: 'stats' },
          h('span', null, h('b', null, srl.length), 'SR Linux'),
          h('span', null, h('b', null, project.nodes.length - srl.length), 'hosts'),
          h('span', null, h('b', null, project.links.length), 'links'),
          h('span', null, h('b', null, project.services.length), 'services'),
          h('span', null, h('b', null, files.filter(x => x.kind === 'cli').reduce((a, x) => a + x.code.split('\n').filter(l => l.startsWith('set /')).length, 0)), 'config lines')),
        h('div', { class: 'row', style: 'gap:6px' },
          lic ? h('span', { class: 'pill warn', title: '7250 IXR / 7730 SXR types' }, 'License needed') : h('span', { class: 'pill ok' }, 'No license needed'),
          errs.length ? h('span', { class: 'pill error' }, `${errs.length} error${errs.length > 1 ? 's' : ''}`) : warns.length ? h('span', { class: 'pill warn' }, `${warns.length} warning${warns.length > 1 ? 's' : ''}`) : h('span', { class: 'pill ok' }, 'Ready'))),
      h('div', { html: topoSvg() }));
    summary.querySelectorAll('.n').forEach(g => {
      const go = () => {
        const id = g.getAttribute('data-id'); const n = byId(id);
        ui.focus = id; ui.tab = 'nodes';
        const file = n && n.kind === 'srl' ? `configs/${n.name}.cli` : null;
        if (file && files.some(x => x.name === file)) ui.file = file;
        renderEditor(); renderPreview();
        const el = document.getElementById('node-' + id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });

    const pre = h('pre', { class: 'code', tabindex: '0', 'aria-label': ui.file || 'file' });
    if (f) pre.innerHTML = f.kind === 'cli' ? hlCli(f.code) : f.kind === 'yaml' ? hlYaml(f.code) : hlMd(f.code);
    const filesPanel = h('div', { class: 'panel' },
      h('div', { class: 'files', role: 'tablist', 'aria-label': 'Generated files' }, files.map(x => h('button', { type: 'button', class: 'ftab', role: 'tab', 'aria-selected': String(x.name === ui.file), onclick: () => { ui.file = x.name; renderPreview(); } }, x.name.replace(/^configs\//, '')))),
      h('div', { class: 'codebar' },
        h('span', null, f ? `${f.name} · ${f.code.split('\n').length} lines` : 'No files'),
        f ? h('button', { type: 'button', class: 'btn small ghost', onclick: e => copyText(f.code, pre, e.currentTarget) }, icon('copy'), 'Copy') : null),
      pre);

    const order = { error: 0, warn: 1, info: 2 };
    const list = gen.issues.slice().sort((a, b) => order[a.level] - order[b.level]);
    const issues = h('div', { class: 'panel' },
      h('div', { class: 'panel-top' }, h('span', { class: 'panel-h' }, 'Checks'), h('span', { class: 'note' }, 'Paths validated against SR Linux 24.10 · 25.10 · 26.7 YANG')),
      list.length ? h('ul', { class: 'issues' }, list.map(i => h('li', null, h('span', { class: 'sev ' + i.level }, i.level === 'warn' ? 'warn' : i.level), h('span', null, i.msg))))
        : h('ul', { class: 'issues' }, h('li', null, h('span', { class: 'sev info' }, 'ok'), h('span', { class: 'ok' }, 'No problems found.'))));

    pvEl.replaceChildren(summary, filesPanel, issues);
  }

  function copyText(text, pre, button) {
    const done = () => { const old = button.lastChild.textContent; button.lastChild.textContent = 'Copied'; setTimeout(() => { button.lastChild.textContent = old; }, 1400); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Press Ctrl/⌘+C to copy.'); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }

  // ───────────── files out ─────────────
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(entries) {
    const enc = new TextEncoder(); const parts = [], central = []; let offset = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    entries.forEach(e => {
      const name = enc.encode(e.name), data = enc.encode(e.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, (3 << 8) | 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
      ch.setUint32(38, (0o100644 << 16) >>> 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const size = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  let dlP = null;
  const downloadsCap = () => dlP || (dlP = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null));
  async function offer(filename, data, mime) {
    const dl = await downloadsCap();
    if (dl) {
      try { await dl.save({ filename, data }); toast(`Saved ${filename}.`); }
      catch (e) {
        const c = e && e.code;
        if (c === 'declined') toast('Download cancelled.');
        else if (c === 'rate_limited') toast('A save prompt is already open.');
        else toast(`This view could not save the file (${c || 'unavailable'}). Copy the files from the preview instead.`);
      }
      return;
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename, style: 'display:none' });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function downloadZip() {
    regen();
    const lab = project.design.lab || 'srl-lab';
    const entries = gen.files.map(f => ({ name: `${lab}/${f.name}`, data: f.code }));
    entries.push({ name: `${lab}/project.json`, data: JSON.stringify(project, null, 2) });
    offer(`${lab}.zip`, zip(entries), 'application/zip');
  }
  function exportProject() { offer(`${project.design.lab || 'srl-lab'}.json`, JSON.stringify(project, null, 2), 'application/json'); }
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'vh', 'aria-label': 'Import project JSON',
    onchange: e => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        try { const p = JSON.parse(r.result); if (!isProject(p)) throw new Error('not a project'); replaceProject(p, `Imported ${file.name}.`); }
        catch (err) { toast('That file is not a project exported from this builder.'); }
        e.target.value = '';
      };
      r.readAsText(file);
    } });
  document.body.append(fileInput);

  // ───────────── toast ─────────────
  let toastEl = null, toastT = null;
  function toast(msg, actionLabel, action) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastT);
    toastEl = h('div', { class: 'toast', role: 'status' }, h('span', null, msg),
      actionLabel ? h('button', { type: 'button', onclick: () => { action(); if (toastEl) toastEl.remove(); toastEl = null; } }, actionLabel) : null);
    document.body.append(toastEl);
    toastT = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; }, actionLabel ? 7000 : 3200);
  }

  // ───────────── footer ─────────────
  const footEl = document.getElementById('foot');
  if (footEl) footEl.replaceChildren(
    h('span', null, 'Created by ', extLink(AUTHOR_URL, AUTHOR)),
    h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
    h('span', null, extLink(REPO_URL, 'Source on GitHub')),
    h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
    h('span', null, 'Independent project, not an official Nokia tool.'));

  // ───────────── boot ─────────────
  regen();
  renderEditor();
  renderPreview();
})();
