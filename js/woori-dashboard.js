/* ===========================
   woori-dashboard.js (최종본)
   - SW 등록 + FCM init (토큰 저장/포그라운드 수신)
   - 권한 요청은 '사용자 클릭'에서만 (자동 팝업 없음)
   - '알림 켜기' 버튼: 로그인+권한 미결정+토큰없음일 때만 표시
   - 네트워크 상태에 따라 Long-Polling 사용
   - 로그아웃 시 현재 기기의 토큰 삭제 + 로컬 정리
   - 업무 '픽업/반납' + 상태 가드
   - 햄버거 메뉴/비밀번호 변경/차트/수술/채팅 드로어/배지
=========================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut,
  reauthenticateWithCredential, EmailAuthProvider, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, collection, query, where, orderBy, onSnapshot,
  Timestamp, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, limit, setDoc, deleteField
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getMessaging, getToken, onMessage, isSupported
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';

/* ===== DOM/유틸 ===== */
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]||m));
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

/* ===== DOM refs ===== */
const clock=$('#clock'),me=$('#me'),list=$('#list');
const btnLogout   = document.getElementById('btn-logout');
const btnChangePw = document.getElementById('btn-pw');
const btnEnablePush = document.getElementById('btn-enable-push');
const cntOpen=$('#cnt-open'),cntProg=$('#cnt-prog'),cntDone=$('#cnt-done');
const transOnly=$('#trans-only'),miscOnly=$('#misc-only'),soundToggle=$('#sound-toggle');
$('#go-woori')?.addEventListener('click',()=>location.href='woori.html');
$('#main-page')?.addEventListener('click',()=>location.href='index.html');

const dayInput=$('#day'),prevBtn=$('#prev-day'),nextBtn=$('#next-day');
function tick(){clock && (clock.textContent=fmt(new Date()));} tick(); setInterval(tick,1000);

/* ===== 비밀번호 변경 모달 ===== */
const pwModal     = document.getElementById('pw-modal');
const pwCancel    = document.getElementById('pw-cancel');
const pwSave      = document.getElementById('pw-save');
const pwCur       = document.getElementById('pw-current');
const pwNew1      = document.getElementById('pw-new1');
const pwNew2      = document.getElementById('pw-new2');



 


function openPwModal() {
  if (!auth.currentUser) { alert('로그인이 필요합니다.'); return; }
  pwCur.value = ''; pwNew1.value = ''; pwNew2.value = '';
  const uname = document.getElementById('pw-username');
  if (uname) uname.value = auth.currentUser?.email || auth.currentUser?.displayName || '';
  pwModal?.removeAttribute('inert');
  if (pwModal){ pwModal.style.display = 'flex'; pwModal.setAttribute('aria-hidden', 'false'); }
  pwCur?.focus();
}
function closePwModal() {
  document.getElementById('btn-pw')?.focus();
  pwModal?.setAttribute('aria-hidden', 'true');
  pwModal?.setAttribute('inert', '');
  if (pwModal) pwModal.style.display = 'none';
}
btnChangePw?.addEventListener('click', openPwModal);
pwCancel?.addEventListener('click', closePwModal);
pwModal?.addEventListener('click', (e)=>{ if(e.target===pwModal) closePwModal(); });
pwSave?.addEventListener('click', async ()=>{
  try{
    const u = auth.currentUser;
    if(!u) return alert('로그인이 필요합니다.');
    const cur = (pwCur.value||'').trim();
    const n1  = (pwNew1.value||'').trim();
    const n2  = (pwNew2.value||'').trim();
    if(!cur)        return alert('현재 비밀번호를 입력하세요.');
    if(n1.length<6) return alert('새 비밀번호는 6자 이상이어야 합니다.');
    if(n1!==n2)     return alert('새 비밀번호 확인이 일치하지 않습니다.');
    const email = u.email; if(!email) return alert('이메일 정보가 없어 재인증을 진행할 수 없습니다.');
    const cred = EmailAuthProvider.credential(email, cur);
    await reauthenticateWithCredential(u, cred);
    await updatePassword(u, n1);
    alert('비밀번호가 변경되었습니다. 다음 로그인부터 적용됩니다.');
    closePwModal();
  }catch(e){
    const map = {
      'auth/wrong-password': '현재 비밀번호가 올바르지 않습니다.',
      'auth/weak-password':  '새 비밀번호가 너무 짧습니다 (최소 6자).',
      'auth/too-many-requests': '시도가 잦습니다. 잠시 후 다시 시도하세요.',
    };
    alert(map[e?.code] || ('변경 실패: ' + (e?.message || e?.code || e)));
  }
});

/* ===== 햄버거 메뉴(오버레이) ===== */
const menuToggle=document.getElementById('menu-toggle');
const menuPanel=document.getElementById('menu-panel');
const menuClose=menuPanel?.querySelector('.menu-close');
menuToggle?.addEventListener('click',()=>{menuPanel?.classList.add('show');menuPanel?.setAttribute('aria-hidden','false');});
menuClose?.addEventListener('click',()=>{menuPanel?.classList.remove('show');menuPanel?.setAttribute('aria-hidden','true');});
menuPanel?.addEventListener('click',(e)=>{ if(e.target===menuPanel){ menuPanel.classList.remove('show');menuPanel.setAttribute('aria-hidden','true'); }});
document.getElementById('openPwModal')?.addEventListener('click', (e)=>{ e.preventDefault(); menuPanel?.classList.remove('show'); openPwModal(); });
document.getElementById('logout')?.addEventListener('click', async (e)=>{ e.preventDefault();
  if (!auth.currentUser) return location.href='login.html';
  if (!confirm('로그아웃 하시겠어요?')) return;
  await logoutAndCleanup(auth.currentUser);
});

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

/* 네트워크 상태에 따라 Long-Polling 조건부 사용 */
const needLP = !('ReadableStream' in window) || navigator.connection?.saveData === true;
const db = initializeFirestore(app, needLP ? { experimentalForceLongPolling: true, useFetchStreams: false } : {});
const auth=getAuth(app);

/* ===== FCM / Web Push ===== */
const VAPID_KEY = 'BDR1RJklUhPgWbxUpsX-T9tsRCJamok1icmmkSgaz2NGoTj0HiaMpuJ7jY2hsPibWdIlZfC3XnuvMlA6TxOKQfQ';
const FCM_TOKEN_LS_KEY = 'fcmToken'; // 🔔 로컬 저장 키

// 🔔 '알림 켜기' 버튼 노출 조건: (권한 default && 토큰 없음 && 로그인 상태)
function setEnableBtnVisibility() {
  const btn = btnEnablePush;
  if (!btn) return;
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const hasToken = !!localStorage.getItem(FCM_TOKEN_LS_KEY);
  const loggedIn = !!auth.currentUser;
  if (perm === 'default' && !hasToken && loggedIn) {
    btn.style.display = 'inline-block';
  } else {
    btn.style.display = 'none';
  }
}

async function initPush(user, { fromClick=false } = {}){
  try{
    if (!(await isSupported?.())) { console.warn('FCM 미지원 브라우저'); return; }
    if (!('serviceWorker' in navigator)) { console.warn('Service Worker 미지원'); return; }

    const reg = await navigator.serviceWorker.register('/sw.js');

    if (Notification.permission === 'default' && !fromClick) {
      // 자동 초기화에서는 권한 팝업을 띄우지 않음
      return;
    }
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) { console.warn('토큰 발급 실패'); return; }

    await setDoc(
      doc(db, 'users', user.uid, 'fcmTokens', token),
      { at: serverTimestamp(), ua: navigator.userAgent||'' },
      { merge: true }
    );
    // ✅ 로컬에도 보관하여 버튼 노출 제어
    localStorage.setItem(FCM_TOKEN_LS_KEY, token);
    setEnableBtnVisibility();
    console.log('[dashboard] FCM token saved');

    // 포그라운드 수신 (토스트, 10초 디듀프)
    let lastFgNotiAt = 0, lastFgNotiKey = '';
    onMessage(messaging, (payload) => {
      const n = payload.notification || {};
      const d = payload.data || {};
      const title = n.title || d.title || '새 알림';
      const body  = n.body  || d.body  || '';
      const key   = (d.tag || d.url || '') + '|' + title + '|' + body;
      const now   = Date.now();
      if (key === lastFgNotiKey && (now - lastFgNotiAt < 10_000)) return;
      lastFgNotiKey = key; lastFgNotiAt = now;
      maybeToast(`${title} · ${body}`,'info');
    });
  }catch(e){ console.error('initPush error:', e); }
}

/* 로그아웃 시 현재 기기의 토큰 삭제 + signOut */
async function logoutAndCleanup(user){
  try{
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) {
      await deleteDoc(doc(db, 'users', user.uid, 'fcmTokens', token));
      console.log('🧹 대시보드: FCM 토큰 삭제 완료');
    }
  }catch(e){ console.warn('대시보드 토큰 삭제 중 오류:', e); }
  // ✅ 로컬 정리
  localStorage.removeItem(FCM_TOKEN_LS_KEY);
  await signOut(auth);
  location.replace('login.html');
}

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
dayInput && (dayInput.value=selectedYMD);
dayInput?.addEventListener('change',()=>{selectedYMD=dayInput.value;setDateToURL(selectedYMD);subscribeByDate(selectedYMD,true);subscribeSurgeryByDate(selectedYMD,true);});
prevBtn?.addEventListener('click',()=>{const d=parseYMD(selectedYMD);d.setDate(d.getDate()-1);selectedYMD=toYMD(d);dayInput.value=selectedYMD;setDateToURL(selectedYMD);subscribeByDate(selectedYMD,true);subscribeSurgeryByDate(selectedYMD,true);});
nextBtn?.addEventListener('click',()=>{const d=parseYMD(selectedYMD);d.setDate(d.getDate()+1);selectedYMD=toYMD(d);dayInput.value=selectedYMD;setDateToURL(selectedYMD);subscribeByDate(selectedYMD,true);subscribeSurgeryByDate(selectedYMD,true);});

/* ===== 로그인 ===== */
onAuthStateChanged(auth,async user=>{
  cur=user||null;
  me && (me.textContent=user?`${user.displayName||'사용자'}님`:'로그인이 필요합니다');

  // 로그아웃 버튼
  if (btnLogout){
    if (user){
      btnLogout.style.display='inline-block';
      btnLogout.onclick = async ()=>{ if(!confirm('로그아웃 하시겠어요?')) return; await logoutAndCleanup(user); };
    }else{
      btnLogout.style.display='none';
      btnLogout.onclick = ()=>location.href='login.html';
    }
  }

  // 관리자 여부
  try{isAdmin=user?(await getDoc(doc(db,'admins',user.uid))).exists():false;}catch{}

  // 자동 초기화(권한 팝업은 띄우지 않음)
  if (user) initPush(user, { fromClick:false });

  // 사용자가 누르면 권한 요청
  btnEnablePush?.addEventListener('click', async ()=>{
    if(!auth.currentUser) return alert('로그인 후 이용해주세요.');
    await initPush(auth.currentUser, { fromClick:true });
    alert('알림이 활성화되었습니다.');
    setEnableBtnVisibility(); // ✅ 성공 후 버튼 갱신
  }, { once:true });

  // ✅ 로그인/권한/토큰 상태에 따라 표시 갱신
  setEnableBtnVisibility();
  document.addEventListener('visibilitychange', setEnableBtnVisibility);

  subscribeByDate(selectedYMD,true);
  subscribeSurgeryByDate(selectedYMD,true);
});

/* ===== Toast + Beep ===== */
function showToast(message,type='info',ms){
  const wrap=$('#toasts'); if(!wrap) return;
  const el=document.createElement('div');
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
/* === Audio Unlock === */
const AC = window.AudioContext || window.webkitAudioContext;
const audio = { ctx: null, out: null, unlocked: false };
function initAudioContext() {
  if (!AC) return;
  if (!audio.ctx) {
    audio.ctx = new AC();
    audio.out = audio.ctx.createGain();
    audio.out.gain.value = 0.35;
    audio.out.connect(audio.ctx.destination);
  }
}
function unlockAudio() {
  if (!AC) return;
  initAudioContext();
  try { const buffer = audio.ctx.createBuffer(1, 1, audio.ctx.sampleRate); const src = audio.ctx.createBufferSource(); src.buffer = buffer; src.connect(audio.out); src.start(0); } catch {}
  if (audio.ctx.state === 'suspended') { audio.ctx.resume().catch(()=>{}); }
  audio.unlocked = true;
  ['click','touchstart','keydown'].forEach(ev => window.removeEventListener(ev, unlockAudio, true));
}
['click','touchstart','keydown'].forEach(ev => window.addEventListener(ev, unlockAudio, { capture:true, passive:true }));
function playIMChime(kind='join', volume=0.35) {
  if (!soundToggle?.checked) return;
  if (!AC) return;
  initAudioContext();
  if (!audio.unlocked || !audio.ctx) return;
  audio.out.gain.value = volume;
  const delay = audio.ctx.createDelay(0.25);
  delay.delayTime.value = 0.11;
  const fb = audio.ctx.createGain();
  fb.gain.value = 0.18;
  delay.connect(fb); fb.connect(delay);
  delay.connect(audio.out);
  function tone(freq, start, dur, type='sine', gainStart=1.0) {
    const osc = audio.ctx.createOscillator();
    const g   = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audio.ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, audio.ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gainStart, audio.ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + start + dur);
    osc.connect(g); g.connect(delay); g.connect(audio.out);
    osc.start(audio.ctx.currentTime + start);
    osc.stop(audio.ctx.currentTime + start + dur + 0.02);
  }
  if (kind === 'join')      { tone(880,0.00,0.22,'sine',0.9); tone(1318,0.09,0.18,'triangle',0.75); }
  else if (kind === 'leave'){ tone(660,0.00,0.20,'sine',0.85); tone(440,0.10,0.28,'triangle',0.7); }
  else                      { tone(988,0.00,0.14,'triangle',0.9); }
}
function maybeToast(message,type='info',ms){ if (document.visibilityState !== 'visible') return; showToast(message,type,ms); }
function maybeChime(kind='join', volume=0.35){ if (document.visibilityState !== 'visible') return; playIMChime(kind, volume); }

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
      if (newMap.size>prevSnapshot.size){maybeToast('새 업무가 등록되었습니다.','success');maybeChime('join');}
      else if (newMap.size<prevSnapshot.size){maybeToast('업무가 삭제되었습니다.','warn');maybeChime('leave');}
      else{
        for (const [id,oldDoc] of prevSnapshot.entries()){
          const curDoc=newMap.get(id);
          if(curDoc&&(oldDoc.status||'open')!==(curDoc.status||'open')){
            const labels={open:'대기',in_progress:'진행중',done:'완료'};
            maybeToast(`업무 상태가 '${labels[curDoc.status]||curDoc.status}'(으)로 변경되었습니다.`,'info');
            maybeChime('note');break;
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
  surgListEl && (surgListEl.innerHTML='<div class="k">불러오는 중…</div>');
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
      if(mapNow.size>prevSurgerySnapshot.size){maybeToast('새 수술이 등록되었습니다.','success');maybeChime('join');}
      else if(mapNow.size<prevSurgerySnapshot.size){maybeToast('수술이 삭제되었습니다.','warn');maybeChime('leave');}
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
  maybeToast(`수술 상태가 '${SURG_LABEL[curDoc.status]||curDoc.status}'(으)로 변경되었습니다.`,'info');maybeChime('note');
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

/* ===== 차트 ===== */
let statusChart=null, hourlyChart=null, surgeryChart=null;
function updateStatusChart(open,prog,done){
  const ctx=document.getElementById('statusChart')?.getContext('2d'); if(!ctx) return;
  const data={labels:['대기','진행중','완료'],datasets:[{data:[open,prog,done],backgroundColor:['#334155','#2563eb','#16a34a'],borderColor:'#1f2937',borderWidth:1}]};
  const options={plugins:{legend:{labels:{color:'#e5e7eb'}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.formattedValue}`}}}};
  if(statusChart){statusChart.data.datasets[0].data=[open,prog,done];statusChart.update();}
  else{statusChart=new Chart(ctx,{type:'doughnut',data,options});}
}
function updateHourlyChart(items){
  const ctx=document.getElementById('hourlyChart')?.getContext('2d'); if(!ctx) return;
  const buckets=Array.from({length:24},()=>0);
  items.forEach(x=>{const d=toDate(x.createdAt);if(!d) return;buckets[d.getHours()]++;});
  const labels=buckets.map((_,i)=>`${i}시`);
  const data={labels,datasets:[{label:'이송 수',data:buckets,backgroundColor:'#475569',borderColor:'#1f2937',borderWidth:1}]};
  const options={scales:{x:{ticks:{color:'#cbd5e1'},grid:{color:'rgba(148,163,184,.18)'}},y:{ticks:{color:'#cbd5e1',precision:0},grid:{color:'rgba(148,163,184,.18)'},beginAtZero:true}},plugins:{legend:{labels:{color:'#e5e7eb'}}}};
  if(hourlyChart){hourlyChart.data.datasets[0].data=buckets;hourlyChart.update();}
  else{hourlyChart=new Chart(ctx,{type:'bar',data,options});}
}
const doughnutCenterText={id:'doughnutCenterText',afterDraw(chart,args,opts){const{ctx,chartArea:{width,height}}=chart;const total=opts.total||0,running=opts.running||0;const msg=total===0?'오늘 0건':`오늘 ${total}건`;const sub=total>0?(running>0?`진행 ${running}건`:'모두 완료'):'';ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e5e7eb';ctx.font='600 15px system-ui,-apple-system,Segoe UI,Inter';ctx.fillText(msg,width/2,height/2-7);ctx.font='12px system-ui,-apple-system,Segoe UI,Inter';ctx.fillStyle='#9aa3b2';if(sub) ctx.fillText(sub,width/2,height/2+12);ctx.restore();}};
function updateSurgeryChart(waiting,operating,done){
  const ctx=document.getElementById('surgeryChart')?.getContext('2d'); if(!ctx) return;
  const data={labels:['수술대기','수술진행중','완료'],datasets:[{data:[waiting,operating,done],backgroundColor:['#6b7280','#f59e0b','#10b981'],borderColor:'#1f2937',borderWidth:1}]};
  const options={plugins:{legend:{labels:{color:'#e5e7eb'}},tooltip:{callbacks:{label:c=>{const v=c.raw||0;const sum=(waiting+operating+done)||1;const pr=Math.round((v/sum)*100);return `${c.label}: ${v}건 (${pr}%)`;}}},doughnutCenterText:{total:(waiting+operating+done),running:operating}},cutout:'68%'};
  if(surgeryChart){surgeryChart.options.plugins.doughnutCenterText.total=waiting+operating+done;surgeryChart.options.plugins.doughnutCenterText.running=operating;surgeryChart.data.datasets[0].data=[waiting,operating,done];surgeryChart.update();}
  else{surgeryChart=new Chart(ctx,{type:'doughnut',data,options,plugins:[doughnutCenterText]});}
}

/* ===== 렌더 ===== */
let stateFilter='all';
const tabs=$$('.tab');
tabs.forEach(btn=>btn.addEventListener('click',()=>{stateFilter=btn.dataset.state;tabs.forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));render();}));
transOnly?.addEventListener('change',()=>{if(transOnly.checked)miscOnly.checked=false;render();});
miscOnly?.addEventListener('change',()=>{if(miscOnly.checked)transOnly.checked=false;render();});


function render(){
  const base=snapshotData.map(x=>({...x,status:x.status||'open'}));
  const cOpen=base.filter(x=>x.status==='open').length;
  const cProg=base.filter(x=>x.status==='in_progress').length;
  const cDone=base.filter(x=>x.status==='done').length;
  cntOpen && (cntOpen.textContent=cOpen);
  cntProg && (cntProg.textContent=cProg);
  cntDone && (cntDone.textContent=cDone);
  updateStatusChart(cOpen,cProg,cDone);

  let items=base.slice();
  if(stateFilter!=='all') items=items.filter(x=>x.status===stateFilter);
  if(transOnly?.checked) items=items.filter(x=>x.category==='transport');
  if(miscOnly?.checked)  items=items.filter(x=>x.category==='misc');

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

  const mine = !!(cur && d.assignedTo?.uid===cur.uid);

  // 담당자/관리자 액션
  if(mine || isAdmin){
    const actions=document.createElement('div');actions.className='row';actions.style.cssText='gap:6px;flex-wrap:wrap;margin-top:6px';
    if(d.status==='open') actions.appendChild(btn('시작',()=>quickStatus(d.id,'in_progress')));
    if(d.status==='in_progress') actions.appendChild(btn('완료',()=>quickStatus(d.id,'done')));
    if(d.status==='done') actions.appendChild(btn('진행중',()=>quickStatus(d.id,'in_progress')));
    if(d.status!=='open') actions.appendChild(btn('대기',()=>quickStatus(d.id,'open')));
    if (mine) actions.appendChild(btn('픽업취소', ()=>dropTask(d.id)));
    const delB=document.createElement('button');delB.className='btn danger small';delB.textContent='삭제';delB.onclick=()=>delTask(d.id,d);
    actions.appendChild(delB);left.appendChild(actions);
  }

  // 미배정 + 대기 → 누구나 픽업
  if (!d.assignedTo?.uid && d.status==='open' && cur){
    const actions=document.createElement('div');actions.className='row';actions.style.cssText='gap:6px;flex-wrap:wrap;margin-top:6px';
    actions.appendChild(btn('픽업', ()=>pickupTask(d.id)));
    left.appendChild(actions);
  }

  const right=document.createElement('div');right.className='right';
  const lines=[];lines.push(`<div class="k">${esc(d.assignedTo?.name||'-')}</div>`);lines.push(`<div class="k">생성: ${formatWhen(d.createdAt)}</div>`);
  const ts=d.timestamps||{}; if(ts.startedAt) lines.push(`<div class="k">시작: ${formatWhen(ts.startedAt)}</div>`); if(ts.doneAt) lines.push(`<div class="k">완료: ${formatWhen(ts.doneAt)}</div>`); if(ts.editedAt) lines.push(`<div class="k">수정: ${formatWhen(ts.editedAt)}</div>`); if(ts.reopenedAt) lines.push(`<div class="k">대기: ${formatWhen(ts.reopenedAt)}</div>`);
  right.innerHTML=lines.join('');el.appendChild(left);el.appendChild(right);return el;
}
function chip(t,c=''){const s=document.createElement('span');s.className='chip'+(c?(' '+c):'');s.textContent=t;return s;}
function btn(l,f){const b=document.createElement('button');b.className='btn small';b.textContent=l;b.onclick=f;return b;}

/* ===== 픽업 / 반납 ===== */
async function pickupTask(id){
  try{
    if(!cur) return alert('로그인이 필요합니다.');
    const ref=doc(db,'wardTasks',id);
    const snap=await getDoc(ref); const x=snap.data();
    if(!x) return;
    if(x.assignedTo?.uid) return maybeToast('이미 다른 분이 픽업했습니다.','warn');
    await updateDoc(ref,{
      assignedTo:{ uid:cur.uid, name:(auth.currentUser?.displayName||'사용자') },
      updatedAt:serverTimestamp(),
      'timestamps.assignedAt':serverTimestamp()
    });
    maybeToast('업무를 픽업했습니다.','success'); maybeChime('join');
  }catch(e){ console.error(e); maybeToast('픽업 실패','error'); }
}
async function dropTask(id){
  try{
    if(!cur) return alert('로그인이 필요합니다.');
    const ref=doc(db,'wardTasks',id);
    const snap=await getDoc(ref); const x=snap.data();
    if(!x) return;
    if(x.assignedTo?.uid!==cur.uid && !isAdmin) return alert('담당자만 픽업을 취소 할 수 있습니다.');
    await updateDoc(ref,{
      assignedTo: deleteField(),
      status: 'open',
      updatedAt: serverTimestamp(),
      'timestamps.reopenedAt': serverTimestamp()
    });
    maybeToast('업무의 픽업을 취소했습니다.','warn'); maybeChime('leave');
  }catch(e){ console.error(e); maybeToast('픽업취소 실패','error'); }
}

/* ===== 상태 전환: 담당자/관리자 가드 ===== */
async function quickStatus(id,nextStatus){
  try{
    const ref=doc(db,'wardTasks',id);
    const snap=await getDoc(ref);
    const curDoc=snap.exists()?snap.data():null;

    if (curDoc?.assignedTo?.uid && curDoc.assignedTo.uid !== cur?.uid && !isAdmin) {
      return maybeToast('담당자만 상태를 변경할 수 있습니다.','error');
    }

    const patch={status:nextStatus,updatedAt:serverTimestamp()};
    if(curDoc&&(curDoc.status||'open')!==nextStatus){
      if(nextStatus==='in_progress') patch['timestamps.startedAt']=serverTimestamp();
      else if(nextStatus==='done') patch['timestamps.doneAt']=serverTimestamp();
      else if(nextStatus==='open') patch['timestamps.reopenedAt']=serverTimestamp();
    }
    await updateDoc(ref,patch);
    const labels={open:'대기',in_progress:'진행중',done:'완료'};
    maybeToast(`'${labels[nextStatus]||nextStatus}' 상태로 전환했습니다.`,'info',1800); maybeChime('note');
  }catch(e){maybeToast('권한 없음 또는 오류','error');}
}

/* ===== 수술 섹션: 빠른전환/삭제 ===== */
async function quickSurgeryAction(id, action){
  if (!isAdmin) return maybeToast('관리자만 변경할 수 있습니다.','error');
  const ref = doc(db, 'surgeries', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return maybeToast('문서를 찾을 수 없습니다.','error');
  try{
    if (action === 'delete'){
      if (!confirm('정말 삭제하시겠습니까?')) return;
      await deleteDoc(ref);
      maybeToast('수술 항목이 삭제되었습니다.','info');
      maybeChime('leave'); return;
    }
    const patch = { updatedAt: serverTimestamp() };
    if (action === 'waiting')  { patch.status = 'waiting';  patch['timestamps.reopenedAt'] = serverTimestamp(); }
    if (action === 'operating'){ patch.status = 'operating'; patch['timestamps.startedAt']  = serverTimestamp(); }
    if (action === 'done')     { patch.status = 'done';     patch['timestamps.doneAt']     = serverTimestamp(); }
    await updateDoc(ref, patch);
    const label = { waiting:'대기', operating:'진행중', done:'완료' }[action] || action;
    maybeToast(`수술 상태를 '${label}'(으)로 변경했습니다.`,'info');
    maybeChime('note');
  }catch(e){ console.error(e); maybeToast('변경 실패','error'); }
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
  items.forEach(x=>{
    const statusK=SURG_LABEL[x.status]||x.status;
    const chipClass = x.status==='waiting' ? 'stat-open' : (x.status==='operating' ? 'stat-prog' : 'stat-done');
    const title = `[${x.surgeryDept||'-'}] ${x.surgeryName||'-'}`;
    const el=document.createElement('div');
    el.className='s-item';
    el.innerHTML=`
      <div>
        <div><b>${esc(title)}</b></div>
        <div class="k">${formatWhen(x.createdAt)}</div>
        <div class="k">#${esc(x.caseId||'-')}</div>
        ${x.note?`<div class="k">${esc(x.note)}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
        <span class="chip ${chipClass}">${statusK}</span>
        ${isAdmin ? `
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn small" data-surg-act="operating" data-id="${x.id}">시작</button>
            <button class="btn small" data-surg-act="waiting"  data-id="${x.id}">대기</button>
            <button class="btn small" data-surg-act="done"     data-id="${x.id}">완료</button>
            <button class="btn small danger" data-surg-act="delete" data-id="${x.id}">삭제</button>
          </div>` : ``}
      </div>`;
    frag.appendChild(el);
  });
  surgListEl.innerHTML='';surgListEl.appendChild(frag);
}

async function delTask(id){
  if(!confirm('이 업무를 삭제할까요?')) return;
  try{await deleteDoc(doc(db,'wardTasks',id));maybeToast('업무가 삭제되었습니다.','warn');maybeChime('leave');}
  catch(e){maybeToast('삭제 실패','error');}
}

/* ==== Chat Drawer + Unread Badge ==== */
const chatBtn = document.getElementById('btn-chat');
const chatBadge = document.getElementById('chat-badge');   // 없으면 무시됨
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

/* Firestore 구독으로 미읽음 계산 */
let stopChatSnap = null;
let chatBadgeStarted = false;
let lastUnreadCount = -1;
function subscribeChatBadge(){
  if (chatBadgeStarted) return;
  chatBadgeStarted = true;
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
    if (unread !== lastUnreadCount) {
      setBadge(chatBadge, unread);
      setBadge(chatFabBadge, unread);
      document.title = unread > 0 ? `(${unread}) 대시보드` : '대시보드';
      lastUnreadCount = unread;
    }
  }, _e => { setBadge(chatBadge, 0); setBadge(chatFabBadge, 0); });
}
subscribeChatBadge();

/* Drawer 열기/닫기 */
function ensureChatSrc(){
  if (!chatFrame?.getAttribute('src')){
    chatFrame?.setAttribute('src', `chat.html?room=${encodeURIComponent(CHAT_ROOM)}&embed=1`);
  }
}
function markChatReadNow(){
  setLastReadNow();
  setBadge(chatBadge, 0);
  setBadge(chatFabBadge, 0);
  document.title = '대시보드';
}
function openChat(){
  if (!auth.currentUser){ alert('로그인 후 이용해주세요.'); return; }
  ensureChatSrc();
  if(chatDim) chatDim.style.display='block';
  chatDrawer?.removeAttribute('inert');
  chatDrawer?.classList.add('open');
  chatDrawer?.setAttribute('aria-hidden','false');
  chatOpen = true;
  markChatReadNow();
  chatClose?.focus();
}
function closeChat(){
  chatClose?.blur();
  chatBtn?.focus();
  chatDrawer?.classList.remove('open');
  chatDrawer?.setAttribute('aria-hidden','true');
  chatDrawer?.setAttribute('inert','');
  if(chatDim) chatDim.style.display='none';
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
ensureChatSrc();

/* 채팅 새 메시지 토스트: 가시성 체크 + 5초 디바운스 */
let lastChatToastAt = 0;
window.addEventListener('message', (e) => {
  const fromChat = (e.source === chatFrame?.contentWindow);
  const sameOrigin = (e.origin === location.origin) || (e.origin === 'null');
  if (!fromChat || !sameOrigin) return;
  const data = e.data || {};
  if (data.type === 'chat:new' && data.room === CHAT_ROOM) {
    if (!chatOpen && document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - lastChatToastAt > 5_000) {
        maybeToast('새 채팅이 도착했습니다.','info'); maybeChime('note');
        lastChatToastAt = now;
      }
    }
  } else if (data.type === 'chat:read' && data.room === CHAT_ROOM) {
    markChatReadNow();
  }
});
window.addEventListener('focus', () => { if (chatOpen) markChatReadNow(); });

/* ===== 수술 빠른전환 버튼 클릭 위임 ===== */
surgListEl?.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-surg-act]');
  if(!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.surgAct;
  quickSurgeryAction(id, action);
});
