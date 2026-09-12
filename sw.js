const CACHE_NAME='vehicle-schedule-v36';
const STATIC_ASSETS=['./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const isNavigation=req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html');
  if(isNavigation){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));
    return;
  }
  event.respondWith(fetch(req).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}
    return res;
  }).catch(()=>caches.match(req)));
});
