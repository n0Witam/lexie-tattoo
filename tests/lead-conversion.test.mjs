import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createSubmissionAttempt, submitConfirmedForm } from '../assets/js/form-submission.js';
import { trackConfirmedLead } from '../assets/js/lead-tracking.js';

const endpoint = 'https://script.google.com/macros/s/test-deployment/exec';
const payload = {name:'Jan Test',email:'jan@example.test',message:'To jest testowa wiadomość.',formType:'contact'};
function bridge() {
  const listeners = new Map();
  let timer, frame, sent;
  const sender = {postMessage(data,origin){sent={data,origin};}};
  const environment = {
    crypto:{randomUUID},location:{origin:'https://lexietattoo.pl'},
    document:{createElement(){frame={remove(){frame.removed=true;}};return frame;},body:{appendChild(){}}},
    setTimeout(fn){timer=fn;return 1;},clearTimeout(){timer=null;},
    addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);},
  };
  const emit = (data, source=sender, origin='https://test-script.googleusercontent.com') => listeners.get('message')?.({data,source,origin});
  return{environment,sender,get frame(){return frame;},get sent(){return sent;},get nonce(){return new URL(frame.src).searchParams.get('nonce');},
    emit,ready(){emit({type:'lexie:ready',nonce:this.nonce});},timeout(){timer();},get listening(){return listeners.size;}};
}

test('same payload retries reuse the request ID and original consent; edited payload gets a new request',()=>{
  const first=createSubmissionAttempt(payload,null,false);
  assert.equal(createSubmissionAttempt(payload,first,true),first);
  assert.equal(first.consentAtSubmission,false);
  assert.notEqual(createSubmissionAttempt({...payload,message:'Zmieniona wiadomość'},first,true).submissionId,first.submissionId);
});

test('transport requires trusted ready origin, nonce, exact sender and matching saved receipt',async()=>{
  const b=bridge();const attempt=createSubmissionAttempt(payload,null,true);
  const pending=submitConfirmedForm(endpoint,attempt,b.environment);
  b.emit({type:'lexie:ready',nonce:b.nonce},b.sender,'https://evil.test');assert.equal(b.sent,undefined);
  b.emit({type:'lexie:ready',nonce:randomUUID()});assert.equal(b.sent,undefined);
  b.ready();assert.equal(b.sent.data.payload.submissionId,attempt.submissionId);
  const data={type:'lexie:result',nonce:b.nonce,result:{ok:true,confirmed:true,submissionId:attempt.submissionId,responseId:'saved-response'}};
  b.emit(data,{});assert.equal(b.frame.removed,undefined);
  b.emit({...data,result:{...data.result,submissionId:randomUUID()}});assert.equal(b.frame.removed,undefined);
  b.emit(data);
  assert.deepEqual(await pending,{confirmed:true,submissionId:attempt.submissionId,responseId:'saved-response'});
  assert.equal(b.frame.removed,true);assert.equal(b.listening,0);
});

test('failed, incomplete and timed-out confirmations never resolve as successful receipts',async()=>{
  for(const result of [{ok:false},{ok:true,confirmed:false},{ok:true,confirmed:true,responseId:''}]){
    const b=bridge(),attempt=createSubmissionAttempt(payload,null,true);
    const pending=submitConfirmedForm(endpoint,attempt,b.environment);
    b.ready();b.emit({type:'lexie:result',nonce:b.nonce,result:{...result,submissionId:attempt.submissionId}});
    await assert.rejects(pending,/SAVE_FAILED/);assert.equal(b.listening,0);
  }
  const b=bridge();const pending=submitConfirmedForm(endpoint,createSubmissionAttempt(payload,null,true),b.environment);
  b.timeout();await assert.rejects(pending,/TIMEOUT/);assert.equal(b.frame.removed,true);
  await assert.rejects(submitConfirmedForm('https://evil.test/exec',createSubmissionAttempt(payload,null,true),b.environment),/CONFIG/);
});

test('conversions need confirmation and consent at start and finish, deduplicate, and contain no personal data',()=>{
  let consent=true;
  const env={lexieConsent:{hasAnalyticsConsent:()=>consent},dataLayer:[],document:{documentElement:{lang:'en'}}};
  const options={formType:'contact',consentAtSubmission:true};
  assert.equal(trackConfirmedLead({confirmed:false,responseId:randomUUID()},options,env),false);
  const receipt={confirmed:true,responseId:randomUUID(),...payload};
  assert.equal(trackConfirmedLead(receipt,options,env),true);
  assert.equal(trackConfirmedLead(receipt,options,env),false);
  assert.deepEqual(env.dataLayer,[{event:'generate_lead',form_type:'contact',page_language:'en'}]);
  const denied={confirmed:true,responseId:randomUUID()};
  consent=false;assert.equal(trackConfirmedLead(denied,options,env),false);
  consent=true;assert.equal(trackConfirmedLead(denied,options,env),false);
  assert.equal(trackConfirmedLead({confirmed:true,responseId:randomUUID()},{...options,consentAtSubmission:false},env),false);
  assert.equal(env.dataLayer.length,1);
  const unavailable={...env,dataLayer:{push(){throw Error('tag error');}}};
  assert.equal(trackConfirmedLead({confirmed:true,responseId:randomUUID()},options,unavailable),false);
});

const serverCode=await readFile(new URL('../server/apps-script/Code.gs',import.meta.url),'utf8');
const emailCode=await readFile(new URL('../server/apps-script/Email.gs',import.meta.url),'utf8');
function server() {
  const responses=[], mails=[],properties=new Map();
  let writes=0,failSave=false,failMail=false,accepting=true,busy=false,held=false;
  const item=(id,title,type)=>({getId:()=>id,getTitle:()=>title,getType:()=>type,
    asTextItem(){assert.equal(type,'TEXT');return this;},asParagraphTextItem(){assert.equal(type,'PARAGRAPH_TEXT');return this;},
    setTitle(value){title=value;return this;},setRequired(){return this;},
    createResponse(value){return {getItem:()=>this,getResponse:()=>value};},
  });
  const items=[item(1,'Imię i Nazwisko','TEXT'),item(2,'e-mail','TEXT'),item(3,'Wiadomość','PARAGRAPH_TEXT')];
  const form={getItems:()=>items,addTextItem(){const value=item(4,'','TEXT');items.push(value);return value;},getItemById:id=>items.find(i=>i.getId()===id),
    getResponses:since=>responses.filter(r=>r.getTimestamp()>=since),isAcceptingResponses:()=>accepting,
    createResponse(){const answers=[];let id=null;return {withItemResponse(value){answers.push(value);return this;},
      submit(){assert(held);if(failSave)throw Error('failed');id='response-'+(++writes);responses.push(this);return this;},
      getId:()=>id,getTimestamp:()=>new Date(),getResponseForItem:field=>answers.find(a=>a.getItem().getId()===field.getId()),
    };},
  };
  const context={Date,JSON,FormApp:{ItemType:{TEXT:'TEXT',PARAGRAPH_TEXT:'PARAGRAPH_TEXT'},openById(){return form;}},
    Session:{getActiveUser:()=>({getEmail:()=> 'owner@example.test'}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key),setProperties:values=>Object.entries(values).forEach(([k,v])=>properties.set(k,v))})},
    LockService:{getScriptLock:()=>({tryLock(){held=!busy;return held;},releaseLock(){held=false;}})},
    Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest:(_,text)=>[...createHash('sha256').update(text).digest()],formatDate:()=> '2026-10-13 14:00:00'},
    MailApp:{sendEmail(message){mails.push(message);if(failMail)throw Error('quota');}},console:{log(){},error(){}},
  };
  runInNewContext(serverCode+'\n'+emailCode,context);
  context.skonfigurujFormularz();
  return{context,responses,mails,properties,get writes(){return writes;},save(data){return context.zapiszZgloszenie(data);},
    failSave(){failSave=true;},failMail(){failMail=true;},close(){accepting=false;},busy(){busy=true;}};
}
const request=(extra={})=>({...payload,submissionId:randomUUID(),startedAt:Date.now(),...extra});

test('editor setup functions work for the executing owner and reject anonymous or different users',()=>{
  const s=server();
  assert.doesNotThrow(()=>s.context.skonfigurujFormularz());
  assert.doesNotThrow(()=>s.context.wypiszPola());
  assert.equal(s.writes,0);assert.equal(s.mails.length,0);
  const originalProperties=[...s.properties];
  for(const identity of ['', 'other@example.test']) {
    s.context.Session.getActiveUser=()=>({getEmail:()=>identity});
    assert.throws(()=>s.context.skonfigurujFormularz(),/edytorze Apps Script/);
    assert.throws(()=>s.context.wypiszPola(),/edytorze Apps Script/);
    assert.deepEqual([...s.properties],originalProperties);
  }
});

test('server setup writes no response or email; confirmed save notifies the requested recipient once',()=>{
  const s=server();assert.equal(s.writes,0);assert.equal(s.mails.length,0);
  const data=request({message:'Treść wiadomości <script>alert(1)</script>\n\n---\nPhotos:\nhttps://ucarecdn.com/photo/'});
  const receipt=s.save(data);assert.equal(receipt.confirmed,true);assert.equal(receipt.responseId,'response-1');
  assert.equal(s.mails.length,1);assert.equal(s.mails[0].to,'aleksandralukasiak@gmail.com');assert.equal(s.mails[0].replyTo,payload.email);
  assert.match(s.mails[0].htmlBody,/&lt;script&gt;/);assert.doesNotMatch(s.mails[0].htmlBody,/<script>/);
  assert.match(s.mails[0].htmlBody,/src="https:\/\/ucarecdn.com\/photo\/"/);
  const retry=s.save(data);assert.equal(retry.confirmed,true);assert.equal(retry.replayed,true);assert.equal(s.writes,1);assert.equal(s.mails.length,1);
  const conflict=s.save({...data,message:'Inna wiadomość na ten sam identyfikator'});assert.equal(conflict.ok,false);assert.equal(s.writes,1);
});

test('validation, closed form, busy lock and write errors never confirm an unsaved lead',()=>{
  for(const extra of [{email:'bad'}, {name:''}, {message:'tiny'}, {formType:'unknown'}, {startedAt:Date.now()-8*86400000}]){
    const s=server();assert.equal(s.save(request(extra)).confirmed,false);assert.equal(s.writes,0);assert.equal(s.mails.length,0);
  }
  for(const state of ['close','busy','failSave']){
    const s=server();s[state]();assert.equal(s.save(request()).confirmed,false);assert.equal(s.writes,0);
  }
});

test('email failure preserves the saved lead and retry does not send another mail',()=>{
  const s=server();s.failMail();const data=request();
  const result=s.save(data);assert.equal(result.confirmed,true);assert.equal(result.notification,'failed');assert.equal(s.writes,1);
  assert.equal(s.save(data).replayed,true);assert.equal(s.mails.length,1);
});
