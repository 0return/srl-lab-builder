# SRL Lab Builder

Design Nokia SR Linux labs for containerlab in the browser: pick the hardware for every node,
wire the links, define EVPN services, and download a ready-to-deploy lab
(`<lab>.clab.yml`, `configs/<node>.cli`, `README.md`, `project.json`).

**Open the app:** https://0return.github.io/srl-lab-builder/

No backend, no account, no API keys. Everything is generated in your browser and your design
stays in your browser's local storage.

<div align=center>

[![Run the example lab in Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/0return/srl-lab-builder?quickstart=1)

Run the example EVPN-VXLAN lab in GitHub Codespaces (free tier, 4 vCPU · 16 GB).

</div>

## Hardware coverage

Every `nokia_srlinux` type containerlab accepts, with port layout and breakout rules:

| Family | Types |
|---|---|
| 7215 IXS | `ixs-a1` |
| 7220 IXR-D | `ixr-d1` `ixr-d2` `ixr-d2l` `ixr-d3` `ixr-d3l` `ixr-d4` `ixr-d5` |
| 7220 IXR-H | `ixr-h2` `ixr-h3` `ixr-h4` `ixr-h4-32d` `ixr-h5-32d` `ixr-h5-64d` `ixr-h5-64o` `ixr-h6` |
| 7250 IXR-X | `ixr-x1b` `ixr-x3b` `ixr-x4` |
| 7250 IXR-e | `ixr-6e` `ixr-10e` `ixr-18e` + line card (`components`, containerlab newer than v0.79.0) |
| 7250 IXR gen1 | `ixr-6` `ixr-10` |
| 7730 SXR | `sxr-1d-32d` `sxr-1-32d` `sxr-1x-44s` |

Sources: containerlab `nodes/srl` (types, modular line cards), SR Linux Product Overview
"Hardware overview" (port counts) and Interfaces Guide "Breakout ports" (modes per port).
Hardware missing from the breakout table (IMM3 cards, IXR-X4, IXR-H6, SXR-1-32D) is flagged as unverified in the UI.

7220 IXR and 7215 IXS types run without a license (datapath limited to 1000 pps).
7250 IXR and 7730 SXR types need an SR Linux license file.

## What gets generated

- Underlay: eBGP (numbered /31 or /30), eBGP unnumbered (IPv6 link-local + RFC 8950), IS-IS, OSPFv2, optional BFD
- Overlay: iBGP EVPN with route reflectors (or full mesh), `local-as` on top of per-node underlay ASNs
- Services: MAC-VRF, IP-VRF (EVPN IFL), IRB anycast gateway (symmetric IRB), all-active ESI LAGs from host bonds
- MPLS (7250 / 7730): LDP and/or SR-MPLS (IS-IS node SIDs), EVPN-MPLS MAC-VRF / IP-VRF, IP-VPN (VPN-IPv4)
- Linux hosts: addresses, VLAN sub-interfaces, LACP bonds and routes through containerlab `exec`

## Run a generated lab

You need a Linux host with Docker and containerlab (a laptop VM, OrbStack on a Mac, a lab server)
or a GitHub Codespace.

```bash
unzip my-lab.zip && cd my-lab
sudo containerlab deploy -t my-lab.clab.yml
ssh admin@clab-my-lab-leaf1          # password NokiaSrl1!
sudo containerlab destroy -t my-lab.clab.yml --cleanup
```

The example in [`examples/evpn-vxlan-fabric`](examples/evpn-vxlan-fabric) (2 × IXR-D3L spines, 4 × IXR-D2L leaves,
3 hosts, one on an all-active ESI LAG) deploys as-is:

```bash
cd examples/evpn-vxlan-fabric
sudo containerlab deploy -t evpn-vxlan-fabric.clab.yml
```

## Validation

`tools/validate.py` checks every `set / ...` line against a schema extracted from the official
SR Linux YANG models ([nokia/srlinux-yang-models](https://github.com/nokia/srlinux-yang-models)) by the
`tools/srlschema.py` pyang plugin. The GitHub Actions workflow in `.github/workflows/validate.yml`
runs it for SR Linux 24.10, 25.10 and 26.7 on every push.

Schema validation covers paths, list keys, enums and identities. It does not evaluate YANG
`must` / `when` expressions, so deploy a lab before relying on a new feature.

## Develop

```bash
python3 build.py        # rebuild index.html from src/
npm run start           # http://localhost:3000
```

`index.html` is committed and self-contained, so GitHub Pages (or Vercel) serves it with no build step.

## License

MIT
