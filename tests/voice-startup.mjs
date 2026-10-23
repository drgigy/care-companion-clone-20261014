import assert from 'node:assert/strict';
import {LiveCompanion} from '../voice.js';
const pending=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const permission=pending();let trackStopped=0,connected=0;
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>permission.promise}},configurable:true});
globalThis.AudioContext=class {resume(){return Promise.resolve();}close(){return Promise.resolve();}};
const saved=LiveCompanion.takeWarmToken;
LiveCompanion.takeWarmToken=async()=>({GoogleGenAI:class {constructor(){this.live={connect:async()=>{connected++;}};}},result:{data:{}},createdAt:Date.now()});
try{
 const live=new LiveCompanion({}, {onState(){},onError(message){throw Error(message);}});
 const start=live.start();live.stop();
 permission.resolve({getTracks:()=>[{stop(){trackStopped++;}}]});
 await start;
 assert.equal(trackStopped,1,'Stopping during microphone permission must stop a late stream');
 assert.equal(connected,0,'A stopped startup must never open a voice session');
 await live.start();assert.equal(connected,0,'A stopped companion cannot restart');
 console.log('Passed: Stop cancels startup and releases late microphone access.');
}finally{LiveCompanion.takeWarmToken=saved;}
