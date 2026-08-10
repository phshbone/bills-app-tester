const CACHE_NAME = 'frannies-good-girl-v20';
const APP_SHELL = ['./','./index.html','./styles.css?v=20','./app.js?v=20','./shared-care-core.js?v=1','./shared-care.js?v=1','./frannies-training-update.js?v=1','./manifest.json','./assets/frannie-background.webp','./assets/frannie-photo.webp','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const isCore=url.pathname.endsWith('/index.html')||url.pathname.endsWith('/app.js')||url.pathname.endsWith('/styles.css')||url.pathname.endsWith('/sw.js')||url.pathname.endsWith('/');
  if(isCore){event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html'))))}
  else{event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response&&response.status===200){const copy=response.clone();caches.open(CACHE_NAME).then(c=>c.put(event.request,copy))}return response})))}
});
