const CACHE_NAME='vehicle-schedule-v47fix24-android-icon';

const STATIC_ASSETS=[
  '/vehicle-schedule/manifest.json',
  '/vehicle-schedule/icon-192.png',
  '/vehicle-schedule/icon-512.png',
  '/vehicle-schedule/apple-touch-icon.png'
];

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(STATIC_ASSETS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys
          .filter(k=>k!==CACHE_NAME)
          .map(k=>caches.delete(k))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', event=>{
  const req=event.request;

  if(req.method!=='GET') return;

  // chrome-extension:// など、Cache APIで扱えない通信は無視する
  if(req.url.startsWith('chrome-extension://')) return;

  const isNavigation=
    req.mode==='navigate' ||
    (req.headers.get('accept')||'').includes('text/html');

  if(isNavigation){
    event.respondWith(
      fetch(req,{cache:'no-store'})
        .catch(()=>caches.match(req)
          .then(r=>r||caches.match('/vehicle-schedule/index.html')))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(res=>{
        if(res.ok && /^https?:$/.test(new URL(req.url).protocol)){
          const copy=res.clone();
          caches.open(CACHE_NAME)
            .then(c=>c.put(req,copy))
            .catch(()=>{});
        }
        return res;
      })
      .catch(()=>caches.match(req))
  );
});

/* =========================================
   通知機能：ここから追加
   ========================================= */

self.addEventListener('push', event=>{
  let data={};

  try{
    if(event.data){
      data=event.data.json();
    }
  }catch(e){
    try{
      data={
        body:event.data ? event.data.text() : ''
      };
    }catch(err){
      data={};
    }
  }

  const title=String(
    data.title ||
    '車両人員予定表'
  );

  const body=String(
    data.body ||
    '新しいお知らせがあります'
  );

  const options={
    body:body,

    icon:'/vehicle-schedule/icon-192.png',

    badge:'/vehicle-schedule/icon-192.png',

    data:{
      url:'/vehicle-schedule/'
    },

    tag:'vehicle-schedule-notice',

    renotify:true
  };

  event.waitUntil(
    self.registration.showNotification(title,options)
  );
});


self.addEventListener('notificationclick',event=>{
  event.notification.close();

  const targetUrl=
    event.notification &&
    event.notification.data &&
    event.notification.data.url
      ? event.notification.data.url
      : '/vehicle-schedule/';

  const url=new URL(
    targetUrl,
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({
      type:'window',
      includeUncontrolled:true
    }).then(clientList=>{

      for(const client of clientList){

        if('focus' in client){

          if('navigate' in client){
            return client
              .navigate(url)
              .then(()=>client.focus());
          }

          return client.focus();
        }
      }

      if(clients.openWindow){
        return clients.openWindow(url);
      }

      return undefined;
    })
  );
});
