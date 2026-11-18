export const MARKET = 'us-2-123';
export const API = 'https://auctionhouse.tk.gg/api';
export const DEFAULT_PROFILE = {
  id: 'main', name: 'Main Hunter', race: 'Dwarf', className: 'Hunter', level: 40,
  professions: [{ name: 'Mining', skill: 191 }, { name: 'Engineering', skill: 225 }]
};
export const DEFAULT_SETTINGS = { budget: 10, position: 1, fee: 5, reserve: 5, margin: 15, verified: false };
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const median = a => { const s = a.slice().sort((x,y)=>x-y); const n=s.length; return n ? (s[Math.floor((n-1)/2)]+s[Math.floor(n/2)])/2 : null; };

export function normalizeMarket(raw) {
  if (!raw || raw.house?.key !== MARKET || raw.house?.faction !== 'alliance' || raw.house?.region !== 'us' || !positive(raw.t) || !Array.isArray(raw.f) || !Array.isArray(raw.items)) throw new Error('Unexpected market response. No report generated.');
  for (const field of ['ask','ask2','listed','depth5','vol24','value24','sure24','flowHours','lastSoldT','lastSoldP']) {
    if (!raw.f.includes(field)) throw new Error(`Data source is missing ${field}.`);
  }
  return { timestamp: raw.t, house: raw.house, items: raw.items.filter(i=>Number.isInteger(i.id)&&Array.isArray(i.o)).map(i=>({ ...i, stats: Object.fromEntries(raw.f.map((f,n)=>[f,i.o[n] ?? null])) })) };
}

// A material watchlist, deliberately separate from recipe eligibility.
export function professionMatch(item, profile) {
  const labels=[]; const sub=(item.sub||'').toLowerCase(); const cls=(item.cls||'').toLowerCase();
  for (const p of profile.professions || []) {
    if (!positive(p.skill)) continue;
    if (p.name==='Mining' && /metal|stone|ore/.test(sub)) labels.push(`Mining ${p.skill}`);
    if (p.name==='Engineering' && (/engineering/.test(cls+' '+sub) || /metal|stone|ore/.test(sub))) labels.push(`Engineering ${p.skill}`);
    if (p.name==='Herbalism' && /herb/.test(sub)) labels.push(`Herbalism ${p.skill}`);
    if (p.name==='Alchemy' && /herb|potion|elixir/.test(sub)) labels.push(`Alchemy ${p.skill}`);
    if (p.name==='Skinning' && /leather/.test(sub)) labels.push(`Skinning ${p.skill}`);
    if (p.name==='Leatherworking' && /leather/.test(sub)) labels.push(`Leatherworking ${p.skill}`);
    if (p.name==='Blacksmithing' && /metal|stone|ore/.test(sub)) labels.push(`Blacksmithing ${p.skill}`);
    if (p.name==='Tailoring' && /cloth/.test(sub)) labels.push(`Tailoring ${p.skill}`);
    if (p.name==='Enchanting' && /enchant/.test(sub)) labels.push(`Enchanting ${p.skill}`);
    if (p.name==='Cooking' && /cooking|food/.test(sub)) labels.push(`Cooking ${p.skill}`);
  }
  return labels;
}

export function analyze(market, settings=DEFAULT_SETTINGS, now=Date.now()) {
  const age=now-market.timestamp;
  const stale=age>2*3600000 || age < -5*60000;
  const fee=Number(settings.fee)/100, reserve=Number(settings.reserve)/100;
  const budget=Math.floor(Number(settings.budget)*10000), cap=Math.floor(Number(settings.position)*10000);
  if (![fee,reserve,budget,cap,Number(settings.margin)].every(Number.isFinite) || fee<0 || reserve<0 || fee+reserve>=1 || budget<0 || cap<0) throw new Error('Invalid risk settings.');
  const opportunities=[], watch=[], vendors=[];
  for (const item of market.items) {
    const s=item.stats; if (!positive(s.ask)) continue;
    if (positive(item.sell) && item.sell>s.ask) vendors.push({item, buy:s.ask, sell:item.sell, profit:item.sell-s.ask});
    if (item.nc || !positive(s.vol24) || !positive(s.value24) || !positive(s.lastSoldP)) continue;
    const history=(item.s||[]).filter(positive);
    const historical=median(history);
    if (!positive(historical)) continue;
    const average=s.value24/s.vol24;
    // Historical sales and asks are anchors, never the listed median alone.
    const anchor=Math.min(average,s.lastSoldP,historical);
    const target=Math.max(0,Math.floor(Math.min(anchor*0.9,positive(s.ask2)?s.ask2-1:Infinity)));
    const unitProfit=Math.floor(target*(1-fee-reserve))-s.ask;
    const roi=unitProfit/s.ask;
    if (unitProfit<=0 || roi<Number(settings.margin)/100) continue;
    const reasons=[];
    if (stale) reasons.push('Snapshot older than 2 hours or clock mismatch');
    if (!positive(s.sure24) || s.sure24<20) reasons.push('Fewer than 20 tracker-confirmed units / 24h');
    if (s.sure24/s.vol24<0.3) reasons.push('Less than 30% of inferred volume confirmed');
    if (!positive(s.flowHours) || s.flowHours<20) reasons.push('Less than 20 comparable hours');
    if (history.length<18) reasons.push('Thin price history');
    if (!positive(s.lastSoldT) || now-s.lastSoldT>6*3600000) reasons.push('No tracked sale in the last 6 hours');
    const lo=Math.min(...history), hi=Math.max(...history);
    if (hi/lo>2) reasons.push('Hourly asks moved more than 2×');
    if (s.ask<anchor*0.5) reasons.push('Price collapse: more than 50% below anchor');
    if (!positive(s.listed) || s.listed>s.sure24*2) reasons.push('Supply exceeds two days of confirmed demand');
    // depth5 is an upper bound near the ask, not a claim of exact stock at ask.
    const buyCeiling=Math.floor(Math.min(s.ask*1.05,target*(1-fee-reserve)/(1+Number(settings.margin)/100)));
    const qty=Math.max(0,Math.floor(Math.min(s.depth5||0,s.sure24*0.05,cap/buyCeiling,budget/buyCeiling,100)));
    const profit=Math.floor(target*(1-fee-reserve))-buyCeiling;
    if (!qty || profit<=0) continue;
    const row={item,buy:s.ask,buyCeiling,target,qty,cost:qty*buyCeiling,profit:qty*profit,roi:profit/buyCeiling,reasons,anchor,confirmed:s.sure24,volume:s.vol24,supply:s.listed};
    (reasons.length?watch:opportunities).push(row);
  }
  opportunities.sort((a,b)=>b.profit-a.profit);
  watch.sort((a,b)=>b.profit-a.profit);
  // Report is a portfolio: all suggested purchases together fit the budget.
  let remaining=budget;
  const plan=[];
  for (const row of opportunities) {
    const qty=Math.min(row.qty,Math.floor(remaining/row.buyCeiling));
    if (!qty) continue;
    const profit=qty*(Math.floor(row.target*(1-fee-reserve))-row.buyCeiling);
    plan.push({...row,qty,cost:qty*row.buyCeiling,profit}); remaining-=qty*row.buyCeiling;
  }
  return {opportunities:plan,watch,vendors:vendors.sort((a,b)=>b.profit-a.profit),stale,age,budget,spent:budget-remaining};
}

export function money(copper) {
  if (!Number.isFinite(copper)) return '—';
  const n=Math.floor(copper), g=Math.floor(n/10000), s=Math.floor(n%10000/100), c=n%100;
  return [g?`${g}g`:null,s?`${s}s`:null,c||(!g&&!s)?`${c}c`:null].filter(Boolean).join(' ');
}

export function validateDetail(detail, timestamp, now=Date.now()) {
  if (!positive(detail?.bookT) || detail.bookT!==timestamp || now-detail.bookT>2*3600000 || detail.bookT>now+300000) throw new Error('Order book does not match a fresh report snapshot. Refresh the report.');
  if (!Array.isArray(detail.book)) throw new Error('Order book unavailable.');
  return detail.book.filter(r=>Array.isArray(r)&&positive(r[0])&&positive(r[1]));
}
