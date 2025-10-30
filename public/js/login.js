import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, deleteUser, fetchSignInMethodsForEmail,
  setPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const cfg = {
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  storageBucket: "woori-1ecf5.firebasestorage.app",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c",
  databaseURL: "https://woori-1ecf5-default-rtdb.firebaseio.com"
};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db   = getFirestore(app);

await setPersistence(auth, browserSessionPersistence);

const $ = id => document.getElementById(id);
const tabLogin=$('tab-login'), tabSign=$('tab-signup');
const loginNick=$('login-nick'), loginPw=$('login-pw'), doLogin=$('do-login');
const signNick=$('sign-nick'),  signPw=$('sign-pw'),  signPw2=$('sign-pw2');
const btnCheck=$('btn-check'), agree=$('agree'), doSignup=$('do-signup');
const panelLogin=$('panel-login'), panelSign=$('panel-signup');

let nickOk=false, redirected=false, busy=false;
let lastCheckedNick="";

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

async function ensureNickname(user, fallbackNick){
  const uRef = doc(db,'users',user.uid);
  const s = await getDoc(uRef);
  let nick = s.data()?.nickname?.trim();
  if(!nick){
    nick = user.displayName?.trim() || fallbackNick;
    await setDoc(uRef, { nickname:nick, createdAt: s.exists()? s.data().createdAt : serverTimestamp() }, { merge:true });
    try{ await updateProfile(user, { displayName:nick }); }catch{}
  }
  return nick;
}

/* 이미 로그인 중이면 로그인 화면 대신 등록페이지로 */
onAuthStateChanged(auth, (u)=>{ if(u && !redirected){ redirected=true; location.replace('woori.html'); } });

tabLogin.onclick=()=>{ tabLogin.classList.add('active'); tabSign.classList.remove('active'); panelLogin.style.display='block'; panelSign.style.display='none'; };
tabSign.onclick =()=>{ tabSign.classList.add('active'); tabLogin.classList.remove('active'); panelLogin.style.display='none'; panelSign.style.display='block'; };

signNick.addEventListener('input', ()=>{ nickOk=false; lastCheckedNick=""; });

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
    const key = normNick(n);
    const [nickDoc, methods] = await Promise.all([
      getDocFromServer(doc(db,'nicknames', key)),
      fetchSignInMethodsForEmail(auth, makeEmailFromNick(n))
    ]);
    if (nickDoc.exists() || methods.length>0) {
      nickOk = false; lastCheckedNick="";
      throw { code:'auth/email-already-in-use', message:'이미 사용 중인 별명입니다.' };
    }

    const email = makeEmailFromNick(n);
    const { user } = await createUserWithEmailAndPassword(auth, email, p1);
    createdUser = user;

    try{
      await setDoc(doc(db,'nicknames', key), { uid:user.uid, at:serverTimestamp() });
    }catch(e){
      try{ await deleteUser(user); }catch{}
      throw { code:'auth/email-already-in-use', message:'이미 사용 중인 별명입니다.' };
    }

    try{ await updateProfile(user, { displayName:n }); }catch{}
    await setDoc(doc(db,'users', user.uid), { nickname:n, createdAt:serverTimestamp() }, { merge:true });

    safeAlert('가입 완료! 과업 등록 페이지로 이동합니다.');
    redirected = true;
    /* ✅ 변경부분: 회원가입 완료 후 wooril.html 로 이동 */
    location.replace('wooril.html');
  }catch(e){
    if(createdUser && e?.code!=='auth/email-already-in-use'){
      try{ await deleteUser(createdUser); }catch{}
    }
    err(e);
  }finally{
    setBusy(false);
  }
}

function setBusy(state){
  busy = state;
  [doLogin, btnCheck, doSignup].forEach(b => b && (b.disabled = state));
}

doLogin.onclick  = doLoginFlow;
doSignup.onclick = doSignupFlow;
loginPw.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin.click(); });
loginNick.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin.click(); });
signPw2.addEventListener('keydown', e=>{ if(e.key==='Enter') doSignup.click(); });
