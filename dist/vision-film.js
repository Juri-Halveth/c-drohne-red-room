(() => {
  const canvas = document.getElementById('vision-canvas');
  const video = document.getElementById('vision-video');
  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d', {alpha:false});
  const W = 1280, H = 720, DURATION = 24;
  const bg = new Image();
  bg.src = 'assets/observer-valley-20261019.png';
  const forceCanvas = new URLSearchParams(location.search).has('render');
  let started = performance.now();
  let raf = 0;
  let showingCanvas = false;

  const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, v));
  const smooth = v => { const x=clamp(v); return x*x*(3-2*x); };
  const phase = (t,a,b) => smooth((t-a)/(b-a));
  const mix = (a,b,u) => a+(b-a)*u;
  const rgba = (hex,a) => {
    const n = parseInt(hex.slice(1),16);
    return `rgba(${n>>16},${(n>>8)&255},${n&255},${clamp(a)})`;
  };
  const positions = {
    A:[[0,1180,-70],[3,1010,165],[6,680,218],[9,462,208],[14,505,163],[20,595,198],[24,642,180]],
    B:[[0,1370,-80],[6,1320,78],[10,1010,190],[14,744,255],[20,722,220],[24,770,201]],
    C:[[0,1410,-70],[8,1370,75],[12,1112,131],[16,983,197],[20,930,158],[24,930,142]]
  };
  function pos(id,t){
    const p=positions[id];
    for(let i=1;i<p.length;i++) if(t<=p[i][0]){
      const u=smooth((t-p[i-1][0])/(p[i][0]-p[i-1][0]));
      return {x:mix(p[i-1][1],p[i][1],u),y:mix(p[i-1][2],p[i][2],u)};
    }
    return {x:p.at(-1)[1],y:p.at(-1)[2]};
  }
  function rr(x,y,w,h,r=12){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function text(value,x,y,size=20,color='#f6f9fb',weight=500,align='left'){
    ctx.fillStyle=color;ctx.font=`${weight} ${size}px "Segoe UI",Arial,sans-serif`;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.fillText(value,x,y);
  }
  function rule(x,y,w,color='#7ee9ed',a=.55){ctx.fillStyle=rgba(color,a);ctx.fillRect(x,y,w,2);}
  function panel(x,y,w,h,accent='#79e8ee',alpha=.9){
    ctx.fillStyle=`rgba(7,15,26,${alpha})`;rr(x,y,w,h,14);ctx.fill();
    ctx.strokeStyle=rgba(accent,.57);ctx.lineWidth=1.4;rr(x,y,w,h,14);ctx.stroke();
    ctx.fillStyle=accent;ctx.fillRect(x,y,4,h);
  }
  function wrapped(value,x,y,maxWidth,size=18,lineHeight=26,color='#e8f1f4',weight=500){
    ctx.font=`${weight} ${size}px "Segoe UI",Arial,sans-serif`;ctx.textAlign='left';ctx.textBaseline='alphabetic';
    let line='';
    for(const word of value.split(' ')){
      const candidate=line?`${line} ${word}`:word;
      if(ctx.measureText(candidate).width>maxWidth && line){text(line,x,y,size,color,weight);y+=lineHeight;line=word;}else line=candidate;
    }
    if(line) text(line,x,y,size,color,weight);
    return y+lineHeight;
  }
  function drawBackground(t){
    ctx.fillStyle='#07101a';ctx.fillRect(0,0,W,H);
    if(bg.complete && bg.naturalWidth){
      const zoom=1.055+.032*Math.sin(t/26*Math.PI);
      const dw=W*zoom,dh=H*zoom;
      const panX=-25*Math.sin(t/18),panY=8*Math.sin(t/13);
      ctx.drawImage(bg,(W-dw)/2+panX,(H-dh)/2+panY,dw,dh);
    }
    const shade=ctx.createLinearGradient(0,0,W,H);
    shade.addColorStop(0,'rgba(3,9,17,.40)');shade.addColorStop(.50,'rgba(3,9,17,.08)');shade.addColorStop(1,'rgba(3,9,17,.72)');
    ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
    const vignette=ctx.createRadialGradient(W*.53,H*.4,120,W*.53,H*.4,770);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.38)');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    for(let i=0;i<75;i++){
      const x=((i*419.7+t*17)%1390)-50, y=((i*197.3+t*37)%780)-30;
      ctx.strokeStyle=i%5?'rgba(174,222,238,.09)':'rgba(220,241,246,.19)';ctx.lineWidth=i%7?1:1.5;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y+23);ctx.stroke();
    }
  }
  function drawFrame(t){
    ctx.strokeStyle='rgba(139,232,237,.33)';ctx.lineWidth=1;
    ctx.strokeRect(19,19,W-38,H-38);
    for(const [x,y,sx,sy] of [[19,19,1,1],[W-19,19,-1,1],[19,H-19,1,-1],[W-19,H-19,-1,-1]]){
      ctx.strokeStyle='rgba(130,236,240,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+sx*23,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*23);ctx.stroke();
    }
    text('HALVETH  /  C-DROHNE',45,56,15,'#d6fbfc',800);
    text('VISUELLE SYSTEMDEMO  ·  SYNTHETISCHE SZENE',1235,56,12,'#bcdce3',700,'right');
    const stages=['BEOBACHTEN','KONTEXT','SCHWARM','PRÜFUNG'];
    for(let i=0;i<4;i++){
      const x=45+i*196,active=t>=(2+i*5.2);
      ctx.fillStyle=active?'#8de7e9':'rgba(170,205,215,.36)';ctx.fillRect(x,662,175,3);
      text(`${String(i+1).padStart(2,'0')}  ${stages[i]}`,x,687,13,active?'#ddfbfb':'#a7b8c3',700);
    }
    text(`${Math.floor(t).toString().padStart(2,'0')} / 24`,1223,684,13,'#bdcfd8',700,'right');
  }
  function drone(id,t,color='#80eff1'){
    const entry=id==='A'?2:id==='B'?6:9;
    const a=phase(t,entry,entry+1);
    if(a<=0)return;
    const p=pos(id,t);ctx.save();ctx.globalAlpha=a;
    for(let dt=2.3;dt>.1;dt-=.20){
      const q=pos(id,Math.max(0,t-dt));
      const alpha=(1-dt/2.5)*.24*a;
      ctx.fillStyle=rgba(color,alpha);ctx.beginPath();ctx.arc(q.x,q.y,Math.max(1,5-dt),0,Math.PI*2);ctx.fill();
    }
    const glow=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,66);
    glow.addColorStop(0,rgba(color,.90));glow.addColorStop(.16,rgba(color,.38));glow.addColorStop(1,rgba(color,0));
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,p.y,66,0,Math.PI*2);ctx.fill();
    ctx.translate(p.x,p.y);ctx.rotate(t*.75+(id.charCodeAt(0)-65));
    ctx.strokeStyle=rgba(color,.82);ctx.lineWidth=2.1;ctx.beginPath();ctx.ellipse(0,0,29,11,0,0,Math.PI*2);ctx.stroke();
    ctx.rotate(-t*1.5);ctx.beginPath();ctx.ellipse(0,0,13,28,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#061520';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#e8ffff';ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();ctx.restore();
    if(t>4){panel(p.x+32,p.y-31,45,24,color,.72);text(id,p.x+49,p.y-13,13,'#e8ffff',800);}
  }
  function beam(from,to,t,color='#74ebec',offset=0){
    const a=phase(t,10.0+offset,11.3+offset);if(a<=0)return;
    ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=rgba(color,.85);ctx.lineWidth=2;ctx.setLineDash([7,12]);ctx.lineDashOffset=-t*34;
    ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.quadraticCurveTo((from.x+to.x)/2,(from.y+to.y)/2-125,to.x,to.y);ctx.stroke();ctx.setLineDash([]);
    const u=((t-10-offset)/1.8)%1;if(u>=0){
      const x=(1-u)*(1-u)*from.x+2*(1-u)*u*(from.x+to.x)/2+u*u*to.x;
      const y=(1-u)*(1-u)*from.y+2*(1-u)*u*((from.y+to.y)/2-125)+u*u*to.y;
      ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=25;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
    }ctx.restore();
  }
  function marker(x,y,r,color,t,label){
    const pulse=(Math.sin(t*4)+1)/2;
    ctx.strokeStyle=rgba(color,.95);ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r+pulse*13,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle=rgba(color,.33);ctx.beginPath();ctx.arc(x,y,r+21+pulse*10,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-r-22,y);ctx.lineTo(x-r+1,y);ctx.moveTo(x+r-1,y);ctx.lineTo(x+r+22,y);ctx.stroke();
    panel(x+r+23,y-r-7,Math.max(150,label.length*9+24),30,color,.82);
    text(label,x+r+34,y-r+14,14,'#f4feff',700);
  }
  function scan(t){
    const a=phase(t,6,6.7)*(1-phase(t,10,11));if(a<=0)return;
    const p=pos('A',t);ctx.save();ctx.globalAlpha=a;
    const cone=ctx.createLinearGradient(p.x,p.y,312,445);
    cone.addColorStop(0,'rgba(94,239,241,.04)');cone.addColorStop(1,'rgba(94,239,241,.20)');
    ctx.fillStyle=cone;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(244,510);ctx.lineTo(365,496);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(139,245,246,.48)';ctx.setLineDash([8,12]);ctx.lineDashOffset=-t*35;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(305,446);ctx.stroke();ctx.setLineDash([]);
    marker(305,446,34,'#82eff0',t,'PERSON AM WEG');ctx.restore();
  }
  function stageHeading(t){
    let tag,heading,body;
    if(t<5.8){tag='01 / BEWEGUNG';heading='Der Blick kommt näher.';body='Eine Beobachterdrohne erkundet einen Hilfsweg.';}
    else if(t<10.5){tag='02 / BEOBACHTUNG';heading='Eine Person am Weg.';body='Die Szene zeigt Anwesenheit. Der Bedarf bleibt eine Frage.';}
    else if(t<15.4){tag='03 / AUSTAUSCH';heading='Weitere Blicke kommen dazu.';body='Jede Meldung erhält ihren Ursprung und ihren Zeitbezug.';}
    else if(t<20.8){tag='04 / GEMEINSAME EINSCHÄTZUNG';heading='Drei Meldungen. Zwei Blicke.';body='Die Weiterleitung derselben Sicht bleibt eine Kopie.';}
    else{tag='05 / FACHLICHE PRÜFUNG';heading='Die Lage wird erklärbar.';body='Eine Person sieht Beobachtungen, Gründe und offene Fragen.';}
    if(t<2.5 || t>23)return;
    panel(42,82,710,106,'#8cebee',.79);
    text(tag,60,109,13,'#8debf0',800);
    text(heading,60,149,31,'#fff',800);
    text(body,61,176,16,'#d4e7eb',500);
  }
  function intro(t){
    const fade=1-phase(t,1.5,2.9);if(fade<=0)return;
    ctx.fillStyle=`rgba(3,8,15,${.7*fade})`;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=fade;
    text('C-DROHNE',56,285,90,'#ffffff',800);
    rule(59,308,514,'#f14569',.92);
    text('BEOBACHTER-SCHWARM',59,352,29,'#94f0f0',700);
    text('Ein Systemgedanke in Bewegung.',59,399,23,'#e6eef1',500);
    ctx.restore();
  }
  function observations(t){
    if(t<9.5)return;
    const a=phase(t,9.5,10.4);ctx.save();ctx.globalAlpha=a;
    marker(355,493,36,'#f69d76',t,'HINDERNIS AM WEG');
    if(t<14.5){panel(765,386,450,157,'#86e9ec',.91);text('EINHEIT A',787,414,14,'#8debf0',800);text('Person am Hilfsweg',787,449,23,'#fff',700);text('Frage: Wird Unterstützung benötigt?',787,484,17,'#cadde4',500);text('STATUS: BEOBACHTUNG',787,520,13,'#f58da1',800);}
    ctx.restore();
  }
  function evidencePanel(t){
    if(t<14.5 || t>20.5)return;
    const a=phase(t,14.5,15.3)*(1-phase(t,19.5,20.5));ctx.save();ctx.globalAlpha=a;
    panel(743,348,475,246,'#88eced',.94);
    text('SCHWARM / QUELLENBILD',767,380,15,'#91f2f2',800);
    rule(767,397,422,'#75dfe0',.43);
    text('A',767,434,22,'#8df1f0',800);text('Person am Weg',815,432,18,'#f8fbfb',600);
    text('B',767,475,22,'#f3b17e',800);text('Hindernis am Weg',815,473,18,'#f8fbfb',600);
    text('C',767,516,22,'#c0cad4',800);text('Übernimmt Meldung A',815,514,18,'#d1dbe2',600);
    rule(767,536,422,'#75dfe0',.43);
    text('3 MELDUNGEN  ·  2 URSPRUNGSSICHTEN',767,569,18,'#fff',800);
    ctx.restore();
  }
  function conclusion(t){
    if(t<20.5 || t>23.4)return;
    const a=phase(t,20.5,21.3);ctx.save();ctx.globalAlpha=a;
    panel(660,280,558,310,'#f26d8b',.94);
    text('GEMEINSAME EINSCHÄTZUNG',688,322,17,'#ffa0b4',800);
    text('Hilfsweg prüfen.',688,382,43,'#fff',800);
    text('Unterstützungsbedarf möglich.',688,420,23,'#cfeff0',700);
    rule(688,448,500,'#ed7e97',.7);
    wrapped('Grundlage: Person am Weg + Hindernis aus zwei Ursprungssichten. Eine Weiterleitung ist als Kopie markiert.',688,479,485,17,26,'#ebf1f3',500);
    text('NÄCHSTER SCHRITT  /  FACHLICHE PRÜFUNG',688,557,14,'#ffa0b4',800);
    ctx.restore();
  }
  function end(t){
    const a=phase(t,22.7,23.6);if(a<=0)return;
    ctx.fillStyle=`rgba(4,8,17,${.84*a})`;ctx.fillRect(0,0,W,H);ctx.save();ctx.globalAlpha=a;
    text('C-DROHNE',64,290,89,'#fff',800);
    text('Eine Idee. Eine sichtbare Forschungsrichtung.',66,343,28,'#8debf0',700);
    rule(66,375,780,'#f14569',.9);
    text('JURI JANOVSKI  /  HALVETH',66,418,22,'#f5f7f8',700);
    text('VISUELLE SYSTEMDEMO · 2026',66,450,15,'#b6d5de',700);
    ctx.restore();
  }
  function renderAt(raw){
    const t=Math.max(0,Math.min(DURATION-.001,Number(raw)||0));
    drawBackground(t);
    const A=pos('A',t),B=pos('B',t),C=pos('C',t);
    if(t>10){beam(A,B,t,'#83eef0');beam(A,C,t,'#a8baf5',.7);}
    scan(t);observations(t);
    drone('C',t,'#bcb5ff');drone('B',t,'#f3bb87');drone('A',t,'#83eef0');
    stageHeading(t);evidencePanel(t);conclusion(t);intro(t);end(t);drawFrame(t);
  }
  function showCanvas(){
    if(showingCanvas)return;showingCanvas=true;video.style.display='none';canvas.style.display='block';
    if(!forceCanvas){
      const loop=now=>{renderAt(((now-started)/1000)%DURATION);raf=requestAnimationFrame(loop);};
      raf=requestAnimationFrame(loop);
    }
  }
  window.__visionRenderAt=renderAt;
  window.__visionReady=new Promise(resolve=>{
    if(bg.complete && bg.naturalWidth)resolve();else {bg.onload=resolve;bg.onerror=resolve;}
  });
  if(forceCanvas){showCanvas();window.__visionReady.then(()=>renderAt(0));}
  else{video.addEventListener('error',showCanvas,{once:true});setTimeout(()=>{if(video.readyState===0)showCanvas();},1800);}
  window.addEventListener('pagehide',()=>cancelAnimationFrame(raf),{once:true});
})();
