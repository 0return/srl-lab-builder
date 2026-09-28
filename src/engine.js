/* SRL Lab Builder — deterministic engine.
 * Hardware catalog for every SR Linux type containerlab can boot, the lab
 * data model, and generators for SR Linux flat CLI startup configs,
 * the containerlab topology and a README.
 * Plain ES2018, no dependencies: runs in the browser and in Node. */
(function (root) {
  'use strict';

  // ───────────────────────── helpers ─────────────────────────
  const G = (from, to, media, speed) => ({ from, to, media, speed });

  function parsePortSpec(spec) {
    const out = new Set();
    String(spec || '').split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
      let odd = false;
      if (part.startsWith('odd ')) { odd = true; part = part.slice(4).trim(); }
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let i = a; i <= b; i++) { if (odd && i % 2 === 0) continue; out.add(i); }
    });
    return out;
  }

  function ip2int(ip) {
    const p = String(ip || '').trim().split('.').map(Number);
    if (p.length !== 4 || p.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return null;
    return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  }
  const int2ip = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  function parseCidr(c) {
    const m = String(c || '').trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
    if (!m) return null;
    const ip = ip2int(m[1]); const len = +m[2];
    if (ip === null || len > 32) return null;
    const mask = len === 0 ? 0 : ((0xffffffff << (32 - len)) >>> 0);
    return { ip, len, net: (ip & mask) >>> 0, size: Math.pow(2, 32 - len) };
  }
  const isIp = s => ip2int(s) !== null;
  const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const pad3 = n => String(n).padStart(3, '0');

  // Router-id -> IS-IS system-id: 10.0.0.1 -> 0100.0000.0001
  function isisSystemId(ip) {
    const d = String(ip).split('.').map(o => pad3(parseInt(o, 10) || 0)).join('');
    return `${d.slice(0, 4)}.${d.slice(4, 8)}.${d.slice(8, 12)}`;
  }

  // ───────────────────────── catalog ─────────────────────────
  // Sources: containerlab nokia_srlinux kind (types + modular line cards),
  // SR Linux Product Overview "Hardware overview" (port counts) and
  // Interfaces Guide "Breakout ports" (breakout modes per port).
  const GENERIC_BREAKOUTS = ['2x400G', '4x100G', '8x100G', '2x200G', '4x200G', '2x100G', '4x25G', '4x10G'];

  const LINECARDS = {
    'imm32-100g-qsfp28+4-400g-qsfpdd': { label: '32×100G QSFP28 + 4×400G QSFP-DD', gen: 'gen1',
      ports: [G(1, 32, 'QSFP28', '100G'), G(33, 36, 'QSFP-DD', '400G')], breakout: [] },
    'imm36-400g-qsfpdd': { label: '36×400G QSFP-DD', gen: 'gen2cp',
      ports: [G(1, 36, 'QSFP-DD', '400G')], breakout: [{ ports: '1-36', modes: ['4x100G', '2x100G', '4x25G', '4x10G'] }] },
    'imm60-100g-qsfp28': { label: '60×100G QSFP28', gen: 'gen2cp',
      ports: [G(1, 60, 'QSFP28', '100G')],
      breakout: [{ ports: '9,12,15,18,21,24,26,27,29,30,32,35,38,39,41,42,45,48', modes: ['4x25G', '4x10G'], note: 'port-group restrictions apply' }] },
    'imm2-36-400g-sync-qsfpdd': { label: '36×400G QSFP-DD (sync)', gen: 'gen2cp',
      ports: [G(1, 36, 'QSFP-DD', '400G')], breakout: [{ ports: '1-36', modes: ['4x100G', '2x100G', '4x25G', '4x10G'] }] },
    'imm3-36-800g-qsfpdd': { label: '36×800G QSFP-DD', gen: 'gen3', ports: [G(1, 36, 'QSFP-DD', '800G')], breakout: null },
    'imm3-36-800g-osfp': { label: '36×800G OSFP', gen: 'gen3', ports: [G(1, 36, 'OSFP', '800G')], breakout: null },
    'imm3-18-800g-qsfpdd': { label: '18×800G QSFP-DD', gen: 'gen3', ports: [G(1, 18, 'QSFP-DD', '800G')], breakout: null },
    'imm3-36-800g-sync-qsfpdd': { label: '36×800G QSFP-DD (sync)', gen: 'gen3', ports: [G(1, 36, 'QSFP-DD', '800G')], breakout: null },
  };

  const H5_BO = n => [{ ports: `odd 1-${n - 1}`, modes: ['8x100G', '4x100G'] }, { ports: `1-${n}`, modes: ['2x200G', '2x100G'] }];

  const PLATFORMS = [
    { type: 'ixs-a1', family: '7215 IXS', name: '7215 IXS-A1', license: 'unknown',
      ports: [G(1, 48, 'RJ45', '1G'), G(49, 52, 'SFP+', '10G')], breakout: [] },

    { type: 'ixr-d1', family: '7220 IXR-D', name: '7220 IXR-D1', license: false,
      ports: [G(1, 48, 'RJ45', '1G'), G(49, 52, 'SFP+', '10G')], breakout: [] },
    { type: 'ixr-d2', family: '7220 IXR-D', name: '7220 IXR-D2', license: false,
      ports: [G(1, 48, 'SFP28', '25G'), G(49, 56, 'QSFP28', '100G')], breakout: [] },
    { type: 'ixr-d2l', family: '7220 IXR-D', name: '7220 IXR-D2L', license: false,
      ports: [G(1, 48, 'SFP28', '25G'), G(49, 56, 'QSFP28', '100G'), G(57, 58, 'SFP+', '10G')], breakout: [] },
    { type: 'ixr-d3', family: '7220 IXR-D', name: '7220 IXR-D3', license: false,
      ports: [G(1, 32, 'QSFP28', '100G'), G(33, 34, 'SFP+', '10G')], breakout: [{ ports: '1-32', modes: ['4x25G', '4x10G'] }] },
    { type: 'ixr-d3l', family: '7220 IXR-D', name: '7220 IXR-D3L', license: false,
      ports: [G(1, 32, 'QSFP28', '100G'), G(33, 34, 'SFP+', '10G')], breakout: [{ ports: '1-32', modes: ['4x25G', '4x10G', '2x50G'] }] },
    { type: 'ixr-d4', family: '7220 IXR-D', name: '7220 IXR-D4', license: false,
      ports: [G(1, 28, 'QSFP28', '100G'), G(29, 36, 'QSFP-DD', '400G')],
      breakout: [{ ports: '29-32', modes: ['4x100G', '4x25G', '4x10G'] }, { ports: '9,23-27', modes: ['4x25G', '4x10G'] }] },
    { type: 'ixr-d5', family: '7220 IXR-D', name: '7220 IXR-D5', license: false,
      ports: [G(1, 32, 'QSFP-DD', '400G'), G(33, 34, 'SFP+', '10G')],
      breakout: [{ ports: '1-32', modes: ['4x100G', '2x200G', '2x100G', '4x50G', '2x50G', '4x25G', '4x10G'] }] },

    { type: 'ixr-h2', family: '7220 IXR-H', name: '7220 IXR-H2', license: false,
      ports: [G(1, 128, 'QSFP28', '100G')], breakout: [] },
    { type: 'ixr-h3', family: '7220 IXR-H', name: '7220 IXR-H3', license: false,
      ports: [G(1, 32, 'QSFP-DD', '400G'), G(33, 34, 'SFP+', '10G')],
      breakout: [{ ports: '1-32', modes: ['4x100G', '2x200G', '2x100G', '4x25G', '4x10G'] }] },
    { type: 'ixr-h4', family: '7220 IXR-H', name: '7220 IXR-H4', license: false,
      ports: [G(1, 64, 'QSFP-DD', '400G'), G(65, 66, 'SFP+', '10G')], breakout: [{ ports: '1-64', modes: ['4x100G', '2x200G'] }] },
    { type: 'ixr-h4-32d', family: '7220 IXR-H', name: '7220 IXR-H4-32D', license: false,
      ports: [G(1, 32, 'QSFP-DD', '400G'), G(33, 33, 'SFP+', '10G')], breakout: [{ ports: '1-32', modes: ['4x100G', '2x200G', '2x100G'] }] },
    { type: 'ixr-h5-32d', family: '7220 IXR-H', name: '7220 IXR-H5-32D', license: false,
      ports: [G(1, 32, 'QSFP112-DD', '800G'), G(33, 34, 'SFP+', '10G')], breakout: H5_BO(32) },
    { type: 'ixr-h5-64d', family: '7220 IXR-H', name: '7220 IXR-H5-64D', license: false,
      ports: [G(1, 64, 'QSFP112-DD', '800G'), G(65, 66, 'SFP+', '10G')], breakout: H5_BO(64) },
    { type: 'ixr-h5-64o', family: '7220 IXR-H', name: '7220 IXR-H5-64O', license: false,
      ports: [G(1, 64, 'OSFP', '800G'), G(65, 66, 'SFP+', '10G')], breakout: H5_BO(64) },
    { type: 'ixr-h6', family: '7220 IXR-H', name: '7220 IXR-H6-64', license: false,
      ports: [G(1, 64, 'OSFP', '1.6T')], breakout: null, portsNote: 'Port layout taken from launch material (102.4T, 64 × 1.6TE); not yet in the SR Linux hardware tables.' },

    { type: 'ixr-x1b', family: '7250 IXR-X', name: '7250 IXR-X1b', license: true,
      ports: [G(1, 24, 'QSFP28', '100G'), G(25, 36, 'QSFP-DD', '400G')],
      breakout: [{ ports: '1-24', modes: ['4x25G', '4x10G'], note: 'port-group restrictions apply' }, { ports: '25-36', modes: ['4x100G', '4x25G', '4x10G'] }] },
    { type: 'ixr-x3b', family: '7250 IXR-X', name: '7250 IXR-X3b', license: true,
      ports: [G(1, 36, 'QSFP56-DD', '400G')], breakout: [{ ports: '1-36', modes: ['4x100G', '4x25G', '4x10G'] }] },
    { type: 'ixr-x4', family: '7250 IXR-X', name: '7250 IXR-X4 (QSFP-DD)', license: true,
      ports: [G(1, 32, 'QSFP112-DD', '800G')], breakout: null },

    { type: 'ixr-6e', family: '7250 IXR-e', name: '7250 IXR-6e', license: true, modular: true,
      cards: ['imm36-400g-qsfpdd', 'imm60-100g-qsfp28', 'imm2-36-400g-sync-qsfpdd', 'imm3-36-800g-qsfpdd', 'imm3-36-800g-osfp'], defaultCard: 'imm36-400g-qsfpdd' },
    { type: 'ixr-10e', family: '7250 IXR-e', name: '7250 IXR-10e', license: true, modular: true,
      cards: ['imm36-400g-qsfpdd', 'imm60-100g-qsfp28', 'imm2-36-400g-sync-qsfpdd', 'imm3-36-800g-qsfpdd', 'imm3-36-800g-osfp'], defaultCard: 'imm36-400g-qsfpdd' },
    { type: 'ixr-18e', family: '7250 IXR-e', name: '7250 IXR-18e', license: true, modular: true,
      cards: ['imm3-18-800g-qsfpdd', 'imm3-36-800g-sync-qsfpdd', 'imm3-36-800g-osfp'], defaultCard: 'imm3-18-800g-qsfpdd' },
    { type: 'ixr-6', family: '7250 IXR (gen1)', name: '7250 IXR-6', license: true, modular: true,
      cards: ['imm32-100g-qsfp28+4-400g-qsfpdd'], defaultCard: 'imm32-100g-qsfp28+4-400g-qsfpdd', fixedCard: true },
    { type: 'ixr-10', family: '7250 IXR (gen1)', name: '7250 IXR-10', license: true, modular: true,
      cards: ['imm32-100g-qsfp28+4-400g-qsfpdd'], defaultCard: 'imm32-100g-qsfp28+4-400g-qsfpdd', fixedCard: true },

    { type: 'sxr-1d-32d', family: '7730 SXR', name: '7730 SXR-1d-32D', license: true,
      ports: [G(1, 16, 'QSFP28', '100G'), G(17, 20, 'QSFP-DD', '400G'), G(21, 32, 'QSFP28', '100G')],
      breakout: [{ ports: '17-20', modes: ['4x100G', '4x25G', '4x10G'] }, { ports: '1-16,21-32', modes: ['4x25G', '4x10G'], note: 'port-group restrictions apply' }] },
    { type: 'sxr-1-32d', family: '7730 SXR', name: '7730 SXR-1-32D', license: true,
      ports: [G(1, 16, 'QSFP28', '100G'), G(17, 20, 'QSFP-DD', '400G'), G(21, 32, 'QSFP28', '100G')],
      breakout: null, portsNote: 'Same 28×QSFP28 + 4×QSFP-DD mix as the SXR-1d-32D; port order assumed identical.' },
    { type: 'sxr-1x-44s', family: '7730 SXR', name: '7730 SXR-1x-44S', license: true,
      ports: [G(1, 20, 'SFP-DD', '100G'), G(21, 22, 'QSFP-DD', '400G'), G(23, 42, 'SFP-DD', '100G'), G(43, 44, 'QSFP-DD', '400G')],
      breakout: [{ ports: '21,22,43,44', modes: ['4x100G', '4x25G', '4x10G'] }] },
  ];
  const PLATFORM = Object.fromEntries(PLATFORMS.map(p => [p.type, p]));
  const FAMILIES = [...new Set(PLATFORMS.map(p => p.family))];

  const SRL_VERSIONS = ['26.7.2', '26.3.3', '25.10.5', '25.7.2', '25.3.2', '24.10.4'];

  // Resolved hardware view of a node: port groups + breakout rules.
  function hw(node) {
    const p = PLATFORM[node.type];
    if (!p) return null;
    if (p.modular) {
      const cardId = (node.card && p.cards.includes(node.card)) ? node.card : p.defaultCard;
      const c = LINECARDS[cardId];
      return { platform: p, card: cardId, cardInfo: c, ports: c.ports, breakout: c.breakout, gen: c.gen };
    }
    return { platform: p, card: null, ports: p.ports, breakout: p.breakout, gen: null };
  }
  function portCount(node) { const h = hw(node); return h ? h.ports[h.ports.length - 1].to : 0; }
  function portGroup(node, n) { const h = hw(node); return h ? h.ports.find(g => n >= g.from && n <= g.to) || null : null; }

  // Breakout options for port n. Returns {modes, verified, note}.
  function breakoutOptions(node, n) {
    const h = hw(node);
    if (!h) return { modes: [], verified: false };
    if (h.breakout === null) {
      const g = portGroup(node, n);
      const multi = g && /QSFP|OSFP/.test(g.media);
      return { modes: multi ? GENERIC_BREAKOUTS : [], verified: false, note: 'Breakout modes for this hardware are not in the SR Linux breakout table; values are not verified.' };
    }
    const modes = []; let note = '';
    h.breakout.forEach(r => {
      if (parsePortSpec(r.ports).has(n)) { r.modes.forEach(m => { if (!modes.includes(m)) modes.push(m); }); if (r.note) note = r.note; }
    });
    return { modes, verified: true, note };
  }
  function parseMode(mode) {
    const m = String(mode || '').match(/^(\d)x(\d+G)$/);
    return m ? { num: +m[1], speed: m[2] } : null;
  }

  // All usable port names on a node (breakout parents replaced by children).
  function portList(node) {
    const h = hw(node);
    if (!h) return [];
    const out = [];
    h.ports.forEach(g => {
      for (let i = g.from; i <= g.to; i++) {
        const bo = parseMode((node.breakouts || {})[i]);
        if (bo) { for (let c = 1; c <= bo.num; c++) out.push({ name: `ethernet-1/${i}/${c}`, parent: i, media: g.media, speed: bo.speed }); }
        else out.push({ name: `ethernet-1/${i}`, parent: i, media: g.media, speed: g.speed });
      }
    });
    return out;
  }
  function parsePort(name) {
    const m = String(name || '').match(/^ethernet-(\d+)\/(\d+)(?:\/(\d+))?$/);
    return m ? { slot: +m[1], port: +m[2], child: m[3] ? +m[3] : null } : null;
  }

  // ───────────────────────── model defaults ─────────────────────────
  const ROLES = ['superspine', 'spine', 'leaf', 'borderleaf'];
  const ROLE_TIER = { superspine: 0, spine: 1, leaf: 2, borderleaf: 2, host: 3 };

  function defaultDesign() {
    return {
      lab: 'srl-fabric', version: '26.7.2', image: '', license: './license.key',
      linuxImage: 'ghcr.io/srl-labs/network-multitool', mgmt: '',
      loopbacks: '10.0.0.0/24', p2p: '192.168.0.0/24', p2pLen: 31, routedPool: '172.31.0.0/16',
      underlay: 'ebgp', isisArea: '49.0001', isisLevel: 'L2', ospfArea: '0.0.0.0', bfd: false,
      asnSpine: 65100, asnSuperspine: 65200, asnLeafBase: 65001,
      overlay: 'ibgp', overlayAsn: 65500,
    };
  }

  // Bring older saved projects (which had an MPLS option and PE/P roles)
  // in line with the EVPN-VXLAN-only model.
  function normalize(project) {
    const p = project || {};
    const d = Object.assign(defaultDesign(), p.design || {});
    ['transport', 'ldp', 'srmpls', 'srgbStart', 'srgbEnd'].forEach(k => { delete d[k]; });
    p.design = d;
    (p.nodes || []).forEach(n => { if (n.role === 'pe') n.role = 'leaf'; if (n.role === 'p') n.role = 'spine'; });
    (p.services || []).forEach(sv => { if (sv.kind === 'ip-vrf') sv.signaling = 'evpn'; });
    return p;
  }

  // ───────────────────────── resolution ─────────────────────────
  // Turns the editable project into a fully-addressed plan that every
  // generator reads. Issues found on the way are collected, never thrown.
  function resolve(project) {
    normalize(project);
    const d = project.design;
    const nodes = project.nodes || [];
    const links = project.links || [];
    const services = project.services || [];
    const issues = [];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const svcById = new Map(services.map(s => [s.id, s]));
    const srl = nodes.filter(n => n.kind === 'srl');
    const hosts = nodes.filter(n => n.kind === 'linux');

    // names
    const seen = new Set();
    nodes.forEach(n => {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(n.name || '')) issues.push({ level: 'error', msg: `Node name “${n.name}” is not valid for containerlab (use letters, digits, - and _).`, node: n.id });
      if (seen.has(n.name)) issues.push({ level: 'error', msg: `Duplicate node name “${n.name}”.`, node: n.id });
      seen.add(n.name);
    });

    // loopbacks
    const lb = parseCidr(d.loopbacks);
    if (!lb) issues.push({ level: 'error', msg: `Loopback pool “${d.loopbacks}” is not a valid IPv4 prefix.` });
    const sys = new Map();
    srl.forEach((n, i) => {
      let ip = (n.sys || '').trim();
      if (ip && !isIp(ip)) { issues.push({ level: 'error', msg: `${n.name}: system IP “${ip}” is not a valid IPv4 address.`, node: n.id }); ip = ''; }
      if (!ip && lb) ip = int2ip(lb.net + i + 1);
      sys.set(n.id, ip);
    });
    const sysSeen = new Map();
    sys.forEach((ip, id) => { if (sysSeen.has(ip)) issues.push({ level: 'error', msg: `${byId.get(id).name} and ${byId.get(sysSeen.get(ip)).name} share system IP ${ip}.`, node: id }); sysSeen.set(ip, id); });

    // ASNs (underlay eBGP) — spines share one AS per tier, others unique.
    const asn = new Map(); let leafIdx = 0;
    srl.forEach(n => {
      let a = String(n.asn || '').trim();
      if (!a) {
        if (n.role === 'spine') a = String(d.asnSpine);
        else if (n.role === 'superspine') a = String(d.asnSuperspine);
        else a = String(Number(d.asnLeafBase) + (leafIdx++));
      }
      asn.set(n.id, a);
    });

    // hardware checks
    srl.forEach(n => {
      const p = PLATFORM[n.type];
      if (!p) { issues.push({ level: 'error', msg: `${n.name}: unknown SR Linux type “${n.type}”.`, node: n.id }); return; }
      if (p.modular && !p.fixedCard && n.card && n.card !== p.defaultCard)
        issues.push({ level: 'info', msg: `${n.name}: line card ${n.card} is set through a containerlab “components” block, which needs a containerlab build newer than v0.79.0.`, node: n.id });
      Object.entries(n.breakouts || {}).forEach(([port, mode]) => {
        const o = breakoutOptions(n, +port);
        if (!o.modes.includes(mode)) issues.push({ level: 'warn', msg: `${n.name}: breakout ${mode} on ethernet-1/${port} is not listed for this hardware.`, node: n.id });
        else if (!o.verified) issues.push({ level: 'warn', msg: `${n.name}: breakout ${mode} on ethernet-1/${port} is not verified for ${p.name}.`, node: n.id });
      });
      if (p.portsNote) issues.push({ level: 'info', msg: `${n.name} (${p.name}): ${p.portsNote}`, node: n.id });
    });
    const needsLicense = srl.some(n => PLATFORM[n.type] && PLATFORM[n.type].license === true);
    if (needsLicense && !String(d.license || '').trim())
      issues.push({ level: 'warn', msg: '7250 IXR and 7730 SXR types boot only with an SR Linux license file. Set the license path in Design.' });

    // links: port validation + classification
    const used = new Map();
    const resolvedLinks = [];
    links.forEach((l, idx) => {
      const A = byId.get(l.a && l.a.n), B = byId.get(l.b && l.b.n);
      if (!A || !B) { issues.push({ level: 'warn', msg: `Link ${idx + 1} is missing an endpoint node.`, link: l.id }); return; }
      if (A === B) { issues.push({ level: 'error', msg: `Link ${idx + 1} connects ${A.name} to itself.`, link: l.id }); return; }
      let ok = true;
      [[A, l.a.p], [B, l.b.p]].forEach(([n, p]) => {
        if (!p) { issues.push({ level: 'error', msg: `Link ${idx + 1}: ${n.name} has no port selected.`, link: l.id }); ok = false; return; }
        const key = n.id + '|' + p;
        if (used.has(key)) { issues.push({ level: 'error', msg: `${n.name} ${p} is used by more than one link.`, link: l.id }); ok = false; }
        used.set(key, l.id);
        if (n.kind === 'srl') {
          const pp = parsePort(p);
          if (!pp) { issues.push({ level: 'error', msg: `${n.name}: “${p}” is not an SR Linux port name (ethernet-1/N or ethernet-1/N/M).`, link: l.id }); ok = false; return; }
          if (!portList(n).some(x => x.name === p)) {
            const bo = (n.breakouts || {})[pp.port];
            if (pp.child && !bo) issues.push({ level: 'error', msg: `${n.name}: ${p} needs a breakout on ethernet-1/${pp.port}.`, link: l.id });
            else if (!pp.child && bo) issues.push({ level: 'error', msg: `${n.name}: ethernet-1/${pp.port} is broken out (${bo}); use ${p}/1…`, link: l.id });
            else issues.push({ level: 'warn', msg: `${n.name}: ${p} is outside the ${portCount(n)} ports of ${(hw(n) || {}).platform ? hw(n).platform.name : n.type}.`, link: l.id });
          }
        } else if (!/^eth\d+$/.test(p)) {
          issues.push({ level: 'error', msg: `${n.name}: Linux ports are named eth1, eth2…`, link: l.id }); ok = false;
        }
      });
      if (!ok) return;
      let kind;
      if (A.kind === 'srl' && B.kind === 'srl') kind = 'fabric';
      else if (A.kind === 'linux' && B.kind === 'linux') kind = 'host-host';
      else kind = 'access';
      const srlEnd = kind === 'access' ? (A.kind === 'srl' ? 'a' : 'b') : null;
      resolvedLinks.push({ link: l, idx, kind, A, B, srlEnd });
    });

    // fabric addressing
    const p2p = parseCidr(d.p2p);
    const p2pLen = Number(d.p2pLen) === 30 ? 30 : 31;
    const step = p2pLen === 31 ? 2 : 4;
    if (!p2p && d.underlay !== 'ebgp-unnumbered') issues.push({ level: 'error', msg: `Point-to-point pool “${d.p2p}” is not a valid IPv4 prefix.` });
    let fi = 0;
    const fabric = [];
    resolvedLinks.filter(r => r.kind === 'fabric').forEach(r => {
      const f = { link: r.link, A: r.A, B: r.B, pa: r.link.a.p, pb: r.link.b.p, ipA: null, ipB: null };
      if (p2p && d.underlay !== 'ebgp-unnumbered') {
        const base = p2p.net + fi * step;
        if (fi * step + step > p2p.size) issues.push({ level: 'error', msg: `Point-to-point pool ${d.p2p} is too small for ${resolvedLinks.filter(x => x.kind === 'fabric').length} fabric links.` });
        const a = p2pLen === 31 ? base : base + 1, b = a + 1;
        f.ipA = int2ip(a) + '/' + p2pLen; f.ipB = int2ip(b) + '/' + p2pLen;
      }
      fi++;
      fabric.push(f);
    });

    // access attachments: group bonds per host
    const routed = parseCidr(d.routedPool);
    let routedIdx = 0;
    const attachments = []; // {srl, port, host, hostPort, svc, vlan, bondKey}
    resolvedLinks.filter(r => r.kind === 'access').forEach(r => {
      const srlN = r.srlEnd === 'a' ? r.A : r.B, host = r.srlEnd === 'a' ? r.B : r.A;
      const sp = r.srlEnd === 'a' ? r.link.a.p : r.link.b.p, hp = r.srlEnd === 'a' ? r.link.b.p : r.link.a.p;
      const svc = svcById.get(r.link.svc);
      const vlanRaw = String(r.link.vlan || '').trim();
      let vlan = null;
      if (vlanRaw) {
        vlan = Number(vlanRaw);
        if (!Number.isInteger(vlan) || vlan < 1 || vlan > 4094) { issues.push({ level: 'error', msg: `Link ${r.idx + 1}: VLAN “${vlanRaw}” must be 1–4094.`, link: r.link.id }); vlan = null; }
      }
      if (!svc) issues.push({ level: 'warn', msg: `${srlN.name} ${sp} → ${host.name}: pick a service, otherwise the port is left unconfigured.`, link: r.link.id });
      attachments.push({ link: r.link, srl: srlN, port: sp, host, hostPort: hp, svc: svc || null, vlan, bond: String(r.link.bond || '').trim() });
    });

    // bonds / LAGs: key = host + bond name
    const bonds = new Map();
    attachments.forEach(at => {
      if (!at.bond) return;
      const key = at.host.id + '|' + at.bond;
      if (!bonds.has(key)) bonds.set(key, { key, host: at.host, name: at.bond, members: [] });
      bonds.get(key).members.push(at);
    });
    let esIdx = 0;
    const lagByNode = new Map(); // srl id -> [{name, members:[port], bondKey, es}]
    bonds.forEach(b => {
      const first = b.members[0];
      b.members.forEach(m => {
        if (m.svc !== first.svc || m.vlan !== first.vlan) issues.push({ level: 'error', msg: `${b.host.name} ${b.name}: all bond member links must use the same service and VLAN.`, link: m.link.id });
      });
      const peers = [...new Set(b.members.map(m => m.srl.id))];
      b.peers = peers;
      if (peers.length > 1) {
        esIdx++;
        b.es = { name: `ES-${b.host.name}-${b.name}`, esi: `00:11:11:11:11:11:11:00:00:${esIdx.toString(16).padStart(2, '0')}`,
          sysMac: `02:00:00:00:00:${esIdx.toString(16).padStart(2, '0')}`, adminKey: 10 + esIdx };
        if (peers.length > 4) issues.push({ level: 'warn', msg: `${b.host.name} ${b.name}: an Ethernet segment spans at most 4 PEs.` });
        if (first.svc && first.svc.kind === 'ip-vrf') issues.push({ level: 'error', msg: `${b.host.name} ${b.name}: a bond homed to several nodes must attach to a MAC-VRF (use an IRB for routing).`, link: first.link.id });
      }
      peers.forEach(pid => {
        const list = lagByNode.get(pid) || [];
        const lagName = `lag${list.length + 1}`;
        const lag = { name: lagName, bondKey: b.key, members: b.members.filter(m => m.srl.id === pid).map(m => m.port), es: b.es || null, bond: b };
        list.push(lag); lagByNode.set(pid, list);
        b.members.filter(m => m.srl.id === pid).forEach(m => { m.lag = lagName; });
      });
    });

    // service subnets and host addressing
    const svcPlan = new Map();
    services.forEach(s => {
      const plan = { svc: s, nodes: new Set(), hostIdx: 0 };
      if (s.kind === 'mac-vrf') {
        plan.subnet = parseCidr(s.subnet);
        if (s.subnet && !plan.subnet) issues.push({ level: 'error', msg: `${s.name}: subnet “${s.subnet}” is not a valid IPv4 prefix.` });
        if (plan.subnet) {
          plan.gw = s.gw && isIp(s.gw) ? s.gw : int2ip(plan.subnet.net + plan.subnet.size - 2);
          plan.gwCidr = plan.gw + '/' + plan.subnet.len;
        }
        if (s.irb && !svcById.get(s.irb)) issues.push({ level: 'warn', msg: `${s.name}: the IRB target IP-VRF no longer exists.` });
      }
      svcPlan.set(s.id, plan);
    });
    // service instances per SRL node
    attachments.forEach(at => { if (at.svc) svcPlan.get(at.svc.id).nodes.add(at.srl.id); });
    services.forEach(s => (s.extra || []).forEach(nid => { if (byId.get(nid) && byId.get(nid).kind === 'srl') svcPlan.get(s.id).nodes.add(nid); }));
    services.filter(s => s.kind === 'mac-vrf' && s.irb && svcById.get(s.irb)).forEach(s => {
      svcPlan.get(s.id).nodes.forEach(nid => svcPlan.get(s.irb).nodes.add(nid));
    });
    services.forEach(s => { if (!svcPlan.get(s.id).nodes.size) issues.push({ level: 'info', msg: `${s.name} is not attached to any node yet.` }); });

    // EVI / VNI uniqueness
    const eviSeen = new Map();
    services.forEach(s => {
      if (!(Number(s.evi) >= 1 && Number(s.evi) <= 65535)) issues.push({ level: 'error', msg: `${s.name}: EVI must be 1–65535.` });
      if (eviSeen.has(Number(s.evi))) issues.push({ level: 'error', msg: `${s.name} and ${eviSeen.get(Number(s.evi))} use the same EVI ${s.evi}.` });
      eviSeen.set(Number(s.evi), s.name);
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(s.name || '')) issues.push({ level: 'error', msg: `Service name “${s.name}” is not a valid network-instance name.` });
    });

    const vniSeen = new Map();
    services.forEach(s => {
      const v = Number(s.vni) || Number(s.evi);
      if (!(v >= 1 && v <= 16777215)) issues.push({ level: 'error', msg: `${s.name}: VNI must be 1–16777215.` });
      if (vniSeen.has(v)) issues.push({ level: 'error', msg: `${s.name} and ${vniSeen.get(v)} use the same VNI ${v}.` });
      vniSeen.set(v, s.name);
    });

    // Host addressing per attachment (bonds counted once)
    const hostCfg = new Map(); // host id -> {ifaces:[{dev, parent, vlan, ip, gw, svc}], bonds:[]}
    const bondDone = new Set();
    attachments.forEach(at => {
      if (!at.svc) return;
      const h = hostCfg.get(at.host.id) || { ifaces: [], bonds: [] };
      hostCfg.set(at.host.id, h);
      if (at.bond) {
        const key = at.host.id + '|' + at.bond;
        if (bondDone.has(key)) return;
        bondDone.add(key);
        h.bonds.push({ name: at.bond, members: bonds.get(key).members.map(m => m.hostPort) });
      }
      const dev = at.bond || at.hostPort;
      const plan = svcPlan.get(at.svc.id);
      let ip = null, gw = null, srlIp = null;
      if (at.svc.kind === 'mac-vrf') {
        if (plan.subnet) { plan.hostIdx++; ip = int2ip(plan.subnet.net + plan.hostIdx) + '/' + plan.subnet.len; gw = at.svc.irb ? plan.gw : null; }
      } else if (routed) {
        const net = routed.net + routedIdx * 256; routedIdx++;
        srlIp = int2ip(net + 1) + '/24'; ip = int2ip(net + 2) + '/24'; gw = int2ip(net + 1);
      }
      at.srlIp = srlIp;
      if (at.bond) bonds.get(at.host.id + '|' + at.bond).members.forEach(m => { m.srlIp = srlIp; });
      h.ifaces.push({ dev, vlan: at.vlan, ip, gw, svc: at.svc });
    });

    // IP-VRF reachability for hosts: every subnet in the same IP-VRF
    const vrfSubnets = new Map();
    services.filter(s => s.kind === 'mac-vrf' && s.irb).forEach(s => {
      const p = svcPlan.get(s.id); if (!p.subnet) return;
      const arr = vrfSubnets.get(s.irb) || []; arr.push(int2ip(p.subnet.net) + '/' + p.subnet.len); vrfSubnets.set(s.irb, arr);
    });
    attachments.filter(a => a.svc && a.svc.kind === 'ip-vrf' && a.srlIp).forEach(a => {
      const arr = vrfSubnets.get(a.svc.id) || []; const c = parseCidr(a.srlIp); arr.push(int2ip(c.net) + '/24'); vrfSubnets.set(a.svc.id, arr);
    });

    // overlay peering
    const rr = srl.filter(n => n.rr);
    const svcNodes = new Set(); svcPlan.forEach(p => p.nodes.forEach(id => svcNodes.add(id)));
    const clients = srl.filter(n => !n.rr && (svcNodes.has(n.id) || ['leaf', 'borderleaf'].includes(n.role)));
    const overlayPeers = new Map();
    if (d.overlay === 'ibgp') {
      if (rr.length) {
        clients.forEach(c => overlayPeers.set(c.id, { rrClient: false, peers: rr.map(r => r.id) }));
        rr.forEach(r => overlayPeers.set(r.id, { rrClient: true, peers: clients.map(c => c.id) }));
      } else {
        clients.forEach(c => overlayPeers.set(c.id, { rrClient: false, peers: clients.filter(x => x !== c).map(x => x.id) }));
        if (clients.length > 2) issues.push({ level: 'info', msg: 'No route reflector is set, so the EVPN overlay is a full iBGP mesh. Mark spines (or P nodes) as RR to reduce sessions.' });
      }
    }
    if (services.length && d.overlay !== 'ibgp') issues.push({ level: 'warn', msg: 'Services need the iBGP EVPN overlay to exchange routes between nodes.' });

    hosts.forEach(h => { if (!resolvedLinks.some(r => r.A === h || r.B === h)) issues.push({ level: 'info', msg: `${h.name} has no links.`, node: h.id }); });

    return { design: d, nodes, srl, hosts, byId, svcById, sys, asn, fabric, attachments, lagByNode, bonds, svcPlan, hostCfg, vrfSubnets, overlayPeers, links: resolvedLinks, issues };
  }

  // ───────────────────────── SR Linux config ─────────────────────────
  function nodeConfig(plan, node) {
    const d = plan.design;
    const L = [];
    const sec = t => { L.push('', `# ── ${t} ${'─'.repeat(Math.max(4, 60 - t.length))}`); };
    const S = s => L.push('set / ' + s);
    const sysIp = plan.sys.get(node.id);
    const h = hw(node);
    const underAsn = plan.asn.get(node.id);
    const isEbgp = d.underlay === 'ebgp' || d.underlay === 'ebgp-unnumbered';
    const unnumbered = d.underlay === 'ebgp-unnumbered';
    const ov = plan.overlayPeers.get(node.id);

    L.push(`# ${node.name} — ${h ? h.platform.name + (h.card ? ' / ' + h.card : '') : node.type} — SR Linux ${d.version}`);
    L.push('# Partial startup config (flat CLI). containerlab applies it on top of the default config and commits once.');

    sec('System');
    S(`system name host-name ${node.name}`);

    // breakouts
    const bos = Object.entries(node.breakouts || {}).filter(([, m]) => parseMode(m));
    if (bos.length) {
      sec('Breakout connectors');
      bos.forEach(([p, m]) => {
        const bo = parseMode(m);
        S(`interface ethernet-1/${p} admin-state enable`);
        S(`interface ethernet-1/${p} breakout-mode num-breakout-ports ${bo.num}`);
        S(`interface ethernet-1/${p} breakout-mode breakout-port-speed ${bo.speed}`);
      });
    }

    // fabric interfaces
    const myFabric = plan.fabric.filter(f => f.A === node || f.B === node).map(f => {
      const mine = f.A === node;
      return { port: mine ? f.pa : f.pb, ip: mine ? f.ipA : f.ipB, peer: mine ? f.B : f.A, peerPort: mine ? f.pb : f.pa, peerIp: mine ? f.ipB : f.ipA };
    });
    sec('Interfaces');
    S('interface system0 admin-state enable');
    S('interface system0 subinterface 0 admin-state enable');
    S('interface system0 subinterface 0 ipv4 admin-state enable');
    S(`interface system0 subinterface 0 ipv4 address ${sysIp}/32`);
    myFabric.forEach(f => {
      const i = `interface ${f.port}`;
      S(`${i} admin-state enable`);
      S(`${i} description ${q('to ' + f.peer.name + ' ' + f.peerPort)}`);
      S(`${i} subinterface 0 admin-state enable`);
      if (unnumbered) {
        S(`${i} subinterface 0 ipv6 admin-state enable`);
        S(`${i} subinterface 0 ipv6 router-advertisement router-role admin-state enable`);
      } else if (f.ip) {
        S(`${i} subinterface 0 ipv4 admin-state enable`);
        S(`${i} subinterface 0 ipv4 address ${f.ip}`);
      }
    });

    // access side
    const myAt = plan.attachments.filter(a => a.srl === node && a.svc);
    const myLags = plan.lagByNode.get(node.id) || [];
    // one access subinterface per (interface, vlan); bond members share it
    const subifs = new Map();
    myAt.forEach(a => {
      const ifname = a.lag || a.port;
      const sub = a.vlan || 0;
      const key = `${ifname}.${sub}`;
      a.subif = key;
      const prev = subifs.get(key);
      if (prev) {
        if (!(a.lag && prev.lag === a.lag)) plan.issues.push({ level: 'error', msg: `${node.name}: ${key} is used by two attachments; give one of them a different VLAN.`, node: node.id });
        return;
      }
      subifs.set(key, a);
    });
    if (myAt.length) {
      sec('Access interfaces');
      const portsDone = new Set();
      const lagDone = new Set();
      subifs.forEach(a => {
        const ifname = a.lag || a.port;
        if (a.lag) {
          const lag = myLags.find(l => l.name === a.lag);
          if (!lagDone.has(a.lag)) {
            lagDone.add(a.lag);
            lag.members.forEach(m => {
              S(`interface ${m} admin-state enable`);
              S(`interface ${m} description ${q('member of ' + lag.name + ' to ' + a.host.name)}`);
              S(`interface ${m} ethernet aggregate-id ${lag.name}`);
            });
            S(`interface ${lag.name} admin-state enable`);
            S(`interface ${lag.name} description ${q(a.host.name + ' ' + a.bond + (lag.es ? ' (' + lag.es.name + ')' : ''))}`);
            S(`interface ${lag.name} vlan-tagging true`);
            S(`interface ${lag.name} lag lag-type lacp`);
            S(`interface ${lag.name} lag lacp interval FAST`);
            S(`interface ${lag.name} lag lacp lacp-mode ACTIVE`);
            if (lag.es) {
              S(`interface ${lag.name} lag lacp admin-key ${lag.es.adminKey}`);
              S(`interface ${lag.name} lag lacp system-id-mac ${lag.es.sysMac}`);
              S(`interface ${lag.name} lag lacp system-priority 100`);
            }
          }
        } else if (!portsDone.has(a.port)) {
          portsDone.add(a.port);
          S(`interface ${a.port} admin-state enable`);
          S(`interface ${a.port} description ${q('to ' + a.host.name + ' ' + a.hostPort)}`);
          S(`interface ${a.port} vlan-tagging true`);
        }
        const si = `interface ${ifname} subinterface ${a.vlan || 0}`;
        S(`${si} type ${a.svc.kind === 'mac-vrf' ? 'bridged' : 'routed'}`);
        S(`${si} admin-state enable`);
        if (a.vlan) S(`${si} vlan encap single-tagged vlan-id ${a.vlan}`);
        else S(`${si} vlan encap untagged`);
        if (a.svc.kind === 'ip-vrf' && a.srlIp) {
          S(`${si} ipv4 admin-state enable`);
          S(`${si} ipv4 address ${a.srlIp}`);
        }
      });
    }
    const svcSubifs = s => [...subifs.values()].filter(a => a.svc === s).map(a => a.subif);

    // ES
    const esLags = myLags.filter(l => l.es);
    if (esLags.length) {
      sec('EVPN multihoming');
      esLags.forEach(l => {
        const es = `system network-instance protocols evpn ethernet-segments bgp-instance 1 ethernet-segment ${l.es.name}`;
        S(`${es} admin-state enable`);
        S(`${es} esi ${l.es.esi}`);
        S(`${es} multi-homing-mode all-active`);
        S(`${es} interface ${l.name}`);
      });
      S('system network-instance protocols bgp-vpn bgp-instance 1');
    }

    // default network-instance
    sec('Default network-instance');
    S('network-instance default type default');
    S('network-instance default admin-state enable');
    S(`network-instance default router-id ${sysIp}`);
    S('network-instance default interface system0.0');
    myFabric.forEach(f => S(`network-instance default interface ${f.port}.0`));
    if (unnumbered) S('network-instance default ip-forwarding receive-ipv4-check false');

    // BFD
    if (d.bfd && myFabric.length) {
      sec('BFD');
      myFabric.forEach(f => {
        S(`bfd subinterface ${f.port}.0 admin-state enable`);
        S(`bfd subinterface ${f.port}.0 desired-minimum-transmit-interval 100000`);
        S(`bfd subinterface ${f.port}.0 required-minimum-receive 100000`);
        S(`bfd subinterface ${f.port}.0 detection-multiplier 3`);
      });
    }

    // Underlay
    const ni = 'network-instance default protocols';
    if (d.underlay === 'isis') {
      sec('Underlay: IS-IS');
      const I = `${ni} isis instance default`;
      const area = d.isisArea || '49.0001';
      S(`${I} admin-state enable`);
      S(`${I} level-capability ${d.isisLevel || 'L2'}`);
      S(`${I} net [ ${area}.${isisSystemId(sysIp)}.00 ]`);
      S(`${I} ipv4-unicast admin-state enable`);
      S(`${I} interface system0.0 admin-state enable`);
      S(`${I} interface system0.0 passive true`);
      myFabric.forEach(f => {
        S(`${I} interface ${f.port}.0 admin-state enable`);
        S(`${I} interface ${f.port}.0 circuit-type point-to-point`);
        if (d.bfd) S(`${I} interface ${f.port}.0 ipv4-unicast enable-bfd true`);
      });
    } else if (d.underlay === 'ospf') {
      sec('Underlay: OSPFv2');
      const I = `${ni} ospf instance main`;
      const A = `${I} area ${d.ospfArea || '0.0.0.0'}`;
      S(`${I} admin-state enable`);
      S(`${I} version ospf-v2`);
      S(`${I} router-id ${sysIp}`);
      S(`${A} interface system0.0 admin-state enable`);
      S(`${A} interface system0.0 passive true`);
      myFabric.forEach(f => {
        S(`${A} interface ${f.port}.0 admin-state enable`);
        S(`${A} interface ${f.port}.0 interface-type point-to-point`);
        if (d.bfd) S(`${A} interface ${f.port}.0 failure-detection enable-bfd true`);
      });
    }

    // BGP
    const bgp = `${ni} bgp`;
    const needBgp = isEbgp || (d.overlay === 'ibgp' && ov && ov.peers.length);
    if (needBgp) {
      sec(isEbgp ? 'BGP: eBGP underlay' + (ov ? ' + iBGP EVPN overlay' : '') : 'BGP: iBGP EVPN overlay');
      if (isEbgp) {
        S(`routing-policy prefix-set system-loopbacks prefix ${d.loopbacks} mask-length-range 32..32`);
        S('routing-policy policy underlay-loopbacks statement 10 match prefix prefix-set system-loopbacks');
        S('routing-policy policy underlay-loopbacks statement 10 action policy-result accept');
      }
      S(`${bgp} admin-state enable`);
      S(`${bgp} autonomous-system ${isEbgp ? underAsn : d.overlayAsn}`);
      S(`${bgp} router-id ${sysIp}`);
      if (isEbgp) {
        S(`${bgp} afi-safi ipv4-unicast admin-state enable`);
        S(`${bgp} afi-safi ipv4-unicast multipath maximum-paths 64`);
        S(`${bgp} group underlay description ${q('eBGP underlay')}`);
        S(`${bgp} group underlay export-policy [ underlay-loopbacks ]`);
        S(`${bgp} group underlay import-policy [ underlay-loopbacks ]`);
        S(`${bgp} group underlay afi-safi ipv4-unicast admin-state enable`);
        if (d.bfd && !unnumbered) S(`${bgp} group underlay failure-detection enable-bfd true`);
        if (unnumbered) {
          S(`${bgp} group underlay afi-safi ipv4-unicast ipv4-unicast advertise-ipv6-next-hops true`);
          S(`${bgp} group underlay afi-safi ipv4-unicast ipv4-unicast receive-ipv6-next-hops true`);
          myFabric.forEach(f => {
            S(`${bgp} dynamic-neighbors interface ${f.port}.0 peer-group underlay`);
            S(`${bgp} dynamic-neighbors interface ${f.port}.0 allowed-peer-as [ ${plan.asn.get(f.peer.id)} ]`);
          });
        } else {
          myFabric.forEach(f => {
            if (!f.peerIp) return;
            const nb = `${bgp} neighbor ${f.peerIp.split('/')[0]}`;
            S(`${nb} peer-group underlay`);
            S(`${nb} peer-as ${plan.asn.get(f.peer.id)}`);
            S(`${nb} description ${q(f.peer.name)}`);
          });
          myFabric.forEach(f => {
            if (plan.asn.get(f.peer.id) === underAsn) plan.issues.push({ level: 'warn', msg: `${node.name} and ${f.peer.name} share AS ${underAsn} on an eBGP underlay link.`, node: node.id });
          });
        }
      }
      if (d.overlay === 'ibgp' && ov && ov.peers.length) {
        const og = `${bgp} group overlay`;
        S(`${og} description ${q('iBGP EVPN overlay')}`);
        S(`${og} peer-as ${d.overlayAsn}`);
        if (isEbgp) S(`${og} local-as as-number ${d.overlayAsn}`);
        S(`${og} transport local-address ${sysIp}`);
        S(`${og} afi-safi evpn admin-state enable`);
        S(`${og} afi-safi ipv4-unicast admin-state disable`);
        if (ov.rrClient) {
          S(`${og} route-reflector client true`);
          S(`${og} route-reflector cluster-id ${sysIp}`);
        }
        ov.peers.forEach(pid => {
          const pn = plan.byId.get(pid);
          S(`${bgp} neighbor ${plan.sys.get(pid)} peer-group overlay`);
          S(`${bgp} neighbor ${plan.sys.get(pid)} description ${q(pn.name + (ov.rrClient ? ' (RR client)' : pn.rr ? ' (RR)' : ''))}`);
        });
      }
    }

    // Services
    const mySvcs = [...plan.svcPlan.values()].filter(p => p.nodes.has(node.id));
    const macs = mySvcs.filter(p => p.svc.kind === 'mac-vrf');
    const ipvrfs = mySvcs.filter(p => p.svc.kind === 'ip-vrf');
    const rt = s => `target:${d.overlayAsn}:${s.evi}`;
    const vpn = (name, s) => {
      S(`network-instance ${name} protocols bgp-vpn bgp-instance 1 route-distinguisher rd ${sysIp}:${s.evi}`);
      S(`network-instance ${name} protocols bgp-vpn bgp-instance 1 route-target export-rt ${rt(s)}`);
      S(`network-instance ${name} protocols bgp-vpn bgp-instance 1 route-target import-rt ${rt(s)}`);
    };
    if (macs.length || ipvrfs.length) {
      sec('VXLAN tunnel interfaces');
      macs.forEach(p => {
        const vni = Number(p.svc.vni) || Number(p.svc.evi);
        S(`tunnel-interface vxlan1 vxlan-interface ${vni} type bridged`);
        S(`tunnel-interface vxlan1 vxlan-interface ${vni} ingress vni ${vni}`);
      });
      ipvrfs.forEach(p => {
        const vni = Number(p.svc.vni) || Number(p.svc.evi);
        S(`tunnel-interface vxlan1 vxlan-interface ${vni} type routed`);
        S(`tunnel-interface vxlan1 vxlan-interface ${vni} ingress vni ${vni}`);
      });
    }
    macs.forEach(p => {
      const s = p.svc, N = `network-instance ${s.name}`;
      const vni = Number(s.vni) || Number(s.evi);
      sec(`MAC-VRF ${s.name} (EVI ${s.evi}, VNI ${vni})`);
      const irbVrf = s.irb && plan.svcById.get(s.irb);
      if (irbVrf && p.gwCidr) {
        const ii = `interface irb0 subinterface ${s.evi}`;
        S('interface irb0 admin-state enable');
        S(`${ii} admin-state enable`);
        S(`${ii} description ${q('gateway ' + s.name)}`);
        S(`${ii} ipv4 admin-state enable`);
        S(`${ii} ipv4 address ${p.gwCidr} anycast-gw true`);
        S(`${ii} ipv4 address ${p.gwCidr} primary`);
        S(`${ii} ipv4 arp learn-unsolicited true`);
        S(`${ii} ipv4 arp host-route populate dynamic`);
        S(`${ii} ipv4 arp evpn advertise dynamic`);
        S(`${ii} anycast-gw virtual-router-id 1`);
      }
      S(`${N} type mac-vrf`);
      S(`${N} admin-state enable`);
      S(`${N} description ${q(s.description || 'L2 EVI ' + s.evi)}`);
      svcSubifs(s).forEach(x => S(`${N} interface ${x}`));
      if (irbVrf && p.gwCidr) S(`${N} interface irb0.${s.evi}`);
      S(`${N} vxlan-interface vxlan1.${vni}`);
      const bi = `${N} protocols bgp-evpn bgp-instance 1`;
      S(`${bi} admin-state enable`);
      S(`${bi} vxlan-interface vxlan1.${vni}`);
      S(`${bi} evi ${s.evi}`);
      S(`${bi} ecmp 4`);
      vpn(s.name, s);
    });
    ipvrfs.forEach(p => {
      const s = p.svc, N = `network-instance ${s.name}`;
      const vni = Number(s.vni) || Number(s.evi);
      sec(`IP-VRF ${s.name} (EVPN IFL, VNI ${vni})`);
      S(`${N} type ip-vrf`);
      S(`${N} admin-state enable`);
      S(`${N} description ${q(s.description || 'L3 VRF ' + s.evi)}`);
      svcSubifs(s).forEach(x => S(`${N} interface ${x}`));
      [...plan.svcPlan.values()].filter(m => m.svc.kind === 'mac-vrf' && m.svc.irb === s.id && m.nodes.has(node.id) && m.gwCidr)
        .forEach(m => S(`${N} interface irb0.${m.svc.evi}`));
      S(`${N} vxlan-interface vxlan1.${vni}`);
      const bi = `${N} protocols bgp-evpn bgp-instance 1`;
      S(`${bi} admin-state enable`);
      S(`${bi} vxlan-interface vxlan1.${vni}`);
      S(`${bi} evi ${s.evi}`);
      S(`${bi} ecmp 8`);
      vpn(s.name, s);
    });

    return L.join('\n').replace(/^\n/, '') + '\n';
  }

  // ───────────────────────── Linux hosts ─────────────────────────
  function hostExec(plan, host) {
    const cfg = plan.hostCfg.get(host.id);
    if (!cfg) return [];
    const cmds = [];
    cfg.bonds.forEach((b, i) => {
      cmds.push(`ip link add ${b.name} type bond mode 802.3ad lacp_rate fast xmit_hash_policy layer3+4`);
      cmds.push(`ip link set address 00:c1:ab:00:${(plan.hosts.indexOf(host) + 1).toString(16).padStart(2, '0')}:${(i + 1).toString(16).padStart(2, '0')} dev ${b.name}`);
      b.members.forEach(m => { cmds.push(`ip link set ${m} down`); cmds.push(`ip link set ${m} master ${b.name}`); cmds.push(`ip link set ${m} up`); });
      cmds.push(`ip link set ${b.name} up`);
    });
    cfg.ifaces.forEach(f => {
      let dev = f.dev;
      if (f.vlan) {
        cmds.push(`ip link add link ${f.dev} name ${f.dev}.${f.vlan} type vlan id ${f.vlan}`);
        dev = `${f.dev}.${f.vlan}`;
        cmds.push(`ip link set ${dev} up`);
      }
      if (f.ip) cmds.push(`ip addr add ${f.ip} dev ${dev}`);
      if (f.gw) {
        const vrf = f.svc.kind === 'mac-vrf' ? f.svc.irb : f.svc.id;
        const own = f.ip ? (() => { const c = parseCidr(f.ip); return int2ip(c.net) + '/' + c.len; })() : null;
        (plan.vrfSubnets.get(vrf) || []).filter(n => n !== own).forEach(n => cmds.push(`ip route add ${n} via ${f.gw}`));
      }
    });
    return cmds;
  }

  // ───────────────────────── containerlab topology ─────────────────────────
  function clabYaml(plan) {
    const d = plan.design;
    const img = (d.image || '').trim() || `ghcr.io/nokia/srlinux:${d.version}`;
    const L = [`name: ${d.lab}`, ''];
    const mg = parseCidr(d.mgmt);
    if (mg) L.push('mgmt:', `  network: ${d.lab}-mgmt`, `  ipv4-subnet: ${int2ip(mg.net)}/${mg.len}`, '');
    L.push('topology:', '  kinds:');
    if (plan.srl.length) {
      L.push('    nokia_srlinux:', `      image: ${img}`);
      const lic = plan.srl.some(n => PLATFORM[n.type] && PLATFORM[n.type].license === true);
      if (lic && String(d.license || '').trim()) L.push(`      license: ${d.license.trim()}  # 7250 IXR / 7730 SXR types need it`);
    }
    if (plan.hosts.length) L.push('    linux:', `      image: ${d.linuxImage || 'ghcr.io/srl-labs/network-multitool'}`);
    L.push('', '  nodes:');
    let mi = 10;
    plan.nodes.forEach(n => {
      L.push(`    ${n.name}:`);
      if (n.kind === 'srl') {
        const h = hw(n);
        L.push('      kind: nokia_srlinux', `      type: ${n.type}`);
        if (h && h.platform.modular && !h.platform.fixedCard && h.card !== h.platform.defaultCard) {
          L.push('      components:  # line card selection: containerlab newer than v0.79.0', '        - slot: 1', `          type: ${h.card}`);
        }
        L.push(`      startup-config: configs/${n.name}.cli`);
      } else {
        L.push('      kind: linux');
      }
      if (mg) L.push(`      mgmt-ipv4: ${int2ip(mg.net + (mi++))}`);
      if (n.kind === 'linux') {
        const ex = hostExec(plan, n);
        if (ex.length) { L.push('      exec:'); ex.forEach(c => L.push(`        - ${JSON.stringify(c)}`)); }
      }
    });
    const valid = plan.links;
    if (valid.length) {
      L.push('', '  links:');
      valid.forEach(r => L.push(`    - endpoints: ["${r.A.name}:${r.link.a.p}", "${r.B.name}:${r.link.b.p}"]`));
    }
    return L.join('\n') + '\n';
  }

  // ───────────────────────── README ─────────────────────────
  function readme(plan) {
    const d = plan.design;
    const L = [`# ${d.lab}`, '', 'Generated by SRL Lab Builder.', '', '## Deploy', '', '```bash',
      `sudo containerlab deploy -t ${d.lab}.clab.yml`, '```', '',
      `SR Linux image: \`${(d.image || '').trim() || 'ghcr.io/nokia/srlinux:' + d.version}\`. Log in with \`ssh admin@clab-${d.lab}-<node>\` (password \`NokiaSrl1!\`).`, ''];
    if (plan.srl.some(n => PLATFORM[n.type] && PLATFORM[n.type].license === true)) L.push(`7250 IXR / 7730 SXR types need the license file at \`${d.license}\`.`, '');
    L.push('## Nodes', '', '| Node | Type | Role | System IP | AS |', '|---|---|---|---|---|');
    plan.srl.forEach(n => { const h = hw(n); L.push(`| ${n.name} | ${h ? h.platform.name + (h.platform.modular ? ' / ' + h.card : '') : n.type} | ${n.role}${n.rr ? ' (RR)' : ''} | ${plan.sys.get(n.id)} | ${d.underlay.startsWith('ebgp') ? plan.asn.get(n.id) : d.overlayAsn} |`); });
    plan.hosts.forEach(h => { const c = plan.hostCfg.get(h.id); L.push(`| ${h.name} | linux | host | ${c ? c.ifaces.map(f => f.ip).filter(Boolean).join(', ') : '—'} | — |`); });
    L.push('', '## Check it', '');
    const cmd = [];
    if (d.underlay.startsWith('ebgp') || d.overlay === 'ibgp') cmd.push('show network-instance default protocols bgp neighbor');
    if (d.underlay === 'isis') cmd.push('show network-instance default protocols isis adjacency');
    if (d.underlay === 'ospf') cmd.push('show network-instance default protocols ospf neighbor');
    cmd.push('show network-instance default route-table ipv4-unicast summary');
    if (d.overlay === 'ibgp') cmd.push('show network-instance default protocols bgp routes evpn route-type summary');
    plan.svcPlan.forEach(p => {
      if (!p.nodes.size) return;
      if (p.svc.kind === 'mac-vrf') cmd.push(`show network-instance ${p.svc.name} bridge-table mac-table all`);
      else cmd.push(`show network-instance ${p.svc.name} route-table`);
    });
    if ([...plan.lagByNode.values()].some(l => l.some(x => x.es))) cmd.push('show system network-instance ethernet-segments');
    if (plan.lagByNode.size) cmd.push('show lag');
    L.push('```', ...cmd, '```', '');
    const pings = [];
    plan.hostCfg.forEach((c, hid) => c.ifaces.forEach(f => { if (f.ip) pings.push({ host: plan.byId.get(hid).name, ip: f.ip.split('/')[0] }); }));
    if (pings.length > 1) {
      L.push('From a host:', '', '```bash', `docker exec -it clab-${d.lab}-${pings[0].host} ping -c 3 ${pings[pings.length - 1].ip}`, '```', '');
    }
    const issues = plan.issues.filter(i => i.level !== 'info');
    if (issues.length) { L.push('## Open items', ''); issues.forEach(i => L.push(`- ${i.msg}`)); L.push(''); }
    return L.join('\n');
  }

  function generate(project) {
    const plan = resolve(project);
    const files = [];
    files.push({ name: `${plan.design.lab}.clab.yml`, kind: 'yaml', code: clabYaml(plan) });
    plan.srl.forEach(n => { if (PLATFORM[n.type]) files.push({ name: `configs/${n.name}.cli`, kind: 'cli', node: n.id, code: nodeConfig(plan, n) }); });
    files.push({ name: 'README.md', kind: 'md', code: readme(plan) });
    return { plan, files, issues: plan.issues };
  }

  // ───────────────────────── builders / presets ─────────────────────────
  let uid = 0;
  const nid = p => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

  function mkNode(name, kind, type, role, extra) {
    return Object.assign({ id: nid('n'), name, kind, type: kind === 'srl' ? type : null, card: null, role: kind === 'srl' ? role : 'host', asn: '', sys: '', rr: role === 'spine' || role === 'superspine', breakouts: {} }, extra || {});
  }
  const mkLink = (a, pa, b, pb, extra) => Object.assign({ id: nid('l'), a: { n: a.id, p: pa }, b: { n: b.id, p: pb }, svc: '', vlan: '', bond: '' }, extra || {});

  // Ports for a switch in a Clos: `up` = fabric-facing (fastest ports),
  // `down` = host-facing. When the slower ports are too few to serve hosts,
  // hosts take the fast ports from the start and uplinks from the end.
  function leafPorts(type) {
    const groups = hw({ type, card: null, breakouts: {} }).ports;
    const rank = sp => parseFloat(sp) * (/T$/.test(sp) ? 1000 : 1);
    const max = Math.max(...groups.map(g => rank(g.speed)));
    const expand = gs => gs.flatMap(g => { const r = []; for (let i = g.from; i <= g.to; i++) r.push(i); return r; });
    const fast = expand(groups.filter(g => rank(g.speed) === max));
    const slow = expand(groups.filter(g => rank(g.speed) < max));
    if (slow.length >= 8) return { up: fast, down: slow, fabricDown: fast };
    return { up: fast.slice().reverse(), down: fast, fabricDown: fast };
  }

  function buildClos(o) {
    const opt = Object.assign({ spines: 2, leaves: 4, spineType: 'ixr-d3l', leafType: 'ixr-d2l', hostsPerLeaf: 1, dualHomed: true, underlay: 'ebgp' }, o || {});
    const nodes = [], links = [];
    const spines = [], leaves = [];
    for (let i = 1; i <= opt.spines; i++) spines.push(mkNode(`spine${i}`, 'srl', opt.spineType, 'spine'));
    for (let i = 1; i <= opt.leaves; i++) leaves.push(mkNode(`leaf${i}`, 'srl', opt.leafType, 'leaf'));
    nodes.push(...spines, ...leaves);
    const lp = leafPorts(opt.leafType), spineDown = leafPorts(opt.spineType).fabricDown;
    leaves.forEach((lf, li) => spines.forEach((s, si) => {
      links.push(mkLink(lf, `ethernet-1/${lp.up[si]}`, s, `ethernet-1/${spineDown[li]}`));
    }));
    const macA = { id: nid('s'), kind: 'mac-vrf', name: 'mac-vrf-10', evi: 10, vni: 10, subnet: '172.16.10.0/24', gw: '', irb: '', extra: [], description: 'Tenant A · VLAN 10' };
    const macB = { id: nid('s'), kind: 'mac-vrf', name: 'mac-vrf-20', evi: 20, vni: 20, subnet: '172.16.20.0/24', gw: '', irb: '', extra: [], description: 'Tenant A · VLAN 20' };
    const vrf = { id: nid('s'), kind: 'ip-vrf', name: 'tenant-a', evi: 100, vni: 100, signaling: 'evpn', extra: [], description: 'Tenant A routing' };
    macA.irb = vrf.id; macB.irb = vrf.id;
    let h = 0; const hostPortIdx = new Map(leaves.map(l => [l.id, 0]));
    const nextHostPort = lf => { const i = hostPortIdx.get(lf.id); hostPortIdx.set(lf.id, i + 1); return `ethernet-1/${lp.down[i]}`; };
    let li = 0;
    if (opt.dualHomed && leaves.length >= 2) {
      const host = mkNode(`host${++h}`, 'linux'); nodes.push(host);
      links.push(mkLink(leaves[0], nextHostPort(leaves[0]), host, 'eth1', { svc: macA.id, vlan: '', bond: 'bond0' }));
      links.push(mkLink(leaves[1], nextHostPort(leaves[1]), host, 'eth2', { svc: macA.id, vlan: '', bond: 'bond0' }));
      li = 2;
    }
    leaves.forEach((lf, i) => {
      if (i < li && opt.hostsPerLeaf <= 1) return;
      const n = i < li ? opt.hostsPerLeaf - 1 : opt.hostsPerLeaf;
      for (let k = 0; k < n; k++) {
        const host = mkNode(`host${++h}`, 'linux'); nodes.push(host);
        const svc = (h % 2 === 0) ? macB : macA;
        links.push(mkLink(lf, nextHostPort(lf), host, 'eth1', { svc: svc.id }));
      }
    });
    const design = Object.assign(defaultDesign(), { lab: 'evpn-vxlan-fabric', underlay: opt.underlay });
    return { design, nodes, links, services: [macA, macB, vrf] };
  }

  function buildAiFabric() {
    const pr = buildClos({ spines: 2, leaves: 2, spineType: 'ixr-h5-64d', leafType: 'ixr-h4-32d', hostsPerLeaf: 2, dualHomed: false, underlay: 'ebgp-unnumbered' });
    pr.design.lab = 'dc-h-series';
    // border leaf on 7250 IXR-X3b
    const bl = mkNode('border1', 'srl', 'ixr-x3b', 'borderleaf');
    pr.nodes.splice(4, 0, bl);
    const spines = pr.nodes.filter(n => n.role === 'spine');
    spines.forEach((s, i) => pr.links.push(mkLink(bl, `ethernet-1/${35 + i}`, s, 'ethernet-1/64')));
    const vrf = pr.services.find(s => s.kind === 'ip-vrf');
    vrf.extra = [bl.id];
    return pr;
  }

  const SRL = {
    PLATFORMS, PLATFORM, FAMILIES, LINECARDS, ROLES, ROLE_TIER, SRL_VERSIONS, GENERIC_BREAKOUTS,
    hw, portList, portCount, portGroup, breakoutOptions, parseMode, parsePort, parsePortSpec, parseCidr, int2ip, ip2int,
    defaultDesign, normalize, resolve, generate, nodeConfig, clabYaml, readme, hostExec,
    mkNode, mkLink, buildClos, buildAiFabric, leafPorts, nid,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SRL;
  else root.SRL = SRL;
})(typeof window !== 'undefined' ? window : globalThis);
