(() => {
  const canvas = document.getElementById('night-canvas');
  const video = document.getElementById('night-video');
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d', {alpha: false});
  const W = 1280, H = 720, DURATION = 30;
  const bg = new Image(); bg.src = 'assets/night-street-20261019.png';
  const forceCanvas = new URLSearchParams(location.search).has('render');
  let started = performance.now(), raf = 0, showingCanvas = false;
  const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
  const smooth = x => {x=clamp(x);return x*x*(3-2*x)};
  const phase = (t,a,b) => smooth((t-a)/(b-a));
  const mix = (a,b,u) => a+(b-a)*u;
  const rgba = (hex,a) => {const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${clamp(a)})`};
  function label(value,x,y,size=20,color='#f8fbfb',weight=600,align='left'){
    ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Segoe UI",Arial,sans-serif`;
    ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(value,x,y);
  }
  function panel(x,y,w,h,accent='#84ecec',alpha=.88){
    ctx.fillStyle=`rgba(4,12,22,${alpha})`;ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.fill();
    ctx.strokeStyle=rgba(accent,.6);ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(x,y,w,h,12);ctx.stroke();
    ctx.fillStyle=accent;ctx.fillRect(x,y,4,h);
  }
  function background(t){
    ctx.fillStyle='#08111d';ctx.fillRect(0,0,W,H);
    if(bg.complete && bg.naturalWidth){
      const zoom=1.05+.02*Math.sin(t*.12),dw=W*zoom,dh=H*zoom;
      ctx.drawImage(bg,(W-dw)/2-10*Math.sin(t*.17),(H-dh)/2,dw,dh);
    }
    const shade=ctx.createLinearGradient(0,0,W,H);
    shade.addColorStop(0,'rgba(2,8,17,.28)');shade.addColorStop(.55,'rgba(2,8,17,.03)');
    shade.addColorStop(1,'rgba(1,7,15,.46)');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
    const vignette=ctx.createRadialGradient(700,360,100,700,360,750);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.28)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    for(let i=0;i<46;i++){
      const x=(i*399+t*11)%1390-50,y=(i*167+t*35)%790-30;
      ctx.strokeStyle='rgba(187,215,229,.10)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-6,y+17);ctx.stroke();
    }
  }
  function frame(t){
    ctx.strokeStyle='rgba(140,234,236,.39)';ctx.lineWidth=1;ctx.strokeRect(19,19,W-38,H-38);
    for(const [x,y,sx,sy] of [[19,19,1,1],[1261,19,-1,1],[19,701,1,-1],[1261,701,-1,-1]]){
      ctx.strokeStyle='rgba(143,246,248,.91)';ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(x+sx*23,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*23);ctx.stroke();
    }
    label('HALVETH  /  C-DROHNE',45,55,15,'#dbfcfb',800);
    label('NACHTLICHT  ·  SYNTHETISCHE SYSTEMSZENE',1235,55,12,'#d7e8ee',800,'right');
    const stages=['HINWEIS','EINORDNEN','LICHT','MENSCH'];
    for(let i=0;i<4;i++){
      const x=45+i*196,active=t>=[4,9,15,23][i];
      ctx.fillStyle=active?'#8df5cf':'rgba(191,222,224,.44)';ctx.fillRect(x,662,175,3);
      label(`${String(i+1).padStart(2,'0')}  ${stages[i]}`,x,687,13,active?'#e1fff2':'#b7c8cc',700);
    }
    label(`${Math.floor(t).toString().padStart(2,'0')} / 30`,1220,684,13,'#c6d6dc',700,'right');
  }
  function dronePos(t){
    const p=[[0,1330,85],[7,1300,110],[10,1090,172],[15,884,172],[22,922,160],[30,1000,153]];
    for(let i=1;i<p.length;i++)if(t<=p[i][0]){
      const u=smooth((t-p[i-1][0])/(p[i][0]-p[i-1][0]));
      return {x:mix(p[i-1][1],p[i][1],u),y:mix(p[i-1][2],p[i][2],u)};
    }
    return {x:1000,y:153};
  }
  function drone(t){
    const a=phase(t,8.5,10);if(a<=0)return;
    const p=dronePos(t);ctx.save();ctx.globalAlpha=a;
    for(let dt=2;dt>.1;dt-=.22){const q=dronePos(Math.max(0,t-dt));ctx.fillStyle=rgba('#95ffd2',(1-dt/2.2)*.19);ctx.beginPath();ctx.arc(q.x,q.y,3,0,Math.PI*2);ctx.fill();}
    const glow=ctx.createRadialGradient(p.x,p.y,3,p.x,p.y,58);
    glow.addColorStop(0,'rgba(166,255,228,.8)');glow.addColorStop(.25,'rgba(97,255,191,.23)');glow.addColorStop(1,'rgba(97,255,191,0)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,58,0,Math.PI*2);ctx.fill();
    ctx.translate(p.x,p.y);ctx.rotate(t*.8);
    ctx.strokeStyle='#aaffda';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,30,11,0,0,Math.PI*2);ctx.stroke();
    ctx.rotate(-t*1.6);ctx.beginPath();ctx.ellipse(0,0,12,29,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#081b25';ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();ctx.restore();
    panel(p.x+31,p.y-33,118,28,'#8ef4c9',.8);label('C-DROHNE',p.x+42,p.y-13,13,'#eafff5',800);
  }
  function person(t){
    if(t<8 || t>26)return;
    const a=phase(t,8,8.5),run=phase(t,8,14);
    const x=mix(670,993,run),y=mix(522,520,run);
    const crouch=phase(t,13,14),lit=phase(t,17,19);
    ctx.save();ctx.globalAlpha=a*(1-.42*crouch+.42*lit);
    ctx.translate(x,y);ctx.scale(1.35-.16*crouch,1.35-.16*crouch);
    ctx.fillStyle='#133442';ctx.strokeStyle='rgba(220,249,247,.94)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,-65,11,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-53);ctx.lineTo(-8,-23);ctx.lineTo(3,-19);ctx.lineTo(9,-48);ctx.closePath();ctx.fill();ctx.stroke();
    const step=Math.sin(t*16)*12*(1-crouch);
    ctx.beginPath();ctx.moveTo(-3,-22);ctx.lineTo(-14+step,0);ctx.moveTo(3,-21);ctx.lineTo(12-step,0);
    ctx.moveTo(-4,-43);ctx.lineTo(-14-step*.5,-23);ctx.moveTo(7,-43);ctx.lineTo(18+step*.5,-27);ctx.stroke();
    ctx.restore();
  }
  function glass(t){
    if(t<4)return;
    const a=phase(t,4,4.5);ctx.save();ctx.globalAlpha=a;
    const p=[[141,562],[193,574],[215,558],[233,590],[275,566],[165,601]];
    for(const [x,y] of p){ctx.fillStyle='rgba(211,242,255,.85)';ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x+8,y+1);ctx.lineTo(x-5,y+3);ctx.closePath();ctx.fill();}
    if(t<11){panel(76,410,280,87,'#f2c487',.86);label('HINWEIS / FENSTER',95,438,14,'#ffd3a3',800);label('Glas am Boden sichtbar',95,470,22,'#fff',700);}
    ctx.restore();
  }
  function wave(t){
    if(t<6.1 || t>12)return;
    const a=phase(t,6.1,6.4)*(1-phase(t,11,12));ctx.save();ctx.globalAlpha=a;
    for(let i=0;i<3;i++){
      const r=25+((t-6.1)*73+i*52)%225;
      ctx.strokeStyle=rgba('#f6a671',(.7-r/350)*a);ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(420,362,r,-.8,.8);ctx.stroke();
    }
    panel(408,284,406,105,'#f2ac79',.86);
    label('KURZER IMPULS / GERÄUSCH',430,314,14,'#ffd1aa',800);
    label('Böller? Schuss? Andere Ursache?',430,348,22,'#fff',700);
    label('EINORDNUNG OFFEN',430,374,13,'#ffb898',800);
    ctx.restore();
  }
  function light(t){
    const a=phase(t,12.5,14)*(1-phase(t,25,27));if(a<=0)return;
    const p=dronePos(t),targetX=mix(600,999,phase(t,13,18)),targetY=537;
    ctx.save();ctx.globalAlpha=a;
    const cone=ctx.createLinearGradient(p.x,p.y,targetX,targetY);
    cone.addColorStop(0,'rgba(226,255,244,.06)');cone.addColorStop(1,'rgba(217,255,229,.29)');
    ctx.fillStyle=cone;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(targetX-66,targetY+20);ctx.lineTo(targetX+59,targetY+22);ctx.closePath();ctx.fill();
    const pool=ctx.createRadialGradient(targetX,targetY,2,targetX,targetY,95);
    pool.addColorStop(0,'rgba(235,255,239,.61)');pool.addColorStop(.38,'rgba(177,255,203,.27)');pool.addColorStop(1,'rgba(109,255,175,0)');
    ctx.fillStyle=pool;ctx.beginPath();ctx.arc(targetX,targetY,95,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(99,255,169,.9)';ctx.shadowColor='#7dffb9';ctx.shadowBlur=17;ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(targetX,targetY);ctx.stroke();
    ctx.shadowBlur=0;ctx.strokeStyle='rgba(194,255,214,.94)';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(targetX,targetY,31+Math.sin(t*4)*4,0,Math.PI*2);ctx.stroke();
    ctx.restore();
    if(t>16.5 && t<24){panel(870,398,345,72,'#8af4bb',.88);label('LICHTPUNKT / BODEN',890,427,14,'#a5ffd0',800);label('Person im Gebüsch sichtbar',890,454,17,'#fff',700);}
  }
  function police(t){
    const a=phase(t,21.5,23);if(a<=0)return;
    ctx.save();ctx.globalAlpha=a;
    const x=mix(1280,1100,phase(t,21.5,24));
    ctx.fillStyle='#09111a';ctx.strokeStyle='rgba(220,233,247,.72)';ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(x,485,135,51,8);ctx.fill();ctx.stroke();
    ctx.fillStyle='#263e59';ctx.fillRect(x+20,475,70,18);
    for(const [dx,dy] of [[29,540],[106,540]]){ctx.fillStyle='#040a0f';ctx.beginPath();ctx.arc(x+dx,dy,13,0,Math.PI*2);ctx.fill();}
    const blink=(Math.sin(t*12)+1)/2;
    ctx.fillStyle=rgba('#6fb4ff',.4+.6*blink);ctx.fillRect(x+38,470,21,5);
    ctx.fillStyle=rgba('#ff7a82',1-.6*blink);ctx.fillRect(x+61,470,21,5);
    label('POLIZEI',x+25,519,14,'#e3f0fa',800);
    ctx.restore();
  }
  function heading(t){
    if(t<2.4 || t>28.8)return;
    let tag,title,body;
    if(t<6){tag='01 / EIN HINWEIS';title='Das Glas fällt auf.';body='Ein sichtbarer Hinweis löst noch keine sichere Deutung aus.';}
    else if(t<12){tag='02 / GERÄUSCH';title='Ein Knall. Mehrere Ursachen.';body='Die Szene hält Böller, Schuss und andere Ursachen offen.';}
    else if(t<18){tag='03 / NACHTLICHT';title='Die Drohne bringt Licht.';body='Suchlicht und grüne Fokuslinie machen einen Bereich sichtbar.';}
    else if(t<23){tag='04 / SICHTBAR';title='Da ist jemand im Gebüsch.';body='Die Beobachtung wird für die ankommenden Menschen erkennbar.';}
    else{tag='05 / MENSCHLICHE KLÄRUNG';title='Äh ... hallo?';body='Die Einsatzkräfte übernehmen die Einordnung vor Ort.';}
    panel(41,84,730,108,'#95f6c7',.88);label(tag,61,112,13,'#9effcf',800);
    label(title,61,151,32,'#fff',800);label(body,62,177,16,'#dcefeb',500);
  }
  function comic(t){
    if(t<23.5 || t>28.1)return;
    const a=phase(t,23.5,24.2);ctx.save();ctx.globalAlpha=a;
    panel(811,299,330,89,'#9cffc6',.92);
    label('PERSON',833,326,13,'#a8ffd1',800);
    label('„Oh ... ihr seid schon da?“',833,362,24,'#fff',700);
    ctx.restore();
  }
  function intro(t){
    const a=1-phase(t,1.5,2.8);if(a<=0)return;
    ctx.fillStyle=`rgba(2,7,15,${.69*a})`;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=a;
    label('C-DROHNE',55,289,87,'#fff',800);
    ctx.fillStyle='#8cffbc';ctx.fillRect(58,310,544,3);
    label('NACHTLICHT',58,354,31,'#a4ffd0',800);
    label('Eine zweite Systemszene.',58,400,23,'#e5f1ee',500);
    ctx.restore();
  }
  function ending(t){
    const a=phase(t,27.7,28.7);if(a<=0)return;
    ctx.fillStyle=`rgba(4,9,17,${.83*a})`;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=a;
    label('C-DROHNE',62,286,86,'#fff',800);
    label('Beobachten. Beleuchten. Menschen klären.',65,342,29,'#a0ffd0',700);
    ctx.fillStyle='#8effc0';ctx.fillRect(65,373,790,3);
    label('VISUELLE SYSTEMDEMO · JURI JANOVSKI / HALVETH',65,420,18,'#d4e6e3',700);
    ctx.restore();
  }
  function renderAt(raw){
    const t=clamp(Number(raw)||0,0,DURATION-.001);
    background(t);glass(t);wave(t);person(t);police(t);light(t);drone(t);
    heading(t);comic(t);intro(t);ending(t);frame(t);
  }
  function showCanvas(){
    if(showingCanvas)return;showingCanvas=true;video.style.display='none';canvas.style.display='block';
    if(!forceCanvas){const loop=now=>{renderAt(((now-started)/1000)%DURATION);raf=requestAnimationFrame(loop)};raf=requestAnimationFrame(loop)}
  }
  window.__nightRenderAt=renderAt;
  window.__nightReady=new Promise(resolve=>{if(bg.complete && bg.naturalWidth)resolve();else{bg.onload=resolve;bg.onerror=resolve}});
  if(forceCanvas){showCanvas();window.__nightReady.then(()=>renderAt(0))}
  else{video.addEventListener('error',showCanvas,{once:true});setTimeout(()=>{if(video.readyState===0)showCanvas()},1800)}
  window.addEventListener('pagehide',()=>cancelAnimationFrame(raf),{once:true});
})();
