import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const ownerId="24e04247-35c4-4e62-ab93-2229322a7b28";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Método não permitido"},405);
 const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
 if(!token)return reply({error:"Entre na sua conta"},401);
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await admin.auth.getUser(token);
 if(authError||!auth.user)return reply({error:"Sessão inválida"},401);
 if(auth.user.id!==ownerId||auth.user.app_metadata?.central_admin!==true)return reply({error:"Somente o administrador pode criar contas"},403);
 try{
  const body=await req.json();
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  const password=typeof body.password==="string"?body.password:"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<8||password.length>128)return reply({error:"Informe um e-mail válido e uma senha de 8 a 128 caracteres"},400);
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{central_access:true,central_admin:false}});
  if(error)return reply({error:error.message},400);
  return reply({id:data.user.id,email:data.user.email},201);
 }catch{return reply({error:"Não foi possível criar a conta"},400)}
});