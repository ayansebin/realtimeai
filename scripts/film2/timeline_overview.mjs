/* The 3:15 overview film (Time Series FMs on Confluent Overview): cut times, sentence times and on-chart moments taken from the source film. */
export const END = 195.4;
export const UCS = [['uc-prod', 'Production optimization'], ['uc-anom', 'Anomaly detection'], ['uc-demand', 'Supply chain planning'], ['uc-fraud', 'Fraud and security'], ['uc-search', 'Semantic search'], ['uc-trade', 'Trading']];
export const ENDCARD = null;
export const PRE = [`__film2.frame('#st-why',{label:'<b>01</b>From words to decisions',why:true,brand:'Real-time intelligence'});__film2.setWhy(6)`];
const nav = k => `__film2.nav(${k})`;
const MNAMES = JSON.stringify(['TTM','FlowState','PatchTST-FM','TSPulse']);
const mnav = k => `__film2.nav(${k},${MNAMES},'Models')`;
export const T = [
  [0.00, `__film2.cut('start')`],
  [16.30, `__film2.frame('#st-live',{label:'<b>01</b>Innovation'});__rti.hero.reset();__film2.cut('hero')`],
  [20.43, `__rti.hero.ctx()`],
  [25.90, `__rti.hero.anomaly()`],
  [28.40, `__rti.hero.optimize()`],
  [30.51, `__rti.hero.flash('dom')`],
  [33.40, `__rti.hero.flash('dist')`],
  [36.00, `__film2.card('models',true);__film2.tabsNeutral(true);__film2.frame('#mdtabs',{top:236,width:1200,flat:true,brand:'Real-time intelligence',quiet:true,label:''});__film2.cut('models')`],
  [49.73, `__film2.card('models',false);__film2.tabsNeutral(false);__film2.tab('md-ttm');__film2.frame('#md-ttm',{brand:'Real-time intelligence',quiet:false,label:${mnav(0)}});__film2.cut('md-ttm')`],
  [56.40, `__film2.tab('md-flowstate');__film2.frame('#md-flowstate',{label:${mnav(1)}});__film2.cut('md-flowstate')`],
  [63.13, `__film2.tab('md-patchtstfm');__film2.frame('#md-patchtstfm',{label:${mnav(2)}});__film2.cut('md-patchtstfm')`],
  [70.37, `__film2.tab('md-tspulse');__film2.frame('#md-tspulse',{label:${mnav(3)}});__film2.cut('md-tspulse')`],
  [77.77, `__film2.frame('#st-arch',{brand:'Real-time intelligence',quiet:false,label:'<b>01</b>Confluent + IBM Granite'});__rti.arch.focus(0,true,2.0);__film2.cut('arch')`],
  [100.87, `__film2.frame('#st-three',{label:'<b>02</b>Productivity, accuracy and responsiveness'});__film2.click('#th-replay');__film2.hiCard('prod');__film2.cut('three')`],
  [105.42, `__film2.hiCard('acc')`],
  [110.80, `__film2.hiCard('resp')`],
  [116.97, `__film2.tab('uc-prod');__film2.frame('#uc-prod',{label:${nav(0)}});__film2.cut('uc-prod')`],
  [122.63, `__film2.click('#pr-inject .chip[data-v="butter"]')`],
  [129.67, `__film2.tab('uc-anom');__film2.click('#an-conf .chip[data-v="99.9"]');__film2.frame('#uc-anom',{label:${nav(1)}});__film2.cut('uc-anom')`],
  [137.64, `window.__n0=+((document.querySelector('#an-flagged')||{}).textContent||0);__film2.click('#an-inject .chip[data-v="stockout"]')`],
  [139.30, `if(+((document.querySelector('#an-flagged')||{}).textContent||0)<=window.__n0)__film2.click('#an-inject .chip[data-v="stockout"]')`],
  [139.97, `__film2.tab('uc-demand');__film2.frame('#uc-demand',{label:${nav(2)}});__film2.cut('uc-demand')`],
  [149.47, `__film2.click('#dm-sl .chip[data-v="95"]')`],
  [151.77, `__film2.tab('uc-fraud');__film2.click('#fr-conf .chip[data-v="99.5"]');__film2.frame('#uc-fraud',{label:${nav(3)}});__film2.cut('uc-fraud')`],
  [157.59, `__film2.click('#fr-inject .chip[data-v="testing"]')`],
  [163.47, `__film2.tab('uc-search');__film2.frame('#uc-search',{label:${nav(4)}});__film2.click('#se-q .chip[data-v="spike"]');__film2.cut('uc-search')`],
  [170.60, `__film2.tab('uc-trade');__film2.frame('#uc-trade',{label:${nav(5)}});__film2.cut('uc-trade')`],
  [177.20, `__film2.click('#tr-inject .chip[data-v="news"]')`],
  [181.80, `__film2.release();__film2.card('gallery',true);__film2.setBrand('Real-time intelligence',true);__film2.setLabel('');__film2.cut('gallery')`],
  [188.10, `__film2.card('end',true);__film2.setBrand(null);__film2.cut('end')`],
  [188.27, `__film2.endStep(1)`],
  [190.17, `__film2.endStep(2)`],
];

