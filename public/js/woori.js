import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, setLogLevel,
  collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot,
  updateDoc, deleteDoc, doc, Timestamp, limit, getDoc, deleteField
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = id=>document.getElementById(id);
const esc = s => (s||'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

/* DOM refs */
const mePill=$('me-pill'), btnLogout=$('btn-logout'), btnDashboard=$('btn-dashboard');
const tDept=$('t-dept'), tMob=$('t-mob'), tPri=$('t-pri'), tNote=$('t-note'), tSave=$('t-save');
const miscModal=$('misc-modal'), openMisc=$('open-misc'), miscCancel=$('misc-cancel'), miscSave=$('misc-save');
const mTitle=$('m-title'), mDept=$('m-dept'), mPri=$('m-pri'), mNote=$('m-note');
const sId=$('s-id'), sDept=$('s-dept'), sName=$('s-name'), sNote=$('s-note'), sSave=$('s-save');
const sList=$('s-list'), sCount=$('s-count'), sReload=$('s-reload');
const sEditModal=$('s-edit-modal'), seId=$('se-id'), seDept=$('se-dept'), seName=$('se-name'), seNote=$('se-note'), seStatus=$('se-status'), sEditCancel=$('s-edit-cancel'), sEditSave=$('s-edit-save'), seTimes=$('se-times');
const myList=$('my-list');
const editModal=$('edit-modal'), editCancel=$('edit-cancel'), editSave=$('edit-save');
const eStatus=$('e-status'), ePri=$('e-pri'), eNote=$('e-note');
const eTransportBox=$('edit-transport'), eMiscBox=$('edit-misc');
const eRoom=$('e-room'), ePatient=$('e-patient'), eDept=$('e-dept'), eMob=$('e-mob');
const eTitle=$('e-title'), eDeptMisc=$('e-dept-misc');

/* Firebase */
const app = initializeApp({
  apiKey:"AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain:"woori-1ecf5.firebaseapp.com",
  projectId:"woori-1ecf5",
  storageBucket:"woori-1ecf5.firebasestorage.app",
  messagingSenderId:"1073097361525",
  appId:"1:1073097361525:web:3218ced6a040aaaf4d503c",
  databaseURL:"https://woori-1ecf5-default-rtdb.firebaseio.com"
});

/* 콘솔 노이즈 최소화 */
setLogLevel('error');

/* 망 호환성 높이기 */
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false
});

const auth = getAuth(app);

/* Auth */
let currentUser=null;
onAuthStateChanged(auth, async (user)=>{
  currentUser=user||null;
  if(!user){
    mePill.textContent='로그인이 필요합니다';
    btnLogout.textContent='로그인'; btnLogout.classList.remove('ghost');
    btnLogout.onclick=()=>location.href='login.html';
    btnDashboard.onclick=()=>location.href='woori-dashboard.html';
    sList.innerHTML='<div class="k">로그인 후 이용해주세요.</div>';
    myList.innerHTML='<div class="k">로그인 후 이용해주세요.</div>';
    return;
  }
  if(!user.displayName && user.email){
    try{await updateProfile(user,{displayName:user.email.split('@')[0]});}catch{}
  }
  mePill.textContent=`${user.displayName||'사용자'}님`;
  btnLogout.textContent='로그아웃'; btnLogout.classList.add('ghost');
  btnLogout.onclick=()=>signOut(auth);
  btnDashboard.onclick=()=>location.href='woori-dashboard.html';

  resetCaseId();
  subTodaySurgeries();
  subMyTodayTasks(user.uid);
});

/* Utils */
const Z=n=>String(n).padStart(2,'0');
const day0=(d)=>{const x=new Date(d||Date.now());x.setHours(0,0,0,0);return x;}
const day1=(d)=>{const x=day0(d);x.setDate(x.getDate()+1);return x;}
const fmtWhen=(ts)=>{try{const d=ts?.toDate?.()||new Date();return `${d.getFullYear()}-${Z(d.getMonth()+1)}-${Z(d.getDate())} ${Z(d.getHours())}:${Z(d.getMinutes())}`;}catch{return '';}}

/* ---- 수술 CaseId ---- */
function makeCaseId(){const d=new Date();return `S-${d.getFullYear()}${Z(d.getMonth()+1)}${Z(d.getDate())}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;}
function resetCaseId(){ sId.value=makeCaseId(); }

/* ---- 이송 저장 (메모 비워도 OK) ---- */
tSave.addEventListener('click', async ()=>{
  if(!auth.currentUser) return alert('로그인 후 이용해주세요.');
  const dept=(tDept.value||'').trim(); if(!dept) return alert('목적지/부서를 입력하세요.');
  const mob=tMob.value, pri=tPri.value, note=(tNote.value||'').trim();
  const empUid=auth.currentUser.uid, empName=auth.currentUser.displayName||'(사용자)';
  try{
    const payload={
      assignedTo:{uid:empUid,name:empName},
      dept, mobility:mob, priority:pri, category:'transport',
      status:'open',
      createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
      timestamps:{createdAt:serverTimestamp()},
      createdBy:{uid:empUid,name:empName}
    };
    if(note) payload.note=note; // 공란은 저장 안 함
    await addDoc(collection(db,'wardTasks'), payload);
    tDept.value=''; tNote.value=''; tMob.value='bed'; tPri.value='Routine';
    alert('이송업무가 등록되었습니다.');
  }catch(e){ alert(e.message||e.code||e); }
});

/* ---- 기타 업무 저장 (메모 비워도 OK) ---- */
openMisc?.addEventListener('click', ()=>{ mTitle.value=''; mDept.value=''; mPri.value='Routine'; mNote.value=''; miscModal.style.display='flex'; miscModal.setAttribute('aria-hidden','false'); });
miscCancel?.addEventListener('click', ()=>{ miscModal.style.display='none'; miscModal.setAttribute('aria-hidden','true'); });
miscModal?.addEventListener('click', (e)=>{ if(e.target===miscModal){ miscModal.style.display='none'; miscModal.setAttribute('aria-hidden','true'); }});

miscSave?.addEventListener('click', async ()=>{
  if(!auth.currentUser) return alert('로그인 후 이용해주세요.');
  const title=(mTitle.value||'').trim(); if(!title) return alert('업무 제목을 입력하세요.');
  const dept=(mDept.value||'').trim(); const pri=mPri.value; const note=(mNote.value||'').trim();
  const empUid=auth.currentUser.uid, empName=auth.currentUser.displayName||'(사용자)';
  try{
    const payload={
      assignedTo:{uid:empUid,name:empName},
      title, priority:pri, category:'misc',
      status:'open',
      createdAt:serverTimestamp(), updatedAt:serverTimestamp(),
      timestamps:{createdAt:serverTimestamp()},
      createdBy:{uid:empUid,name:empName},
      mobility:'walk'
    };
    if(dept) payload.dept=dept;
    if(note) payload.note=note; // 공란은 저장 안 함
    await addDoc(collection(db,'wardTasks'), payload);
    miscModal.style.display='none'; miscModal.setAttribute('aria-hidden','true');
    alert('기타 업무가 등록되었습니다.');
  }catch(e){ alert(e.message||e.code||e); }
});

/* ---- 수술 저장 (메모 비워도 OK) ---- */
sSave.addEventListener('click', async ()=>{
  if(!auth.currentUser) return alert('로그인 후 이용해주세요.');
  const caseId=(sId.value||'').trim();
  const dept=sDept.value;
  const name=(sName.value||'').trim();
  const note=(sNote.value||'').trim();
  if(!name) return alert('수술명을 입력하세요.');

  // 메모가 있을 때만 PII 검사
  const pii=/\b(\d{2,3}-\d{3,4}-\d{4}|\d{6}-\d{7}|\d{8})\b/;
  if(note && pii.test(note)) return alert('메모에 개인정보가 포함된 것 같아요. 제거 후 저장해주세요.');

  const empUid=auth.currentUser.uid, empName=auth.currentUser.displayName||'(사용자)';
  try{
    const payload={
      caseId,
      surgeryDept:dept,
      surgeryName:name,
      status:'waiting',
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp(),
      timestamps:{},
      createdBy:{uid:empUid,name:empName}
    };
    if(note) payload.note=note; // ✅ 메모가 비면 note 필드 자체를 저장하지 않음
    await addDoc(collection(db,'surgeries'), payload);
    alert('수술이 등록되었습니다.');
    sName.value=''; sNote.value=''; resetCaseId();
  }catch(e){ alert(e.message||e.code||e); }
});

/* ---- 오늘 수술(최근5) ---- */
let unsubS=null;
function subTodaySurgeries(){
  try{unsubS&&unsubS();}catch{}
  sList.innerHTML='<div class="k">불러오는 중…</div>';
  const qy=query(collection(db,'surgeries'),
    where('createdAt','>=',Timestamp.fromDate(day0())),
    where('createdAt','<',Timestamp.fromDate(day1())),
    orderBy('createdAt','desc'),
    limit(5));
  unsubS=onSnapshot(qy,snap=>{
    const arr=snap.docs.map(d=>({id:d.id,...d.data()}));
    sCount.textContent=`${arr.length}건`;
    if(!arr.length){sList.innerHTML='<div class="k">표시할 수술이 없습니다.</div>';return;}
    const frag=document.createDocumentFragment();
    arr.forEach(x=>{
      const st = x.status==='waiting'?'수술대기':x.status==='operating'?'수술진행중':'완료';
      const cls= x.status==='waiting'?'stat-open':x.status==='operating'?'stat-prog':'stat-done';
      const lines=[`<div class="k">등록: ${x.createdAt?esc(fmtWhen(x.createdAt)):'-'}</div>`];
      const el=document.createElement('div'); el.className='s-item';
      el.innerHTML=`
        <div>
          <div><b>${esc(x.surgeryDept||'-')}</b> · ${esc(x.surgeryName||'-')}</div>
          ${lines.join('')}
          ${x.note?`<div class="k">${esc(x.note)}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <span class="chip ${cls}">${st}</span>
          <div class="row" style="gap:6px">
            <button class="btn small" data-act="toggle" data-id="${x.id}">상태전환</button>
            <button class="btn small" data-act="edit" data-id="${x.id}">편집</button>
            <button class="btn danger small" data-act="del" data-id="${x.id}">삭제</button>
          </div>
          <span class="k">#${esc(x.caseId||'-')}</span>
        </div>`;
      frag.appendChild(el);
    });
    sList.innerHTML=''; sList.appendChild(frag);
  },err=>{sList.innerHTML=`<div class="k">목록 오류: ${esc(err.message||err.code||'')}</div>`;});
}
sReload.addEventListener('click', subTodaySurgeries);

/* 수술 리스트 버튼 */
sList.addEventListener('click', async (e)=>{
  const b=e.target.closest('button'); if(!b) return;
  const id=b.dataset.id, act=b.dataset.act; if(!id) return;
  if(act==='toggle'){
    const ref=doc(db,'surgeries',id);
    const snap=await getDoc(ref).catch(()=>null);
    const x=snap?.data(); if(!x) return;
    const next=x.status==='waiting'?'operating':(x.status==='operating'?'done':'waiting');
    const patch={status:next,updatedAt:serverTimestamp()};
    if(x.status!==next){
      if(next==='operating') patch['timestamps.startedAt']=serverTimestamp();
      else if(next==='done') patch['timestamps.doneAt']=serverTimestamp();
      else if(next==='waiting') patch['timestamps.reopenedAt']=serverTimestamp();
    }
    try{await updateDoc(ref,patch);}catch(e){alert(e.message||e.code||e);}
  }else if(act==='del'){
    if(!auth.currentUser) return alert('로그인 필요');
    const ref=doc(db,'surgeries',id);
    const snap=await getDoc(ref).catch(()=>null);
    const x=snap?.data(); if(!x) return;
    if(!(x.createdBy?.uid===auth.currentUser.uid)) return alert('작성자만 삭제할 수 있습니다.');
    if(!confirm('이 수술 기록을 삭제할까요?')) return;
    try{await deleteDoc(ref);}catch(e){alert(e.message||e.code||e);}
  }else if(act==='edit'){ openSurgeryEdit(id); }
});

/* 수술 편집 모달 */
let editingSurgeryId=null, beforeStatus=null;
async function openSurgeryEdit(id){
  const ref=doc(db,'surgeries',id);
  const snap=await getDoc(ref).catch(()=>null);
  const x=snap?.data(); if(!x) return alert('존재하지 않는 문서입니다.');
  if(!auth.currentUser) return alert('로그인 필요');
  if(x.createdBy?.uid!==auth.currentUser.uid) return alert('작성자만 수정할 수 있습니다.');
  editingSurgeryId=id;
  seId.value=x.caseId||'';
  seDept.value=x.surgeryDept||'NS';
  seName.value=x.surgeryName||'';
  seNote.value=x.note||'';
  seStatus.value=x.status||'waiting';
  beforeStatus=x.status||'waiting';
  seTimes.textContent = `등록: ${x.createdAt?fmtWhen(x.createdAt):'-'}`;
  sEditModal.style.display='flex'; sEditModal.setAttribute('aria-hidden','false');
}
sEditCancel.addEventListener('click', ()=>{
  sEditModal.style.display='none'; sEditModal.setAttribute('aria-hidden','true');
});
sEditModal.addEventListener('click', (e)=>{
  if(e.target===sEditModal){
    sEditModal.style.display='none'; sEditModal.setAttribute('aria-hidden','true');
  }
});
sEditSave.addEventListener('click', async ()=>{
  if(!editingSurgeryId) return;
  const note=(seNote.value||'').trim();
  const pii=/\b(\d{2,3}-\d{3,4}-\d{4}|\d{6}-\d{7}|\d{8})\b/;
  if(note && pii.test(note)) return alert('메모에 개인정보가 포함된 것 같아요. 제거 후 저장해주세요.');

  const patch={
    surgeryDept:seDept.value,
    surgeryName:(seName.value||'').trim(),
    updatedAt:serverTimestamp(),
    'timestamps.editedAt':serverTimestamp(),
    status:seStatus.value
  };
  if(note) patch.note=note; else patch.note=deleteField(); // ✅ 편집 시 공란이면 note 필드 삭제
  if(beforeStatus!==seStatus.value){
    if(seStatus.value==='operating') patch['timestamps.startedAt']=serverTimestamp();
    else if(seStatus.value==='done') patch['timestamps.doneAt']=serverTimestamp();
    else if(seStatus.value==='waiting') patch['timestamps.reopenedAt']=serverTimestamp();
  }
  try{
    await updateDoc(doc(db,'surgeries',editingSurgeryId),patch);
    sEditModal.style.display='none'; sEditModal.setAttribute('aria-hidden','true');
    alert('수정되었습니다.');
  }catch(e){alert(e.message||e.code||e);}
});

/* ---- 나의 업무(오늘) ---- */
let unsubMine=null;
function subMyTodayTasks(uid){
  try{unsubMine&&unsubMine();}catch{}
  const qy=query(collection(db,'wardTasks'),
    where('assignedTo.uid','==',uid),
    where('createdAt','>=',Timestamp.fromDate(day0())),
    where('createdAt','<',Timestamp.fromDate(day1())),
    orderBy('createdAt','asc'));
  unsubMine=onSnapshot(qy,snap=>{
    if(snap.empty){myList.innerHTML='<div class="k">오늘 등록된 업무가 없습니다.</div>';return;}
    const frag=document.createDocumentFragment(); let idx=1;
    snap.forEach(d=>{
      const x=d.data(), id=d.id;
      const el=document.createElement('div'); el.className='task';
      const left=document.createElement('div');
      const chips=document.createElement('div'); chips.className='chips';
      chips.appendChild(mkChip(String(idx++)));
      chips.appendChild(mkChip(x.category==='misc'?'기타':'이송'));
      chips.appendChild(mkChip(x.priority==='STAT'?'긴급':'보통', x.priority==='STAT'?'warn':'' ));
      const st=x.status==='open'?'대기':x.status==='in_progress'?'진행중':'완료';
      const stc=x.status==='open'?'stat-open':x.status==='in_progress'?'stat-prog':'stat-done';
      chips.appendChild(mkChip(st,stc));
      if(x.category!=='misc'){
        const mobK=x.mobility==='bed'?'이동침대':(x.mobility==='wheelchair'?'휠체어':'도보');
        chips.appendChild(mkChip(mobK));
      }
      const title=document.createElement('div');
      if(x.category==='misc'){
        const t1=esc(x.title||'(제목 없음)');
        const t2=(x.dept||'').trim();
        const n =(x.note||'').trim();
        title.innerHTML = `<b>${t1}</b>${t2?` <span class="k">|</span> <b>${esc(t2)}</b>`:''}${n?` <span class="k">|</span> ${esc(n)}`:''}`;
      }else{
        const from=(x.room||x.patient||'').trim();
        const to  =(x.dept||'').trim();
        const n   =(x.note||'').trim();
        const parts=[];
        if(from) parts.push(`<b>${esc(from)}</b>`);
        if(to)   parts.push(`<b>${esc(to)}</b>`);
        parts.push(x.mobility==='bed'?'이동침대':(x.mobility==='wheelchair'?'휠체어':'도보'));
        if(n) parts.push(esc(n));
        title.innerHTML = parts.join(' <span class="k">|</span> ');
      }
      const actions=document.createElement('div'); actions.className='row'; actions.style.cssText='gap:6px;margin-top:6px;flex-wrap:wrap';
      actions.appendChild(btn('상태전환', async ()=>{
        const next=x.status==='open'?'in_progress':(x.status==='in_progress'?'done':'open');
        const patch={status:next,updatedAt:serverTimestamp()};
        if(x.status!==next){
          if(next==='in_progress') patch['timestamps.startedAt']=serverTimestamp();
          else if(next==='done') patch['timestamps.doneAt']=serverTimestamp();
          else if(next==='open') patch['timestamps.reopenedAt']=serverTimestamp();
        }
        try{await updateDoc(doc(db,'wardTasks',id),patch);}catch(e){alert(`상태 변경 실패: ${e.code||e.message}`);}
      }));
      actions.appendChild(btn('수정', ()=>openEdit(id,x)));
      actions.appendChild(btn('삭제', async ()=>{ if(!confirm('이 업무를 삭제할까요?')) return; try{await deleteDoc(doc(db,'wardTasks',id));}catch(e){alert(`삭제 실패: ${e.code||e.message}`);} }, 'danger'));
      left.appendChild(chips); left.appendChild(title); left.appendChild(actions);
      const right=document.createElement('div'); right.style.textAlign='right';
      const lines=[];
      lines.push(`<div class="k">${esc(x.assignedTo?.name||'-')}</div>`);
      lines.push(`<div class="k">생성: ${fmtWhen(x.createdAt)}</div>`);
      const ts=x.timestamps||{};
      if(ts.startedAt) lines.push(`<div class="k">시작: ${fmtWhen(ts.startedAt)}</div>`);
      if(ts.doneAt) lines.push(`<div class="k">완료: ${fmtWhen(ts.doneAt)}</div>`);
      right.innerHTML=lines.join('');
      el.appendChild(left); el.appendChild(right);
      frag.appendChild(el);
    });
    myList.innerHTML=''; myList.appendChild(frag);
  },err=>{myList.innerHTML=`<div class="k">목록 오류: ${esc(err.message||err.code||'')}</div>`;});
}
function mkChip(t,cls=''){const s=document.createElement('span');s.className='chip'+(cls?(' '+cls):'');s.textContent=t;return s;}
function btn(label,fn,extra=''){const b=document.createElement('button');b.className='btn small'+(extra?(' '+extra):'');b.textContent=label;b.onclick=fn;return b;}

/* ---- 편집 ---- */
let editingTask={id:null,data:null};
function openEdit(id,x){
  if(!auth.currentUser || x.assignedTo?.uid!==auth.currentUser.uid){alert('본인 업무만 수정할 수 있습니다.');return;}
  editingTask={id,data:x};
  eStatus.value=x.status||'open'; ePri.value=x.priority||'Routine'; eNote.value=x.note||'';
  if(x.category==='misc'){
    eTransportBox.style.display='none'; eMiscBox.style.display='flex';
    eTitle.value=x.title||''; eDeptMisc.value=x.dept||'';
  }else{
    eTransportBox.style.display='flex'; eMiscBox.style.display='none';
    eRoom.value=x.room||''; ePatient.value=x.patient||''; eDept.value=x.dept||''; eMob.value=x.mobility||'bed';
  }
  editModal.style.display='flex'; editModal.setAttribute('aria-hidden','false');
}
const closeEdit=()=>{editModal.style.display='none'; editModal.setAttribute('aria-hidden','true');};
editCancel.onclick=closeEdit;
editModal.addEventListener('click',(e)=>{if(e.target===editModal) closeEdit();});

editSave.onclick=async ()=>{
  if(!editingTask.id) return;
  const x=editingTask.data; const prev=x.status||'open'; const next=eStatus.value;
  const patch={status:next,priority:ePri.value,updatedAt:serverTimestamp()};
  const note=(eNote.value||'').trim(); patch.note = note?note:deleteField();
  if(prev!==next){
    if(next==='in_progress') patch['timestamps.startedAt']=serverTimestamp();
    else if(next==='done') patch['timestamps.doneAt']=serverTimestamp();
    else if(next==='open') patch['timestamps.reopenedAt']=serverTimestamp();
  }
  let newText='';
  if(x.category==='misc'){
    const title=(eTitle.value||'').trim();
    const dept =(eDeptMisc.value||'').trim();
    patch.title = title?title:deleteField();
    patch.dept  = dept ?dept :deleteField();
    patch.mobility = deleteField(); // 기타는 이동수단 제거
    patch.room = deleteField(); patch.patient = deleteField();
    const parts=[`[기타] ${title||'(제목 없음)'}`]; if(dept) parts.push(dept); if(note) parts.push(note);
    newText = parts.join(' ▶ ');
  }else{
    const room=(eRoom.value||'').trim();
    const patient=(ePatient.value||'').trim();
    const dept=(eDept.value||'').trim();
    patch.mobility=eMob.value;
    patch.room = room?room:deleteField();
    patch.patient = patient?patient:deleteField();
    patch.dept = dept?dept:deleteField();
    const parts=[];
    if(room||patient) parts.push((room||'')+(patient?(' '+patient):'')); if(dept) parts.push(dept);
    parts.push(patch.mobility==='bed'?'이동침대':(patch.mobility==='wheelchair'?'휠체어':'도보'));
    if(note) parts.push(note);
    newText = parts.join(' ▶ ');
    patch.title = deleteField();
  }
  patch.text=newText;
  try{await updateDoc(doc(db,'wardTasks',editingTask.id),patch); closeEdit(); alert('수정되었습니다.');}
  catch(e){alert(e.message||e.code||e);}
};

/* ==== Chat Drawer Toggle (추가) ==== */
const chatBtn = document.getElementById('btn-chat');
const chatFab = document.getElementById('chat-fab');
const chatDim = document.getElementById('chat-dim');
const chatDrawer = document.getElementById('chat-drawer');
const chatClose = document.getElementById('chat-close');
const chatPopout = document.getElementById('chat-popout');
const chatFrame = document.getElementById('chat-frame');

function openChat(room='global'){
  if(!auth.currentUser){ alert('로그인 후 이용해주세요.'); return; }
  if(!chatFrame.getAttribute('src')){
    chatFrame.setAttribute('src', `chat.html?room=${encodeURIComponent(room)}`);
  }
  chatDim.style.display='block';
  chatDrawer.classList.add('open');
  chatDrawer.setAttribute('aria-hidden','false');
}
function closeChat(){
  chatDrawer.classList.remove('open');
  chatDrawer.setAttribute('aria-hidden','true');
  chatDim.style.display='none';
}
chatBtn?.addEventListener('click', ()=>openChat());
chatFab?.addEventListener('click', ()=>openChat());
chatDim?.addEventListener('click', closeChat);
chatClose?.addEventListener('click', closeChat);
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeChat(); });
chatPopout?.addEventListener('click', ()=>{
  const url = chatFrame.getAttribute('src') || 'chat.html?room=global';
  window.open(url, '_blank','noopener,noreferrer');
  closeChat();
});
