import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue} from 'firebase-admin/firestore';
import {allocationInput} from './room-allocation.js';
export function createNursingBatchHandler({db,authorize,validateCare}){
  return async request=>{
    const uid=await authorize(request),data=request.data||{};
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(data.requestId||''))throw new HttpsError('invalid-argument','A valid report identifier is required.');
    if(!Array.isArray(data.requests)||!data.requests.length||data.requests.length>30)throw new HttpsError('invalid-argument','Review between 1 and 30 requests before sending.');
    const items=data.requests.map(item=>{
      if(item?.category==='roomAllocation'){
        const summary=typeof item.summary==='string'?item.summary.trim():'';
        if(!summary||summary.length>500)throw new HttpsError('invalid-argument','Enter a request of up to 500 characters for every row.');
        const {updates}=allocationInput({category:'roomAllocation',requestId:data.requestId,roomUpdates:[item]});
        return {...updates[0],category:'roomAllocation',summary};
      }
      const clean=validateCare({...item,ward:data.ward||'',patientLanguage:data.patientLanguage||'other',requestId:data.requestId});
      return {room:clean.room,category:clean.category,summary:clean.summary,ward:clean.ward,patientLanguage:clean.patientLanguage};
    });
    const allocations=items.filter(i=>i.category==='roomAllocation').map(({room,roomStatus})=>({room,roomStatus}));
    if(allocations.length)allocationInput({category:'roomAllocation',requestId:data.requestId,roomUpdates:allocations});
    const batchId=`batch_${uid}_${data.requestId}`,batchRef=db.doc(`nursingBatches/${batchId}`);
    return db.runTransaction(async tx=>{
      const [prior,actor,...rooms]=await Promise.all([tx.get(batchRef),tx.get(db.doc(`profiles/${uid}`)),...allocations.map(i=>tx.get(db.doc(`roomAllocation/${i.room}`)))]);
      if(!actor.exists||actor.data().role!=='staff'||actor.data().disabled===true)throw new HttpsError('permission-denied','Staff access changed. Sign in again.');
      if(prior.exists){
        if(prior.data().submittedByUid!==uid||JSON.stringify(prior.data().requests)!==JSON.stringify(items))throw new HttpsError('already-exists','This recording was already sent with different details. Retry the unchanged requests.');
        return {requestId:batchId,status:'sent',count:items.length,retried:true};
      }
      tx.create(batchRef,{submittedByUid:uid,submittedVia:'nursing-bot',requests:items,createdAt:FieldValue.serverTimestamp()});
      for(const [index,item]of items.entries())if(item.category!=='roomAllocation'){
        tx.create(db.doc(`requests/${batchId}_${index}`),{...item,ownerUid:`nursing:${uid}`,submittedByUid:uid,submittedVia:'nursing-bot',batchId,patientName:'',uhid:'',status:'new',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),acknowledgedAt:null,acknowledgedByEmployeeId:null,completedAt:null,completedByName:null,completedByEmployeeId:null});
      }
      if(allocations.length){
        tx.create(db.doc(`roomAllocationReports/${batchId}`),{category:'roomAllocation',roomUpdates:allocations,submittedByUid:uid,submittedVia:'nursing-bot',status:'recorded',createdAt:FieldValue.serverTimestamp()});
        for(const [index,item]of allocations.entries())tx.set(db.doc(`roomAllocation/${item.room}`),{room:item.room,status:item.roomStatus,reportId:batchId,updatedByUid:uid,updatedAt:FieldValue.serverTimestamp(),revision:(rooms[index].data()?.revision||0)+1});
      }
      return {requestId:batchId,status:'sent',count:items.length,roomCount:allocations.length,careCount:items.length-allocations.length};
    });
  };
}
