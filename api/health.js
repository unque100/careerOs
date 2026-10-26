import { auth, db } from 'hatchable';
export const access = 'public';
export const methods = ['GET'];
export default async function(req,res){
 try{const r=await db.query('SELECT 1 AS ok');const user=await auth.getUser(req);return res.json({status:'ok',database:r.rows[0]?.ok===1?'ok':'unknown',authentication:{configured:true,session:user?'signed_in':'anonymous'},timestamp:new Date().toISOString(),note:'AI and billing providers are checked only when their features are used.'})}
 catch(e){return res.status(503).json({status:'degraded',database:'unavailable',timestamp:new Date().toISOString()})}
}