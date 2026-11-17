/**
 * Keep & Flip private encrypted snapshot synchronization.
 * - Browser encrypts before upload. Worker never receives plaintext.
 * - Single-user auth is the EXISTING Worker Bearer gate in index.js.
 * - Revision compare-and-swap prevents stale-device overwrite.
 * - D1 binding env.KF_SYNC_DB is intentionally NOT provisioned automatically.
 * - No inventory merging, sale duplication, or auto-destructive restore.
 */
const ROW='personal';
const LIMIT=1_500_000;
const DEVICE_ID=/^[a-z0-9_-]{8,72}$/i;
const BASE64=/^[A-Za-z0-9+/]+={0,2}$/;
const DB_UNAVAILABLE={status:'not-configured',synced:false};
function isBound(env){return Boolean(env?.KF_SYNC_DB?.prepare);}
function validEnvelope(envelope){
  if(!envelope || typeof envelope!=='object' || Array.isArray(envelope))return false;
  const {v,alg,kdf,compression,salt,iv,data,iterations}=envelope;
  if(v!==1 || alg!=='AES-256-GCM' || kdf!=='PBKDF2-SHA256' ||
     compression!=='gzip'||iterations!==210000)return false;
  for(const [value,min,max] of [[salt,20,64],[iv,12,40],[data,40,LIMIT]]){
    if(typeof value!=='string'||value.length<min||value.length>max||
       value.length%4!==0||!BASE64.test(value))return false;
  }
  return true;
}
function errorStatus(e){
  const msg=String(e?.message||'').toLowerCase();
  if(msg.includes('no such table'))return 'database-not-migrated';
  return 'database-error';
}
function response(status,extra={}){return {status,...extra};}
export async function syncStatus(env){
  if(!isBound(env))return DB_UNAVAILABLE;
  try{
    const row=await env.KF_SYNC_DB.prepare(
      "SELECT revision,updated_at,device_id,bytes FROM keepflip_sync_state WHERE id=?"
    ).bind(ROW).first();
    return response('ok',{
      synced:true,exists:!!row,revision:row?.revision||0,
      updatedAt:row?.updated_at||null,
      lastDevice:row?.device_id||null,
      encryptedBytes:row?.bytes||0
    });
  }catch(e){return response(errorStatus(e),{synced:false});}
}
export async function syncRead(env){
  if(!isBound(env))return DB_UNAVAILABLE;
  try{
    const row=await env.KF_SYNC_DB.prepare(
      "SELECT revision,envelope,updated_at,device_id FROM keepflip_sync_state WHERE id=?"
    ).bind(ROW).first();
    if(!row)return response('empty',{revision:0});
    if(!Number.isSafeInteger(row.revision)||!row.envelope)return response('invalid-record');
    const parsed=JSON.parse(row.envelope);
    if(!validEnvelope(parsed))return response('invalid-record');
    return response('ok',{
      revision:row.revision,envelope:parsed,
      updatedAt:row.updated_at,lastDevice:row.device_id
    });
  }catch(e){return response(errorStatus(e));}
}
export async function syncWrite(env,input) {
  if(!isBound(env))return DB_UNAVAILABLE;
  const expected=input?.expectedRevision;
  const deviceId=input?.deviceId;
  const envelope=input?.envelope;
  if(!Number.isSafeInteger(expected)||expected<0||expected>1_000_000_000||
     typeof deviceId!=='string'||!DEVICE_ID.test(deviceId)||
     !validEnvelope(envelope))return response('invalid-input');
  const serialized=JSON.stringify(envelope);
  if(serialized.length>LIMIT)return response('payload-too-large');
  const next=expected+1,now=new Date().toISOString();
  try{
    const result=expected===0
      ?await env.KF_SYNC_DB.prepare(
        "INSERT OR IGNORE INTO keepflip_sync_state(id,revision,envelope,updated_at,device_id,bytes) VALUES(?,?,?,?,?,?)"
      ).bind(ROW,next,serialized,now,deviceId,serialized.length).run()
      :await env.KF_SYNC_DB.prepare(
        "UPDATE keepflip_sync_state SET revision=?,envelope=?,updated_at=?,device_id=?,bytes=? WHERE id=? AND revision=?"
      ).bind(next,serialized,now,deviceId,serialized.length,ROW,expected).run();
    if(result?.meta?.changes!==1){
      const nowRemote=await syncStatus(env);
      return response('conflict',{
        currentRevision:nowRemote.revision??null,
        updatedAt:nowRemote.updatedAt??null
      });
    }
    // Best-effort history; live state is the source of truth. No plaintext.
    try{
      await env.KF_SYNC_DB.prepare(
        "INSERT INTO keepflip_sync_history(revision,envelope,updated_at,device_id) VALUES(?,?,?,?)"
      ).bind(next,serialized,now,deviceId).run();
      await env.KF_SYNC_DB.prepare(
        "DELETE FROM keepflip_sync_history WHERE revision NOT IN "+
        "(SELECT revision FROM keepflip_sync_history ORDER BY revision DESC LIMIT 10)"
      ).run();
    }catch{}
    return response('saved',{revision:next,updatedAt:now});
  }catch(e){return response(errorStatus(e));}
}
