import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue} from 'firebase-admin/firestore';
export const roomStatuses=['occupied','awaitingDischarge','vacated','ready'];
export const roomLabels={occupied:'Occupied',awaitingDischarge:'Awaiting discharge',vacated:'Vacated / awaiting cleaning',ready:'Ready for occupancy'};
const fail=message=>{throw new HttpsError('invalid-argument',message);};
export function allocationInput(data={}){
  if(data.category!=='roomAllocation')fail('Select Room Allocation.');
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(data.requestId||''))fail('A valid report identifier is required.');
  if(!Array.isArray(data.roomUpdates)||!data.roomUpdates.length||data.roomUpdates.length>30)fail('Review between 1 and 30 room updates.');
  const seen=new Set();
  const updates=data.roomUpdates.map(value=>{
    const room=typeof value?.room==='string'?value.room.trim():'';
    if(!/^3(?:0[1-9]|[12][0-9]|30)$/.test(room))fail('Room Allocation accepts rooms 301–330 only. Correct the room number before sending.');
    if(!roomStatuses.includes(value.roomStatus))fail('Select one of the four room statuses.');
    if(seen.has(room))fail(`Room ${room} appears more than once. Keep one final status for that room.`);
    seen.add(room);return {room,roomStatus:value.roomStatus};
  }).sort((a,b)=>a.room.localeCompare(b.room));
  return {updates,requestId:data.requestId};
}
// Only the nursing callable invokes this handler. No client or department-admin writes.
export function createRoomAllocationHandler({db,authorize}){
  return async request=>{
    const uid=await authorize(request),input=allocationInput(request.data);
    const reportId=`allocation_${uid}_${input.requestId}`,reportRef=db.doc(`roomAllocationReports/${reportId}`);
    return db.runTransaction(async tx=>{
      const [report,actor,...rooms]=await Promise.all([tx.get(reportRef),tx.get(db.doc(`profiles/${uid}`)),...input.updates.map(u=>tx.get(db.doc(`roomAllocation/${u.room}`)))]);
      if(!actor.exists||actor.data().role!=='staff'||actor.data().disabled===true)throw new HttpsError('permission-denied','Staff access changed. Sign in again.');
      if(report.exists){
        if(report.data().submittedByUid!==uid||JSON.stringify(report.data().roomUpdates)!==JSON.stringify(input.updates))throw new HttpsError('already-exists','This report identifier was used for different details. Retry the unchanged report.');
        return {requestId:reportId,status:'sent',category:'roomAllocation',count:input.updates.length,retried:true};
      }
      tx.create(reportRef,{category:'roomAllocation',roomUpdates:input.updates,submittedByUid:uid,submittedVia:'nursing-bot',status:'recorded',createdAt:FieldValue.serverTimestamp()});
      for(const [index,update]of input.updates.entries())tx.set(db.doc(`roomAllocation/${update.room}`),{room:update.room,status:update.roomStatus,reportId,updatedByUid:uid,updatedAt:FieldValue.serverTimestamp(),revision:(rooms[index].data()?.revision||0)+1});
      return {requestId:reportId,status:'sent',category:'roomAllocation',count:input.updates.length};
    });
  };
}
