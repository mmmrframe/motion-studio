// Мок AE под проект приглашения: композиции и тайминги как в new_priglashenit_4.aepx
const fs=require('fs'), vm=require('vm'), path=require('path');
const [,, jsxPath, jsonPath, videoDur, videoW] = process.argv;
const out=[]; let alerts=[];
class Item{ constructor(n){ this.name=n; this.id=Item.n=(Item.n||0)+1; this.parentFolder=null; } }
class FootageItem extends Item{ constructor(n,o={}){ super(n); Object.assign(this,{duration:o.duration||0,width:o.width||0,height:o.height||0,hasVideo:!!o.hasVideo,mainSource:o.solid?new SolidSource():{},file:o.file?{fsName:o.file,name:path.basename(o.file)}:null}); }
  replace(f){ this.file=f; this.name=path.basename(f.fsName); out.push('CSV replaced -> '+f.fsName); } }
class SolidSource{}
class PropertyType{} PropertyType.PROPERTY='P'; PropertyType.INDEXED_GROUP='G';
class Prop{ constructor(v,keys){ this.value=v; this.keys=keys||[]; this.propertyType='P'; this.expression=''; this.expressionEnabled=false; this.expressionError=''; }
  get numKeys(){return this.keys.length} keyTime(k){return this.keys[k-1]} setValue(v){this.value=v} valueAtTime(){ if(this.onEval) this.onEval(this); return this.value; } }
class Group{ constructor(ch){ this.ch=ch; this.propertyType='G'; } get numProperties(){return this.ch.length} property(i){ return typeof i==='number'?this.ch[i-1]:this.ch.find(c=>c.mn===i) } }
class AVLayer{ constructor(comp,name,src,st,inp,outp,o={}){ Object.assign(this,{comp,name,source:src,_st:st,_in:inp,_out:outp}); 
    const scale=new Prop([100,100,100],o.scaleKeys); scale.mn='ADBE Scale';
    const tg=new Group([scale]); tg.mn='ADBE Transform Group'; this.root=new Group([tg].concat(o.extra||[])); this.root.ch.forEach(c=>c.mn=c.mn||'x'); }
  get startTime(){return this._st} set startTime(v){ const d=v-this._st; this._st=v; this._in+=d; this._out+=d; }
  get inPoint(){return this._in} set inPoint(v){ if(v<this._st-1e-6 && this.source && !(this.source instanceof CompItem && false)) {} this._in=v; }
  get outPoint(){return this._out} set outPoint(v){ const max = this.source && this.source.duration && !(this.source.mainSource instanceof SolidSource) && !this.isText ? this._st+this.source.duration : 1e9; this._out=Math.min(v,max); }
  property(k){ return this.root.property(k) } get numProperties(){return this.root.numProperties}
  replaceSource(s){ out.push(`replaceSource ${this.name} -> ${s.name}`); this.source=s; } }
class TextLayer extends AVLayer{ constructor(comp,name,expr,ok){ super(comp,name,null,0,0,60); this.isText=true;
  const doc=new Prop('txt'); doc.mn='ADBE Text Document'; doc.expression=expr; doc.expressionEnabled=true;
  doc.onEval=p=>{ p.expressionError = (p.expression.includes('dataValue')||ok) ? '' : 'Error: property named " Title" is missing'; };
  const tp=new Group([doc]); tp.mn='ADBE Text Properties'; this.root.ch.push(tp); } }
class CompItem extends Item{ constructor(n,w,h,dur,wa){ super(n); Object.assign(this,{width:w,height:h,duration:dur,workAreaStart:0,workAreaDuration:wa||dur,list:[]}); }
  get numLayers(){return this.list.length} layer(i){return this.list[i-1]} }
// --- проект
const items=[];
const csv=new FootageItem('master text.csv',{file:'/old/master text.csv'});
const mov=new FootageItem('P1155710.MOV',{duration:40.32,width:3840,height:2160,hasVideo:true,file:'/old/P1155710.MOV'});
const logo=new FootageItem('Logoshot3.mp4',{duration:3.72,width:1920,height:1080,hasVideo:true,file:'/old/Logoshot3.mp4'});
const solid=()=>new FootageItem('Pale Red Solid',{duration:0,hasVideo:true,solid:true});
const spk=new CompItem('speaker',3840,2160,40.32,40.32); spk.list.push(new AVLayer(spk,'P1155710.MOV',mov,-2.76,0,37.56));
const wrap=(n,h)=>{ const c=new CompItem(n,1080,h,60,60); c.list.push(new AVLayer(c,'Logoshot3.mp4',logo,0,0,3.68)); const s=new AVLayer(c,'Pale Red Solid',solid(),-34.48,0,38.16-34.48); c.list.push(s); return c; };
const w11=wrap('Logoshot3.mp4 Comp 1',1080), w45=wrap('Pre-comp 15',1350), w916=wrap('Pre-comp 16',1920);
function main(n,w,h,logoSrc,dayName,okExpr){ const c=new CompItem(n,w,h,60,38.16);
  c.list.push(new AVLayer(c,'master text.csv',csv,0,0,60));
  c.list.push(new AVLayer(c,'Logoshot',logoSrc,34.48,34.48,logoSrc===logo?38.2:94.48));
  ['Family name and Name','Job title','Title','Сontent 1','Сontent 2','Сontent 3',dayName,'Time'].forEach(t=>c.list.push(new TextLayer(c,t,`thisComp.layer("master text.csv")("Data")("Outline")(" ${t}")(" ${t} 0")`,okExpr)));
  c.list.push(new AVLayer(c,'BG shape',null,-3.68,-3.68,56.32,{extra:[Object.assign(new Prop(0,[1.2,33.0]),{mn:'k'})]}));
  c.list.push(new AVLayer(c,'speaker',spk,0,0,40.32)); return c; }
const C169=main('16_9',1920,1080,logo,'Calendar',true), C11=main('1_1',1080,1080,w11,'Day',false), C45=main('4_5',1080,1350,w45,'Day',false), C916=main('9_16',1080,1920,w916,'Calendar',false);
items.push(csv,mov,logo,spk,w11,w45,w916,C169,C11,C45,C916);
const rq=[];
const project={ get numItems(){return items.length}, item(i){return items[i-1]},
  importFile(o){ const f=new FootageItem(path.basename(o.file.fsName),{duration:+videoDur,width:+videoW,height:Math.round(videoW*9/16),hasVideo:true,file:o.file.fsName}); items.push(f); out.push('import '+f.name); return f; },
  renderQueue:{items:{add(c){ const it={comp:c.name,outputModule(){return this.om}, om:{file:{name:'Comp.mov'}}}; rq.push(it); return it; }}} };
class File{ constructor(p){ this.fsName=p; this.name=path.basename(p); this.parent={fsName:path.dirname(p)}; } get exists(){ return fs.existsSync(this.fsName) }
  open(m){ this.m=m; this.buf=''; return true } read(){ return fs.readFileSync(this.fsName,'utf8') } write(s){ this.buf+=s } close(){ if(this.m==='w') fs.writeFileSync(this.fsName,this.buf) } }
File.openDialog=(t)=>{ out.push('DIALOG: '+t); return /JSON/.test(t)? new File(jsonPath) : null; };
const ctx={ app:{project, beginUndoGroup(){}, endUndoGroup(){}}, alert:s=>alerts.push(s), File, ImportOptions:class{constructor(f){this.file=f}}, CompItem, FootageItem, TextLayer, SolidSource, PropertyType };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(jsxPath,'utf8'),ctx);
console.log(out.join('\n')); console.log('---- ALERT ----\n'+alerts.join('\n'));
console.log('---- RESULT ----');
for(const c of [spk,C169,C11,C45,C916]){ console.log(`${c.name}: dur ${c.duration.toFixed(2)} work ${c.workAreaStart}-${(c.workAreaStart+c.workAreaDuration).toFixed(2)}`);
  c.list.forEach(L=>{ if(L.isText) return; console.log(`   ${L.name.padEnd(18)} src=${(L.source&&L.source.name||'-').padEnd(22)} start=${L.startTime.toFixed(2)} in=${L.inPoint.toFixed(2)} out=${L.outPoint.toFixed(2)} scale=${L.property('ADBE Transform Group').property('ADBE Scale').value.map(x=>+x.toFixed(1))}`); });
  const tx=c.list.filter(L=>L.isText).map(L=>L.name+': '+L.property('ADBE Text Properties').property('ADBE Text Document').expression.slice(0,45)); if(tx.length) console.log('   texts:', tx.slice(0,3).join(' | '), '…'); }
for(const w of [w11]) console.log(w.name, w.list.map(L=>L.name+' start '+L.startTime.toFixed(2)).join('; '));
console.log('RQ', rq.map(r=>r.comp+' '+r.timeSpanDuration.toFixed(2)+' '+r.om.file.fsName).join('\n   '));
console.log('---- CSV ----\n'+fs.readFileSync(path.dirname(jsonPath)+'/master text.csv','utf8').split('\r\n').slice(0,2).join('\n'));
