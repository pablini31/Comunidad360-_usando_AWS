const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const base = (process.env.VERIFY_API_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/,'');
const adminUser = process.env.VERIFY_ADMIN_USERNAME || process.env.SEED_ADMIN_USERNAME;
const adminPass = process.env.VERIFY_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
const analystUser = process.env.VERIFY_ANALYST_USERNAME || process.env.SEED_ANALYST_USERNAME;
const analystPass = process.env.VERIFY_ANALYST_PASSWORD || process.env.SEED_ANALYST_PASSWORD;
if (![adminUser,adminPass,analystUser,analystPass].every(Boolean) || [adminUser,adminPass,analystUser,analystPass].some((v)=>/^(CAMBIAR|REEMPLAZA|CHANGE_ME)/i.test(v))) {
  console.error('Configura las credenciales SEED_ADMIN_* y SEED_ANALYST_* en .env antes de ejecutar la verificación.');
  process.exit(2);
}
async function req(path, { token, method='GET', body }={}) {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),120000);
  let r;try{r=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});}finally{clearTimeout(timeout);}
  let data=null;try{data=await r.json()}catch{}return {status:r.status,data};
}
function ok(condition,message){if(!condition)throw new Error(message);console.log(`✓ ${message}`)}
async function availableTestId(token){for(let n=888887;n<900000;n++){const id=`U${String(n).padStart(6,'0')}`;const r=await req(`/api/usuarios/${id}`,{token});if(r.status===404)return id;if(r.status!==200)throw new Error(`No se pudo comprobar la disponibilidad de ${id} (HTTP ${r.status}).`);}throw new Error('No se encontró un ID temporal libre para probar alias duplicado.');}
async function main(){
  const adminLogin=await req('/api/auth/login',{method:'POST',body:{username:adminUser,password:adminPass}});
  ok(adminLogin.status===200&&adminLogin.data.token,'login administrador exitoso');
  const badLogin=await req('/api/auth/login',{method:'POST',body:{username:adminUser,password:`${adminPass}-incorrecta`}});
  ok(badLogin.status===401,'login fallido rechazado');
  const analystLogin=await req('/api/auth/login',{method:'POST',body:{username:analystUser,password:analystPass}});
  ok(analystLogin.status===200&&analystLogin.data.token,'login analista exitoso');
  const adminToken=adminLogin.data.token, analystToken=analystLogin.data.token;
  ok((await req('/api/usuarios',{token:analystToken,method:'POST',body:{}})).status===403,'RBAC bloquea POST para analista');
  ok((await req('/api/usuarios/U000000',{token:analystToken,method:'DELETE'})).status===403,'RBAC bloquea DELETE para analista');
  const badBase={id_usuario:'U888888',alias:'prueba-api',fecha_ingreso:'2024-01-01',ciudad_id:null,latitud:null,longitud:null,rango_edad:'25-31',especie_fursona:'Prueba',interes_principal:'Pruebas',plataforma_principal:'Discord',es_artista:0,mensajes_30d:0,reacciones_30d:0,eventos_asistidos:0,comisiones_compradas:0,sentimiento_promedio:0,ultima_actividad:'2024-01-01',estatus:'activo',consentimiento_datos:'no'};
  ok((await req('/api/usuarios',{token:adminToken,method:'POST',body:{...badBase,id_usuario:'bad'}})).status===400,'rechaza ID inválido');
  ok((await req('/api/usuarios',{token:adminToken,method:'POST',body:{...badBase,estatus:'inactivo',mensajes_30d:2}})).status===400,'rechaza inactivo con mensajes');
  ok((await req('/api/usuarios',{token:adminToken,method:'POST',body:{...badBase,sentimiento_promedio:1.2}})).status===400,'rechaza sentimiento fuera de rango');
  const sample=await req('/api/usuarios?limit=1',{token:adminToken});
  if(sample.status!==200||!sample.data.items.length)throw new Error('No se pudo obtener alias existente para probar unicidad.');
  const duplicateId=await availableTestId(adminToken);
  const duplicateAlias=await req('/api/usuarios',{token:adminToken,method:'POST',body:{...badBase,id_usuario:duplicateId,alias:sample.data.items[0].alias}});
  ok(duplicateAlias.status===409&&duplicateAlias.data?.error==='El alias ya está registrado.','rechaza alias duplicado');
  const existing=await req('/api/usuarios/U999999',{token:adminToken});
  if(existing.status===200)throw new Error('U999999 ya existe; se detiene para proteger datos existentes.');
  if(existing.status!==404)throw new Error(`No se pudo verificar disponibilidad de U999999 (${existing.status}).`);
  const baseline=await req('/api/usuarios?limit=1',{token:adminToken});
  if(baseline.status!==200||baseline.data.total!==1068)throw new Error(`Se esperaba el padrón inicial de 1,068 usuarios; encontrado: ${baseline.data?.total??'desconocido'}. No se modifica la base.`);
  const mapBefore=await req('/api/analytics/mapa',{token:adminToken});
  if(mapBefore.status!==200)throw new Error('No se pudo obtener el mapa antes de la prueba de privacidad.');
  const testUser={...badBase,id_usuario:'U999999',alias:`verify_${Date.now()}`};let createAttempted=false;
  try{
    createAttempted=true;
    const result=await req('/api/usuarios',{token:adminToken,method:'POST',body:testUser});
    if(result.status!==201)throw new Error(`No se pudo crear usuario temporal (${result.status}): ${result.data?.error||''}`);
    const detail=await req('/api/usuarios/U999999',{token:adminToken});
    ok(detail.status===200&&detail.data.user.ciudad_id===null&&detail.data.user.latitud===null&&detail.data.user.longitud===null,'privacidad fuerza ubicación NULL para consentimiento no');
    const map=await req('/api/analytics/mapa',{token:adminToken});
    ok(map.status===200&&map.data.length===mapBefore.data.length&&map.data.every(x=>x.latitud!=null&&x.longitud!=null&&Object.keys(x).sort().join(',')==='ciudad,estatus,latitud,longitud,pais,sentimiento_promedio'),'usuario sin consentimiento excluido del mapa y respuesta con campos permitidos');
    const analytics=await req('/api/analytics/resumen',{token:adminToken});ok(analytics.status===200&&analytics.data.total_usuarios>=1,'analítica híbrida responde');
    const quarantine=await req('/api/cuarentena?limit=10',{token:adminToken});ok(quarantine.status===200&&Array.isArray(quarantine.data.items),'cuarentena responde paginada');
  } finally {if(createAttempted){const probe=await req('/api/usuarios/U999999',{token:adminToken});if(probe.status===200&&probe.data.user?.alias===testUser.alias){const cleanup=await req('/api/usuarios/U999999',{token:adminToken,method:'DELETE'});if(cleanup.status!==204)throw new Error(`Limpieza de U999999 requiere atención (HTTP ${cleanup.status}).`);}else if(probe.status!==404)throw new Error(`No se pudo comprobar la limpieza de U999999 (HTTP ${probe.status}).`);const finalCount=await req('/api/usuarios?limit=1',{token:adminToken});if(finalCount.status!==200||finalCount.data.total!==baseline.data.total)throw new Error(`El padrón final no coincide con su conteo inicial (${baseline.data.total}).`);ok(true,'usuario temporal eliminado; padrón restaurado');}}
}
main().catch(e=>{console.error(`Verificación fallida: ${e.message}`);process.exitCode=1;});
