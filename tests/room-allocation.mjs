import assert from 'node:assert/strict';
import {createNursingRequestHandler} from '../functions/nursing.js';
import {createTranscriptionHandler} from '../functions/transcription.js';
import {accountInput} from '../functions/admin.js';
import {allocationViewer} from '../room-allocation-store.js';
import {nursingCategories,allocationStatuses,allocationRooms,validateRequests} from '../nursing-drafts.js';
import {categories} from '../shared.js';
assert.equal(Object.keys(categories).length,8,'patient retains exactly eight categories');assert.ok(!categories.roomAllocation);assert.ok(nursingCategories.roomAllocation);assert.equal(allocationRooms.length,30);assert.equal(allocationRooms[0],'301');assert.equal(allocationRooms[29],'330');
assert.ok(allocationViewer({role:'departmentAdmin',department:'roomAllocation'}));assert.ok(allocationViewer({role:'administrator'}));for(const p of [{role:'room'},{role:'staff'},{role:'departmentAdmin',department:'food'},{role:'departmentAdmin',department:'roomAllocation',disabled:true}])assert.ok(!allocationViewer(p));
assert.equal(accountInput({name:'Rooms',email:'room@example.test',role:'departmentAdmin',department:'roomAllocation'}).department,'roomAllocation');
const records=new Map([['profiles/nurse',{role:'staff',assignedRoomUids:[]}],['profiles/tablet',{role:'room',room:'301'}],['profiles/allocator',{role:'departmentAdmin',department:'roomAllocation'}],['profiles/admin',{role:'administrator'}]]);
let failCommit=false,tail=Promise.resolve(),authDisabled=false;
const snapshot=path=>({exists:records.has(path),data:()=>records.get(path)});
const db={doc:path=>({path,get:async()=>snapshot(path)}),runTransaction:fn=>{const run=tail.then(async()=>{const writes=[];const out=await fn({get:async ref=>snapshot(ref.path),create:(ref,data)=>writes.push({path:ref.path,data,create:true}),set:(ref,data)=>writes.push({path:ref.path,data})});if(failCommit)throw Error('Simulated transaction failure');for(const w of writes)if(w.create&&records.has(w.path))throw Error('Duplicate write');for(const w of writes)records.set(w.path,w.data);return out;});tail=run.catch(()=>{});return run;}};
const deps={db,auth:{getUser:async()=>({disabled:authDisabled})},allowedOrigins:()=> 'https://mock.example'};
const handler=createNursingRequestHandler(deps),req=(data,uid='nurse',origin='https://mock.example')=>({auth:uid?{uid}:null,rawRequest:{headers:{origin}},data});
const allocate=(room,roomStatus)=>({room,roomStatus,category:'roomAllocation',summary:`Room ${room} status report`});
const care=(room,category,summary)=>({room,category,summary});
const payload={requestId:'batch-report-0001',ward:'Ward',patientLanguage:'english',requests:[allocate('306','awaitingDischarge'),allocate('304','vacated'),care('306','food','Water'),care('306','housekeeping','Clean bathroom'),care('999','nursing','Nurse assistance')]};
validateRequests(payload.requests);
for(const uid of [null,'tablet','allocator','admin'])await assert.rejects(()=>handler(req(payload,uid)),e=>['unauthenticated','permission-denied'].includes(e.code));
await assert.rejects(()=>handler(req(payload,'nurse','https://evil.test')),e=>e.code==='permission-denied');authDisabled=true;await assert.rejects(()=>handler(req(payload)),e=>e.code==='permission-denied');authDisabled=false;
const initial=records.size;
for(const requests of [[allocate('3066','occupied')],[allocate('301','bad')],[allocate('306','occupied'),allocate('306','vacated')],[care('301','food','')],Array.from({length:31},()=>care('301','food','Water'))]){
 await assert.rejects(()=>handler(req({...payload,requests})),e=>e.code==='invalid-argument');assert.equal(records.size,initial,'invalid batches must have no partial effects');assert.throws(()=>validateRequests(requests));
}
failCommit=true;await assert.rejects(()=>handler(req(payload)),/Simulated/);assert.equal(records.size,initial);failCommit=false;
const result=await handler(req(payload));assert.equal(result.roomCount,2);assert.equal(result.careCount,3);assert.equal(records.get('roomAllocation/306').status,'awaitingDischarge');assert.equal(records.get('roomAllocation/304').status,'vacated');
const careRows=[...records].filter(([path])=>path.startsWith('requests/')).map(([,row])=>row);assert.equal(careRows.length,3);assert.ok(careRows.every(row=>row.category!=='roomAllocation'));assert.equal(careRows.filter(row=>row.room==='306').length,2);assert.ok(careRows.some(row=>row.room==='999'),'ordinary care has no assigned-room/301–330 restriction');
const after=records.size;assert.ok((await handler(req(payload))).retried);assert.equal(records.size,after);
await handler(req({...payload,requestId:'batch-report-0002',requests:[allocate('306','occupied')]}));await handler(req(payload));assert.equal(records.get('roomAllocation/306').status,'occupied','retry of an older report must never revert a later room status');
await assert.rejects(()=>handler(req({...payload,requests:[allocate('306','ready')]})),e=>e.code==='already-exists');
records.set('profiles/nurse',{role:'staff',disabled:true});await assert.rejects(()=>handler(req({...payload,requestId:'disabled-report'})),e=>e.code==='permission-denied');records.set('profiles/nurse',{role:'staff',assignedRoomUids:[]});
const extraction={room:'3066',category:'roomAllocation',summary:'Reports',patientLanguage:'english',transcript:'3066 awaiting discharge, 304 vacated, 306 occupied, 306 ready, 310 water and cleaning',requests:[allocate('3066','awaitingDischarge'),allocate('304','vacated'),allocate('306','occupied'),allocate('306','ready'),care('310','food','Water'),care('310','housekeeping','Cleaning')]};
const transcribe=createTranscriptionHandler({...deps,transcribe:async()=>extraction});const parsed=await transcribe(req({audio:'AAAA',mimeType:'audio/wav'}));assert.equal(parsed.requests.length,6);assert.equal(parsed.requests[0].room,'3066','do not shorten an out-of-range dictated number');assert.equal(parsed.requests.filter(row=>row.room==='306').length,2,'preserve conflicting dictation for review');assert.equal(parsed.requests.filter(row=>row.room==='310').length,2);
console.log('Passed: nursing-only ninth category, all 30 rooms, department read scope, mixed multi-room/multi-request batches, unrestricted ordinary care rooms, invalid/duplicate status rejection, atomic failures, retry deduplication and stale retry protection.');

// The fifth status must survive transcription, review and the server write path.
assert.equal(Object.keys(allocationStatuses).length,5);assert.equal(allocationStatuses.dischargeTomorrow,'Discharge tomorrow');
const tomorrow={requestId:'batch-tomorrow-001',patientLanguage:'english',requests:[allocate('307','dischargeTomorrow'),allocate('308','awaitingDischarge')]};
validateRequests(tomorrow.requests);await handler(req(tomorrow));assert.equal(records.get('roomAllocation/307').status,'dischargeTomorrow');assert.equal(records.get('roomAllocation/308').status,'awaitingDischarge');
const extractedTomorrow=createTranscriptionHandler({...deps,transcribe:async()=>({room:'307',category:'roomAllocation',summary:'Discharge tomorrow',patientLanguage:'english',transcript:'307 tomorrow; 308 today',roomUpdates:tomorrow.requests,requests:tomorrow.requests})});
const future=await extractedTomorrow(req({audio:'AAAA',mimeType:'audio/wav'}));assert.equal(future.requests[0].roomStatus,'dischargeTomorrow');assert.equal(future.roomUpdates[0].roomStatus,'dischargeTomorrow');assert.equal(future.requests[1].roomStatus,'awaitingDischarge');
console.log('Passed: Discharge tomorrow is distinct from awaiting discharge in review, transcription and persisted status.');
// Execute the board's actual projection without initializing browser authentication.
const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
const boardSource=readFileSync('room-allocation.js','utf8');
const projection=boardSource.slice(boardSource.indexOf('export function boardRooms('),boardSource.indexOf('\nfunction render(')).replace('export ','');
const boardContext=vm.createContext({allocationRooms,allocationStatuses});vm.runInContext(projection,boardContext);
const emptyBoard=vm.runInContext('boardRooms([])',boardContext);assert.equal(emptyBoard.length,30);assert.ok(emptyBoard.every(r=>r.status==='ready'),'unreported rooms use the requested white ready display default');
boardContext.rows=[{room:'306',status:'dischargeTomorrow'},{room:'307',status:'awaitingDischarge'}];
const displayed=vm.runInContext('boardRooms(rows)',boardContext);assert.equal(displayed.find(r=>r.room==='306').status,'dischargeTomorrow');assert.equal(displayed.find(r=>r.room==='307').status,'awaitingDischarge');assert.equal(displayed.filter(r=>r.status==='ready').length,28);
console.log('Passed: all 30 missing reports default to white Ready while reported today/tomorrow statuses remain distinct.');
