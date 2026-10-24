import { config } from 'hatchable';
export const access = 'public';
export const methods = ['GET'];
export default async function(req,res){
 const pro=Number(await config.get('pro_monthly_price_inr')??799);
 const freeLimit=Number(await config.get('free_monthly_ai_limit')??20);
 const proLimit=Number(await config.get('pro_monthly_ai_limit')??300);
 return res.json({currency:'INR',checkoutEnabled:false,disclaimer:'Prices are proposed platform subscription fees. Paid checkout is not active and no payment is collected. AI usage limits are enforced server-side.',plans:[
 {id:'free',name:'Free',monthlyPriceInr:0,tagline:'Start building a more intentional career.',monthlyAiLimit:freeLimit,features:['Career profile and goals','Starter roadmap and task tracking','Limited AI career coaching','Resume feedback and job analysis','Learning, DSA and job tracker']},
 {id:'pro',name:'Pro',monthlyPriceInr:Math.max(0,pro),tagline:'More room for focused career preparation.',monthlyAiLimit:proLimit,features:['Higher monthly AI usage','More career coaching and analysis','Advanced roadmaps','Extended interview practice','More learning and job-search reviews']}
 ]});
}