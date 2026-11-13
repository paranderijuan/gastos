(function(){
"use strict";

/* ===================== utilidades ===================== */
var MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
var MES3=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
var DIAS=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
var nf=new Intl.NumberFormat("es-PY");
function fmt(n){return nf.format(Math.round(n||0));}
function gs(n){return "Gs. "+fmt(n);}
function p2(n){return n<10?"0"+n:""+n;}
function hoyISO(){var d=new Date();return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());}
function ayerISO(){var d=new Date();d.setDate(d.getDate()-1);return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate());}
function ymDe(s){return String(s||"").slice(0,7);}
function nomMes(ym){var a=ym.split("-");return MESES[parseInt(a[1],10)-1]+" "+a[0];}
function sumaMes(ym,d){var a=ym.split("-"),y=+a[0],m=+a[1]+d;while(m<1){m+=12;y--;}while(m>12){m-=12;y++;}return y+"-"+p2(m);}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function $(id){return document.getElementById(id);}
function lee(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function escribe(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function soloDig(s,max){return String(s).replace(/\D/g,"").slice(0,max||12);}
function fechaCorta(iso){
  if(iso===hoyISO())return "Hoy";
  if(iso===ayerISO())return "Ayer";
  var d=new Date(iso+"T12:00:00");
  return d.getDate()+" "+MES3[d.getMonth()];
}

/* ===================== datos ===================== */
var GRUPOS_INI=[
 {id:"g_casa",  nombre:"Casa",      col:"--g1", pre:0, subs:["Alquiler","Luz","Agua","Internet","Arreglos"]},
 {id:"g_comida",nombre:"Comida",    col:"--g2", pre:0, subs:["Despensa","Carnicería","Almuerzo","Delivery"]},
 {id:"g_auto",  nombre:"Auto",      col:"--g3", pre:0, subs:["Combustible","Service","Cubiertas","Pasajes"]},
 {id:"g_salud", nombre:"Salud",     col:"--g4", pre:0, subs:["Farmacia","Médico"]},
 {id:"g_deuda", nombre:"Deudas",    col:"--g5", pre:0, subs:["Préstamo","Tarjeta","Cuotas"]},
 {id:"g_pers",  nombre:"Personal",  col:"--g6", pre:0, subs:["Ropa","Salidas","Regalos"]},
 {id:"g_serv",  nombre:"Servicios", col:"--g7", pre:0, subs:["Celular","Suscripciones","Banco"]},
 {id:"g_otros", nombre:"Otros",     col:"--g8", pre:0, subs:["Imprevistos","Varios"]}
];
var ING=["Salario","Aguinaldo","Venta","Otro"];
var PAGOS=[{id:"efectivo",n:"Efectivo"},{id:"tarjeta",n:"Tarjeta"},{id:"transferencia",n:"Transferencia"},
  {id:"fiado",n:"Fiado"}];
var AHO=[{id:"Guardé",n:"Guardar plata"},{id:"Saqué",n:"Sacar del ahorro"}];

var D=lee("miplata",null);
if(!D||!Array.isArray(D.mov)){
  var v2=lee("miplata",null);
  D={v:3,grupos:JSON.parse(JSON.stringify(GRUPOS_INI)),mov:[],plan:[],salario:0,borrados:[],act:0};
}
if(!Array.isArray(D.grupos)||!D.grupos.length) D.grupos=JSON.parse(JSON.stringify(GRUPOS_INI));
if(!Array.isArray(D.plan)) D.plan=[];
if(!Array.isArray(D.borrados)) D.borrados=[];
if(typeof D.salario!=="number") D.salario=0;
if(typeof D.act!=="number") D.act=0;
D.v=3;
/* migración de colores viejos */
D.grupos.forEach(function(g,i){ if(g.col&&g.col.indexOf("--g-")===0) g.col=GRUPOS_INI[i]?GRUPOS_INI[i].col:"--g8"; });

var CFG=lee("miplata_cfg",{user:"",repo:"",tok:""});
var SHA=lee("miplata_sha",null);
var pend=lee("miplata_pend",false);

var mes=ymDe(hoyISO()), vista="inicio", estado=CFG.tok?"pendiente":"sin";
var filtro="todos", tSync=null;

function grupo(id){for(var i=0;i<D.grupos.length;i++)if(D.grupos[i].id===id)return D.grupos[i];return null;}
function colG(id){var g=grupo(id);return "var("+(g?g.col:"--g8")+")";}
function nomG(id){var g=grupo(id);return g?g.nombre:"Otros";}

/* ===================== guardado ===================== */
function guardar(){ D.act=Date.now(); escribe("miplata",D); marcar(); }
function marcar(){
  pend=true; escribe("miplata_pend",true);
  if(!CFG.tok){estado="sin";pintarSync();return;}
  estado="pendiente"; pintarSync();
  clearTimeout(tSync); tSync=setTimeout(sincronizar,1600);
}
function b64e(s){var b=new TextEncoder().encode(s),x="";for(var i=0;i<b.length;i++)x+=String.fromCharCode(b[i]);return btoa(x);}
function b64d(s){var x=atob(String(s).replace(/\s/g,"")),b=new Uint8Array(x.length);for(var i=0;i<x.length;i++)b[i]=x.charCodeAt(i);return new TextDecoder().decode(b);}
function urlApi(c){return "https://api.github.com/repos/"+encodeURIComponent(c.user)+"/"+encodeURIComponent(c.repo)+"/contents/datos.json";}
function cab(c){return {"Authorization":"Bearer "+c.tok,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};}
function bajar(c){
  return fetch(urlApi(c)+"?t="+Date.now(),{headers:cab(c),cache:"no-store"}).then(function(r){
    if(r.status===404) return {datos:null,sha:null};
    if(!r.ok) return r.text().then(function(t){throw new Error("GitHub "+r.status+" · "+t.slice(0,90));});
    return r.json().then(function(j){var d=null;try{d=JSON.parse(b64d(j.content));}catch(e){}return {datos:d,sha:j.sha};});
  });
}
function subir(c,d,sha){
  var body={message:"Mi Plata "+new Date().toISOString().slice(0,16).replace("T"," "),content:b64e(JSON.stringify(d))};
  if(sha) body.sha=sha;
  return fetch(urlApi(c),{method:"PUT",headers:cab(c),body:JSON.stringify(body)}).then(function(r){
    if(!r.ok) return r.text().then(function(t){throw new Error("GitHub "+r.status+" · "+t.slice(0,90));});
    return r.json().then(function(j){return j.content?j.content.sha:null;});
  });
}
function fusionar(l,r){
  if(!r) return l;
  var bo={}; (l.borrados||[]).concat(r.borrados||[]).forEach(function(i){bo[i]=1;});
  function une(a,b){
    var m={}; (b||[]).forEach(function(x){m[x.id]=x;});
    (a||[]).forEach(function(x){var o=m[x.id];if(!o||(x.m||0)>=(o.m||0))m[x.id]=x;});
    var out=[];for(var k in m) if(!bo[k]) out.push(m[k]);
    return out;
  }
  var la=l.act||0, ra=r.act||0;
  return {v:3, grupos: ra>la?(r.grupos||l.grupos):(l.grupos||r.grupos),
    salario: ra>la?(r.salario||0):(l.salario||0),
    act:Math.max(la,ra), mov:une(l.mov,r.mov), plan:une(l.plan,r.plan),
    borrados:Object.keys(bo).slice(-800)};
}
var sincing=false;
function sincronizar(forzar){
  if(!CFG.tok||!CFG.user||!CFG.repo){estado="sin";pintarSync();return;}
  if(sincing) return;
  sincing=true; estado="sync"; pintarSync();
  bajar(CFG).then(function(res){
    D=fusionar(D,res.datos); escribe("miplata",D);
    return subir(CFG,D,res.sha);
  }).then(function(sha){
    SHA=sha; escribe("miplata_sha",sha);
    pend=false; escribe("miplata_pend",false);
    estado="ok"; sincing=false; pintar();
  }).catch(function(e){
    sincing=false; estado=navigator.onLine?"error":"pendiente";
    window.__err=String(e&&e.message||e); pintar();
  });
}
window.addEventListener("online",function(){if(pend)sincronizar();});

/* ===================== cálculos ===================== */
function movMes(ym){return D.mov.filter(function(x){return ymDe(x.fecha)===ym;});}
function totales(ym){
  var i=0,g=0,a=0,f=0;
  movMes(ym).forEach(function(x){
    if(x.t==="i") i+=x.monto;
    else if(x.t==="g"){ g+=x.monto; if(x.pago==="fiado") f+=x.monto; }
    else if(x.t==="a") a+=(x.sub==="Saqué"? -x.monto : x.monto);
  });
  return {ing:i,gas:g,aho:a,fia:f,queda:i-(g-f)-a};
}
function ahorroTotal(){
  var t=0;
  D.mov.forEach(function(x){ if(x.t==="a") t+=(x.sub==="Saqué"? -x.monto : x.monto); });
  return t;
}
function porGrupo(ym){
  var m={},tot=0;
  movMes(ym).forEach(function(x){
    if(x.t!=="g")return;
    if(!m[x.gr]) m[x.gr]=0;
    m[x.gr]+=x.monto; tot+=x.monto;
  });
  var a=[];
  for(var k in m){
    var g=grupo(k);
    a.push({id:k,nom:g?g.nombre:"Otros",col:g?g.col:"--g8",pre:g?(+g.pre||0):0,gas:m[k],pct:tot?m[k]/tot:0});
  }
  a.sort(function(x,y){return y.gas-x.gas;});
  return {lista:a,total:tot};
}
function porPago(ym){
  var m={},tot=0;
  movMes(ym).forEach(function(x){
    if(x.t!=="g")return;
    var p=x.pago||"efectivo";
    m[p]=(m[p]||0)+x.monto; tot+=x.monto;
  });
  var cols={efectivo:"--g2",tarjeta:"--g1",transferencia:"--g6",fiado:"--g3"};
  return PAGOS.map(function(p){
    return {id:p.id,nom:p.n,col:cols[p.id],gas:m[p.id]||0,pct:tot?(m[p.id]||0)/tot:0};
  }).filter(function(x){return x.gas>0;});
}
function diasRest(){
  if(mes!==ymDe(hoyISO()))return 0;
  var a=mes.split("-");
  return new Date(+a[0],+a[1],0).getDate()-new Date().getDate()+1;
}
function planAbierto(){return D.plan.filter(function(p){return !p.hecho;});}

/* ===================== toast ===================== */
var tT=null;
function toast(txt){
  var e=document.querySelector(".toast"); if(e)e.remove();
  var d=document.createElement("div"); d.className="toast"; d.textContent=txt;
  document.body.appendChild(d); clearTimeout(tT);
  tT=setTimeout(function(){d.remove();},2200);
}
function pintarSync(){ $("sync").dataset.e=estado; }

/* ===================== pintado ===================== */
function pintar(){
  var t=document.querySelectorAll(".tab");
  for(var i=0;i<t.length;i++){
    if(t[i].dataset.v===vista)t[i].setAttribute("aria-current","page");
    else t[i].removeAttribute("aria-current");
  }
  $("fab").hidden=(vista==="aj"||vista==="inf");
  $("fab").textContent=(vista==="lista")?"+ Anotar":"+ Cargar";
  pintarSync();
  if(vista==="inicio")pInicio();
  else if(vista==="mov")pMov();
  else if(vista==="inf")pInf();
  else if(vista==="lista")pLista();
  else pAj();
}

function anillo(pg,queda,ing){
  var R=78,C=2*Math.PI*R,off=0;
  var usado=ing>0?Math.min(1,(ing-queda)/ing):0;
  var s='<svg width="188" height="188" viewBox="0 0 188 188" aria-hidden="true">'
   + '<circle cx="94" cy="94" r="'+R+'" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="13"/>';
  if(pg.total>0&&ing>0){
    pg.lista.forEach(function(c){
      var len=(c.gas/ing)*C;
      if(len<=0.5)return;
      s+='<circle cx="94" cy="94" r="'+R+'" fill="none" stroke="var('+c.col+')" stroke-width="13"'
       + ' stroke-dasharray="'+Math.max(0,len-2).toFixed(2)+' '+(C-Math.max(0,len-2)).toFixed(2)+'"'
       + ' stroke-dashoffset="'+(-off).toFixed(2)+'"/>';
      off+=len;
    });
  }else if(pg.total>0){
    pg.lista.forEach(function(c){
      var len=c.pct*C;
      if(len<=0.5)return;
      s+='<circle cx="94" cy="94" r="'+R+'" fill="none" stroke="var('+c.col+')" stroke-width="13"'
       + ' stroke-dasharray="'+Math.max(0,len-2).toFixed(2)+' '+(C-Math.max(0,len-2)).toFixed(2)+'"'
       + ' stroke-dashoffset="'+(-off).toFixed(2)+'"/>';
      off+=len;
    });
  }
  s+='</svg>';
  return s;
}

function marca(){
  return '<span class="marca" aria-hidden="true"><b style="height:7px"></b><b style="height:11px"></b>'
   + '<b style="height:15px;background:#fff"></b><b style="height:9px"></b></span>';
}

function pInicio(){
  var t=totales(mes), pg=porGrupo(mes), dias=diasRest();
  var usado=t.ing>0?Math.round(((t.ing-t.queda)/t.ing)*100):0;
  var h='<div class="top"><div class="top-in wrap">'
   + '<div class="tbar"><span class="mes">'+esc(nomMes(mes))+'</span>'+marca()+'</div>'
   + '<div class="anillo"><div class="wrap2">'+anillo(pg,t.queda,t.ing)
   +   '<div class="mid"><div class="lbl">'+(t.queda>=0?"Te queda":"Te pasaste")+'</div>'
   +     '<div class="val num'+(t.queda<0?" neg":"")+'">'+esc(fmt(Math.abs(t.queda)))+'</div>'
   +     '<div class="pct">'+(t.ing>0?("usaste el "+usado+"%"):"cargá tu salario")+'</div></div>'
   + '</div></div>'
   + '<div class="flujo">'
   +   '<button type="button" data-f="ingresos"><span class="kk"><i class="ar up">▲</i>Entró</span><span class="vv num">'+esc(fmt(t.ing))+'</span></button>'
   +   '<button type="button" data-f="gastos"><span class="kk"><i class="ar dn">▼</i>Salió</span><span class="vv num">'+esc(fmt(t.gas))+'</span></button>'
   + '</div></div></div>';
  $("cab").innerHTML=h;

  var b="";
  if(!D.salario){
    b+='<button class="card" id="cSal" style="width:100%"><span class="ban">'
     + '<span class="ico" style="background:var(--warn-bg);color:var(--warn)">₲</span>'
     + '<span class="b"><span class="n">Cargá tu salario</span><span class="s">así sabés cuánto te queda cada mes</span></span>'
     + '<span class="cv">›</span></span></button>';
  }else if(t.ing===0){
    b+='<button class="card" id="cSalMes" style="width:100%"><span class="ban">'
     + '<span class="ico" style="background:var(--warn-bg);color:var(--warn)">₲</span>'
     + '<span class="b"><span class="n">Cargar el salario de '+esc(MESES[+mes.split("-")[1]-1])+'</span>'
     + '<span class="s">'+esc(gs(D.salario))+'</span></span><span class="cv">›</span></span></button>';
  }
  if(t.fia>0){
    b+='<button class="card" data-pg="fiado" style="width:100%;padding:12px 14px"><span class="ban">'
     + '<span class="ico" style="background:var(--warn-bg);color:var(--warn)">₲</span>'
     + '<span class="b"><span class="n">Fiado · debés '+esc(fmt(t.fia))+'</span>'
     + '<span class="s">no se descuenta de lo que te queda, sale de tu próximo cobro</span></span>'
     + '<span class="cv">›</span></span></button>';
  }
  if(dias>0&&t.queda>0){
    b+='<div class="card" style="padding:12px 14px"><div class="ban">'
     + '<span class="ico" style="background:var(--soft);color:var(--brand)">₲</span>'
     + '<span class="b"><span class="n">Podés gastar '+esc(fmt(t.queda/dias))+' por día</span>'
     + '<span class="s">quedan '+dias+' día'+(dias>1?"s":"")+' de '+esc(MESES[+mes.split("-")[1]-1])+'</span></span>'
     + '</div></div>';
  }

  if(pg.total>0){
    b+='<div class="card"><div class="ch"><span class="k">En qué se va</span>'
     + '<button class="mas" data-ir="mov">ver todo ›</button></div>';
    pg.lista.slice(0,6).forEach(function(c){
      var pp=c.pre>0?c.gas/c.pre:0;
      b+='<button class="ru" data-ru="'+esc(c.id)+'"><i class="pt" style="background:var('+c.col+')"></i>'
       + '<span class="nm">'+esc(c.nom)+'</span><span class="vl num">'+esc(fmt(c.gas))+'</span>'
       + '<span class="pc num">'+Math.round(c.pct*100)+'%</span></button>'
       + '<div class="tr"><i style="width:'+Math.min(100,(c.pre>0?pp:c.pct)*100).toFixed(1)+'%;background:var('+(c.pre>0&&pp>=1?"--bad":c.col)+')"></i></div>'
       + (c.pre>0?'<div class="sb'+(pp>=1?" d":"")+'">'+(pp>1?"te pasaste "+esc(fmt(c.gas-c.pre)):pp===1?"usaste todo el presupuesto":"quedan "+esc(fmt(c.pre-c.gas))+" de "+esc(fmt(c.pre)))+'</div>':'');
    });
    b+='</div>';
  }else{
    b+='<div class="card"><div class="vacio"><b>Todavía no cargaste nada</b>'
     + 'Tocá «+ Cargar» abajo a la derecha para anotar tu primer gasto o tu salario.</div></div>';
  }

  var at=ahorroTotal();
  b+='<div class="card ahorro"><div class="ah-top"><div>'
   + '<span class="k" style="color:rgba(255,255,255,.5)">Ahorro guardado</span>'
   + '<div class="ah-v num">'+esc(gs(at))+'</div></div>'
   + '<button class="ah-btn" id="bAho">Guardar plata</button></div>'
   + '<div class="ah-s">No cuenta como disponible.'
   + (t.aho?' Este mes '+(t.aho>0?"guardaste ":"sacaste ")+esc(fmt(Math.abs(t.aho)))+'.':'')+'</div></div>';

  var ab=planAbierto(), tp=0; ab.forEach(function(x){tp+=x.monto||0;});
  b+='<button class="card" data-ir="lista" style="width:100%;padding:12px 14px"><span class="ban">'
   + '<span class="ico" style="background:var(--warn-bg);color:var(--warn)">'+(ab.length||"0")+'</span>'
   + '<span class="b"><span class="n">Lista del mes'+(ab.length?" · "+ab.length+" sin comprar":"")+'</span>'
   + '<span class="s">'+(ab.length?("tenés anotado "+esc(gs(tp))):"anotá lo que tenés que comprar")+'</span></span>'
   + '<span class="cv">›</span></span></button>';

  $("vista").innerHTML=b;
}

function pMov(){
  $("cab").innerHTML='<div class="hdr wrap"><h1>Movimientos</h1><div class="segs">'
   + '<button data-f="todos" aria-pressed="'+(filtro==="todos")+'">Todo</button>'
   + '<button data-f="gastos" aria-pressed="'+(filtro==="gastos")+'">Gastos</button>'
   + '<button data-f="ingresos" aria-pressed="'+(filtro==="ingresos")+'">Ingresos</button>'
   + '<button data-f="ahorro" aria-pressed="'+(filtro==="ahorro")+'">Ahorro</button>'
   + '</div></div>';
  var lista=movMes(mes).filter(function(x){
    return filtro==="todos"||(filtro==="gastos"&&x.t==="g")||(filtro==="ingresos"&&x.t==="i")||(filtro==="ahorro"&&x.t==="a");
  }).sort(function(a,b){return a.fecha<b.fecha?1:a.fecha>b.fecha?-1:(b.m||0)-(a.m||0);});
  if(!lista.length){
    $("vista").innerHTML='<div class="card"><div class="vacio"><b>Nada por acá</b>'
     + 'No hay movimientos de este tipo en '+esc(MESES[+mes.split("-")[1]-1])+'.</div></div>';
    return;
  }
  var gr={},ord=[];
  lista.forEach(function(x){if(!gr[x.fecha]){gr[x.fecha]=[];ord.push(x.fecha);}gr[x.fecha].push(x);});
  var h="";
  ord.forEach(function(f){
    var sub=0; gr[f].forEach(function(x){sub+=(x.t==="i"?x.monto:-x.monto);});
    var d=new Date(f+"T12:00:00");
    h+='<div class="card"><div class="ch"><span class="k">'+esc(DIAS[d.getDay()]+" "+d.getDate())+'</span>'
     + '<span class="mas num">'+(sub>=0?"+":"−")+esc(fmt(Math.abs(sub)))+'</span></div>';
    gr[f].forEach(function(x){
      var col = x.t==="i"?"var(--ok)" : x.t==="a"?"var(--g1)" : colG(x.gr);
      var pn=""; PAGOS.forEach(function(p){if(p.id===x.pago)pn=p.n;});
      var det = x.t==="i"?"Ingreso" : x.t==="a"?(x.sub==="Saqué"?"Sacado del ahorro":"Guardado en ahorro") : nomG(x.gr)+(pn?" · "+pn.toLowerCase():"");
      var tit = x.t==="a"?(x.sub==="Saqué"?"Retiro":"Ahorro") : (x.sub||nomG(x.gr));
      h+='<button class="dia" data-id="'+esc(x.id)+'"><i class="pt" style="background:'+col+'"></i>'
       + '<span class="b"><span class="n">'+esc(tit)+'</span>'
       + '<span class="s">'+esc(det)+(x.nota?" · "+esc(x.nota):"")+'</span></span>'
       + '<span class="v num'+(x.t==="i"?" in":x.t==="a"?" ah":"")+'">'
       + (x.t==="i"?"+":x.t==="a"?(x.sub==="Saqué"?"−":"→"):"−")+esc(fmt(x.monto))+'</span></button>';
    });
    h+='</div>';
  });
  $("vista").innerHTML=h;
}

function pInf(){
  var h='<div class="hdr wrap"><h1>Informes</h1><div class="segs" id="selMes">';
  for(var i=5;i>=0;i--){
    var ym=sumaMes(ymDe(hoyISO()),-i);
    h+='<button data-m="'+ym+'" aria-pressed="'+(ym===mes)+'">'+MES3[+ym.split("-")[1]-1]+'</button>';
  }
  h+='</div></div>';
  $("cab").innerHTML=h;

  var um=[],mx=0;
  for(var j=5;j>=0;j--){var y=sumaMes(ymDe(hoyISO()),-j),t=totales(y);um.push({ym:y,t:t});mx=Math.max(mx,t.ing,t.gas);}
  var b="";
  if(mx>0){
    b+='<div class="card"><div class="ch"><span class="k">Entró y salió</span></div><div class="bars">';
    um.forEach(function(x){
      b+='<div class="bc'+(x.ym===mes?" on":"")+'"><div class="bp">'
       + '<span class="bi" style="height:'+(x.t.ing/mx*100).toFixed(1)+'%'+(x.t.ing?'':';min-height:0')+'"></span>'
       + '<span class="bg" style="height:'+(x.t.gas/mx*100).toFixed(1)+'%'+(x.t.gas?'':';min-height:0')+'"></span>'
       + '</div><div class="l">'+MES3[+x.ym.split("-")[1]-1]+'</div></div>';
    });
    b+='</div><div class="lg"><span><i style="background:var(--g2)"></i>Entró</span>'
     + '<span><i style="background:var(--g5)"></i>Salió</span></div></div>';

    var mq=0; um.forEach(function(x){mq=Math.max(mq,Math.abs(x.t.queda));});
    b+='<div class="card"><div class="ch"><span class="k">Lo que te quedó cada mes</span></div>';
    um.forEach(function(x){
      b+='<div class="cmp"><span class="m">'+MES3[+x.ym.split("-")[1]-1]+'</span>'
       + '<span class="bar"><i class="'+(x.t.queda<0?"neg":"")+'" style="width:'+(mq?Math.abs(x.t.queda)/mq*100:0).toFixed(1)+'%"></i></span>'
       + '<span class="v num">'+(x.t.queda<0?"−":"")+esc(fmt(Math.abs(x.t.queda)))+'</span></div>';
    });
    b+='</div>';
  }

  var pg=porGrupo(mes);
  if(pg.total>0){
    b+='<div class="card"><div class="ch"><span class="k">Rubros de '+esc(MESES[+mes.split("-")[1]-1])+'</span>'
     + '<span class="mas" style="font-size:10.5px;color:var(--ink3)">tocá para ver</span></div>';
    pg.lista.forEach(function(c){
      b+='<button class="ru" data-ru="'+esc(c.id)+'"><i class="pt" style="background:var('+c.col+')"></i><span class="nm">'+esc(c.nom)+'</span>'
       + '<span class="vl num">'+esc(fmt(c.gas))+'</span><span class="pc num">'+Math.round(c.pct*100)+'%</span>'
       + '<span class="cv" style="margin-left:2px">›</span></button>'
       + '<div class="tr"><i style="width:'+(c.pct*100).toFixed(1)+'%;background:var('+c.col+')"></i></div>';
    });
    b+='</div>';
  }

  var pp=porPago(mes);
  if(pp.length){
    b+='<div class="card"><div class="ch"><span class="k">Cómo pagaste</span>'
     + '<span class="mas" style="font-size:10.5px;color:var(--ink3)">tocá para ver</span></div>';
    pp.forEach(function(c){
      b+='<button class="ru" data-pg="'+esc(c.id)+'"><i class="pt" style="background:var('+c.col+')"></i><span class="nm">'+esc(c.nom)+'</span>'
       + '<span class="vl num">'+esc(fmt(c.gas))+'</span><span class="pc num">'+Math.round(c.pct*100)+'%</span>'
       + '<span class="cv" style="margin-left:2px">›</span></button>'
       + '<div class="tr"><i style="width:'+(c.pct*100).toFixed(1)+'%;background:var('+c.col+')"></i></div>';
    });
    b+='</div>';
  }
  if(!b) b='<div class="card"><div class="vacio"><b>Sin datos todavía</b>Cargá algunos movimientos y acá vas a ver los gráficos.</div></div>';
  $("vista").innerHTML=b;
}

var COLP={efectivo:"--g2",tarjeta:"--g1",transferencia:"--g6",fiado:"--g3"};
function nomPago(id){var n="Efectivo";PAGOS.forEach(function(p){if(p.id===id)n=p.n;});return n;}
var detTipo="gr", detClave="";
function abrirDet(tipo,clave){ detTipo=tipo; detClave=clave; pintarDet(); $("shRub").hidden=false; }
function pintarDet(){
  var lista=movMes(mes).filter(function(x){
    if(x.t!=="g") return false;
    return detTipo==="gr" ? x.gr===detClave : (x.pago||"efectivo")===detClave;
  });
  var col = detTipo==="gr" ? (grupo(detClave)?grupo(detClave).col:"--g8") : (COLP[detClave]||"--g8");
  $("rubTit").textContent = detTipo==="gr" ? nomG(detClave) : nomPago(detClave);
  var tot=0; lista.forEach(function(x){tot+=x.monto;});
  var h='<div class="dt-top"><i class="pt" style="background:var('+col+')"></i>'
   + '<span class="dt-v num">'+esc(gs(tot))+'</span>'
   + '<span class="dt-s">'+lista.length+(lista.length===1?' movimiento en ':' movimientos en ')+esc(MESES[+mes.split("-")[1]-1])+'</span></div>';
  if(!lista.length){
    h+='<div class="vacio"><b>Nada por acá</b>No hay gastos de este tipo en el mes.</div>';
    $("rubCont").innerHTML=h; return;
  }
  var ms={},ord=[];
  lista.forEach(function(x){
    var k = detTipo==="gr" ? (x.sub||"Sin detalle") : nomG(x.gr);
    if(ms[k]===undefined){ms[k]=0;ord.push(k);}
    ms[k]+=x.monto;
  });
  ord.sort(function(a,b){return ms[b]-ms[a];});
  h+='<div class="dt-sec"><span class="k">'+(detTipo==="gr"?"En qué se fue":"En qué rubros")+'</span></div>';
  ord.forEach(function(k){
    var p=tot?ms[k]/tot:0;
    h+='<div class="ru"><i class="pt" style="background:var('+col+')"></i><span class="nm">'+esc(k)+'</span>'
     + '<span class="vl num">'+esc(fmt(ms[k]))+'</span><span class="pc num">'+Math.round(p*100)+'%</span></div>'
     + '<div class="tr"><i style="width:'+(p*100).toFixed(1)+'%;background:var('+col+')"></i></div>';
  });
  if(detTipo==="gr"){
    var mp={},hay=0;
    lista.forEach(function(x){var p=x.pago||"efectivo"; if(!mp[p])hay++; mp[p]=(mp[p]||0)+x.monto;});
    if(hay>1){
      h+='<div class="dt-sec"><span class="k">Cómo lo pagaste</span></div>';
      PAGOS.forEach(function(p){
        if(!mp[p.id])return;
        var pc=tot?mp[p.id]/tot:0;
        h+='<div class="ru"><i class="pt" style="background:var('+COLP[p.id]+')"></i><span class="nm">'+esc(p.n)+'</span>'
         + '<span class="vl num">'+esc(fmt(mp[p.id]))+'</span><span class="pc num">'+Math.round(pc*100)+'%</span></div>'
         + '<div class="tr"><i style="width:'+(pc*100).toFixed(1)+'%;background:var('+COLP[p.id]+')"></i></div>';
      });
    }
  }
  h+='<div class="dt-sec"><span class="k">Uno por uno</span></div><div class="dt-lista">';
  lista.sort(function(a,b){return a.fecha<b.fecha?1:a.fecha>b.fecha?-1:(b.m||0)-(a.m||0);}).forEach(function(x){
    var d=new Date(x.fecha+"T12:00:00");
    var tit = detTipo==="gr" ? (x.sub||nomG(x.gr)) : (x.sub||nomG(x.gr));
    var pg2 = detTipo==="gr" ? nomPago(x.pago||"efectivo").toLowerCase() : nomG(x.gr).toLowerCase();
    var sub = DIAS[d.getDay()]+" "+d.getDate()+" · "+pg2+(x.nota?" · "+x.nota:"");
    h+='<button class="dia" data-id="'+esc(x.id)+'"><i class="pt" style="background:var('+col+')"></i>'
     + '<span class="b"><span class="n">'+esc(tit)+'</span><span class="s">'+esc(sub)+'</span></span>'
     + '<span class="v num">−'+esc(fmt(x.monto))+'</span></button>';
  });
  h+='</div>';
  $("rubCont").innerHTML=h;
}
if(!document.getElementById("shRub")){
  var _sh=document.createElement("div");
  _sh.className="sheet"; _sh.id="shRub"; _sh.hidden=true;
  _sh.innerHTML='<div class="sheet-in"><div class="grab"></div>'
   + '<div class="sh"><button class="x" id="rubX">&#10005;</button><h2 id="rubTit">Rubro</h2></div>'
   + '<div id="rubCont"></div></div>';
  document.body.appendChild(_sh);
  var _st=document.createElement("style");
  _st.textContent=".dt-top{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:2px 0 14px;border-bottom:1px solid var(--hair);margin-bottom:4px}"
   + ".dt-top .pt{margin-bottom:6px}"
   + ".dt-v{font-family:var(--f-d);font-weight:700;font-size:27px;letter-spacing:-.02em;line-height:1.1}"
   + ".dt-s{font-size:11.5px;color:var(--ink3)}.dt-sec{margin:16px 0 6px}.dt-lista{margin-top:2px}";
  document.head.appendChild(_st);
}
$("rubX").addEventListener("click",function(){$("shRub").hidden=true;});
$("shRub").addEventListener("click",function(e){if(e.target===this)this.hidden=true;});
$("rubCont").addEventListener("click",function(e){
  var d=e.target.closest(".dia[data-id]");
  if(!d)return;
  var x=null; D.mov.forEach(function(y){if(y.id===d.dataset.id)x=y;});
  if(x){ $("shRub").hidden=true; abrirMov(x); }
});

function pLista(){
  var ab=planAbierto(), hechos=D.plan.filter(function(p){return p.hecho;});
  var tot=0; ab.forEach(function(x){tot+=x.monto||0;});
  $("cab").innerHTML='<div class="hdr wrap"><h1>Lista del mes</h1><div class="segs">'
   + '<button aria-pressed="true">'+ab.length+' sin comprar'+(tot?' · '+esc(fmt(tot)):'')+'</button>'
   + (hechos.length?'<button>'+hechos.length+' comprado'+(hechos.length>1?"s":"")+'</button>':'')
   + '</div></div>';
  var h="";
  if(!ab.length&&!hechos.length){
    h='<div class="card"><div class="vacio"><b>Sin anotaciones</b>'
     + 'Anotá acá lo que tenés que comprar este mes: la lista de compras, arreglos del auto, un imprevisto. '
     + 'Cuando lo comprás, tildás y pasa solo a los gastos.</div></div>';
  }else{
    if(ab.length){
      /* agrupado por rubro, en el orden de los rubros */
      var porGr={}, orden=[];
      D.grupos.forEach(function(g){ porGr[g.id]=[]; orden.push(g.id); });
      ab.forEach(function(p){
        var k=porGr[p.gr]?p.gr:"_otros";
        if(!porGr[k]){ porGr[k]=[]; orden.push(k); }
        porGr[k].push(p);
      });
      var sinPrecio=0, prim=true;
      h+='<div class="card"><div class="ch"><span class="k">Falta comprar</span></div>';
      orden.forEach(function(k){
        var lista=porGr[k]; if(!lista||!lista.length)return;
        var col = k==="_otros" ? "var(--g8)" : colG(k);
        var sub=0; lista.forEach(function(p){ sub+=p.monto||0; if(!p.monto)sinPrecio++; });
        h+='<div class="lsec'+(prim?" p1":"")+'"><i class="pt" style="background:'+col+'"></i>'
         + '<span class="nm">'+esc(k==="_otros"?"Sin rubro":nomG(k))+'</span>'
         + '<span class="tt num">'+(sub?esc(fmt(sub)):"")+'</span></div>';
        prim=false;
        lista.forEach(function(p){
          h+='<div class="lst"><button class="bx" data-ok="'+esc(p.id)+'" aria-label="Marcar como comprado"></button>'
           + '<button class="b" data-ed="'+esc(p.id)+'" style="text-align:left"><span class="n">'+esc(p.titulo)+'</span></button>'
           + '<button class="v num'+(p.monto?"":" sp")+'" data-ed="'+esc(p.id)+'">'
           + (p.monto?esc(fmt(p.monto)):"poner precio")+'</button></div>';
        });
      });
      h+='</div>';
      h+='<div class="card plan"><div class="ch"><span class="k">Vas a necesitar</span></div>'
       + '<div class="pl-v num">'+esc(gs(tot))+'</div><div class="pl-s">'
       + (sinPrecio? 'Te falta ponerle precio a '+sinPrecio+(sinPrecio>1?' cosas. ':' cosa. '):'')
       + 'Esto <b>no se descuenta</b> de tu plata: es para que sepas cuánto preparar.</div></div>';
    }
    if(hechos.length){
      h+='<div class="card"><div class="ch"><span class="k">Ya comprado</span>'
       + '<button class="mas" id="limpiar">borrar ✕</button></div>';
      hechos.slice(-15).reverse().forEach(function(p){
        h+='<div class="lst done"><span class="bx on">✓</span>'
         + '<span class="b"><span class="n">'+esc(p.titulo)+'</span><span class="s">'+esc(nomG(p.gr))+' · pasó a gastos</span></span>'
         + (p.monto?'<span class="v num">'+esc(fmt(p.monto))+'</span>':'')+'</div>';
      });
      h+='</div>';
    }
  }
  $("vista").innerHTML=h;
}

function pAj(){
  $("cab").innerHTML='<div class="hdr wrap"><h1>Ajustes</h1></div>';
  var h='<div class="card"><div class="ch"><span class="k">Tu salario</span></div>'
   + '<div class="aj" style="border:none;padding:0"><span class="nm">Salario mensual</span>'
   + '<input type="text" inputmode="numeric" class="mon-in num" id="salIn" value="'+esc(fmt(D.salario))+'" aria-label="Salario mensual"></div>'
   + '<button class="btn-lin" id="cargarSal">Cargar en '+esc(MESES[+mes.split("-")[1]-1])+'</button></div>';

  h+='<div class="card"><div class="ch"><span class="k">Rubros y presupuesto</span></div>'
   + '<div style="font-size:11.5px;color:var(--ink3);margin:-6px 0 8px">Tocá el puntito para cambiarle el color, el nombre para renombrarlo y la flecha para ver lo que tiene adentro. Dejá el tope en 0 si no querés límite.</div>';
  D.grupos.forEach(function(g,i){
    h+='<div class="aj"><button class="ptb" data-col="'+i+'" aria-label="Color del rubro">'
     + '<i class="pt" style="background:var('+g.col+')"></i></button>'
     + '<input type="text" value="'+esc(g.nombre)+'" data-n="'+i+'" aria-label="Nombre del rubro">'
     + '<input type="text" inputmode="numeric" class="mon-in num" value="'+esc(fmt(g.pre||0))+'" data-p="'+i+'" aria-label="Presupuesto">'
     + '<button class="x" data-sub="'+esc(g.id)+'" aria-label="Ver lo que tiene adentro">›</button></div>';
  });
  h+='<button class="btn-dash" id="addGr">+ Agregar rubro</button></div>';

  var txt={sin:"No conectado · los datos están solo en este celular",ok:"Conectado y al día",
    pendiente:"Hay cambios sin subir",sync:"Subiendo…",error:"Error al guardar en la nube"}[estado]||"";
  h+='<div class="card"><div class="ch"><span class="k">Guardado en la nube</span></div>'
   + '<div style="font-size:12.5px;color:'+(estado==="error"?"var(--bad)":"var(--ink3)")+'">'+esc(txt)
   + (CFG.user?' · '+esc(CFG.user)+'/'+esc(CFG.repo):'')+'</div>'
   + (estado==="error"&&window.__err?'<div class="aviso err" style="margin-top:9px">'+esc(window.__err)+'</div>':'')
   + '<button class="btn-lin" id="btnCfg">'+(CFG.tok?"Cambiar conexión":"Conectar con GitHub")+'</button>'
   + (CFG.tok?'<button class="btn-lin" id="btnAhora">Sincronizar ahora</button>':'')+'</div>';

  h+='<div class="card"><div class="ch"><span class="k">Respaldo</span></div>'
   + '<div style="font-size:12.5px;color:var(--ink3)">Bajá una copia de todo en un archivo, por las dudas.</div>'
   + '<button class="btn-lin" id="btnExp">Descargar respaldo</button>'
   + '<button class="btn-lin" id="btnImp">Restaurar desde un respaldo</button>'
   + '<input type="file" id="fileImp" accept=".json,application/json" hidden>'
   + '<div style="font-size:11.5px;color:var(--ink3);margin-top:10px">'+D.mov.length+' movimientos guardados.</div></div>';
  $("vista").innerHTML=h;
}

/* ===================== navegación ===================== */
document.querySelector(".tabs").addEventListener("click",function(e){
  var b=e.target.closest(".tab"); if(!b)return;
  vista=b.dataset.v; pintar(); window.scrollTo(0,0);
});
$("cab").addEventListener("click",function(e){
  var f=e.target.closest("[data-f]");
  if(f){ vista="mov"; filtro=f.dataset.f; pintar(); window.scrollTo(0,0); return; }
  var m=e.target.closest("[data-m]");
  if(m){ mes=m.dataset.m; pintar(); }
});
$("vista").addEventListener("click",function(e){
  var ir=e.target.closest("[data-ir]");
  if(ir){ vista=ir.dataset.ir; if(vista==="mov")filtro="gastos"; pintar(); window.scrollTo(0,0); return; }
  var ru=e.target.closest("[data-ru]");
  if(ru){ abrirDet("gr",ru.dataset.ru); return; }
  var pgb=e.target.closest("[data-pg]");
  if(pgb){ abrirDet("pago",pgb.dataset.pg); return; }
  var gr=e.target.closest("[data-gr]");
  if(gr){ vista="mov"; filtro="gastos"; pintar(); window.scrollTo(0,0); return; }
  if(e.target.closest("#bAho")){ abrirMov(null,"a"); return; }
  if(e.target.closest("#cSal")){ vista="aj"; pintar(); setTimeout(function(){var s=$("salIn");if(s)s.focus();},120); return; }
  if(e.target.closest("#cSalMes")){ cargarSalario(); return; }
  var d=e.target.closest(".dia[data-id]");
  if(d){ var x=null; D.mov.forEach(function(y){if(y.id===d.dataset.id)x=y;}); if(x)abrirMov(x); return; }
  /* lista */
  var ok=e.target.closest("[data-ok]");
  if(ok){ comprar(ok.dataset.ok); return; }
  var ed=e.target.closest("[data-ed]");
  if(ed){ var p=null; D.plan.forEach(function(y){if(y.id===ed.dataset.ed)p=y;}); if(p)abrirItem(p); return; }
  if(e.target.closest("#limpiar")){
    D.plan.filter(function(p){return p.hecho;}).forEach(function(p){D.borrados.push(p.id);});
    D.plan=D.plan.filter(function(p){return !p.hecho;});
    guardar(); pintar(); return;
  }
  /* ajustes */
  if(e.target.closest("#addGr")){
    D.grupos=D.grupos.concat([{id:uid(),nombre:"Nuevo rubro",col:colorLibre(),pre:0,subs:["Varios"]}]);
    guardar(); pintar(); return;
  }
  var cb=e.target.closest("[data-col]");
  if(cb){ abrirColor(+cb.dataset.col); return; }
  if(e.target.closest("#cargarSal")){ cargarSalario(); return; }
  if(e.target.closest("#btnCfg")){ abrirCfg(); return; }
  if(e.target.closest("#btnAhora")){ sincronizar(true); return; }
  if(e.target.closest("#btnExp")){ exportar(); return; }
  if(e.target.closest("#btnImp")){ $("fileImp").click(); return; }
  var sb=e.target.closest("[data-sub]");
  if(sb){ abrirSubs(sb.dataset.sub); return; }
});
$("vista").addEventListener("input",function(e){
  var t=e.target;
  if(t.dataset.p!==undefined||t.id==="salIn"){ var d=soloDig(t.value); t.value=d?fmt(parseInt(d,10)):""; }
});
$("vista").addEventListener("change",function(e){
  var t=e.target;
  if(t.dataset.n!==undefined){ D.grupos[+t.dataset.n].nombre=t.value.trim()||"Sin nombre"; guardar(); pintar(); }
  else if(t.dataset.p!==undefined){ D.grupos[+t.dataset.p].pre=parseInt(soloDig(t.value),10)||0; guardar(); pintar(); }
  else if(t.id==="salIn"){ D.salario=parseInt(soloDig(t.value),10)||0; guardar(); }
  else if(t.id==="fileImp"&&t.files&&t.files[0]){
    var fr=new FileReader();
    fr.onload=function(){
      try{
        var j=JSON.parse(fr.result);
        if(!Array.isArray(j.mov)) throw new Error();
        D=fusionar(D,j); guardar(); pintar(); toast("Respaldo restaurado");
      }catch(err){ toast("El archivo no sirve"); }
    };
    fr.readAsText(t.files[0]);
  }
});
function cargarSalario(){
  if(!D.salario){ vista="aj"; pintar(); toast("Primero poné el monto"); return; }
  var ya=movMes(mes).some(function(x){return x.t==="i"&&x.sub==="Salario";});
  if(ya){ toast("El salario de este mes ya está cargado"); return; }
  D.mov.push({id:uid(),t:"i",fecha:(mes===ymDe(hoyISO())?hoyISO():mes+"-01"),monto:D.salario,
    gr:"",sub:"Salario",pago:"",nota:"",m:Date.now()});
  guardar(); vista="inicio"; pintar(); toast("Salario cargado");
}
var planPend=null;
function comprar(id){
  var p=null; D.plan.forEach(function(x){if(x.id===id)p=x;});
  if(!p)return;
  if(!p.monto){
    /* sin precio anotado: que ponga cuánto salió de verdad */
    planPend=p.id;
    abrirMov(null,"g");
    M.gr=p.gr; M.sub=p.titulo;
    pintarMovHoja();
    toast("¿Cuánto salió?");
    return;
  }
  p.hecho=1; p.m=Date.now();
  D.mov.push({id:uid(),t:"g",fecha:hoyISO(),monto:p.monto,gr:p.gr,sub:p.titulo,pago:"efectivo",nota:"",m:Date.now()});
  guardar(); pintar(); toast("Pasó a gastos");
}
function exportar(){
  var b=new Blob([JSON.stringify(D,null,1)],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download="respaldo-mi-plata-"+hoyISO()+".json";
  document.body.appendChild(a); a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);
}

/* ===================== hoja de movimiento ===================== */
var M={id:null,t:"g",monto:0,gr:null,sub:null,pago:"efectivo",fecha:hoyISO(),nota:""};
var confDel=false;
function abrirMov(x,tipo){
  confDel=false;
  if(x){ M={id:x.id,t:x.t,monto:x.monto,gr:x.gr,sub:x.sub,pago:x.pago||"efectivo",fecha:x.fecha,nota:x.nota||""}; }
  else { M={id:null,t:tipo||"g",monto:0,gr:null,sub:null,pago:"efectivo",
    fecha:(mes===ymDe(hoyISO())?hoyISO():mes+"-01"),nota:""};
    if(M.t==="a") M.sub="Guardé"; }
  $("movTit").textContent = x?"Editar":"Nuevo";
  $("fMonto").value = M.monto?fmt(M.monto):"";
  $("movDel").hidden=!x; $("movDel").textContent="Eliminar"; $("movDel").classList.remove("on");
  pintarMovHoja();
  $("shMov").hidden=false;
  setTimeout(function(){$("fMonto").focus();},80);
}
function pintarMovHoja(){
  var b=$("movTipo").querySelectorAll("button");
  for(var i=0;i<b.length;i++) b[i].setAttribute("aria-pressed",String(b[i].dataset.t===M.t));
  $("rwCat").hidden=(M.t==="a");
  $("rwPago").hidden=(M.t!=="g");
  $("kkCat").textContent=(M.t==="i")?"Concepto":"Categoría";
  if(M.t==="a"){
    $("rwNota").querySelector(".kk").textContent="Movimiento";
    $("vvNota").textContent=(M.sub==="Saqué")?"Sacar del ahorro":"Guardar plata";
    $("vvNota").className="vv";
  }else{
    $("rwNota").querySelector(".kk").textContent="Detalle";
    $("vvNota").textContent=M.nota||"opcional";
    $("vvNota").className=M.nota?"vv":"vv off";
  }
  if(M.sub&&M.t!=="a"){
    $("vvCat").innerHTML=(M.t==="g"?'<i class="pt" style="background:'+colG(M.gr)+'"></i>':'')+esc(M.sub);
    $("vvCat").className="vv";
  }else{ $("vvCat").textContent="elegir"; $("vvCat").className="vv off"; }
  var pn="Efectivo"; PAGOS.forEach(function(p){if(p.id===M.pago)pn=p.n;});
  $("vvPago").textContent=pn;
  $("vvFecha").textContent=fechaCorta(M.fecha)+(fechaCorta(M.fecha)==="Hoy"||fechaCorta(M.fecha)==="Ayer"?", "+new Date(M.fecha+"T12:00:00").getDate()+" "+MES3[new Date(M.fecha+"T12:00:00").getMonth()]:"");
  $("movSave").disabled=!(M.monto>0 && (M.t==="a"||M.sub));
}
$("movTipo").addEventListener("click",function(e){
  var b=e.target.closest("button"); if(!b)return;
  M.t=b.dataset.t; M.sub=(M.t==="a")?"Guardé":null; M.gr=null; pintarMovHoja();
});
$("fMonto").addEventListener("input",function(){
  var d=soloDig(this.value); this.value=d?fmt(parseInt(d,10)):"";
  M.monto=parseInt(d,10)||0; $("movSave").disabled=!(M.monto>0 && (M.t==="a"||M.sub));
});
$("movX").addEventListener("click",cerrarMov);
$("shMov").addEventListener("click",function(e){if(e.target===this)cerrarMov();});
function cerrarMov(){ $("shMov").hidden=true; planPend=null; }
$("movSave").addEventListener("click",function(){
  if($("movSave").disabled)return;
  var c={t:M.t,fecha:M.fecha,monto:M.monto,gr:M.t==="g"?M.gr:"",sub:M.sub||"",
    pago:M.t==="g"?M.pago:"",nota:M.t==="a"?"":M.nota,m:Date.now()};
  if(M.id){ for(var i=0;i<D.mov.length;i++) if(D.mov[i].id===M.id){c.id=M.id;D.mov[i]=c;break;} }
  else { c.id=uid(); D.mov.push(c); }
  mes=ymDe(c.fecha);
  var vinoDeLista=false;
  if(planPend){
    D.plan.forEach(function(p){ if(p.id===planPend){ p.hecho=1; p.monto=c.monto; p.m=Date.now(); vinoDeLista=true; } });
    planPend=null;
  }
  guardar(); cerrarMov(); pintar();
  toast(vinoDeLista?"Pasó a gastos":M.t==="i"?"Ingreso guardado":M.t==="a"?"Listo":"Gasto guardado");
});
$("movDel").addEventListener("click",function(){
  if(!confDel){ confDel=true; this.textContent="Tocá otra vez para eliminar"; this.classList.add("on"); return; }
  D.mov=D.mov.filter(function(x){return x.id!==M.id;});
  D.borrados.push(M.id); guardar(); cerrarMov(); pintar(); toast("Eliminado");
});

/* ===================== hoja de categorías ===================== */
var catAbierto=null, catDestino="mov";
$("rwCat").addEventListener("click",function(){ catDestino="mov"; abrirCat(); });
function abrirCat(){
  catAbierto=null;
  $("catTit").textContent=(catDestino==="mov"&&M.t==="i")?"Concepto":"Categoría";
  pintarCat(); $("shCat").hidden=false;
}
function pintarCat(){
  var h="";
  if(catDestino==="mov"&&M.t==="i"){
    ING.forEach(function(s){
      h+='<button class="op" data-ing="'+esc(s)+'"><i class="pt" style="background:var(--ok)"></i>'
       + '<span class="nm">'+esc(s)+'</span>'+(M.sub===s?'<span class="tk">✓</span>':'')+'</button>';
    });
    $("catLista").innerHTML=h; return;
  }
  var selGr = catDestino==="item" ? IT.gr : M.gr;
  var selSub = catDestino==="item" ? null : M.sub;
  D.grupos.forEach(function(g){
    var ab=(catAbierto===g.id);
    h+='<button class="cg" data-g="'+esc(g.id)+'" aria-expanded="'+ab+'">'
     + '<i class="pt" style="background:var('+g.col+')"></i><span class="nm">'+esc(g.nombre)+'</span>'
     + (catDestino==="item"&&selGr===g.id?'<span class="tk">✓</span>':'<span class="cnt">'+(g.subs||[]).length+'</span>')
     + '<span class="cv">⌄</span></button>';
    if(ab&&catDestino!=="item"){
      h+='<div class="csub">';
      (g.subs||[]).forEach(function(s){
        var on=(selSub===s&&selGr===g.id);
        h+='<button data-g2="'+esc(g.id)+'" data-s="'+esc(s)+'" aria-pressed="'+on+'">'+esc(s)+(on?'<span>✓</span>':'<span></span>')+'</button>';
      });
      if(!(g.subs||[]).length) h+='<div style="padding:10px 0;font-size:12.5px;color:var(--ink3)">Sin detalles. Agregalos en Ajustes.</div>';
      h+='</div>';
    }
  });
  $("catLista").innerHTML=h;
}
$("catLista").addEventListener("click",function(e){
  var ing=e.target.closest("[data-ing]");
  if(ing){ M.sub=ing.dataset.ing; M.gr=""; $("shCat").hidden=true; pintarMovHoja(); return; }
  var s=e.target.closest("[data-s]");
  if(s){ M.gr=s.dataset.g2; M.sub=s.dataset.s; $("shCat").hidden=true; pintarMovHoja(); return; }
  var g=e.target.closest("[data-g]");
  if(g){
    if(catDestino==="item"){ IT.gr=g.dataset.g; $("shCat").hidden=true; pintarItem(); return; }
    catAbierto=(catAbierto===g.dataset.g)?null:g.dataset.g; pintarCat();
  }
});
$("catX").addEventListener("click",function(){$("shCat").hidden=true;});
$("shCat").addEventListener("click",function(e){if(e.target===this)this.hidden=true;});

/* ===================== hoja de opciones ===================== */
var optCb=null;
function abrirOpt(titulo,opts,sel,cb){
  $("optTit").textContent=titulo; optCb=cb;
  var h="";
  opts.forEach(function(o){
    h+='<button class="op" data-o="'+esc(o.id)+'"><span class="nm">'+esc(o.n)+'</span>'
     + (sel===o.id?'<span class="tk">✓</span>':'')+'</button>';
  });
  $("optLista").innerHTML=h; $("shOpt").hidden=false;
}
$("optLista").addEventListener("click",function(e){
  var b=e.target.closest("[data-o]"); if(!b)return;
  $("shOpt").hidden=true; if(optCb)optCb(b.dataset.o);
});
var COLORES=["--g1","--g2","--g3","--g4","--g5","--g6","--g7","--g9","--g10","--g11","--g12","--g8"];
function colorLibre(){
  var usados={}; D.grupos.forEach(function(g){usados[g.col]=1;});
  for(var i=0;i<COLORES.length;i++) if(!usados[COLORES[i]]) return COLORES[i];
  return "--g8";
}
function abrirColor(i){
  var g=D.grupos[i]; if(!g)return;
  $("optTit").textContent="Color de "+g.nombre;
  var h='<div class="cols">';
  COLORES.forEach(function(c){
    h+='<button class="col'+(g.col===c?" on":"")+'" data-o="'+c+'" style="background:var('+c+')" aria-label="Elegir color"></button>';
  });
  $("optLista").innerHTML=h+'</div>';
  optCb=function(v){ D.grupos[i].col=v; guardar(); pintar(); };
  $("shOpt").hidden=false;
}
$("optX").addEventListener("click",function(){$("shOpt").hidden=true;});
$("shOpt").addEventListener("click",function(e){if(e.target===this)this.hidden=true;});
$("rwPago").addEventListener("click",function(){
  abrirOpt("Pagado con",PAGOS,M.pago,function(v){M.pago=v;pintarMovHoja();});
});

/* ===================== hoja de fecha ===================== */
$("rwFecha").addEventListener("click",function(){
  $("fFecha").value=M.fecha;
  var r=[{i:hoyISO(),n:"Hoy"},{i:ayerISO(),n:"Ayer"}];
  var h="";
  r.forEach(function(o){
    h+='<button class="op" data-d="'+o.i+'"><span class="nm">'+o.n+'</span>'
     + (M.fecha===o.i?'<span class="tk">✓</span>':'')+'</button>';
  });
  $("fechaRap").innerHTML=h;
  $("shFecha").hidden=false;
});
$("fechaRap").addEventListener("click",function(e){
  var b=e.target.closest("[data-d]"); if(!b)return;
  M.fecha=b.dataset.d; $("shFecha").hidden=true; pintarMovHoja();
});
$("fechaOk").addEventListener("click",function(){
  if($("fFecha").value) M.fecha=$("fFecha").value;
  $("shFecha").hidden=true; pintarMovHoja();
});
$("fechaX").addEventListener("click",function(){$("shFecha").hidden=true;});
$("shFecha").addEventListener("click",function(e){if(e.target===this)this.hidden=true;});

/* ===================== hoja de texto / ahorro ===================== */
$("rwNota").addEventListener("click",function(){
  if(M.t==="a"){
    abrirOpt("Ahorro",AHO,M.sub,function(v){M.sub=v;pintarMovHoja();});
    return;
  }
  $("txtTit").textContent="Detalle";
  $("fTxt").value=M.nota||"";
  $("shTxt").hidden=false;
  setTimeout(function(){$("fTxt").focus();},80);
});
$("txtOk").addEventListener("click",function(){ M.nota=$("fTxt").value.trim(); $("shTxt").hidden=true; pintarMovHoja(); });
$("txtX").addEventListener("click",function(){$("shTxt").hidden=true;});
$("shTxt").addEventListener("click",function(e){if(e.target===this)this.hidden=true;});

/* ===================== hoja de item de lista ===================== */
var IT={id:null,titulo:"",monto:0,gr:null};
var confDelIt=false;
function abrirItem(p){
  confDelIt=false;
  IT = p ? {id:p.id,titulo:p.titulo,monto:p.monto,gr:p.gr} : {id:null,titulo:"",monto:0,gr:D.grupos[0]&&D.grupos[0].id};
  $("itemTit").textContent=p?"Editar":"Anotar";
  $("iQue").value=IT.titulo;
  $("iMonto").value=IT.monto?fmt(IT.monto):"";
  $("itemDel").hidden=!p; $("itemDel").textContent="Eliminar"; $("itemDel").classList.remove("on");
  pintarItem(); $("shItem").hidden=false;
  setTimeout(function(){$("iQue").focus();},80);
}
function pintarItem(){
  if(IT.gr){ $("iCatV").innerHTML='<i class="pt" style="background:'+colG(IT.gr)+'"></i>'+esc(nomG(IT.gr)); $("iCatV").className="vv"; }
  else { $("iCatV").textContent="elegir"; $("iCatV").className="vv off"; }
  $("itemSave").disabled=!$("iQue").value.trim();
}
$("iQue").addEventListener("input",pintarItem);
$("iMonto").addEventListener("input",function(){
  var d=soloDig(this.value); this.value=d?fmt(parseInt(d,10)):""; IT.monto=parseInt(d,10)||0;
});
$("iCat").addEventListener("click",function(){
  catDestino="item"; catAbierto=null; $("catTit").textContent="Rubro"; pintarCat();
  /* la hoja de rubros va en el HTML antes que la de anotar: sin esto queda abajo y no se puede tocar */
  $("shCat").style.zIndex="46"; $("shOpt").style.zIndex="46";
  $("shCat").hidden=false;
});
$("itemX").addEventListener("click",function(){$("shItem").hidden=true;});
$("shItem").addEventListener("click",function(e){if(e.target===this)this.hidden=true;});
$("itemSave").addEventListener("click",function(){
  if($("itemSave").disabled)return;
  var c={titulo:$("iQue").value.trim(),monto:IT.monto,gr:IT.gr,hecho:0,m:Date.now()};
  if(IT.id){ for(var i=0;i<D.plan.length;i++) if(D.plan[i].id===IT.id){c.id=IT.id;c.hecho=D.plan[i].hecho||0;D.plan[i]=c;break;} }
  else { c.id=uid(); D.plan.push(c); }
  guardar(); $("shItem").hidden=true; vista="lista"; pintar();
});
$("itemDel").addEventListener("click",function(){
  if(!confDelIt){ confDelIt=true; this.textContent="Tocá otra vez para eliminar"; this.classList.add("on"); return; }
  D.plan=D.plan.filter(function(p){return p.id!==IT.id;});
  D.borrados.push(IT.id); guardar(); $("shItem").hidden=true; pintar();
});

/* ===================== subcategorías (ajustes) ===================== */
var subGr=null;
function abrirSubs(gid){
  subGr=gid; var g=grupo(gid); if(!g)return;
  $("optTit").textContent="Lo que hay en "+g.nombre;
  pintarSubsOpt(); $("shOpt").hidden=false; optCb=null;
}
function pintarSubsOpt(){
  var g=grupo(subGr); if(!g)return;
  var h="";
  (g.subs||[]).forEach(function(s,i){
    h+='<div class="op"><span class="nm">'+esc(s)+'</span><button class="x" data-si="'+i+'" aria-label="Quitar">✕</button></div>';
  });
  if(!(g.subs||[]).length) h='<div style="padding:12px 0;font-size:12.5px;color:var(--ink3)">Todavía no hay nada acá.</div>';
  h+='<div style="padding-top:12px"><span class="k">Agregar</span>'
   + '<input id="subNuevo" type="text" maxlength="40" placeholder="Ej: cubiertas" autocomplete="off"'
   + ' style="width:100%;margin-top:8px;background:var(--soft);border:1px solid var(--hair);border-radius:11px;padding:12px"></div>'
   + '<button class="save" id="subAdd">Agregar</button>';
  $("optLista").innerHTML=h;
}
$("optLista").addEventListener("click",function(e){
  var q=e.target.closest("[data-si]");
  if(q){ var g=grupo(subGr); g.subs.splice(+q.dataset.si,1); guardar(); pintarSubsOpt(); return; }
  if(e.target.closest("#subAdd")){
    var v=$("subNuevo").value.trim(); if(!v)return;
    var g2=grupo(subGr); g2.subs=(g2.subs||[]).concat([v]);
    guardar(); pintarSubsOpt(); return;
  }
});

/* ===================== nube ===================== */
function abrirCfg(){
  $("cUser").value=CFG.user||""; $("cRepo").value=CFG.repo||"mi-plata-datos"; $("cTok").value="";
  $("cfgMsg").innerHTML=""; $("cfgOff").hidden=!CFG.tok;
  $("cfgOff").textContent="Desconectar"; $("cfgOff").classList.remove("on");
  $("shCfg").hidden=false;
}
$("cfgX").addEventListener("click",function(){$("shCfg").hidden=true;});
$("shCfg").addEventListener("click",function(e){if(e.target===this)this.hidden=true;});
$("cfgOk").addEventListener("click",function(){
  var lim=function(s){return String(s==null?"":s).replace(/\s+/g,"");};
  var c={user:lim($("cUser").value),repo:lim($("cRepo").value),tok:lim($("cTok").value)};
  if(!c.user||!c.repo||!c.tok){$("cfgMsg").innerHTML='<div class="aviso err" style="margin-top:12px">Completá los tres campos.</div>';return;}
  $("cfgOk").disabled=true;
  $("cfgMsg").innerHTML='<div class="aviso" style="margin-top:12px">Probando la conexión…</div>';
  bajar(c).then(function(res){
    CFG=c; escribe("miplata_cfg",CFG);
    D=fusionar(D,res.datos); escribe("miplata",D);
    SHA=res.sha; escribe("miplata_sha",SHA);
    pend=true; escribe("miplata_pend",true);
    $("cfgOk").disabled=false; $("shCfg").hidden=true;
    sincronizar(true); toast("Conectado");
  }).catch(function(e){
    $("cfgOk").disabled=false;
    $("cfgMsg").innerHTML='<div class="aviso err" style="margin-top:12px">No se pudo conectar. Revisá el usuario, el repositorio y la clave.<br><br>'+esc(String(e.message||e))+'</div>';
  });
});
$("cfgOff").addEventListener("click",function(){
  if(this.textContent.indexOf("otra vez")<0){ this.textContent="Tocá otra vez para desconectar"; this.classList.add("on"); return; }
  CFG={user:"",repo:"",tok:""}; escribe("miplata_cfg",CFG);
  SHA=null; escribe("miplata_sha",null);
  estado="sin"; $("shCfg").hidden=true; pintar();
});

/* ===================== fab ===================== */
$("fab").addEventListener("click",function(){
  if(vista==="lista") abrirItem(null); else abrirMov(null);
});

/* ===================== arranque ===================== */
pintar();
if(CFG.tok) sincronizar(true);
setTimeout(function(){
  var s=$("splash"); if(s){ s.classList.add("ir"); setTimeout(function(){s.remove();},400); }
},700);
})();
