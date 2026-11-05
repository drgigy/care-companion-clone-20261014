import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createNursingRequestHandler} from '../functions/nursing.js';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8088';
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const project='demo-rajagiri-admin',app=initializeApp({projectId:project},'allocation-tests'),db=getFirestore(app);
const root=`http://127.0.0.1:8088/v1/projects/${project}/databases/(default)/documents`;
const token=uid=>[Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({iss:`https://securetoken.google.com/${project}`,aud:project,sub:uid,user_id:uid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{sign_in_provider:'password'}})).toString('base64url'),''].join('.');
async function call(path,uid,method='GET',body){const r=await fetch(root+path,{method,headers:{Authorization:'Bearer '+token(uid),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,text:await r.text()};}
try{
 for(const [uid,profile]of Object.entries({'allocation-nurse':{role:'staff',assignedRoomUids:[]},'allocation-login':{role:'departmentAdmin',department:'roomAllocation'},'allocation-other':{role:'departmentAdmin',department:'food'},'allocation-admin':{role:'administrator'},'allocation-tablet':{role:'room',room:'306'},'allocation-disabled':{role:'departmentAdmin',department:'roomAllocation',disabled:true}}))await db.doc('profiles/'+uid).set(profile);
 const handler=createNursingRequestHandler({db,auth:{getUser:async()=>({disabled:false})},allowedOrigins:()=> 'https://mock.example'});
 const request={auth:{uid:'allocation-nurse'},rawRequest:{headers:{origin:'https://mock.example'}},data:{requestId:'emulator-batch-001',patientLanguage:'english',requests:[{room:'306',category:'roomAllocation',roomStatus:'awaitingDischarge',summary:'Planned discharge'},{room:'304',category:'roomAllocation',roomStatus:'vacated',summary:'Room vacated'},{room:'306',category:'food',summary:'Water'},{room:'306',category:'housekeeping',summary:'Clean bathroom'}]}};
 const out=await handler(request);assert.equal(out.count,4);
 const current=await db.doc('roomAllocation/306').get();assert.equal(current.data().status,'awaitingDischarge');assert.ok(current.data().updatedAt.toMillis());
 for(const uid of ['allocation-login','allocation-admin'])assert.equal((await call('/roomAllocation/306',uid)).status,200);
 for(const uid of ['allocation-nurse','allocation-tablet','allocation-other','allocation-disabled'])assert.equal((await call('/roomAllocation/306',uid)).status,403);
 for(const uid of ['allocation-login','allocation-admin','allocation-nurse','allocation-tablet']){
  const denied=await call('/roomAllocation/306',uid,'PATCH',{fields:{status:{stringValue:'ready'}}});assert.equal(denied.status,403,'direct room write must be denied');
 }
 assert.equal((await call('/roomAllocationReports/'+out.requestId,'allocation-nurse')).status,200);
 assert.equal((await call('/roomAllocationReports/'+out.requestId,'allocation-tablet')).status,403);
 for(const uid of ['allocation-login','allocation-admin'])assert.equal((await call('/roomAllocationReports/'+out.requestId,uid)).status,200);
 const q=await call(':runQuery','allocation-nurse','POST',{structuredQuery:{from:[{collectionId:'roomAllocationReports'}],where:{fieldFilter:{field:{fieldPath:'submittedByUid'},op:'EQUAL',value:{stringValue:'allocation-nurse'}}}}});assert.equal(q.status,200,q.text);
 const deniedAll=await call(':runQuery','allocation-nurse','POST',{structuredQuery:{from:[{collectionId:'roomAllocationReports'}]}});assert.equal(deniedAll.status,403);
 assert.equal((await call('/nursingBatches/'+out.requestId,'allocation-nurse')).status,403,'deduplication ledger stays server-only');
 assert.ok((await handler(request)).retried);
 await handler({...request,data:{...request.data,requestId:'emulator-batch-002',requests:[{room:'306',category:'roomAllocation',roomStatus:'ready',summary:'Room ready'}]}});await handler(request);assert.equal((await db.doc('roomAllocation/306').get()).data().status,'ready');
 const mixedCare=await db.collection('requests').where('batchId','==',out.requestId).get();assert.equal(mixedCare.size,2);assert.ok(mixedCare.docs.every(d=>d.data().category!=='roomAllocation'));
 console.log('Passed emulator: mixed batch atomic writes and timestamps, live room state, retry no-revert, department/administrator reads, denied tablet/staff board reads and all direct writes, private reports and server-only batch ledger.');
}finally{await deleteApp(app);}
