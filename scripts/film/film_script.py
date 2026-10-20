"""Build the film's own demo script (film_script.js) from the film narration manifest.
The film leaves out the case studies, spends longer on Confluent + IBM Granite and on the closing call to action,
and starts each line after a short pause so the new chart is on screen before the voice.
Timing: dur is the clip length, and leading spaces in `say` and in the first caption shift the in-line cues past that pause.
usage: python3 film_script.py <film narration manifest.json> <out film_script.js>"""
import json, re, sys

man = {l['n']: l for l in json.load(open(sys.argv[1]))['lines']}
UCF = "'#usecases > .wrap > .chapter-head:first-child,#uctabs,#usecases .ucpanel'"
STEPS = [
  dict(n=1, act=0, extra="focus:'.hero-head,#st-live',scroll:'top',",
       subs=['<em>Time series intelligence</em> meets <em>real-time context</em>.', 'Foundation models transformed how enterprises', 'unlock value from <em>unstructured data</em>,', 'with <em>LLMs, chatbots and agents</em>.', 'The bigger prize is <em>time series and streaming data</em>,', 'where the <em>mission-critical decisions</em> live,', 'from <em>production</em> and <em>demand planning</em> to <em>anomaly detection</em>.', 'IBM Granite Time Series models now run <em>live inside Confluent</em>,', '<em>pretrained to scale</em> across plants, stores, SKUs and customers,', '<em>efficient</em> on standard CPUs,', 'and <em>learning</em> as each event lands.'],
       run="async(w,at)=>{const H=App.hero;if(!H)return;H.reset();await at('live inside');scrollTo('#st-live');await at('pretrained');H.flash('dom');await at('efficient');H.flash('dist');await at('and learning');H.flash('inter');}"),
  dict(n=2, act=0, extra="focus:'.hero-head,#st-live',scroll:'#st-live',",
       subs=['Take <em>one store</em> on a hot day.', 'The forecast reads the heat wave', 'and <em>sees the stockout coming</em>,', 'so the empty shelf is <em>flagged in seconds</em>,'],
       run="async(w,at)=>{await at('reads the heat wave');if(App.hero)App.hero.ctx();await at('so the empty shelf');if(App.hero)App.hero.anomaly();}"),
  dict(n=3, act=0, extra="focus:'.hero-head,#st-live',",
       subs=['and the <em>next order is optimized</em> to keep it full,', '<em>while the decision still matters</em>.'],
       run="async(w,at)=>{await at('and the next');if(App.hero)App.hero.optimize();}"),
  dict(n=4, act=0, extra="focus:'#h-arch,#st-arch',",
       subs=['That works because the intelligence', '<em>lives where the data already flows</em>.', 'When store sales stall, the event lands', 'in a <em>governed Confluent topic</em>,', 'joins the <em>live weather stream</em>,', 'and Granite forecasts it <em>inside Flink</em>.', 'The shelf check goes out <em>in under a second</em>,', 'while the usual way copies, trains', 'and scores in a nightly batch,', 'and is <em>still a day behind</em>.'],
       run="async(w,at)=>{const A=App.arch;if(!A)return;const v=n=>{A.hi('v'+n);hi('#ax-vals [data-v=\"'+n+'\"]');};A.focus(0,true,8);await at('lives where');v(3);await at('When store sales');A.focus(0,true,3.0);await at('governed');A.hi('cf');v(1);await at('weather');v(2);await at('Granite forecasts');v(5);await at('The shelf check');A.hi('out');v(4);await at('while the usual way');v(6);}"),
  dict(n=5, act=1, extra="focus:'#value > .wrap > .chapter-head:first-child,#st-three',scroll:'#st-three',pre:()=>click('#th-replay'),",
       subs=['So your teams ship a forecast in <em>one step instead of six</em>,', 'get <em>thirty-two percent less error</em> than a seasonal baseline,', 'and <em>stop waiting</em> on nightly scoring runs.'],
       run="async w=>{}"),
  dict(n=6, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-prod'),",
       subs=['Time series models <em>optimize mission-critical decisions</em>', 'as each event lands.', 'On a chocolate line, <em>temper is forecast on every reading</em>,', 'so setpoints adjust before a new cocoa butter lot', '<em>turns into rework</em>.'],
       run="async(w,at)=>{hi('#uctabs [role=tab]');await at('On a chocolate');click('#pr-inject .chip[data-v=\"butter\"]');}"),
  dict(n=7, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-anom'),",
       subs=['Across thousands of signals,', 'each series gets <em>its own expected band</em>,', 'so weekend peaks pass', 'and <em>only the real breaks are flagged</em>.'],
       run="async(w,at)=>{await at('so weekend');click('#an-inject .chip[data-v=\"stockout\"]');}"),
  dict(n=8, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-demand'),",
       subs=['In retail, one model forecasts <em>every SKU in every store</em>', 'and reorders at <em>the service level you choose</em>.'],
       run="async(w,at)=>{await at('and reorders');click('#dm-sl .chip[data-v=\"95\"]');}"),
  dict(n=9, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-fraud'),",
       subs=['In payments, each card is scored <em>against its own normal</em>', 'before authorization,', 'so <em>card testing is held</em>', 'and travelers get through.'],
       run="async(w,at)=>{await at('before authorization');click('#fr-inject .chip[data-v=\"testing\"]');}"),
  dict(n=10, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-search'),",
       subs=['Years of history become <em>searchable by shape</em>,', 'so one sketch finds every signal that looked like this.'],
       run="async(w,at)=>{await at('so one sketch');click('#se-q .chip[data-v=\"spike\"]');}"),
  dict(n=11, act=2, extra="focus:" + UCF + ",pre:()=>show('uctabs','uc-trade'),",
       subs=['On the trading desk, a volume forecast with <em>a probability band</em>', '<em>paces large orders</em> to the market.'],
       run="async(w,at)=>{await at('paces');click('#tr-inject .chip[data-v=\"news\"]');}"),
  dict(n=13, act=3, extra="focus:'.contact',",
       subs=['Try the models <em>in the playground</em>.', 'Sign up for early access <em>on Confluent Cloud</em>.', 'Then bring us <em>a stream and a decision</em>,', 'and we will <em>co-innovate with you</em>', 'to bring real-time intelligence to your enterprise.'],
       run="async w=>{}"),
]
vis = lambda h: re.sub(r'<[^>]+>', '', h)
js = lambda s: s.replace('\\', '\\\\').replace("'", "\\'")
out = []
for st in STEPS:
    l = man[st['n']]; D, L = l['dur'], l['lead']; V = max(0.5, D - L)
    say = l['text'].replace('I B M', 'IBM')
    padS = int(round(L * len(say) / V)); tot = sum(len(vis(x)) for x in st['subs']); padC = int(round(L * tot / V))
    subs = [' ' * padC + st['subs'][0]] + st['subs'][1:]
    out.append("    {n:%d,act:%d,%sdur:%d,\n      say:'%s',\n      subs:[%s],\n      run:%s}" % (
        st['n'], st['act'], st['extra'], int(round(D * 1000)) - 60, js(' ' * padS + say), ','.join("'" + js(x) + "'" for x in subs), st['run']))
open(sys.argv[2], 'w').write('  const SCRIPT=[\n' + ',\n'.join(out) + '\n  ];')
print('steps', len(out), 'voice', round(sum(man[s['n']]['dur'] for s in STEPS), 2), 's')
