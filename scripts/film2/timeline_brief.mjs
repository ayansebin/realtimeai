/* The 1:58 brief overview (Time series on Confluent: a brief overview, demos/overview.mp4):
   cut times from frame differencing of the source, sentence times from its burned-in captions, on-chart moments from its frames. */
export const END = 117.9;
/* the brief film walks the use cases in this order: trading before semantic search */
export const UCS = [['uc-prod', 'Production optimization'], ['uc-anom', 'Anomaly detection'], ['uc-demand', 'Supply chain planning'], ['uc-fraud', 'Fraud and security'], ['uc-trade', 'Trading'], ['uc-search', 'Semantic search']];
export const ENDCARD = { title: 'Turn time series into <em class="b">better decisions</em>.', steps: [['Try the models', 'Forecast, detect and optimize.'], ['Reach out', 'Transform your decisions with time-series intelligence.']] };
export const PRE = [`__film2.frame('#st-why',{label:'<b>01</b>From words to decisions',why:true,brand:'Real-time intelligence'});__film2.setWhy(6)`];
const NAMES = JSON.stringify(UCS.map(u => u[1]));
const nav = k => `__film2.nav(${k},${NAMES})`;
const MNAMES = JSON.stringify(['TTM','FlowState','PatchTST-FM','TSPulse']);
const mnav = k => `__film2.nav(${k},${MNAMES},'Models')`;
export const T = [
  [0.00, `__film2.cut('start')`],
  [12.30, `__film2.frame('#st-live',{label:'<b>01</b>Innovation'});__rti.hero.reset();__film2.cut('hero')`],
  [15.50, `__rti.hero.ctx()`],
  [19.10, `__rti.hero.flash('dom')`],
  [21.40, `__rti.hero.flash('dist')`],
  [24.00, `__rti.hero.anomaly()`],
  [26.70, `__rti.hero.optimize()`],
  [30.00, `__film2.tab('md-ttm');__film2.frame('#md-ttm',{brand:'Real-time intelligence',quiet:false,label:${mnav(0)}});__film2.cut('md-ttm')`],
  [43.30, `__film2.tab('md-flowstate');__film2.frame('#md-flowstate',{label:${mnav(1)}});__film2.cut('md-flowstate')`],
  [46.00, `__film2.tab('md-patchtstfm');__film2.frame('#md-patchtstfm',{label:${mnav(2)}});__film2.cut('md-patchtstfm')`],
  [48.40, `__film2.tab('md-tspulse');__film2.frame('#md-tspulse',{label:${mnav(3)}});__film2.cut('md-tspulse')`],
  [53.80, `__film2.frame('#st-arch',{brand:'Real-time intelligence',quiet:false,label:'<b>01</b>Confluent + IBM Granite'});__rti.arch.focus(0,true,1.6);__film2.cut('arch')`],
  [72.50, `__film2.release();__film2.card('gallery',true);__film2.setBrand('Real-time intelligence',true);__film2.setLabel('');__film2.cut('gallery')`],
  [78.90, `__film2.card('gallery',false);__film2.tab('uc-prod');__film2.frame('#uc-prod',{brand:'Real-time intelligence',quiet:false,label:${nav(0)}});__film2.cut('uc-prod')`],
  [82.90, `__film2.click('#pr-inject .chip[data-v="butter"]')`],
  [84.10, `__film2.tab('uc-anom');__film2.click('#an-conf .chip[data-v="99.9"]');__film2.frame('#uc-anom',{label:${nav(1)}});__film2.cut('uc-anom')`],
  [87.60, `window.__n0=+((document.querySelector('#an-flagged')||{}).textContent||0);__film2.click('#an-inject .chip[data-v="stockout"]')`],
  [89.20, `if(+((document.querySelector('#an-flagged')||{}).textContent||0)<=window.__n0)__film2.click('#an-inject .chip[data-v="stockout"]')`],
  [90.20, `__film2.tab('uc-demand');__film2.frame('#uc-demand',{label:${nav(2)}});__film2.cut('uc-demand')`],
  [95.80, `__film2.click('#dm-sl .chip[data-v="95"]')`],
  [99.00, `__film2.tab('uc-fraud');__film2.click('#fr-conf .chip[data-v="99.5"]');__film2.frame('#uc-fraud',{label:${nav(3)}});__film2.cut('uc-fraud')`],
  [99.40, `__film2.click('#fr-inject .chip[data-v="testing"]')`],
  [104.50, `__film2.tab('uc-trade');__film2.frame('#uc-trade',{label:${nav(4)}});__film2.cut('uc-trade')`],
  [107.50, `__film2.tab('uc-search');__film2.frame('#uc-search',{label:${nav(5)}});__film2.click('#se-q .chip[data-v="spike"]');__film2.cut('uc-search')`],
  [113.00, `__film2.release();__film2.card('end',true);__film2.setBrand(null);__film2.setLabel('');__film2.endStep(1);__film2.cut('end')`],
  [114.40, `__film2.endStep(2)`],
];
