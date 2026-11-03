"""Build the film's own demo script (film_script.js) from the film narration manifest.
The film leaves out the case studies, opens on the "from words to decisions" chart and ends on the call to action.
Timing: the page times captions by their length and on-screen actions by where their phrase sits in `say`,
both against the clip length. So captions and `say` are padded with spaces until characters run at one steady
rate (R per second) through the clip, using the sentence timings genfilm.py wrote: every caption and action
lands on its word, pauses included.
usage: python3 film_script.py <film narration manifest.json> <out film_script.js>"""
import json, re, sys

man = {l['n']: l for l in json.load(open(sys.argv[1]))['lines']}
R = 40.0
UCF = "'#usecases > .wrap > .chapter-head:first-child,#uctabs,#usecases .ucpanel'"
STEPS = [
  dict(n=1, act=0, extra="focus:'#st-why',scroll:'top',",
       subs=['Ask your clients', 'what <em>language models</em> do for them.', "You'll hear <em>chatbots, copilots and agents</em>.", 'Now ask where their <em>money is made or lost</em>.', 'Sales every minute.', 'Payments every second.', 'Readings from every machine.', '<em>IBM Granite Time Series</em> models are built for exactly that data.', "They forecast what's next, catch what doesn't fit,", 'and turn both into <em>a decision</em>.', "That's <em>the bigger prize</em>, and it's in every account you cover."],
       run="async w=>{}"),
  dict(n=2, act=0, extra="focus:'.hero-head,#st-live',scroll:'#st-live',",
       subs=["Here's <em>one model</em> reading <em>six businesses</em> at once:", 'stores, payments, plants, deliveries,', "a checkout service and a building's energy.", 'It was <em>never trained</em> on any of them.', 'It forecasts each one from its own recent history,', '<em>in milliseconds</em>, on standard servers.', 'Then a <em>heat wave</em> bends three forecasts at once.', 'Every event is <em>checked as it arrives</em>:', 'an empty shelf, card testing,', 'a missed delivery, a slow checkout.'],
       run="async(w,at)=>{const H=App.hero;if(!H)return;H.reset();await at('never trained');H.flash('dom');await at('from its own recent history');H.flash('inter');await at('in milliseconds');H.flash('dist');await at('Then a heat wave');H.ctx();await at('Every event is checked');H.anomaly();}"),
  dict(n=3, act=0, extra="focus:'.hero-head,#st-live',",
       subs=['Each becomes <em>a decision</em> before the risk lands.'],
       run="async(w,at)=>{await at('Each becomes');if(App.hero)App.hero.optimize();}"),
  dict(n=4, act=0, extra="focus:'#h-arch,#st-arch',",
       subs=['It all runs <em>inside Confluent</em>, now part of IBM.', 'Store one twelve goes quiet for twenty minutes.', 'The event joins the <em>live weather</em>,', 'and Granite forecasts it <em>inside Flink</em>.', 'A shelf check goes out <em>in under a second</em>.', 'The usual way copies the data out', 'and finds it <em>tomorrow</em>.'],
       run="async(w,at)=>{const A=App.arch;if(!A)return;const v=n=>{A.hi('v'+n);hi('#ax-vals [data-v=\"'+n+'\"]');};A.focus(0,true,8);await at('inside Confluent');v(3);await at('Store one twelve');A.focus(0,true,3.0);await at('The event joins');A.hi('cf');v(1);await at('live weather');v(2);await at('Granite forecasts');v(5);await at('A shelf check');A.hi('out');v(4);await at('The usual way');v(6);}"),
  dict(n=5, act=1, extra="focus:'#value > .wrap > .chapter-head:first-child,#st-three',scroll:'#st-three',pre:()=>click('#th-replay'),",
       subs=['For your client, <em>three things change</em>.', 'Data teams replace <em>hundreds of custom models</em> with one.', 'Planners get forecasts <em>on day one</em>,', 'and they update with every event.', 'And operations act <em>in seconds</em>, instead of the next morning.'],
       run="async(w,at)=>{const card=k=>{$$('#st-three .v4c.tour-hi').forEach(e=>e.classList.remove('tour-hi'));hi('#st-three .v4c[data-k=\"'+k+'\"]');};card('prod');await at('Planners get');card('acc');await at('And operations');card('resp');}"),
  dict(n=6, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-prod'),",
       subs=['Take a chocolate line,', 'where <em>quality is forecast</em> on every reading.', 'New cocoa butter arrives,', 'and the forecast slips below spec <em>before any bar does</em>.', 'The operator approves new settings, and <em>rework drops</em>.'],
       run="async(w,at)=>{hi('#uctabs [role=tab]');await at('New cocoa butter');click('#pr-inject .chip[data-v=\"butter\"]');}"),
  dict(n=7, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-anom'),",
       subs=['Every store gets <em>its own expected range</em>.', 'Weekend peaks pass quietly.', 'A real break, like this stockout,', 'gets <em>flagged with the next step</em>.'],
       run="async(w,at)=>{await at('Weekend peaks');click('#an-inject .chip[data-v=\"stockout\"]');}"),
  dict(n=8, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-demand'),",
       subs=['Back at store one twelve, every product', 'gets a <em>fresh forecast every hour</em>.', 'Pick the service level, and <em>the purchase order follows</em>.'],
       run="async(w,at)=>{await at('Pick the service');click('#dm-sl .chip[data-v=\"95\"]');}"),
  dict(n=9, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-fraud'),",
       subs=['For the fraud team, every card has <em>its own normal</em>.', 'One dollar test charges are <em>declined</em>,', 'and travelers still get through.'],
       run="async(w,at)=>{await at('its own normal');click('#fr-inject .chip[data-v=\"testing\"]');}"),
  dict(n=10, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-search'),",
       subs=['Engineers can search years of history <em>by shape</em>,', 'and find every machine that spiked and recovered the same way.'],
       run="async(w,at)=>{await at('by shape');click('#se-q .chip[data-v=\"spike\"]');}"),
  dict(n=11, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-trade'),",
       subs=['And on a trading desk, a big order follows the volume forecast,', '<em>slice by slice</em>.', 'A news burst, and <em>it pauses</em>.'],
       run="async(w,at)=>{await at('slice by slice');click('#tr-inject .chip[data-v=\"news\"]');}"),
  dict(n=13, act=3, extra="focus:'.contact',",
       subs=['The models are <em>open source</em>,', 'with over <em>forty million downloads</em>,', 'and run on <em>Confluent Cloud</em>.', 'Find one decision your client makes <em>too late</em>.', "<em>We'll build the rest with you</em>.", 'Bring us <em>a stream and a decision</em>.'],
       run="async w=>{}"),
]
vis = lambda h: re.sub(r'<[^>]+>', '', h)
js = lambda s: s.replace('\\', '\\\\').replace("'", "\\'")

def clock(l):
    """Time in the clip for any character offset of the line text, from the sentence timings."""
    text = l['text']; marks = []; o = 0
    for sg in l['segs']:
        k = text.index(sg['text'], o); marks.append((k, len(sg['text']), sg['start'], sg['end'])); o = k + len(sg['text'])
    def t(off):
        for k, c, a, b in marks:
            if off < k: return a                              # in the space before a sentence: its start
            if off <= k + c: return a + (off - k) / c * (b - a)
        return marks[-1][3]
    return t

out = []; report = []
for st in STEPS:
    l = man[st['n']]; D = (int(round(l['dur'] * 1000)) - 60) / 1000; t = clock(l); text = l['text']
    # say: each comma-sized piece starts where its first word is spoken
    say = ''; o = 0
    for piece in re.split(r'(?<=[,:;.!?])\s+', text):
        k = text.index(piece, o); o = k + len(piece)
        say += ' ' * max(0, int(round(R * t(k))) - len(say)) + piece
    say += ' ' * max(0, int(round(R * D)) - len(say))
    # captions: each one shows when its first word is spoken
    starts = []; o = 0
    for h in st['subs']:
        v = vis(h); k = text.index(v, o); o = k + len(v); starts.append(0.0 if not starts else t(k))
    assert o == len(text), ('captions do not cover the line', st['n'], text[o:])
    ends = starts[1:] + [D]; subs = []; tot = 0
    for h, a, b in zip(st['subs'], starts, ends):
        n = max(len(vis(h)), int(round(R * b)) - tot) if b < D else max(len(vis(h)), int(round(R * D)) - tot)
        subs.append(h + ' ' * (n - len(vis(h)))); tot += n
    for p in re.findall(r"at\('([^']+)'\)", st['run']):
        k = say.find(p); assert k >= 0, ('anchor not in say', st['n'], p)
        report.append(f"  {st['n']:2d} {p!r:32s} at {k / len(say) * D:5.2f}s (spoken {t(text.index(p)):5.2f}s)")
    out.append("    {n:%d,act:%d,%sdur:%d,\n      say:'%s',\n      subs:[%s],\n      run:%s}" % (
        st['n'], st['act'], st['extra'], int(round(D * 1000)), js(say), ','.join("'" + js(x) + "'" for x in subs), st['run']))
open(sys.argv[2], 'w').write('  const SCRIPT=[\n' + ',\n'.join(out) + '\n  ];')
print('\n'.join(report))
print('steps', len(out), 'voice', round(sum(man[s['n']]['dur'] for s in STEPS), 2), 's')
