const CACHE='sudoku-v1';
self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./'])).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin))return;
 e.respondWith(
  fetch(e.request).then(resp=>{
   const cl=resp.clone();
   caches.open(CACHE).then(c=>c.put(e.request,cl));
   return resp;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./')))
 );
});
