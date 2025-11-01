// login.js (final)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, deleteUser, fetchSignInMethodsForEmail,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

/* ===== Firebase ===== */
const cfg = {
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  storageBucket: "woori-1ecf5.firebasestorage.app",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c",
  databaseURL: "https://woori-1ecf5-default-rtdb.firebaseio.com"
};
const app  = initializeApp(cfg);
const auth = getAuth(app);
const db   = getFirestore(app);

/* 로그인 유지: 로컬 영속(탭/앱 재시작·알림 클릭 새 탭에서도 유지) */
try {
  await setPersistence(auth, browserLocalPersistence);
} catch (_) {
  // 일부 브라우저의 프라이빗 모드 등에서 실패할 수 있음 → 무시하고 진행
}

/* ===== DOM ===== */
const $ = id => document.getElementById(id);
const tabLogin=$('tab-login'), tabSign=$('tab-signup');
const loginNick=$('login-nick'), loginPw=$('login-pw'), doLogin=$('do-login');
const signNick=$('sign-nick'),  signPw=$('sign-pw'),  signPw2=$('sign-pw2');
const btnCheck=$('btn-check'), agree=$('agree'), doSignup=$('do-signup');
const panelLogin=$('panel-login'), panelSign=$('panel-signup');

/* ===== 상태 ===== */
let nickOk=false, redirected=false, busy=false;
let lastCheckedNick="";

/* ===== 유틸 ===== */
const normNick = n => n.trim().toLowerCase();
const validNick = n => /^[^\s]{2,20}$/.test(n.trim());
const makeEmailFromNick = n => `${normNick(n)}@nick.local`;

function safeAlert(msg){
  const s = String(msg||'').replace(/[<>&'"]/g, c=>({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[c]));
  alert(s);
}
const err = e => safeAlert({
  "auth/email-already-in-use":"이미 사용 중인 별명입니다.",
  "auth/weak-password":"비밀번호가 6자 미만입니다.",
  "auth/invalid-credential":"별명 또는 비밀번호가 올바르지 않습니다.",
  "permission-denied":"권한이 없습니다."
}[e?.code] || ('오류: ' + (e?.message || e?.code)));

/* ===== 프로필 보정 =====
   - users/{uid} 에 nickname, nicknameKey 저장
   - nicknames/{key} 인덱스 없으면 생성(로그인 상태에서만 실행) */
async function ensureNickname(user, fallbackNick){
  const uRef = doc(db,'users',user.uid);
  const s = await getDoc(uRef);
  let nick = s.data()?.nickname?.trim();
  if(!nick){ nick = user.displayName?.trim() || fallbackNick; }

  await setDoc(uRef, {
    nickname: nick,
    nicknameKey: normNick(nick),
    createdAt: s.exists() ? s.data().createdAt : serverTimestamp()
  }, { merge:true });

  try{ await updateProfile(user, { displayName:nick }); }catch{}

  // nicknames 인덱스가 없으면 생성
  try{
    const key = normNick(nick);
    const ndoc = await getDocFromServer(doc(db,'nicknames', key));
    if(!ndoc.exists()){
      await setDoc(doc(db,'nicknames', key), { uid:user.uid, at:serverTimestamp() }, { merge:true });
    }
  }catch{}

  return nick;
}

/* 이미 로그인 상태면 바로 이동 (깜빡임 방지용 redirected 플래그) */
onAuthStateChanged(auth, (u)=>{ if(u && !redirected){ redirected=true; location.replace('woori.html'); } });

/* 탭 전환 */
tabLogin.onclick=()=>{ tabLogin.classList.add('active'); tabSign.classList.remove('active'); panelLogin.style.display='block'; panelSign.style.display='none'; };
tabSign.onclick =()=>{ tabSign.classList.add('active'); tabLogin.classList.remove('active'); panelLogin.style.display='none'; panelSign.style.display='block'; };

/* 닉 입력 바뀌면 재확인 필요 */
signNick.addEventListener('input', ()=>{ nickOk=false; lastCheckedNick=""; });

/* ===== 중복 확인 ===== */
btnCheck.onclick = async ()=>{
  const n = signNick.value.trim();
  if(!validNick(n)) return safeAlert('별명은 공백 없이 2~20자로 입력하세요.');
  setBusy(true);
  try{
    const key = normNick(n);
    const [nickDoc, methods] = await Promise.all([
      getDocFromServer(doc(db,'nicknames', key)),
      fetchSignInMethodsForEmail(auth, makeEmailFromNick(n))
    ]);
    const taken = nickDoc.exists() || methods.length>0;
    nickOk = !taken;
    lastCheckedNick = nickOk ? n : "";
    safeAlert(nickOk ? '사용 가능합니다.' : '이미 사용 중입니다.');
  }catch(e){ err(e); }
  finally{ setBusy(false); }
};

/* ===== 로그인 ===== */
async function doLoginFlow(){
  const n = loginNick.value.trim(), p = loginPw.value.trim();
  if(!validNick(n)) return safeAlert('별명은 공백 없이 2~20자로 입력하세요.');
  if(p.length < 6)  return safeAlert('비밀번호는 6자 이상이어야 합니다.');
  setBusy(true);
  try{
    const { user } = await signInWithEmailAndPassword(auth, makeEmailFromNick(n), p);
    await ensureNickname(user, n);
    redirected = true; location.replace('woori.html');
  }catch(e){ err(e); }
  finally{ setBusy(false); }
}

/* ===== 회원가입 ===== */
async function doSignupFlow(){
  const n  = signNick.value.trim();
  const p1 = signPw.value.trim();
  const p2 = signPw2.value.trim();

  if(!validNick(n))  return safeAlert('별명은 공백 없이 2~20자로 입력하세요.');
  if(p1.length < 6)  return safeAlert('비밀번호는 6자 이상이어야 합니다.');
  if(p1 !== p2)      return safeAlert('비밀번호 확인이 일치하지 않습니다.');
  if(!agree.checked) return safeAlert('개인정보 동의가 필요합니다.');
  if(!nickOk || normNick(n) !== normNick(lastCheckedNick)){
    return safeAlert('별명이 변경되었습니다. 다시 중복 확인을 해주세요.');
  }

  setBusy(true);
  let createdUser = null;
  try{
    // 가입 직전 재검증(경쟁 상태 대비)
    const key = normNick(n);
    const [nickDoc, methods] = await Promise.all([
      getDocFromServer(doc(db,'nicknames', key)),
      fetchSignInMethodsForEmail(auth, makeEmailFromNick(n))
    ]);
    if (nickDoc.exists() || methods.length>0) {
      nickOk = false; lastCheckedNick="";
      throw { code:'auth/email-already-in-use', message:'이미 사용 중인 별명입니다.' };
    }

    // Auth 계정 생성
    const email = makeEmailFromNick(n);
    const { user } = await createUserWithEmailAndPassword(auth, email, p1);
    createdUser = user;

    // nicknames/{key} 예약 (경쟁 방지)
    try{
      await setDoc(doc(db,'nicknames', key), { uid:user.uid, at:serverTimestamp() });
    }catch(e){
      try{ await deleteUser(user); }catch{}
      throw { code:'auth/email-already-in-use', message:'이미 사용 중인 별명입니다.' };
    }

    // 프로필/유저 문서
    try{ await updateProfile(user, { displayName:n }); }catch{}
    await setDoc(doc(db,'users', user.uid), {
      nickname: n,
      nicknameKey: key,
      createdAt: serverTimestamp()
    }, { merge:true });

    safeAlert('가입 완료! 과업 등록 페이지로 이동합니다.');
    redirected = true;
    location.replace('woori.html');
  }catch(e){
    if(createdUser && e?.code!=='auth/email-already-in-use'){
      try{ await deleteUser(createdUser); }catch{}
    }
    err(e);
  }finally{
    setBusy(false);
  }
}

/* ===== 공통 ===== */
function setBusy(state){
  busy = state;
  [doLogin, btnCheck, doSignup].forEach(b => b && (b.disabled = state));
}

/* 이벤트 바인딩 */
doLogin.onclick  = doLoginFlow;
doSignup.onclick = doSignupFlow;
loginPw.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin.click(); });
loginNick.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin.click(); });
signPw2.addEventListener('keydown', e=>{ if(e.key==='Enter') doSignup.click(); });
