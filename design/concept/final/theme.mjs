import fs from 'fs';
const { Hct, TonalPalette, hexFromArgb, argbFromHex } = await import(process.env.MCU);
const H = h => Hct.fromInt(argbFromHex(h));
const seeds = { sun:'#F2C230', kaamos:'#1E3150', ply:'#E2C79C', spring:'#9DBE8C', apricot:'#F3A57A', frost:'#9DB9CC', ceiling:'#C8D6BE', lilac:'#B4A6CE' };
const info = Object.fromEntries(Object.entries(seeds).map(([k,v])=>{const h=H(v);return [k,{hex:v,hue:+h.hue.toFixed(1),chroma:+h.chroma.toFixed(1),tone:+h.tone.toFixed(1)}]}));
const X = a => hexFromArgb(a).toUpperCase();
const P0 = TonalPalette.fromHueAndChroma(info.sun.hue, 48);
const KB = TonalPalette.fromHueAndChroma(info.kaamos.hue, 40);
const PL = TonalPalette.fromHueAndChroma(info.ply.hue, 26);
const S0 = TonalPalette.fromHueAndChroma(info.kaamos.hue, 24);
const T = TonalPalette.fromHueAndChroma(info.spring.hue, 28);
const E = TonalPalette.fromHueAndChroma(Math.max(info.apricot.hue, 55), 40);
const N = TonalPalette.fromHueAndChroma(info.kaamos.hue, 18);
const NV = TonalPalette.fromHueAndChroma(info.kaamos.hue, 22);
const W = TonalPalette.fromHueAndChroma(info.ply.hue, 5);
const WV = TonalPalette.fromHueAndChroma(info.ply.hue, 10);
const role = (n,nv,t,P=P0,S=S0) => ({
 primary:P.tone(t.p), 'on-primary':P.tone(t.onP), 'primary-container':P.tone(t.pc), 'on-primary-container':P.tone(t.onPc),
 secondary:S.tone(t.s), 'on-secondary':S.tone(t.onS), 'secondary-container':S.tone(t.sc), 'on-secondary-container':S.tone(t.onSc),
 tertiary:T.tone(t.s), 'on-tertiary':T.tone(t.onS), 'tertiary-container':T.tone(t.sc), 'on-tertiary-container':T.tone(t.onSc),
 error:E.tone(t.e), 'on-error':E.tone(t.onE), 'error-container':E.tone(t.sc), 'on-error-container':E.tone(t.onSc),
 surface:n.tone(t.surface), 'surface-dim':n.tone(t.dim), 'surface-bright':n.tone(t.bright),
 'surface-container-lowest':n.tone(t.lowest), 'surface-container-low':n.tone(t.low), 'surface-container':n.tone(t.c),
 'surface-container-high':n.tone(t.high), 'surface-container-highest':n.tone(t.highest),
 'on-surface':n.tone(t.on), 'on-surface-variant':nv.tone(t.onV), outline:nv.tone(t.ol), 'outline-variant':nv.tone(t.olv),
 'inverse-surface':n.tone(t.inv), 'inverse-on-surface':n.tone(t.invOn), 'inverse-primary':P.tone(t.invP), scrim:n.tone(2), shadow:0xff000000,
});
const DK = {p:80,onP:20,pc:30,onPc:90,s:80,onS:20,sc:30,onSc:90,e:80,onE:20,surface:8,dim:6,bright:24,lowest:4,low:10,c:13,high:17,highest:22,on:94,onV:78,ol:58,olv:30,inv:94,invOn:16,invP:40};
const LT = {p:40,onP:100,pc:90,onPc:10,s:40,onS:100,sc:90,onSc:10,e:40,onE:100,surface:98,dim:88,bright:99,lowest:100,low:96,c:94,high:92,highest:90,on:10,onV:32,ol:50,olv:82,inv:20,invOn:96,invP:80};
const kaamos = role(N,NV,DK);
kaamos.primary = argbFromHex(seeds.sun);
const kevat = role(W,WV,{...LT,p:30},KB,PL);
for (const sc of []) {}
const darkRoom = role(N,NV,{...DK,on:76,onV:62,ol:44,p:70});
const fixed = {'sun':argbFromHex(seeds.sun),'on-sun':P0.tone(20),'sun-container':P0.tone(90),'on-sun-container':P0.tone(10)};
Object.assign(kaamos,fixed);Object.assign(kevat,fixed);Object.assign(darkRoom,fixed);
const hx = o => Object.fromEntries(Object.entries(o).map(([k,v])=>[k,X(v)]));
const lum = hex => { const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return +((x+0.05)/(y+0.05)).toFixed(2)};
const out = {kaamos:hx(kaamos), kevat:hx(kevat), kaamos_dark_room:hx(darkRoom)};
const pairs=[['on-sun','sun'],['on-surface','surface'],['on-surface-variant','surface'],['on-primary','primary'],['on-primary-container','primary-container'],['on-secondary-container','secondary-container'],['on-tertiary-container','tertiary-container'],['on-error-container','error-container'],['outline','surface']];
const contrast={}; for(const s of Object.keys(out)){contrast[s]={};for(const [a,b] of pairs)contrast[s][a+' / '+b]=ratio(out[s][a],out[s][b]);}
fs.writeFileSync(process.argv[2], JSON.stringify({seeds:info, schemes:out, contrast}, null, 1));
console.log(JSON.stringify(contrast,null,0));console.log(JSON.stringify(out.kaamos));console.log(JSON.stringify(out.kevat));
