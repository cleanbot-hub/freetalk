import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth,onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,collection,query,where,orderBy,onSnapshot,Timestamp,updateDoc,deleteDoc,doc,getDoc,serverTimestamp,limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

/* ===== DOM/유틸 ===== */
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]||m));
const Z=n=>String(n).padStart(2,'0');
const toDate=ts=>ts?.toDate?.()||null;
const fmt=d=>`${d.getFullYear()}-${Z(d.getMonth()+1)}-${Z(d.getDate())} ${Z(d.getHours())}:${Z(d.getMinutes())}:${Z(d.getSeconds())}`;
function formatWhen(ts){try{const d=toDate(ts)||new Date();return`${d.getFullYear()}-${Z(d.getMonth()+1)}-${Z(d.getDate())} ${Z(d.getHours())}:${Z(d.getMinutes())}`;}catch{return'';}}
function fmtDuration(ms){ if(!Number.isFinite(ms)||ms<0) return '-'; const s=Math.floor(ms/1000); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const ss=s%60; if(h>0) return `${h}시간 ${m}분`; if(m>0) return `${m}분 ${ss}초`; return `${ss}초`; }

/* 보기 라인 */
function mobK(v){return v==='bed'?'이동침대':(v==='wheelchair'?'휠체어':'도보');}
function renderLineHTML(x){
  if(x.category==='misc'){
    const title=esc(x.title||'(제목 없음)'),dept=(x.dept||'').trim(),note=(x.note||'').trim();
    const parts=[`<b>${title}</b>`]; if(dept) parts.push(`<b>${esc(dept)}</b>`); if(note) parts.push(esc(note));
    return parts.join(' <span class="k">|</span> ');
  }else{
    const from=(x.room||x.patient||'').trim(), to=(x.dept||'').trim(), mover=mobK(x.mobility), note=(x.note||'').trim();
    const parts=[]; if(from) parts.push(`<b>${esc(from)}</b>`); if(to) parts.push(`<b>${esc(to)}</b>`); parts.push(mover); if(note) parts.push(esc(note));
    return parts.join(' <span class="k">|</span> ');
  }
}
function renderLinePlain(x){
  if(x.category==='misc'){
    const t=(x.title||'(제목 없음)'), d=(x.dept||'').trim(), n=(x.note||'').trim();
    const parts=[t]; if(d) parts.push(d); if(n) parts.push(n); return parts.join(' | ');
  }else{
    const f=(x.room||x.patient||'').trim(), t=(x.dept||'').trim(), m=mobK(x.mobility), n=(x.note||'').trim();
    const parts=[]; if(f) parts.push(f); if(t) parts.push(t); parts.push(m); if(n) parts.push(n); return parts.join(' | ');
  }
}

const clock=$('#clock'),me=$('#me'),list=$('#list');
const cntOpen=$('#cnt-open'),cntProg=$('#cnt-prog'),cntDone=$('#cnt-done');
const transOnly=$('#trans-only'),miscOnly=$('#misc-only'),soundToggle=$('#sound-toggle');
$('#go-woori').onclick=()=>location.href='woori.html';
$('#go-posting').onclick=()=>location.href='posting.html';
const dayInput=$('#day'),prevBtn=$('#prev-day'),nextBtn=$('#next-day');
function tick(){clock.textContent=fmt(new Date());} tick(); setInterval(tick,1000);

/* 처리시간 DOM */
const avgTimeEl=document.getElementById('avg-time');
const maxTimeEl=document.getElementById('max-time');
const maxTimeDescEl=document.getElementById('max-time-desc');

/* 수술 DOM */
const opWaitEl=$('#op-wait'), opProgEl=$('#op-prog'), opDoneEl=$('#op-done');
const surgListEl=$('#surg-list'); const surgUpdatedEl=$('#surg-updated');

/* ===== Firebase ===== */
const firebaseConfig={apiKey:"AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",authDomain:"woori-1ecf5.firebaseapp.com",
projectId:"woori-1ecf5",storageBucket:"woori-1ecf5.firebasestorage.app",messagingSenderId:"1073097361525",
appId:"1:1073097361525:web:3218ced6a040aaaf4d503c",databaseURL:"https://woori-1ecf5-default-rtdb.firebaseio.com"};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);

/* ===== 상태 ===== */
let cur=null,isAdmin=false,unsub=null,snapshotData=[];let prevSnapshot=new Map();
let unsubSurgery=null, surgeryData=[];let prevSurgerySnapshot=null;

/* ===== 날짜 ===== */
const Z2=n=>String(n).padStart(2,'0');
const toYMD=d=>`${d.getFullYear()}-${Z2(d.getMonth()+1)}-${Z2(d.getDate())}`;
const parseYMD=ymd=>{const[y,m,dn]=(ymd||'').split('-').map(Number);const d=new Date(y,m-1,dn);d.setHours(0,0,0,0);return d;};
const getDateFromURL=()=>new URL(location.href).searchParams.get('date');
const setDateToURL=ymd=>{const u=new URL(location.href);u.searchParams.set('date',ymd);history.replaceState(null,'',u.toString());};
let selectedYMD=getDateFromURL()||toYMD(new Date());
dayInput.value=selectedYMD;
dayInput.addEventListener('change',()=>{selectedYMD=dayInput.value;setDateToURL(selectedYMD);subscribeByDate(selectedYMD,true);subscribeSurgeryByDate(selectedYMD,true);});
prevBtn.addEventListener('click',()=>{const d=parseYMD(selectedYMD);d.setDate(d.getDate()-1);selectedYMD=toYMD(d);dayInput.value=selectedYMD;setDateToURL(selectedYMD);subscribeByDate(selectedYMD,true);subscribeSurgeryByDate(selectedYMD,true);});
nextBtn.addEventListener('click',()=>{const d=parseYMD(selectedYMD);d.setDate(d.getDate()+1);selectedYMD=toYMD(d);dayInput.value=selectedYMD;setDateToURL(selectedYMD);subscribeByDate(selectedYMD,true);subscribeSurgeryByDate(selectedYMD,true);});

/* ===== 로그인 ===== */
onAuthStateChanged(auth,async user=>{
  cur=user||null;me.textContent=user?`${user.displayName||'사용자'}님`:'로그인이 필요합니다';
  try{isAdmin=user?(await getDoc(doc(db,'admins',user.uid))).exists():false;}catch{}
  subscribeByDate(selectedYMD,true);subscribeSurgeryByDate(selectedYMD,true);
});

/* ===== Toast + Beep ===== */
function showToast(message,type='info',ms){
  const wrap=$('#toasts');const el=document.createElement('div');
  el.className=`toast ${type}`;
  const icons={info:'💬',success:'✅',warn:'⚠️',error:'❌'};
  const colorTime={info:3500,success:3000,warn:4000,error:5000};
  ms = ms || colorTime[type] || 3500;
  el.innerHTML=`<div class="icon">${icons[type]||'🔔'}</div><div class="msg">${esc(message)}</div><button class="t-close">×</button>`;
  el.querySelector('.t-close').onclick=()=>remove();
  wrap.appendChild(el);
  const timer=setTimeout(()=>remove(),ms);
  function remove(){clearTimeout(timer);el.style.transition='opacity .3s, transform .3s';el.style.opacity='0';el.style.transform='translateY(6px)';setTimeout(()=>el.remove(),300);}
}
function playIMChime(kind='join', volume=0.35) {
  if (!document.getElementById('sound-toggle')?.checked) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const out = ctx.createGain(); out.gain.value = volume; out.connect(ctx.destination);
  const delay = ctx.createDelay(0.25); delay.delayTime.value = 0.11;
  const fb = ctx.createGain(); fb.gain.value = 0.18;
  delay.connect(fb); fb.connect(delay);
  delay.connect(out);
  function tone(freq, start, dur, type='sine', gainStart=1.0) {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gainStart, ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    osc.connect(g); g.connect(delay); g.connect(out);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.02);
  }
  if (kind === 'join') { tone(880,0.00,0.22,'sine',0.9); tone(1318,0.09,0.18,'triangle',0.75); }
  else if (kind === 'leave') { tone(660,0.00,0.20,'sine',0.85); tone(440,0.10,0.28,'triangle',0.7); }
  else { tone(988,0.00,0.14,'triangle',0.9); }
}

/* ===== Firestore: 업무 ===== */
function subscribeByDate(ymd,notify){
  try{unsub&&unsub();}catch{}
  const start=parseYMD(ymd);const end=new Date(start);end.setDate(end.getDate()+1);
  const qy=query(collection(db,'wardTasks'),
    where('createdAt','>=',Timestamp.fromDate(start)),
    where('createdAt','<',Timestamp.fromDate(end)),
    orderBy('createdAt','desc'));
  unsub=onSnapshot(qy,snap=>{
    const newData=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(notify&&prevSnapshot.size){
      const newMap=new Map(newData.map(x=>[x.id,x]));
      if (newMap.size>prevSnapshot.size){showToast('새 업무가 등록되었습니다.','success');playIMChime('join');}
      else if (newMap.size<prevSnapshot.size){showToast('업무가 삭제되었습니다.','warn');playIMChime('leave');}
      else{
        for (const [id,oldDoc] of prevSnapshot.entries()){
          const curDoc=newMap.get(id);
          if(curDoc&&(oldDoc.status||'open')!==(curDoc.status||'open')){
            const labels={open:'대기',in_progress:'진행중',done:'완료'};
            showToast(`업무 상태가 '${labels[curDoc.status]||curDoc.status}'(으)로 변경되었습니다.`,'info');
            playIMChime('note');break;
          }
        }
      }
      prevSnapshot=newMap;
    }else prevSnapshot=new Map(newData.map(x=>[x.id,x]));
    snapshotData=newData;render();
  },err=>{list.innerHTML=`<div class="k">목록 오류: ${esc(err.message||err.code||'')}</div>`;});
}

/* ===== Firestore: 수술 ===== */
function subscribeSurgeryByDate(ymd,notify){
  try{unsubSurgery&&unsubSurgery();}catch{}
  surgListEl.innerHTML='<div class="k">불러오는 중…</div>';
  const start=parseYMD(ymd);const end=new Date(start);end.setDate(end.getDate()+1);
  const qy=query(collection(db,'surgeries'),
    where('createdAt','>=',Timestamp.fromDate(start)),
    where('createdAt','<',Timestamp.fromDate(end)),
    orderBy('createdAt','desc'));
  unsubSurgery=onSnapshot(qy, async snap=>{
    const arr=snap.docs.map(d=>({id:d.id,...d.data()}));
    surgeryData=arr;
    const mapNow=new Map(arr.map(x=>[x.id,x]));
    if(notify&&prevSurgerySnapshot){
      if(mapNow.size>prevSurgerySnapshot.size){showToast('새 수술이 등록되었습니다.','success');playIMChime('join');}
      else if(mapNow.size<prevSurgerySnapshot.size){showToast('수술이 삭제되었습니다.','warn');playIMChime('leave');}
      else{
        for(const [id,oldDoc] of prevSurgerySnapshot.entries()){
          const curDoc=mapNow.get(id); if(!curDoc) continue;
          const oldS=oldDoc.status||'waiting', newS=curDoc.status||'waiting';
          if(oldS!==newS){ await onSurgeryStatusChanged(id,oldDoc,curDoc); break; }
        }
      }
    }
    prevSurgerySnapshot=mapNow;
    renderSurgery();
  },err=>{
    opWaitEl.textContent='-';opProgEl.textContent='-';opDoneEl.textContent='-';
    surgListEl.innerHTML=`<div class="k">수술 목록 오류: ${esc(err.message||err.code||'')}</div>`;
  });
}
const SURG_LABEL={waiting:'수술대기',operating:'수술진행중',done:'완료'};
async function onSurgeryStatusChanged(id,oldDoc,curDoc){
  showToast(`수술 상태가 '${SURG_LABEL[curDoc.status]||curDoc.status}'(으)로 변경되었습니다.`,'info');playIMChime('note');
  try{
    if(!cur) return;
    const isOwner=curDoc?.createdBy?.uid&&(curDoc.createdBy.uid===cur.uid);
    if(!(isOwner||isAdmin)) return;
    const patch={updatedAt:serverTimestamp()};
    const hadStarted=!!(curDoc?.timestamps?.startedAt);
    const hadDone=!!(curDoc?.timestamps?.doneAt);
    if(curDoc.status==='operating'&&!hadStarted) patch['timestamps.startedAt']=serverTimestamp();
    if(curDoc.status==='done'&&!hadDone)         patch['timestamps.doneAt']=serverTimestamp();
    if(Object.keys(patch).length>1){await updateDoc(doc(db,'surgeries',id),patch);}
  }catch(e){}
}

/* Chart.js: 상태 도넛 */
let statusChart=null;
function updateStatusChart(open,prog,done){
  const ctx=document.getElementById('statusChart').getContext('2d');
  const data={labels:['대기','진행중','완료'],datasets:[{data:[open,prog,done],backgroundColor:['#334155','#2563eb','#16a34a'],borderColor:'#1f2937',borderWidth:1}]};
  const options={plugins:{legend:{labels:{color:'#e5e7eb'}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.formattedValue}`}}}};
  if(statusChart){statusChart.data.datasets[0].data=[open,prog,done];statusChart.update();}
  else{statusChart=new Chart(ctx,{type:'doughnut',data,options});}
}

/* Chart.js: 시간대별 막대 */
let hourlyChart=null;
function updateHourlyChart(items){
  const buckets=Array.from({length:24},()=>0);
  items.forEach(x=>{const d=toDate(x.createdAt);if(!d) return;buckets[d.getHours()]++;});
  const labels=buckets.map((_,i)=>`${i}시`);
  const ctx=document.getElementById('hourlyChart').getContext('2d');
  const data={labels,datasets:[{label:'이송 수',data:buckets,backgroundColor:'#475569',borderColor:'#1f2937',borderWidth:1}]};
  const options={scales:{x:{ticks:{color:'#cbd5e1'},grid:{color:'rgba(148,163,184,.18)'}},y:{ticks:{color:'#cbd5e1',precision:0},grid:{color:'rgba(148,163,184,.18)'},beginAtZero:true}},plugins:{legend:{labels:{color:'#e5e7eb'}}}};
  if(hourlyChart){hourlyChart.data.datasets[0].data=buckets;hourlyChart.update();}
  else{hourlyChart=new Chart(ctx,{type:'bar',data,options});}
}

/* Chart.js: 수술 도넛(센터 텍스트) */
let surgeryChart=null;
const doughnutCenterText={id:'doughnutCenterText',afterDraw(chart,args,opts){const{ctx,chartArea:{width,height}}=chart;const total=opts.total||0,running=opts.running||0;const msg=total===0?'오늘 0건':`오늘 ${total}건`;const sub=total>0?(running>0?`진행 ${running}건`:'모두 완료'):'';ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e5e7eb';ctx.font='600 15px system-ui,-apple-system,Segoe UI,Inter';ctx.fillText(msg,width/2,height/2-7);ctx.font='12px system-ui,-apple-system,Segoe UI,Inter';ctx.fillStyle='#9aa3b2';if(sub) ctx.fillText(sub,width/2,height/2+12);ctx.restore();}};
function updateSurgeryChart(waiting,operating,done){
  const ctx=document.getElementById('surgeryChart').getContext('2d');
  const data={labels:['수술대기','수술진행중','완료'],datasets:[{data:[waiting,operating,done],backgroundColor:['#6b7280','#f59e0b','#10b981'],borderColor:'#1f2937',borderWidth:1}]};
  const options={plugins:{legend:{labels:{color:'#e5e7eb'}},tooltip:{callbacks:{label:c=>{const v=c.raw||0;const sum=(waiting+operating+done)||1;const pr=Math.round((v/sum)*100);return `${c.label}: ${v}건 (${pr}%)`;}}},doughnutCenterText:{total:(waiting+operating+done),running:operating}},cutout:'68%'};
  if(surgeryChart){surgeryChart.options.plugins.doughnutCenterText.total=waiting+operating+done;surgeryChart.options.plugins.doughnutCenterText.running=operating;surgeryChart.data.datasets[0].data=[waiting,operating,done];surgeryChart.update();}
  else{surgeryChart=new Chart(ctx,{type:'doughnut',data,options,plugins:[doughnutCenterText]});}
}

/* 렌더 */
let stateFilter='all';
const tabs=$$('.tab');
tabs.forEach(btn=>btn.addEventListener('click',()=>{stateFilter=btn.dataset.state;tabs.forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));render();}));
transOnly.addEventListener('change',()=>{if(transOnly.checked)miscOnly.checked=false;render();});
miscOnly.addEventListener('change',()=>{if(miscOnly.checked)transOnly.checked=false;render();});
function render(){
  const base=snapshotData.map(x=>({...x,status:x.status||'open'}));
  const cOpen=base.filter(x=>x.status==='open').length;
  const cProg=base.filter(x=>x.status==='in_progress').length;
  const cDone=base.filter(x=>x.status==='done').length;
  cntOpen.textContent=cOpen;cntProg.textContent=cProg;cntDone.textContent=cDone;
  updateStatusChart(cOpen,cProg,cDone);
  let items=base.slice();
  if(stateFilter!=='all') items=items.filter(x=>x.status===stateFilter);
  if(transOnly.checked) items=items.filter(x=>x.category==='transport');
  if(miscOnly.checked)  items=items.filter(x=>x.category==='misc');
  if(items.length===0){list.innerHTML='<div class="k">조건에 맞는 업무가 없습니다.</div>';updateHourlyChart([]);updateTimeSummary([]);return;}
  const frag=document.createDocumentFragment();
  items.forEach(d=>frag.appendChild(renderTask(d)));
  list.innerHTML='';list.appendChild(frag);
  updateTimeSummary(items);updateHourlyChart(items);
}
function updateTimeSummary(items){
  let sumMs=0,n=0,maxMs=-1,maxItem=null;
  for(const d of items){
    const ts=d.timestamps||{}; const done=toDate(ts.doneAt); if(!done) continue;
    const started=toDate(ts.startedAt)||toDate(d.createdAt); if(!started) continue;
    const ms=done-started; if(Number.isFinite(ms)&&ms>=0){sumMs+=ms;n++; if(ms>maxMs){maxMs=ms;maxItem=d;}}
  }
  if(n>0){avgTimeEl.textContent=fmtDuration(sumMs/n);maxTimeEl.textContent=fmtDuration(maxMs);maxTimeDescEl.textContent=`최장: ${(maxItem?.assignedTo?.name||'-')} · ${renderLinePlain(maxItem)}`;}
  else{avgTimeEl.textContent='-';maxTimeEl.textContent='-';maxTimeDescEl.textContent='완료된 업무가 없어서 집계할 수 없습니다.';}
}
function renderTask(d){
  const el=document.createElement('div');el.className='task';
  const left=document.createElement('div');left.className='left';
  const chips=document.createElement('div');chips.className='chips';
  chips.appendChild(chip(d.category==='misc'?'기타':'이송업무'));
  chips.appendChild(chip(d.priority==='STAT'?'긴급':'보통',d.priority==='STAT'?'warn':''));  
  chips.appendChild(chip(d.status==='open'?'대기':d.status==='in_progress'?'진행중':'완료',d.status==='open'?'stat-open':d.status==='in_progress'?'stat-prog':'stat-done'));
  if(d.category!=='misc'){chips.appendChild(chip(mobK(d.mobility))); }
  if((d.note||'').trim()){
    const tipWrap=document.createElement('span');tipWrap.className='tip-wrap';
    tipWrap.innerHTML=`<span class="chip tip">📝 메모</span><div class="tip-box" role="tooltip" aria-label="메모 상세"><div class="tip-title">📝 메모 상세보기</div>${esc(d.note||'')}</div>`;
    chips.appendChild(tipWrap);
  }
  const title=document.createElement('div');title.innerHTML=renderLineHTML(d);
  left.appendChild(chips);left.appendChild(title);
  if((cur&&d.assignedTo?.uid===cur.uid)||isAdmin){
    const actions=document.createElement('div');actions.className='row';actions.style.cssText='gap:6px;flex-wrap:wrap;margin-top:6px';
    if(d.status==='open') actions.appendChild(btn('시작',()=>quickStatus(d.id,'in_progress')));
    if(d.status==='in_progress') actions.appendChild(btn('완료',()=>quickStatus(d.id,'done')));
    if(d.status==='done') actions.appendChild(btn('진행중',()=>quickStatus(d.id,'in_progress')));
    if(d.status!=='open') actions.appendChild(btn('대기',()=>quickStatus(d.id,'open')));
    const delB=document.createElement('button');delB.className='btn danger small';delB.textContent='삭제';delB.onclick=()=>delTask(d.id,d);
    actions.appendChild(delB);left.appendChild(actions);
  }
  const right=document.createElement('div');right.className='right';
  const lines=[];lines.push(`<div class="k">${esc(d.assignedTo?.name||'-')}</div>`);lines.push(`<div class="k">생성: ${formatWhen(d.createdAt)}</div>`);
  const ts=d.timestamps||{}; if(ts.startedAt) lines.push(`<div class="k">시작: ${formatWhen(ts.startedAt)}</div>`); if(ts.doneAt) lines.push(`<div class="k">완료: ${formatWhen(ts.doneAt)}</div>`); if(ts.editedAt) lines.push(`<div class="k">수정: ${formatWhen(ts.editedAt)}</div>`); if(ts.reopenedAt) lines.push(`<div class="k">대기: ${formatWhen(ts.reopenedAt)}</div>`);
  right.innerHTML=lines.join('');el.appendChild(left);el.appendChild(right);return el;
}
function chip(t,c=''){const s=document.createElement('span');s.className='chip'+(c?(' '+c):'');s.textContent=t;return s;}
function btn(l,f){const b=document.createElement('button');b.className='btn small';b.textContent=l;b.onclick=f;return b;}
async function quickStatus(id,nextStatus){
  try{
    const ref=doc(db,'wardTasks',id);const snap=await getDoc(ref);const curDoc=snap.exists()?snap.data():null;
    const patch={status:nextStatus,updatedAt:serverTimestamp()};
    if(curDoc&&(curDoc.status||'open')!==nextStatus){
      if(nextStatus==='in_progress') patch['timestamps.startedAt']=serverTimestamp();
      else if(nextStatus==='done') patch['timestamps.doneAt']=serverTimestamp();
      else if(nextStatus==='open') patch['timestamps.reopenedAt']=serverTimestamp();
    }
    await updateDoc(ref,patch);const labels={open:'대기',in_progress:'진행중',done:'완료'};showToast(`'${labels[nextStatus]||nextStatus}' 상태로 전환 중...`,'info',1800);playIMChime('note');
  }catch(e){showToast('권한 없음 또는 오류','error');}
}
function renderSurgery(){
  const base=surgeryData.map(x=>({...x,status:x.status||'waiting'}));
  const C={w:base.filter(x=>x.status==='waiting').length,p:base.filter(x=>x.status==='operating').length,d:base.filter(x=>x.status==='done').length};
  const pct=n=>Math.round((n/(base.length||1))*100);
  opWaitEl.textContent=`${C.w}건 (${pct(C.w)}%)`;opProgEl.textContent=`${C.p}건 (${pct(C.p)}%)`;opDoneEl.textContent=`${C.d}건 (${pct(C.d)}%)`;
  const now=new Date();surgUpdatedEl.textContent=`${Z(now.getHours())}:${Z(now.getMinutes())}`;updateSurgeryChart(C.w,C.p,C.d);
  const items=base.slice(0,5);
  if(!items.length){surgListEl.innerHTML='<div class="k">표시할 수술이 없습니다.</div>';return;}
  const frag=document.createDocumentFragment();
  items.forEach(x=>{const statusK=SURG_LABEL[x.status]||x.status;const chipClass=x.status==='waiting'?'stat-open':' '&&x.status==='operating'?'stat-prog':'stat-done';const title=`[${x.surgeryDept||'-'}] ${x.surgeryName||'-'}`;const el=document.createElement('div');el.className='s-item';el.innerHTML=`<div><div><b>${esc(title)}</b></div><div class="k">${formatWhen(x.createdAt)}</div><div class="k">#${esc(x.caseId||'-')}</div>${x.note?`<div class="k">${esc(x.note)}</div>`:''}</div><span class="chip ${chipClass}">${statusK}</span>`;frag.appendChild(el);});
  surgListEl.innerHTML='';surgListEl.appendChild(frag);
}
async function delTask(id){
  if(!confirm('이 업무를 삭제할까요?')) return;
  try{await deleteDoc(doc(db,'wardTasks',id));showToast('업무가 삭제되었습니다.','warn');playIMChime('leave');}
  catch(e){showToast('삭제 실패','error');}
}

/* ==== Chat Drawer + Unread Badge (상단 + FAB 동기화) ==== */





const chatBtn = document.getElementById('btn-chat');
const chatBadge = document.getElementById('chat-badge');
const chatFab = document.getElementById('chat-fab');
const chatFabBadge = document.getElementById('chat-fab-badge');
const chatDim = document.getElementById('chat-dim');
const chatDrawer = document.getElementById('chat-drawer');
const chatClose = document.getElementById('chat-close');
const chatPopout = document.getElementById('chat-popout');
const chatFrame = document.getElementById('chat-frame');

const CHAT_ROOM = 'global';
const LS_LAST_READ_KEY = `freetalk_chat_lastRead_${CHAT_ROOM}`;
let chatOpen = false;

/* 마지막 읽음 */
const getLastRead = () => {
  const v = Number(localStorage.getItem(LS_LAST_READ_KEY) || 0);
  return Number.isFinite(v) ? v : 0;
};
const setLastReadNow = () => localStorage.setItem(LS_LAST_READ_KEY, String(Date.now()));

/* 배지 표시/숨김 */
function setBadge(el, n){
  if(!el) return;
  if(n>0){ el.style.display='inline-block'; el.textContent = n>99 ? '99+' : String(n); }
  else { el.style.display='none'; }
}

/* Firestore 구독으로 미읽음 계산 (첫 메시지부터 정확히) */
let stopChatSnap = null;
function subscribeChatBadge(){
  try{ stopChatSnap && stopChatSnap(); }catch{}
  const qy = query(
    collection(db, 'rooms', CHAT_ROOM, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  stopChatSnap = onSnapshot(qy, snap => {
    const last = getLastRead();
    let unread = 0;
    snap.forEach(d => {
      const ts = d.data()?.createdAt;
      const ms = ts?.toMillis?.() ?? 0;
      if (ms > last) unread++;
    });
    setBadge(chatBadge, unread);
    setBadge(chatFabBadge, unread);
    document.title = unread > 0 ? `(${unread}) 대시보드` : '대시보드';
  }, _e => {
    setBadge(chatBadge, 0); setBadge(chatFabBadge, 0);
  });
}
subscribeChatBadge();

/* Drawer 열기/닫기 */
function ensureChatSrc(){
  if (!chatFrame.getAttribute('src')){
    chatFrame.setAttribute('src', `chat.html?room=${encodeURIComponent(CHAT_ROOM)}&embed=1`);
  }
}

// --- 읽음 즉시 반영 헬퍼 ---
function markChatReadNow(){
  setLastReadNow();                // 마지막 읽음 시간 로컬에 저장
  setBadge(chatBadge, 0);          // 헤더 뱃지 바로 제거
  setBadge(chatFabBadge, 0);       // 플로팅 버튼 뱃지도 제거
  document.title = '대시보드';     // 제목 복구
}


// ✅ 수정된 openChat()
function openChat(){
  if (!auth.currentUser){ 
    alert('로그인 후 이용해주세요.'); 
    return; 
  }
  ensureChatSrc();
  chatDim.style.display='block';
  chatDrawer.classList.add('open');
  chatDrawer.setAttribute('aria-hidden','false');
  chatOpen = true;
  markChatReadNow(); // ✅ 열 때 읽음 처리 즉시 반영 (기존 setLastReadNow() 교체)
}
function closeChat(){
  chatDrawer.classList.remove('open');
  chatDrawer.setAttribute('aria-hidden','true');
  chatDim.style.display='none';
  chatOpen = false;
}
chatBtn?.addEventListener('click', openChat);
chatFab?.addEventListener('click', openChat);
chatDim?.addEventListener('click', closeChat);
chatClose?.addEventListener('click', closeChat);
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeChat(); });
chatPopout?.addEventListener('click', () => {
  const url = chatFrame?.getAttribute('src') || `chat.html?room=${encodeURIComponent(CHAT_ROOM)}&embed=1`;
  window.open(url, '_blank', 'noopener,noreferrer');
  closeChat();
});

/* chat.html과의 postMessage: 토스트/사운드만 담당 (카운트는 스냅샷이 담당) */
function ensureChatSrcEarly(){ ensureChatSrc(); }
ensureChatSrcEarly();

window.addEventListener('message', (e) => {
  const fromChat = (e.source === chatFrame.contentWindow);
  const sameOrigin = (e.origin === location.origin) || (e.origin === 'null');
  if (!fromChat || !sameOrigin) return;

  const data = e.data || {};
  if (data.type === 'chat:new' && data.room === CHAT_ROOM) {
    if (!chatOpen && !document.hasFocus()) {
      showToast('새 채팅이 도착했습니다.','info'); playIMChime('note');
    }
  } else if (data.type === 'chat:read' && data.room === CHAT_ROOM) {
    markChatReadNow();
  }
});
window.addEventListener('focus', () => { if (chatOpen) markChatReadNow();; });

/* 필요시: 초기 전체 미읽음 방지
if (!localStorage.getItem(LS_LAST_READ_KEY)) {
  localStorage.setItem(LS_LAST_READ_KEY, String(Date.now()));
}
*/

