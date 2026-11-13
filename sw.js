/* Mi Plata - para que ande sin internet y se pueda instalar */
var V = "miplata-v7";
var ARCH = ["./", "./index.html", "./app.js?v=7", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", function(e){
  e.waitUntil(caches.open(V).then(function(c){ return c.addAll(ARCH).catch(function(){}); })
    .then(function(){ return self.skipWaiting(); }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){ if(k !== V) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
/* Primero la red: con internet siempre se ve la version nueva.
   Sin internet, se usa la copia guardada. La nube de GitHub va directo. */
self.addEventListener("fetch", function(e){
  var r = e.request;
  if (r.method !== "GET") return;
  var u;
  try { u = new URL(r.url); } catch(err){ return; }
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(function(res){
    if (res && res.status === 200) { var cp = res.clone(); caches.open(V).then(function(c){ c.put(r, cp); }); }
    return res;
  }).catch(function(){
    return caches.match(r).then(function(m){ return m || caches.match("./index.html") || caches.match("./"); });
  }));
});
