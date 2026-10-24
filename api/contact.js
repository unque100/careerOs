import { db } from 'hatchable';
export const access = 'public';
export const methods = ['POST'];
const clean=(v,n=3000)=>typeof v==='string'?v.trim().slice(0,n):'';
export default async function(req,res){
 const b=req.body||{};
 if(clean(b.websiteConfirm,200))return res.status(202).json({ok:true,message:'Thank you. Your request was received.'});
 const name=clean(b.name,120),email=clean(b.email,254).toLowerCase(),category=clean(b.category,40),subject=clean(b.subject,180),message=clean(b.message,3000);
 if(name.length<2||!/^\S+@\S+\.\S+$/.test(email)||subject.length<4||message.length<20)return res.status(400).json({error:'Enter your name, valid email, subject, and a message of at least 20 characters.'});
 if(b.consent!==true)return res.status(400).json({error:'Please agree to be contacted about your support request.'});
 const categories=new Set(['general','account','billing','privacy','bug_report','feature_request']);
 if(!categories.has(category))return res.status(400).json({error:'Choose a support category.'});
 try{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email));
  const emailHash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  const allowed=await db.query("INSERT INTO support_rate_limits(email_hash,last_submitted_at) VALUES($1,now()) ON CONFLICT(email_hash) DO UPDATE SET last_submitted_at=now() WHERE support_rate_limits.last_submitted_at<now()-interval '15 minutes' RETURNING email_hash",[emailHash]);
  if(!allowed.rows.length)return res.status(429).json({error:'A request was recently submitted for this email. Please wait 15 minutes before sending another.'});
  const r=await db.query('INSERT INTO support_requests(name,email,category,subject,message,consent_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING id,created_at',[name,email,category,subject,message]);
  return res.status(201).json({ok:true,requestId:r.rows[0].id,message:'Your request has been saved. The CareerOS team can review it in the support inbox.'});
 }catch(e){console.error('CareerOS contact request error',String(e&&e.message||e).slice(0,160));return res.status(500).json({error:'Could not save your request. Please try again later.'});}
}