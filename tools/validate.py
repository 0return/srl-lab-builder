#!/usr/bin/env python3
"""Validate SR Linux flat CLI ("set / ...") lines against a pyang-derived schema.

Usage: validate.py schema.json file.cli [file.cli ...]
Checks every path segment, list keys, enum/identity values, booleans,
leaf-list syntax and empty-type leaves. Prints errors; exit 1 on any.
"""
import json, re, shlex, sys

def load(path):
    s = json.load(open(path))
    children = {}
    for p in s:
        parent, _, name = p.rpartition('/')
        children.setdefault(parent, set()).add(name)
    return s, children

def tokenize(line):
    lex = shlex.shlex(line, posix=True)
    lex.whitespace_split = True
    lex.commenters = ''
    return list(lex)

INT_T = re.compile(r'^(u?int(8|16|32|64))$')

def check_value(info, val):
    enum = info.get('enum'); ident = info.get('ident')
    union = info.get('union')
    base = info.get('base', '')
    if enum and not union and not ident:
        return val in enum, f"expected one of {enum}"
    if ident and not union and not enum:
        v = val.split(':')[-1]
        return v in ident, f"expected identity in {ident[:20]}"
    if base == 'boolean':
        return val in ('true', 'false'), "expected true/false"
    if INT_T.match(base or ''):
        return re.fullmatch(r'-?\d+', val) is not None, "expected integer"
    return True, ''

def validate_line(schema, children, line):
    toks = tokenize(line)
    if toks[:2] != ['set', '/']:
        return ["line must start with 'set /'"]
    toks = toks[2:]
    cur = ''
    i = 0
    errs = []
    while i < len(toks):
        name = toks[i]
        p = cur + '/' + name
        info = schema.get(p)
        if info is None:
            opts = sorted(children.get(cur, []))
            return [f"unknown node '{name}' under '{cur or '/'}' (children: {', '.join(opts[:25])}{'…' if len(opts) > 25 else ''})"]
        kw = info['kw']
        i += 1
        if kw == 'container':
            cur = p
            continue
        if kw == 'list':
            for ki, k in enumerate(info.get('keys', [])):
                if ki > 0:
                    # SR Linux CLI: keys after the first are given as "<key-name> <value>"
                    if i >= len(toks) or toks[i] != k:
                        return [f"list '{name}' expects named key '{k}'"]
                    i += 1
                if i >= len(toks):
                    return [f"list '{name}' missing key '{k}'"]
                kinfo = schema.get(p + '/' + k, {})
                ok, why = check_value(kinfo, toks[i])
                if not ok:
                    errs.append(f"key {k}='{toks[i]}' invalid: {why}")
                i += 1
            cur = p
            continue
        if kw == 'leaf':
            if info.get('base') == 'empty' or info.get('t') == 'empty':
                continue
            if i >= len(toks):
                return [f"leaf '{name}' needs a value"]
            ok, why = check_value(info, toks[i])
            if not ok:
                errs.append(f"leaf {name}='{toks[i]}' invalid: {why}")
            i += 1
            continue
        if kw == 'leaf-list':
            if i >= len(toks):
                return [f"leaf-list '{name}' needs values"]
            vals = []
            if toks[i] == '[':
                i += 1
                while i < len(toks) and toks[i] != ']':
                    vals.append(toks[i]); i += 1
                if i >= len(toks):
                    return [f"leaf-list '{name}' missing ']'"]
                i += 1
            else:
                vals.append(toks[i]); i += 1
            for v in vals:
                ok, why = check_value(info, v)
                if not ok:
                    errs.append(f"leaf-list {name} value '{v}' invalid: {why}")
            continue
    return errs

def main():
    schema, children = load(sys.argv[1])
    bad = 0; total = 0
    for f in sys.argv[2:]:
        for ln, line in enumerate(open(f), 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            total += 1
            errs = validate_line(schema, children, line)
            for e in errs:
                bad += 1
                print(f"{f}:{ln}: {e}\n    {line}")
    print(f"checked {total} lines, {bad} errors")
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
