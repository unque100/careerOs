(()=> {
'use strict';
const API=(window.__HATCHABLE__&&window.__HATCHABLE__.api)||'/api';
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
async function api(path,opt={}){
 const o={...opt,headers:{...(opt.headers||{})}};
 if(o.body){o.headers['Content-Type']='application/json';o.body=JSON.stringify(o.body);}
 const response=await fetch(API+path,o);
 const data=await response.json().catch(()=>({error:'Invalid response'}));
 if(!response.ok)throw Error(data.message||data.error||'Request failed');
 return data;
}
function setMessage(text,isError=false){
 const el=$('#adminMessage');el.textContent=text;el.className='notice'+(isError?'':' ok');
}
function renderSupport(rows){
 const el=$('#supportInbox');
 if(!rows.length){el.innerHTML='<div class="empty-state">No support requests yet. Public contact requests will appear here.</div>';return;}
 el.innerHTML=rows.map(function(item){
  const statuses=['new','in_review','replied','closed','spam'];
  const options=statuses.map(function(status){
   return '<option value="'+status+'" '+(item.status===status?'selected':'')+'>'+status.replaceAll('_',' ')+'</option>';
  }).join('');
  return '<article class="panel" style="margin:10px 0;background:#fbfcff">'+
   '<div class="page-head"><div><div class="tiny-label">'+esc(item.category.replaceAll('_',' ').toUpperCase())+' · '+esc(new Date(item.created_at).toLocaleString())+'</div>'+
   '<h3 class="panel-title" style="margin-top:7px">'+esc(item.subject)+'</h3><p>'+esc(item.name)+' · <a class="link-quiet" href="mailto:'+esc(item.email)+'">'+esc(item.email)+'</a></p></div>'+
   '<span class="badge">'+esc(item.status.toUpperCase())+'</span></div>'+
   '<p style="font-size:10px;line-height:1.85;white-space:pre-wrap;color:#586781">'+esc(item.message)+'</p>'+
   '<div class="form-grid"><div class="field"><label for="supportStatus-'+item.id+'">Status</label><select id="supportStatus-'+item.id+'">'+options+'</select></div>'+
   '<div class="field span-2"><label for="supportNotes-'+item.id+'">Internal notes</label><textarea id="supportNotes-'+item.id+'" rows="2" maxlength="3000" placeholder="Internal follow-up notes">'+esc(item.owner_notes||'')+'</textarea></div></div>'+
   '<div class="form-actions"><button class="btn btn-primary btn-sm" data-support-save="'+item.id+'">Save support status</button></div>'+
   '<p id="supportMessage-'+item.id+'" class="form-message"></p></article>';
 }).join('');
 el.querySelectorAll('[data-support-save]').forEach(function(button){
  button.onclick=async function(){
   const id=Number(button.dataset.supportSave),msg=$('#supportMessage-'+id);
   button.disabled=true;
   try{
    await api('/admin/support',{method:'PUT',body:{id:id,status:$('#supportStatus-'+id).value,ownerNotes:$('#supportNotes-'+id).value}});
    msg.textContent='Saved.';setMessage('Support request '+id+' updated.');await loadSupport();
   }catch(error){msg.textContent=error.message;msg.classList.add('error');}
   finally{button.disabled=false;}
  };
 });
}
async function loadSupport(){
 const data=await api('/admin/support');renderSupport(data.requests||[]);
}
async function load(){
 setMessage('Loading operational data…');
 try{
  const results=await Promise.all([api('/admin/overview'),api('/admin/support')]);
  const data=results[0],support=results[1];
  const items=[['Registered profiles',data.users.total],['Onboarding complete',data.users.onboarded],['Career goals',data.goals],['Roadmaps',data.roadmaps],['Resume records',data.resumes],['Job applications',data.applications],['Mock interviews',data.interviews.total],['Completed interviews',data.interviews.completed],['AI requests logged',data.aiRequests]];
  $('#adminStats').innerHTML=items.map(function(item){return '<div class="stat-card"><span>'+esc(item[0])+'</span><b>'+Number(item[1]||0).toLocaleString('en-IN')+'</b><small>Persisted records</small></div>';}).join('');
  const rows=(data.subscriptions||[]).map(function(item){return '<tr><td>'+esc(item.plan_id)+'</td><td>'+Number(item.users)+'</td><td>Paid checkout disabled</td></tr>';}).join('');
  $('#planTable').innerHTML='<div class="data-table-wrap"><table class="data-table"><thead><tr><th>PLAN</th><th>SUBSCRIPTION RECORDS</th><th>PAYMENT STATUS</th></tr></thead><tbody>'+(rows||'<tr><td colspan="3">No subscription records yet.</td></tr>')+'</tbody></table></div>';
  renderSupport(support.requests||[]);
  setMessage('Metrics loaded at '+new Date(data.generatedAt).toLocaleString()+'. Counts describe saved records, not market traction or revenue.');
 }catch(error){
  setMessage('Owner/admin access is required to use this page. Sign into the project owner account, then refresh. '+error.message,true);
  $('#supportInbox').innerHTML='<div class="empty-state">Support inbox requires owner/admin access.</div>';
 }
}
$('#refreshAdmin').onclick=load;
load();
})();