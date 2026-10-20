import pathlib, re, os
d = pathlib.Path(__file__).parent
head = (d/'head.html').read_text()
css = (d/'chat.css').read_text()
pgcss = (d/'pg.css').read_text()
body = (d/'chat-body.html').read_text()
js = (d/'chat.js').read_text()
core = (d/'core.js').read_text()
mine = (d/'mine-core.js').read_text()
assert js.count('/*@CORE@*/') == 1 and js.count('/*@MINE@*/') == 1
js = js.replace('/*@CORE@*/', core.rstrip()).replace('/*@MINE@*/', mine.rstrip())
if os.environ.get('CHTEST'):
    js = js.replace("manifest().catch(()=>{});\n})();", "manifest().catch(()=>{});\nwindow.__ch={S,md,TOOLS,getDs,cardFor,attInfo,parseDesc,synth,MINE,dbg:()=>({stick,gap:gapEnd(),empty:CH.dataset.empty})};\n})();")
    assert '__ch' in js
# the playground's tile and legend rules, reused by the cards
keep = []
for m in re.finditer(r'(^|\n)(\.pg-tile[^{]*\{[^}]*\}|\.pg-legend[^{]*\{[^}]*\})', pgcss):
    keep.append(m.group(2))
css = '\n'.join(keep) + '\n' + css
T = 'Chat · Real-Time Intelligence on Confluent'
D = 'Ask about IBM Granite Time Series models and try them in a chat: forecast and find anomalies on real public and synthetic streams, or on your own data, which stays in your browser. No sign-up.'
U = 'https://realtimeintelligence.io/chat'
head = re.sub(r'<title>.*?</title>', '<title>' + T + '</title>', head, count=1)
head = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="' + D + '">', head, count=1)
head = head.replace('<link rel="canonical" href="https://realtimeintelligence.io/">', '<link rel="canonical" href="' + U + '">')
head = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="' + T + '">', head, count=1)
head = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="' + D + '">', head, count=1)
head = head.replace('<meta property="og:url" content="https://realtimeintelligence.io/">', '<meta property="og:url" content="' + U + '">')
head = re.sub(r'<meta name="twitter:title" content="[^"]*">', '<meta name="twitter:title" content="' + T + '">', head, count=1)
head = re.sub(r'<meta name="twitter:description" content="[^"]*">', '<meta name="twitter:description" content="' + D + '">', head, count=1)
head = re.sub(r'<script type="application/ld\+json">.*?</script>\n?', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"' + T + '","url":"' + U + '","description":"' + D + '"}</script>\n', head, count=1, flags=re.S)
head = head.replace('href="favicon.svg"', 'href="/favicon.svg"')
assert head.count('</style>') == 1
head = head.replace('</style>', css + '</style>')
html = head + body + '<script>\n' + js + '\n</script>\n</body>\n</html>\n'
out = d/('chat.test.html' if os.environ.get('CHTEST') else 'chat.html')
out.write_text(html)
print(out, len(html.encode()))
