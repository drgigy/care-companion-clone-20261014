import {statuses,$,toast,escapeHTML} from './shared.js?v=discharge-tomorrow-20261105';
import {NursingStore,loadNursingSettings,saveNursingSettings} from './nursing-store.js?v=discharge-tomorrow-20261105';
import {NursingRecorder,audioPayload,validateDraft} from './nursing-recorder.js?v=discharge-tomorrow-20261105';
import {nursingCategories as categories,allocationStatuses,validateRequests} from './nursing-drafts.js?v=discharge-tomorrow-20261105';
let draftRows=[];
const store=new NursingStore();let settings=loadNursingSettings(),live=null,active=false,starting=false,attempt=0,draftId=null,sendBusy=false,pendingAudio=null,sendPayload=null;
function clock(){const now=new Date(),h=now.getHours(),start=Number(settings.nightStart),end=Number(settings.nightEnd),night=settings.display==='night'||(settings.display==='auto'&&(start<end?h>=start&&h<end:h>=start||h<end));document.body.dataset.theme=night?'night':'day';const time=now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});$('patient-time').textContent=time.replace(/\s?[AP]M$/i,'');$('patient-period').textContent=time.match(/AM|PM/)?.[0]||'';$('patient-date').textContent=now.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});}
function syncUI(){
  $('header-ward').textContent=settings.ward||'Ward / floor optional';$('tap-subtitle').textContent='Say the room number, department and request in any language. Press Stop, review the details, then Send. You can dictate several requests for one or more rooms, including occupancy, planned discharge, vacancy and readiness.';$('helper-card').hidden=true;
  $('ward-unit').value=settings.ward;for(const key of ['display'])$('setting-'+key).value=settings[key];$('night-start').value=settings.nightStart;$('night-end').value=settings.nightEnd;
  const signed=!!store.profile;$('live-login').hidden=signed||store.demo;$('settings-grid').hidden=!signed;$('email').required=!signed&&!store.demo;$('password').required=!signed&&!store.demo;$('ward-unit').required=false;$('logout').hidden=!signed;$('settings-submit').textContent=signed?'Save settings':'Sign in';$('login-help').textContent=signed?'Submit requests for dictated rooms. Your dashboard room assignments do not restrict submissions.':'Use your existing staff account. Room/tablet accounts cannot use this page.';clock();
}
function status(message){$('voice-startup').hidden=false;$('voice-startup').textContent=message;}
function session(value){active=value;document.body.classList.toggle('conversation-active',value);$('discard-audio').hidden=!value;$('mic-action-label').textContent=value?'Stop':'Start';$('start').setAttribute('aria-label',value?'Stop recording':'Start recording');$('start').setAttribute('aria-pressed',String(value));document.body.dataset.voiceState=value?'listening':'idle';}
function end(){document.body.classList.remove('reviewing');$('discard-audio').hidden=true;$('retry-transcription').hidden=true;++attempt;starting=false;live?.cancel();live=null;session(false);$('start').disabled=false;pendingAudio=null;sendPayload=null;draftId=null;$('draft-form').hidden=true;$('processing').hidden=true;draftRows=[];}
async function start(){
 if(active||starting||sendBusy)return;
 if(!store.profile){$('account').click();return;}
 const run=++attempt;starting=true;$('start').disabled=true;status('Allow microphone access…');
 live=new NursingRecorder({onError:error=>{if(run!==attempt)return;end();status(error.message);},onTick:seconds=>status('Listening · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'))});
 live.onLimit=()=>void stopRecording();
 try{if(await live.start()&&run===attempt){session(true);status('Listening · 0:00');}}
 catch(error){if(run===attempt)status(error.message);}
 finally{if(run===attempt){starting=false;$('start').disabled=false;}}
}
function demoTranscription(){
 const scenario=sessionStorage.getItem('mock-dictation')||'single';
 const cases={single:[{room:'1234',category:'housekeeping',summary:'Please clean the bathroom.',roomStatus:''}],mixed:[{room:'306',category:'roomAllocation',summary:'Patient is planned for discharge today.',roomStatus:'awaitingDischarge'},{room:'304',category:'roomAllocation',summary:'The patient has vacated the room.',roomStatus:'vacated'},{room:'315',category:'roomAllocation',summary:'Room is occupied.',roomStatus:'occupied'},{room:'306',category:'food',summary:'Please provide drinking water.',roomStatus:''},{room:'306',category:'housekeeping',summary:'Please clean the bathroom.',roomStatus:''},{room:'310',category:'nursing',summary:'Nursing assistance requested.',roomStatus:''}],conflict:[{room:'3066',category:'roomAllocation',summary:'Awaiting discharge.',roomStatus:'awaitingDischarge'},{room:'306',category:'roomAllocation',summary:'Room vacated.',roomStatus:'vacated'},{room:'306',category:'roomAllocation',summary:'Room occupied.',roomStatus:'occupied'}]};
 return {requests:cases[scenario]||cases.single,patientLanguage:'english',transcript:'Invented mock dictation — no microphone or production connection.'};
}
async function transcribe(){
 const run=attempt;$('discard-audio').hidden=false;$('processing').hidden=false;$('retry-transcription').hidden=true;status('Processing recording…');$('start').disabled=true;
 try{
  const result=store.demo?demoTranscription():(await store.call('nursingTranscribe',await audioPayload(pendingAudio))).data;
  if(run!==attempt)return;
  draftRows=Array.isArray(result.requests)&&result.requests.length?result.requests:[{room:result.room||'',category:result.category||'',summary:result.summary||'',roomStatus:''}];renderDraftRows();$('draft-transcript').textContent=result.transcript||'';$('draft-language').value=result.patientLanguage||'other';
  draftId=crypto.randomUUID();sendPayload=null;$('draft-error').textContent='';$('draft-form').hidden=false;document.body.classList.add('reviewing');$('discard-audio').hidden=true;status(store.demo?'MOCK transcription — review the sample fields.':'Review the room, department and request before sending.');$('draft-rows').querySelector('input')?.focus();pendingAudio=null;live?.cancel();live=null;
 }catch(error){if(run===attempt){status(error.message+' Your recording is kept for retry.');$('retry-transcription').hidden=false;}}
 finally{if(run===attempt){$('processing').hidden=true;$('start').disabled=false;}}
}
async function stopRecording(){
 if(!active)return;const run=attempt,recorder=live;session(false);$('start').disabled=true;
 try{const blob=await recorder.stop();if(run!==attempt)return;pendingAudio=blob;await transcribe();}catch(error){if(run===attempt){status(error.message);$('start').disabled=false;}}
}
$('start').onclick=()=>{if(active)void stopRecording();else if(!$('draft-form').hidden||pendingAudio)status('Send or discard the current draft first.');else void start();};
$('retry-transcription').onclick=()=>void transcribe();
$('discard').onclick=()=>{if(!sendBusy){end();status('Discarded. Ready to record.');}};
$('discard-audio').onclick=()=>{if(sendBusy)return;end();$('retry-transcription').hidden=true;status('Discarded. Ready to record.');};
function readDraftRows(){return [...$('draft-rows').querySelectorAll('[data-draft-row]')].map(row=>({room:row.querySelector('[data-field=room]').value.trim(),category:row.querySelector('[data-field=category]').value,summary:row.querySelector('[data-field=summary]').value.trim(),roomStatus:row.querySelector('[data-field=roomStatus]').value}));}
function renderDraftRows(){
  $('draft-count').textContent=`${draftRows.length} ${draftRows.length===1?'request':'requests'} · maximum 30 per submission`;
  $('draft-rows').innerHTML=draftRows.map((r,index)=>`<fieldset class="draft-row" data-draft-row><legend>Request ${index+1}</legend><label>Room number<input data-field="room" aria-label="Room number ${index+1}" value="${escapeHTML(r.room||'')}" required maxlength="12" autocomplete="off"></label><label>Department<select data-field="category" aria-label="Department ${index+1}" required><option value="">Select department</option>${Object.entries(categories).map(([key,value])=>`<option value="${key}"${r.category===key?' selected':''}>${escapeHTML(value.label)}</option>`).join('')}</select></label><label>Request<textarea data-field="summary" aria-label="Request ${index+1}" required maxlength="500" rows="2">${escapeHTML(r.summary||'')}</textarea></label><label data-status-label${r.category==='roomAllocation'?'':' hidden'}>Room status<select data-field="roomStatus" aria-label="Room status ${index+1}"${r.category==='roomAllocation'?' required':''}><option value="">Select room status</option>${Object.entries(allocationStatuses).map(([key,value])=>`<option value="${key}"${r.roomStatus===key?' selected':''}>${escapeHTML(value)}</option>`).join('')}</select><small>Room Allocation: 301–330 only. Keep one final status per room.</small></label><button type="button" class="remove-draft" data-remove="${index}">Remove request ${index+1}</button></fieldset>`).join('');
  $('add-draft').disabled=draftRows.length>=30;
}
$('draft-rows').addEventListener('change',event=>{if(event.target.matches('[data-field=category]')){draftRows=readDraftRows();renderDraftRows();}});
$('draft-rows').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button||sendBusy)return;draftRows=readDraftRows();draftRows.splice(Number(button.dataset.remove),1);renderDraftRows();});
$('add-draft').onclick=()=>{if(sendBusy)return;draftRows=readDraftRows();if(draftRows.length>=30)return;draftRows.push({room:'',category:'',summary:'',roomStatus:''});renderDraftRows();};
$('draft-form').onsubmit=async event=>{
 event.preventDefault();if(sendBusy)return;$('draft-error').textContent='';
 try{
  const payload={requests:readDraftRows().map(r=>r.category==='roomAllocation'?r:{room:r.room,category:r.category,summary:r.summary}),ward:settings.ward.trim(),patientLanguage:$('draft-language').value};
  validateRequests(payload.requests);
  if(sendPayload&&JSON.stringify(payload)!==JSON.stringify(sendPayload))throw Error('Retry the unchanged request first, or discard it. The previous send may already have succeeded.');
  sendPayload=payload;sendBusy=true;$('send').disabled=true;$('discard').disabled=true;$('add-draft').disabled=true;$('draft-rows').querySelectorAll('fieldset').forEach(row=>row.disabled=true);
  const count=payload.requests.length;await store.create(payload,draftId);end();status(`${count} ${count===1?'request sent':'requests sent'}. Ready to record.`);toast('All requests sent');
 }catch(error){$('draft-error').textContent=error.message+' Draft retained.';status('Not confirmed as sent: '+error.message+' Draft retained.');}
 finally{sendBusy=false;$('send').disabled=false;$('discard').disabled=false;$('add-draft').disabled=draftRows.length>=30;$('draft-rows').querySelectorAll('fieldset').forEach(row=>row.disabled=false);}
};
$('account').onclick=()=>{if(sendBusy)return;if(active)end();$('login-error').textContent='';syncUI();$('login-dialog').showModal();};$('close-login').onclick=()=>$('login-dialog').close();
$('login-form').onsubmit=async event=>{event.preventDefault();$('login-error').textContent='';$('settings-submit').disabled=true;try{
  if(!store.profile)await store.login($('email').value.trim(),$('password').value);
  else{const ward=$('ward-unit').value.trim();if(ward.length>40)throw Error('Enter a ward or floor of up to 40 characters.');settings=saveNursingSettings({...settings,ward,display:$('setting-display').value,nightStart:$('night-start').value,nightEnd:$('night-end').value});syncUI();$('login-dialog').close();toast('Nursing settings saved');}
  $('password').value='';
}catch(error){$('login-error').textContent=error.message;}finally{$('settings-submit').disabled=false;}};
$('logout').onclick=async()=>{if(sendBusy)return;end();try{await store.logout();}catch(error){toast(error.message);}};
$('requests-button').onclick=()=>$('requests-dialog').showModal();$('requests-close').onclick=()=>$('requests-dialog').close();
const hours=Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,'0')}:00</option>`).join('');$('night-start').innerHTML=hours;$('night-end').innerHTML=hours;
store.subscribe(rows=>{const today=new Date();today.setHours(0,0,0,0);const current=rows.filter(r=>r.createdAt>=today.getTime());$('requests-count').textContent=String(current.length);$('requests-count').hidden=!current.length;$('requests-empty').hidden=!!current.length;$('requests-empty').textContent='No requests submitted today.';$('patient-requests').innerHTML=current.map(r=>`<article class="patient-request-card"><b class="request-icon">${escapeHTML(categories[r.category]?.icon||'!')}</b><div><strong>Room ${escapeHTML(r.room)} · ${escapeHTML(r.summary)}</strong><small>${escapeHTML(r.ward||'')} · ${escapeHTML(categories[r.category]?.label||'Request')}</small></div><span class="status ${escapeHTML(r.status)}">${escapeHTML(r.category==='roomAllocation'?'Updated':statuses[r.status]||r.status)}</span></article>`).join('');});
syncUI();setInterval(clock,30000);
store.init((profile,error)=>{if(!profile)end();syncUI();if(error){$('login-error').textContent=error.message;toast(error.message);}if(!profile)$('login-dialog').showModal();else if(!error)$('login-dialog').close();}).catch(error=>toast(error.message));
window.addEventListener('pagehide',()=>{if(!sendBusy)end();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)void stopRecording();});
