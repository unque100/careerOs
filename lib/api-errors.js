export function respondToApiError(route,error,req,res){
 const rawStatus=Number(error&&error.status||0);
 const publicClientError=[400,401,403,404,409,413,415,422,429].includes(rawStatus);
 const status=publicClientError?rawStatus:500;
 const message=String(error&&error.message||'Request failed').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,220);
 const requestId=String(req&&((req.requestId)||(req.headers&&req.headers['x-request-id']))||'').replace(/[^a-zA-Z0-9._:-]/g,'').slice(0,80)||undefined;
 console.error(JSON.stringify({event:'api.unhandled_error',route:String(route||'unknown').slice(0,100),method:String(req&&req.method||'unknown').slice(0,12),status,requestId,error:message}));
 if(res&&res.headersSent)return;
 return res.status(status).json({error:publicClientError?message:'The request could not be completed. Please retry.',...(requestId?{requestId}:{})});
}