"""pyang plugin: dump SR Linux config schema as JSON (path with keys -> info incl. enums/identities)."""
import json
from pyang import plugin, statements

def pyang_plugin_init():
    # union of all platforms: never prune nodes on if-feature
    statements.v_type_if_feature = lambda ctx, stmt, no_error_report=False: None
    plugin.register_plugin(SchemaPlugin())

class SchemaPlugin(plugin.PyangPlugin):
    def add_output_format(self, fmts):
        self.multiple_modules = True
        fmts['srlschema'] = self
    def emit(self, ctx, modules, fd):
        # identity derivation map
        derived = {}
        def all_identities():
            for m in ctx.modules.values():
                for i in m.search('identity'):
                    yield i
        for idn in all_identities():
            for b in idn.search('base'):
                bi = getattr(b, 'i_identity', None)
                if bi is not None:
                    derived.setdefault(id(bi), []).append(idn)
        def derivs(base):
            out = []; stack = [base]; seen=set()
            while stack:
                x = stack.pop()
                for d in derived.get(id(x), []):
                    if id(d) in seen: continue
                    seen.add(id(d)); out.append(d.arg); stack.append(d)
            return sorted(set(out))
        def type_info(t):
            info = {}
            if t is None: return info
            # resolve typedef chain
            name = t.arg
            cur = t
            while True:
                if cur.arg == 'enumeration':
                    info['enum'] = [e.arg for e in cur.search('enum')]; break
                if cur.arg == 'identityref':
                    vals = []
                    for b in cur.search('base'):
                        bi = getattr(b, 'i_identity', None)
                        if bi is not None: vals += derivs(bi)
                    info['ident'] = sorted(set(vals)); break
                if cur.arg == 'union':
                    subs = [type_info(s) for s in cur.search('type')]
                    en = sum([s.get('enum', []) for s in subs], [])
                    idt = sum([s.get('ident', []) for s in subs], [])
                    if en: info['enum'] = en
                    if idt: info['ident'] = idt
                    info['union'] = True; break
                td = getattr(cur, 'i_typedef', None)
                if td is None:
                    info['base'] = cur.arg; break
                cur = td.search_one('type')
                if cur is None: break
            info['t'] = name
            return info
        out = {}
        def walk(node, path):
            for ch in getattr(node, 'i_children', []):
                if ch.keyword in ('choice', 'case'):
                    walk(ch, path); continue
                if ch.keyword not in ('container', 'list', 'leaf', 'leaf-list'):
                    continue
                cfg = getattr(ch, 'i_config', True)
                if cfg is False: continue
                seg = ch.arg
                p = path + '/' + seg
                e = {'kw': ch.keyword}
                if ch.keyword == 'container' and ch.search_one('presence') is not None:
                    e['presence'] = True
                d = ch.search_one('default')
                if d is not None: e['default'] = d.arg
                if ch.keyword == 'list':
                    keys = ch.search_one('key')
                    e['keys'] = keys.arg.split() if keys is not None else []
                if ch.keyword in ('leaf', 'leaf-list'):
                    e.update(type_info(ch.search_one('type')))
                out[p] = e
                walk(ch, p)
        for m in modules:
            walk(m, '')
        json.dump(out, fd)
