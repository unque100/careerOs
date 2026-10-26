const CACHE='careeros-shell-v15';
const SHELL=['/','/styles.css','/pwa-install.css','/app.js','/manifest.webmanifest','/icon.svg','/icon-192.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(response=>{
   if(response.ok&&url.pathname==='/')caches.open(CACHE).then(cache=>cache.put('/',response.clone()));
   return response;
  }).catch(()=>caches.match('/')));
  return;
 }
 if(['/styles.css','/pwa-install.css','/app.js','/manifest.webmanifest','/icon.svg','/icon-192.png'].includes(url.pathname)){
  event.respondWith(fetch(req).then(response=>{
   if(response.ok)caches.open(CACHE).then(cache=>cache.put(req,response.clone()));
   return response;
  }).catch(()=>caches.match(req)));
 }
});