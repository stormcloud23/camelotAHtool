import {API,MARKET,DEFAULT_PROFILE,DEFAULT_SETTINGS,normalizeMarket,analyze,money,professionMatch,validateDetail} from './market.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{$('saved').textContent='Browser storage unavailable. Changes last for this session only.';return false;}}
let profiles=read('camelot-profiles',[structuredClone(DEFAULT_PROFILE)]);
if (!Array.isArray(profiles)||!profiles.length||profiles.some(p=>!p.id||!Array.isArray(p.professions))) profiles=[structuredClone(DEFAULT_PROFILE)];
let active=read('camelot-active','main'); if(!profiles.some(p=>p.id===active))active=profiles[0].id;
let settings={...DEFAULT_SETTINGS,...read('camelot-settings',{})};
let market=null,report=null,loading=false;
const professions=['None','Mining','Engineering','Blacksmithing','Herbalism','Alchemy','Skinning','Leatherworking','Tailoring','Enchanting','Cooking','Fishing','First Aid'];
const profile=()=>profiles.find(p=>p.id===active);
function fillProfile(){
  $('character').innerHTML=profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''); $('character').value=active;
  const p=profile(); for(const k of ['name','level','race','className'])$(k).value=p[k];
  $('professions').innerHTML=[0,1].map((_,n)=>{const prof=p.professions[n]||{name:'None',skill:0};return `<div class="pair"><label>Profession ${n+1}<select id="prof-${n}">${professions.map(name=>`<option ${prof.name===name?'selected':''}>${name}</option>`).join('')}</select></label><label>Skill<input id="skill-${n}" type="number" min="0" max="450" value="${Number(prof.skill)||0}" required></label></div>`;}).join('');
}
fillProfile();
for(const k of ['budget','position','fee','reserve','margin'])$(k).value=settings[k]; $('verified').checked=!!settings.verified;
$('character').onchange=()=>{active=$('character').value;save('camelot-active',active);fillProfile();render();};
$('add-character').onclick=()=>{const p=structuredClone(DEFAULT_PROFILE);p.id=crypto.randomUUID();p.name=`Character ${profiles.length+1}`;profiles.push(p);active=p.id;save('camelot-profiles',profiles);save('camelot-active',active);fillProfile();$('name').focus();};
$('profile-form').onsubmit=e=>{e.preventDefault();const p=profile();for(const k of ['name','race','className'])p[k]=$(k).value.trim();p.level=Number($('level').value);p.professions=[0,1].map(n=>({name:$(`prof-${n}`).value,skill:Number($(`skill-${n}`).value)}));if(save('camelot-profiles',profiles))$('saved').textContent='Character saved in this browser.';fillProfile();render();};
$('settings-form').onsubmit=e=>{e.preventDefault();for(const k of ['budget','position','fee','reserve','margin'])settings[k]=Number($(k).value);save('camelot-settings',settings);render();};
$('verified').onchange=()=>{settings.verified=$('verified').checked;save('camelot-settings',settings);render();};
$('search').oninput=render; $('scope').onchange=render;

async function fetchJSON(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`Market service returned HTTP ${r.status}.`);return r.json();}
function cache(){try {const c=read('camelot-market',null);return c&&Number.isFinite(c.fetchedAt)?c:null;}catch{return null;}}
async function load(){
  if(loading)return;loading=true;$('refresh').disabled=true;$('status').textContent='Reading the latest available snapshot…';
  try{
    // Respect the provider's maximum of one overview request per hour.
    const c=cache();const useCache=c&&Date.now()-c.fetchedAt<3600000&&Date.now()>=c.fetchedAt;
    const raw=useCache?c.raw:await fetchJSON(`${API}/m/${MARKET}`);
    market=normalizeMarket(raw);
    if(!useCache)save('camelot-market',{raw,fetchedAt:Date.now()});
    $('status').textContent=useCache?'Using this browser’s hourly cache. Refresh becomes available one hour after the last fetch.':'Snapshot loaded. Overview requests are limited to once an hour.';
    render();
  }catch(e){
    const c=cache();
    try{if(!market&&c){market=normalizeMarket(c.raw);render();}}catch{}
    $('status').textContent=`${e.message} ${market?'Showing the last available snapshot; check its timestamp.':'Try again later. No sample prices are shown.'}`;
  }finally{loading=false;$('refresh').disabled=false;}
}
$('refresh').onclick=load;
function visible(rows){const q=$('search').value.trim().toLowerCase();return rows.filter(r=>(r.item.name||String(r.item.id)).toLowerCase().includes(q)&&($('scope').value!=='profession'||professionMatch(r.item,profile()).length));}
function card(row,watch=false){
  const {item}=row;const match=professionMatch(item,profile());
  const icon=typeof item.icon==='string'&&item.icon.startsWith('https://render.worldofwarcraft.com/')?`<img src="${esc(item.icon)}" alt="" loading="lazy">`:'';
  return `<article class="card"><div class="item-heading">${icon}<div><h3>${esc(item.name||`Item ${item.id}`)}</h3><span class="badge">${esc(match.length?match.join(' · ')+' · material watch':item.sub||item.cls||'Commodity')}</span></div></div><div class="card-grid"><div><span>Ask / buy ceiling</span><strong>${money(row.buy)} / ${money(row.buyCeiling)}</strong></div><div><span>Resale target / unit</span><strong>${money(row.target)}</strong></div><div><span>${watch?'Illustrative size':'Maximum units'} / cost</span><strong>${row.qty} / ${money(row.cost)}</strong></div><div><span>Projected net / return</span><strong class="positive">${money(row.profit)} / ${Math.round(row.roi*100)}%</strong></div></div><p class="muted">24h: ${row.confirmed.toLocaleString()} tracker-confirmed of ${row.volume.toLocaleString()} inferred units · ${row.supply.toLocaleString()} units listed.</p>${row.reasons.length?`<p class="reasons">${row.reasons.map(esc).join(' · ')}</p>`:''}<div class="card-actions"><button class="secondary inspect" data-id="${item.id}">Check order book</button><a href="https://auctionhouse.tk.gg/m/${MARKET}/${item.id}" target="_blank" rel="noreferrer">History & source</a></div><div class="book" id="book-${item.id}" aria-live="polite"></div></article>`;
}
function render(){
  if(!market)return;
  try{report=analyze(market,settings);}catch(e){$('status').textContent=e.message;return;}
  $('snapshot-time').textContent=new Date(market.timestamp).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  $('count').textContent=market.items.length.toLocaleString();$('passes').textContent=report.opportunities.length;$('capital').textContent=settings.verified?money(report.spent):'Verify market';
  const rows=visible(report.opportunities);
  $('shortlist').innerHTML=report.stale?'<p class="empty">Snapshot is stale or your clock differs from the provider. Purchase suggestions are paused until fresh data is available.</p>':!settings.verified?'<p class="empty">Purchase plan locked until you confirm the market above. Watchlist and vendor checks are available for comparison.</p>':rows.length?rows.map(r=>card(r)).join(''):'<p class="empty">No items pass your conservative filters and current search. Holding your gold is a valid decision.</p>';
  const watch=visible(report.watch);
  $('watch').innerHTML=watch.length?watch.slice(0,8).map(r=>card(r,true)).join(''):'<p class="empty">No matching watchlist items.</p>';
  const vendors=visible(report.vendors).slice(0,8);
  $('vendors').innerHTML=vendors.length?vendors.map(r=>`<div class="vendor"><span>${esc(r.item.name)}<br><span class="muted">Ask ${money(r.buy)} · vendor ${money(r.sell)}</span></span><strong class="positive">+${money(r.profit)} / item</strong></div>`).join(''):'<p class="empty">No matching vendor gaps.</p>';
  $('export').disabled=false;
  document.querySelectorAll('.inspect').forEach(b=>b.onclick=()=>inspect(Number(b.dataset.id),b));
}
async function inspect(id,button){
  button.disabled=true;const out=$(`book-${id}`);out.textContent='Checking actual listing depth…';
  try{
    const key=`camelot-book-${id}`;let d=read(key,null);
    if(d?.bookT!==market.timestamp){d=await fetchJSON(`${API}/m/${MARKET}/item/${id}?hours=48&v=${market.timestamp}`);if(d?.item?.id!==id)throw new Error('Wrong item returned by source.');save(key,d);}
    const book=validateDetail(d,market.timestamp);const row=[...report.opportunities,...report.watch].find(r=>r.item.id===id);
    const depth=book.filter(r=>r[0]<=row.buyCeiling).reduce((sum,r)=>sum+r[1],0);
    out.innerHTML=`<p>${depth} units currently shown at or below your buy ceiling. ${settings.verified&&!report.stale&&!row.reasons.length?'Check in-game before purchasing.':'Watch only; this is not an unlocked purchase recommendation.'}</p><table><caption>Lowest price levels in this snapshot</caption><thead><tr><th>Unit price</th><th>Units</th><th>Auctions</th></tr></thead><tbody>${book.slice(0,8).map(r=>`<tr><td>${money(r[0])}</td><td>${r[1]}</td><td>${Number(r[2])||0}</td></tr>`).join('')}</tbody></table>`;
  }catch(e){out.textContent=e.message;}finally{button.disabled=false;}
}
$('export').onclick=()=>{
  if(!report)return;
  const unlocked=settings.verified&&!report.stale;
  const text=[`# Camelot Auction Ledger`,`Generated: ${new Date().toISOString()}`,`Snapshot: ${new Date(market.timestamp).toISOString()}`,`Market: Alliance US RP-PvP (${MARKET}; inferred provider mapping)`,`Character: ${profile().name}, level ${profile().level} ${profile().race} ${profile().className}`,`Professions: ${profile().professions.map(p=>`${p.name} ${p.skill}`).join(', ')}`,`Market confirmed by user: ${settings.verified}`,`Budget: ${settings.budget}g; per item: ${settings.position}g; cut: ${settings.fee}%; reserve: ${settings.reserve}%; minimum return: ${settings.margin}%`,``,unlocked?'## Purchase plan':'## Purchase plan locked',...(unlocked?report.opportunities.map(r=>`- ${r.item.name}: up to ${r.qty} at <= ${money(r.buyCeiling)} each; target ${money(r.target)}; projected net ${money(r.profit)}.`):['Confirm the market and obtain a fresh snapshot.']),``,`## Watch only`,...report.watch.slice(0,15).map(r=>`- ${r.item.name}: ${r.reasons.join('; ')}.`),``,`Targets are estimates, not guaranteed proceeds. Verify actual prices in-game.`,`Source: https://auctionhouse.tk.gg/data/`].join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download=`camelot-report-${new Date().toISOString().slice(0,10)}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
// Re-evaluate freshness while the tab stays open, without polling the API.
setInterval(()=>{if(market)render();},60000);
load();
