import {allocationRooms,allocationStatuses} from './nursing-drafts.js?v=room-allocation-20261105';
import {AllocationStore} from './room-allocation-store.js?v=room-allocation-20261105';
const $=id=>document.getElementById(id),store=new AllocationStore();
const bed='<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M3 4v21m34-21v21M3 20h34M8 8h24a5 5 0 0 1 5 5v7H3v-7a5 5 0 0 1 5-5Z"/><path d="M9 8V4h8v4m6 0V4h8v4"/></svg>';
const labels={...allocationStatuses,unreported:'Not yet reported'};
export function boardRooms(rows){const reported=new Map(rows.filter(r=>allocationRooms.includes(r.room)&&allocationStatuses[r.status]).map(r=>[r.room,r]));return allocationRooms.map(room=>({...reported.get(room),room,status:reported.get(room)?.status||'unreported'}));}
function render(rows,metadata={}){
 const all=boardRooms(rows),counts=Object.fromEntries(Object.keys(labels).map(status=>[status,all.filter(r=>r.status===status).length]));
 $('legend').innerHTML=Object.entries(labels).map(([key,label])=>`<div class="legend-item ${key}"><span>${label}</span><b>${counts[key]}</b></div>`).join('');
 $('room-grid').innerHTML=all.map(row=>{const when=row.updatedAt?new Date(row.updatedAt):null;return `<article class="room-tile ${row.status}" aria-label="Room ${row.room}: ${labels[row.status]}"><div class="tile-top"><span>ROOM</span>${bed}</div><strong>${row.room}</strong><span class="tile-status">${labels[row.status]}</span><small>${when?'Reported '+when.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})+' · '+when.toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'Awaiting first nursing report'}</small></article>`;}).join('');
 $('cached-warning').hidden=!metadata.cached;
}
$('login-form').onsubmit=async event=>{event.preventDefault();$('login-error').textContent='';$('login-submit').disabled=true;try{await store.login($('email').value.trim(),$('password').value);$('password').value='';}catch{$('login-error').textContent='Unable to sign in. Check the email and password.';}finally{$('login-submit').disabled=false;}};
$('sign-out').onclick=()=>store.logout().catch(()=>{$('login-error').textContent='Sign-out failed. Please try again.';});
store.init((profile,error)=>{$('board').hidden=!profile;$('sign-in-panel').hidden=!!profile;$('sign-out').hidden=!profile;$('identity').textContent=profile?.email||'';if(error)$('login-error').textContent=error.message;},render).catch(()=>{$('login-error').textContent='Unable to connect. Check your connection and reload.';});
