import {categories} from './shared.js';
export const nursingCategories={...categories,roomAllocation:{label:'Room Allocation',icon:'▦'}};
export const allocationStatuses={occupied:'Occupied',awaitingDischarge:'Awaiting discharge',vacated:'Vacated / awaiting cleaning',ready:'Ready for occupancy',dischargeTomorrow:'Discharge tomorrow'};
export const allocationRooms=Array.from({length:30},(_,i)=>String(301+i));
export function validateRequests(items){
  if(!Array.isArray(items)||!items.length||items.length>30)throw Error('Review between 1 and 30 requests.');
  const seen=new Set();
  for(const [index,item]of items.entries()){
    const row=`Row ${index+1}: `;
    if(!/^[A-Za-z0-9][A-Za-z0-9 -]{0,11}$/.test(item.room))throw Error(row+'enter a valid room number.');
    if(!nursingCategories[item.category])throw Error(row+'select a department.');
    if(!item.summary||item.summary.length>500)throw Error(row+'enter a request of up to 500 characters.');
    if(item.category==='roomAllocation'){
      if(!allocationRooms.includes(item.room))throw Error(row+'Room Allocation accepts rooms 301–330 only.');
      if(!allocationStatuses[item.roomStatus])throw Error(row+'select the room status.');
      if(seen.has(item.room))throw Error(row+`room ${item.room} has more than one status. Keep one final status for that room.`);
      seen.add(item.room);
    }
  }
}
