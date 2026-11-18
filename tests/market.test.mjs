import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMarket,analyze,DEFAULT_SETTINGS,DEFAULT_PROFILE,professionMatch,validateDetail} from '../src/market.js';
const now=1800000000000;
function fixture(overrides={}){
 const stats={ask:120,ask2:200,listed:200,depth5:50,vol24:500,value24:125000,sure24:400,flowHours:24,lastSoldT:now-3600000,lastSoldP:250,...overrides};
 return normalizeMarket({house:{key:'us-2-123',region:'us',faction:'alliance'},t:now,f:Object.keys(stats),items:[{id:1,name:'Ore',sub:'Metal & Stone',o:Object.values(stats),s:Array(24).fill(220)}]});
}
test('target uses conservative evidence and quantities fit confirmed demand',()=>{
 const r=analyze(fixture(),DEFAULT_SETTINGS,now);assert.equal(r.opportunities.length,1);const x=r.opportunities[0];assert.equal(x.target,198);assert.equal(x.qty,20);assert.equal(x.buyCeiling,126);assert.equal(x.profit,1040);
});
test('all positions together fit the budget',()=>{
 const m=fixture();m.items=Array.from({length:20},(_,id)=>({...m.items[0],id}));const r=analyze(m,{...DEFAULT_SETTINGS,budget:.5},now);assert.ok(r.spent<=5000);assert.equal(r.spent,r.opportunities.reduce((s,r)=>s+r.cost,0));
});
test('stale and future data never yield a purchase plan',()=>{assert.equal(analyze(fixture(),DEFAULT_SETTINGS,now+3*3600000).opportunities.length,0);assert.equal(analyze(fixture(),DEFAULT_SETTINGS,now-600000).opportunities.length,0);});
test('missing confirmation, excess supply and collapses are watch only',()=>{
 for(const patch of [{sure24:null},{listed:2000},{ask:40},{flowHours:10}]) {const r=analyze(fixture(patch),DEFAULT_SETTINGS,now);assert.equal(r.opportunities.length,0);}
});
test('non-commodities and missing required schema cannot sneak into the plan',()=>{const m=fixture();m.items[0].nc=1;assert.equal(analyze(m,DEFAULT_SETTINGS,now).opportunities.length,0);assert.throws(()=>normalizeMarket({house:{key:'wrong'}}));});
test('field order is not positional',()=>{const m=fixture();assert.equal(m.items[0].stats.ask,120);});
test('profession relevance preserves skill without claiming craft eligibility',()=>{assert.deepEqual(professionMatch(fixture().items[0],DEFAULT_PROFILE),['Mining 191','Engineering 225']);assert.deepEqual(professionMatch(fixture().items[0],{professions:[]}),[]);});
test('order books must match the fresh overview snapshot',()=>{assert.throws(()=>validateDetail({bookT:now-3600000,book:[]},now,now));assert.deepEqual(validateDetail({bookT:now,book:[[100,2,1]]},now,now),[[100,2,1]]);});
test('negative fee and zero budgets are handled',()=>{assert.throws(()=>analyze(fixture(),{...DEFAULT_SETTINGS,fee:-1},now));assert.equal(analyze(fixture(),{...DEFAULT_SETTINGS,budget:0},now).opportunities.length,0);});
