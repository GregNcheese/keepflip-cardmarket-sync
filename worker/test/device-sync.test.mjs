import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {syncStatus,syncRead,syncWrite} from '../src/device-sync.js';
const data=Buffer.alloc(256,4).toString('base64');
const envelope={v:1,alg:'AES-256-GCM',kdf:'PBKDF2-SHA256',
  compression:'gzip',iterations:210000,
  salt:Buffer.alloc(16,3).toString('base64'),
  iv:Buffer.alloc(12,2).toString('base64'),data
};
class FakeD1 {
  constructor(){this.record=null;this.history=new Map();}
  prepare(sql){
    const db=this;
    return {
      bind(...args){this.params=args;return this},
      async first(){
        if(!/SELECT/.test(sql))throw Error('unexpected query');
        return db.record?{...db.record}:null;
      },
      async run(){
        if(sql.startsWith('CREATE TABLE IF NOT EXISTS'))return {meta:{changes:0}};
        const a=this.params||[];
        if(sql.startsWith('INSERT OR IGNORE INTO keepflip_sync_state')){
          if(db.record)return {meta:{changes:0}};
          db.record={revision:a[1],envelope:a[2],updated_at:a[3],device_id:a[4],bytes:a[5]};
          return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE keepflip_sync_state')){
          if(!db.record||db.record.revision!==a[6])return {meta:{changes:0}};
          db.record={revision:a[0],envelope:a[1],updated_at:a[2],device_id:a[3],bytes:a[4]};
          return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO keepflip_sync_history')){
          db.history.set(a[0],{envelope:a[1],updated_at:a[2],device_id:a[3]});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('DELETE FROM keepflip_sync_history')){
          for(const k of [...db.history.keys()].sort((a,b)=>b-a).slice(10))db.history.delete(k);
          return {meta:{changes:1}};
        }
        throw Error('unexpected '+sql);
      }
    };
  }
}
test('D1 not yet configured -> no data upload and no made-up success',async()=>{
  assert.equal((await syncStatus({})).status,'not-configured');
  assert.equal((await syncRead({})).status,'not-configured');
  assert.equal((await syncWrite({},{})).status,'not-configured');
});
test('initial encrypted upload, optimistic conflict and pull by second device',async()=>{
  const db=new FakeD1(),env={KF_SYNC_DB:db};
  assert.deepEqual((await syncStatus(env)),{
    status:'ok',synced:true,exists:false,revision:0,
    updatedAt:null,lastDevice:null,encryptedBytes:0
  });
  const a=await syncWrite(env,{
    expectedRevision:0,deviceId:'phone_device_01',envelope
  });
  assert.equal(a.status,'saved');
  assert.equal(a.revision,1);
  assert.equal(JSON.stringify(db.record).includes('password'),false);
  const pull=await syncRead(env);
  assert.equal(pull.status,'ok');
  assert.deepEqual(pull.envelope,envelope);
  const conflict=await syncWrite(env,{
    expectedRevision:0,deviceId:'laptop_device_02',envelope
  });
  assert.equal(conflict.status,'conflict');
  assert.equal(conflict.currentRevision,1);
  const b=await syncWrite(env,{
    expectedRevision:1,deviceId:'laptop_device_02',envelope
  });
  assert.equal(b.status,'saved');assert.equal(b.revision,2);
  assert.equal((await syncStatus(env)).lastDevice,'laptop_device_02');
  assert.equal(db.history.size,2);
});
test('malformed, cleartext and too-large objects are rejected',async()=>{
  const env={KF_SYNC_DB:new FakeD1()};
  for(const invalid of [
    null,undefined,{...envelope,data:'notbase64'},
    {...envelope,kdf:'none'},
    {...envelope,iterations:1},
    {...envelope,compression:'none'},
    {...envelope,data:'A'.repeat(1500004)}
  ]){
    const r=await syncWrite(env,{expectedRevision:0,
      deviceId:'phone_device_01',envelope:invalid});
    assert.equal(r.status,'invalid-input');
  }
  const r=await syncWrite(env,{expectedRevision:-1,
    deviceId:'phone_device_01',envelope});
  assert.equal(r.status,'invalid-input');
});
test('database requires migration; errors sanitized',async()=>{
  const env={KF_SYNC_DB:{prepare(){throw Error('no such table: keepflip_sync_state /private/path')}}};
  assert.equal((await syncStatus(env)).status,'database-not-migrated');
  assert.equal((await syncRead(env)).status,'database-not-migrated');
  assert.equal((await syncWrite(env,{expectedRevision:0,deviceId:'phone_device_01',envelope})).status,'database-not-migrated');
});
test('existing Worker Bearer gate applies to D1 read/write; body size and CORS are safe',async()=>{
  const origin='https://preview.example.workers.dev';
  const env={KF_SYNC_DB:new FakeD1(),KEEPFLIP_ACCESS_TOKEN:'local-access-token',
    DIRECT_WEB_DISCOVERY:'true',APP_ORIGIN:'https://gregncheese.github.io'};
  const headers=(token='local-access-token')=>({
    'Content-Type':'application/json',Origin:origin,
    Authorization:'Bearer '+token
  });
  const post=async (expectedRevision,token)=>{
    const res=await worker.fetch(new Request(origin+'/sync/snapshot',{
      method:'POST',headers:headers(token),
      body:JSON.stringify({expectedRevision,deviceId:'phone_device_01',envelope})
    }),env);
    return {status:res.status,body:await res.json()};
  };
  const bad=await post(0,'wrong');
  assert.equal(bad.status,401);
  const ok=await post(0);
  assert.equal(ok.status,200);
  assert.equal(ok.body.status,'saved');
  assert.equal((await post(0)).status,409);
  const pull=await worker.fetch(new Request(origin+'/sync/snapshot',{
    method:'GET',headers:{Authorization:'Bearer local-access-token',Origin:origin}
  }),env);
  assert.equal((await pull.json()).revision,1);
  const status=await worker.fetch(new Request(origin+'/sync/status',{
    method:'GET',headers:{Authorization:'Bearer local-access-token',Origin:origin}
  }),env);
  assert.equal((await status.json()).synced,true);
  const cross=await worker.fetch(new Request(origin+'/sync/snapshot',{
    method:'GET',headers:{Authorization:'Bearer local-access-token',
      Origin:'https://malicious.example'}
  }),env);
  assert.equal(cross.status,403);
  const preflight=await worker.fetch(new Request(origin+'/sync/snapshot',{
    method:'OPTIONS',headers:{Origin:origin}
  }),env);
  assert.equal(preflight.status,204);
  const h=await worker.fetch(new Request(origin+'/health'),env);
  assert.equal((await h.json()).deviceSyncConfigured,true);
});
