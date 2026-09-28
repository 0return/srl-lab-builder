#!/usr/bin/env python3
"""Assemble the single-file app: dist/srl-lab-builder.html (artifact body)
and dist/repo/index.html (standalone page with its own document skeleton)."""
import pathlib
root = pathlib.Path(__file__).parent
css = (root / 'src/style.css').read_text()
engine = (root / 'src/engine.js').read_text()
ui = (root / 'src/ui.js').read_text()

HEAD = '''<title>SRL Lab Builder</title>
<meta name="description" content="Build Nokia SR Linux containerlab topologies for every 7215, 7220, 7250 and 7730 type and generate startup configs.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
'''
BODY = f'''<style>
{css}
</style>
<header class="top" id="top"></header>
<main class="wrap">
  <section class="pane" id="editor" aria-label="Lab editor"></section>
  <aside class="pane preview" id="preview" aria-label="Generated lab"></aside>
</main>
<script>
{engine}
</script>
<script>
{ui}
</script>
'''
(root / 'index.html').write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + HEAD + '</head>\n<body>\n' + BODY + '</body>\n</html>\n')
print('built index.html', (root / 'index.html').stat().st_size, 'bytes')
