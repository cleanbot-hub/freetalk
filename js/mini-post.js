import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const cfg={apiKey:"AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",authDomain:"woori-1ecf5.firebaseapp.com",projectId:"woori-1ecf5"};
const app=initializeApp(cfg);const auth=getAuth(app);const db=getFirestore(app);
const params=new URLSearchParams(location.search);
const nick=decodeURIComponent(params.get('u')||'');
const postId=params.get('id');
const $=id=>document.getElementById(id);

async function resolveUid(n){
  const lower=n.toLowerCase();
  const s=await getDoc(doc(db,'nicknames',lower)).catch(()=>null);
  if(s?.exists())return s.data().uid;
  return null;
}

(async()=>{
  const uid=await resolveUid(nick);
  if(!uid){document.body.innerHTML='<p>사용자를 찾을 수 없습니다.</p>';return;}

  const pRef=doc(db,'homes',uid,'posts',postId);
  const snap=await getDoc(pRef);
  if(!snap.exists()){document.body.innerHTML='<p>글을 찾을 수 없습니다.</p>';return;}
  const d=snap.data();
  $('post-title').textContent=d.title;
  $('post-meta').textContent=`작성일 ${new Date(d.createdAt?.toDate?.()||Date.now()).toLocaleString()}`;
  $('post-body').textContent=d.body;

  const cCol=collection(db,'homes',uid,'posts',postId,'comments');
  onSnapshot(query(cCol,orderBy('createdAt','asc')),(ss)=>{
    const list=$('cmt-list');list.innerHTML='';
    if(ss.empty){list.innerHTML='<div style="color:#9aa3b2">댓글이 없습니다.</div>';return;}
    ss.forEach(c=>{
      const x=c.data();const el=document.createElement('div');
      el.style.marginBottom='8px';
      el.innerHTML=`<b>${x.authorName||'익명'}</b> · <span style="color:#9aa3b2">${new Date(x.createdAt?.toDate?.()||Date.now()).toLocaleString()}</span><br>${x.text}`;
      list.appendChild(el);
    });
  });

  $('cmt-add').onclick=async()=>{
    const t=($('cmt-input').value||'').trim();if(!t)return alert('댓글을 입력하세요.');
    if(!auth.currentUser)return location.href='/login.html';
    const me=auth.currentUser;
    const us=await getDoc(doc(db,'users',me.uid));
    const n=us.data()?.nickname||'사용자';
    await addDoc(cCol,{text:t,authorUid:me.uid,authorName:n,createdAt:serverTimestamp()});
    $('cmt-input').value='';
  };
})();
