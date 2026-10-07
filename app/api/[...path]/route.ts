export const dynamic = 'force-dynamic';
async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}){
 const base=process.env.API_BASE_URL;
 if(!base)return Response.json({detail:'Sign-in is temporarily unavailable. Please try again shortly.'},{status:503});
 const {path}=await params;
 if(!['auth','journal','profile','entries','recommendation'].includes(path[0]))return Response.json({detail:'Not found'},{status:404});
 const origin=request.headers.get('origin');
 if(!['GET','HEAD'].includes(request.method)&&origin&&origin!==new URL(request.url).origin)return Response.json({detail:'Invalid request origin'},{status:403});
 const headers=new Headers({'Content-Type':'application/json'});
 const sessionCookie=request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith('tally_session='));
 if(sessionCookie)headers.set('cookie',sessionCookie);
 // The browser request was checked above. The API call is server-to-server, so do not relay the browser Origin.

 try{const response=await fetch(`${base.replace(/\/$/,'')}/api/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:await request.text(),redirect:'manual',signal:AbortSignal.timeout(15000)});const outputHeaders=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});for(const cookie of response.headers.getSetCookie())outputHeaders.append('Set-Cookie',cookie);return new Response(response.body,{status:response.status,headers:outputHeaders});}catch{return Response.json({detail:'Your account service is unavailable. Please try again shortly.'},{status:502});}
}
export const GET=proxy;export const POST=proxy;export const PUT=proxy;export const DELETE=proxy;
