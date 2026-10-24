import { db, config } from 'hatchable';
export const access = 'user';
export const methods = ['GET','POST'];
export default async function(req,res){
 const user=String(req.user.id);
 if(req.method==='GET'){
  const [s,u,free,pro,price]=await Promise.all([
   db.query('SELECT plan_id,status,starts_at,expires_at,billing_provider FROM subscriptions WHERE user_id=$1 LIMIT 1',[user]),
   db.query('SELECT request_count FROM ai_usage_monthly WHERE user_id=$1 AND month_start=date_trunc(\'month\',CURRENT_DATE)::date',[user]),
   config.get('free_monthly_ai_limit'),config.get('pro_monthly_ai_limit'),config.get('pro_monthly_price_inr')
  ]);
  const sub=s.rows[0]||{plan_id:'free',status:'active',starts_at:null,expires_at:null,billing_provider:null},isPro=sub.plan_id==='pro'||sub.plan_id==='enterprise';
  return res.json({subscription:sub,usage:{used:Number(u.rows[0]?.request_count||0),limit:Number(await config.get(isPro?'pro_monthly_ai_limit':'free_monthly_ai_limit')??(isPro?300:20)),plan:sub.plan_id},plans:[{id:'free',name:'Free',monthlyPriceInr:0,monthlyAiLimit:Number(free??20),features:['Career profile','Basic roadmap and tasks','Limited AI career help','Learning, DSA and job tracker']},{id:'pro',name:'Pro',monthlyPriceInr:Number(price??799),monthlyAiLimit:Number(pro??300),features:['Higher AI usage','Advanced roadmap and analysis','Extended interview practice','More AI career coaching']}],checkoutEnabled:false,disclosure:'Prices are proposed platform fees. Checkout, recurring billing, refunds and paid entitlements are not enabled until a payment gateway and verified server-side webhooks are configured.'});
 }
 return res.status(501).json({error:'Checkout is not enabled yet. No payment was taken and no plan was changed. Configure a supported payment gateway, signed webhook verification, invoices/refunds, and entitlement tests before enabling billing.'});
}