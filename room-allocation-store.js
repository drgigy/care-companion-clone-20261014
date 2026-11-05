import {config} from './config.js';
import {assertLocalSafe} from './access.js';
export const allocationViewer=profile=>!!profile&&!profile.disabled&&(profile.role==='administrator'||profile.role==='departmentAdmin'&&profile.department==='roomAllocation');
export class AllocationStore{
 constructor(){this.profile=null;this.rooms=[];this.generation=0;this.demo=config.mode==='demo';}
 async init(onState,onRooms){
  assertLocalSafe(config);this.onState=onState;this.onRooms=onRooms;
  if(this.demo){
   this.profile={role:'departmentAdmin',department:'roomAllocation',uid:'mock-allocation'};onState(this.profile);const read=()=>{this.rooms=Object.values(JSON.parse(localStorage.getItem('care-companion-room-allocation-v1')||'{}'));onRooms(this.rooms,{cached:false});};read();window.addEventListener('storage',read);return;
  }
  const base='https://www.gstatic.com/firebasejs/12.4.0/';
  const [app,auth,db]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  const firebase=app.initializeApp(config.firebase,'rajagiri-room-allocation');this.authSDK=auth;this.auth=auth.getAuth(firebase);this.db=db.getFirestore(firebase);
  await auth.setPersistence(this.auth,auth.browserLocalPersistence);
  auth.onAuthStateChanged(this.auth,user=>{
   const generation=++this.generation;this.profileListener?.();this.roomsListener?.();this.profile=null;onRooms([],{cached:false,loading:true});onState(null);if(!user)return;
   this.profileListener=db.onSnapshot(db.doc(this.db,'profiles',user.uid),snapshot=>{
    if(generation!==this.generation)return;
    const profile=snapshot.exists()?{...snapshot.data(),uid:user.uid,email:user.email}:null;
    if(!allocationViewer(profile)){this.roomsListener?.();this.profile=null;onRooms([],{cached:false});onState(null,Error('Use the Room Allocation department login or a hospital Administrator account.'));return;}
    const first=!this.profile;this.profile=profile;onState(profile);
    if(first)this.roomsListener=db.onSnapshot(db.collection(this.db,'roomAllocation'),{includeMetadataChanges:true},result=>{
     if(generation!==this.generation||!this.profile)return;
     onRooms(result.docs.map(d=>({...d.data(),room:d.id,updatedAt:d.data().updatedAt?.toMillis?.()||null})),{cached:result.metadata.fromCache});
    },error=>{if(generation===this.generation){onRooms([],{cached:false});onState(null,Error('Live room statuses are unavailable. Check your connection and sign in again.'));}});
   },error=>{if(generation===this.generation){this.roomsListener?.();this.profile=null;onRooms([],{cached:false});onState(null,error);}});
  });
 }
 async login(email,password){await this.authSDK.signInWithEmailAndPassword(this.auth,email,password);}
 async logout(){if(this.demo){this.profile=null;this.onRooms([],{cached:false});this.onState(null);return;}await this.authSDK.signOut(this.auth);}
}
