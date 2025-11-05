import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, collection, query, where, orderBy, limit,
  addDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const cfg={apiKey:"AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",authDomain:"woori-1ecf5.firebaseapp.com",projectId:"woori-1ecf5"};
const app=initializeApp(cfg);const auth=getAuth(app);const db=getFirestore(app);
const $=id=>document.getElementById(id);
const esc=s=>String(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]||m));
const fmt=ts=>{try{const d=ts?.toDate?.()||new Date();return new Date(d).toLocaleString();}catch{return '';}};

const params=new URLSearchParams(location.search);
const uParam=decodeURIComponent(params.get('u')||'').trim();
let ownerUid=null, viewer=null;

async function resolveUid(nick){
  const lower=nick.toLowerCase();
  const docu=await getDoc(doc(db,'nicknames',lower)).catch(()=>null);
  if(docu?.exists()) return docu.data().uid;
  const qs=await getDocs(query(collection(db,'users'),where('nickname','==',nick)));
  if(!qs.empty)return qs.docs[0].id;
  return /^[A-Za-z0-9_-]{20,36}$/.test(nick)?nick:null;
}

(async()=>{
  ownerUid=await resolveUid(uParam);
  if(!ownerUid){document.body.innerHTML='<div class="wrap"><div class="card">존재하지 않는 사용자입니다.</div></div>';return;}

  const us=await getDoc(doc(db,'users',ownerUid));
  const nick=us.data()?.nickname||'사용자';
  $('mini-nick').textContent=nick;
  $('mini-bio').textContent=(await getDoc(doc(db,'homes',ownerUid))).data()?.bio||'';
  const avatar=us.data()?.avatarUrl;if(avatar)$('mini-avatar').innerHTML=`<img src="${avatar}">`;
  $('owner-badge').textContent=ownerUid;

  onAuthStateChanged(auth,u=>{
    viewer=u;
    if(!u){$('btn-login').textContent='로그인';$('btn-write').style.display='none';}
    else{
      $('btn-login').textContent='로그아웃';$('btn-login').onclick=()=>auth.signOut().then(()=>location.reload());
      $('btn-write').style.display=(u.uid===ownerUid)?'inline-block':'none';
      $('btn-write').onclick=()=>openWriter();
    }
  });

  // 내 글 목록
  onSnapshot(query(collection(db,'homes',ownerUid,'posts'),orderBy('createdAt','desc'),limit(20)),(snap)=>{
    const list=$('mini-posts');list.innerHTML='';
    if(snap.empty){list.innerHTML='<div class="item"><div class="meta">작성된 글이 없습니다.</div></div>';return;}
    snap.forEach(d=>{
      const x=d.data();
      const el=document.createElement('div');
      el.className='item';
      el.innerHTML=`<b>${esc(x.title||'(제목없음)')}</b><div class="meta">${fmt(x.createdAt)}</div>`;
      el.onclick=()=>openPost(d.id,x);
      list.appendChild(el);
    });
  });

  // 방명록
  const gbCol=collection(db,'homes',ownerUid,'guestbook');
  onSnapshot(query(gbCol,orderBy('createdAt','desc'),limit(20)),(snap)=>{
    const list=$('gb-list');list.innerHTML='';
    if(snap.empty){list.innerHTML='<div class="item"><div class="meta">첫 인사를 남겨보세요!</div></div>';return;}
    snap.forEach(c=>{
      const x=c.data();
      const row=document.createElement('div');
      row.className='item';
      row.innerHTML=`<b>${esc(x.authorName||'익명')}</b> · <span class="meta">${fmt(x.createdAt)}</span><br>${esc(x.text||'')}`;
      list.appendChild(row);
    });
  });

  $('gb-add').onclick=async()=>{
    const t=($('gb-input').value||'').trim();if(!t)return alert('내용을 입력하세요.');
    if(!auth.currentUser)return location.href='/login.html';
    const me=auth.currentUser;
    const nick=(await getDoc(doc(db,'users',me.uid))).data()?.nickname||'사용자';
    await addDoc(collection(db,'homes',ownerUid,'guestbook'),{
      text:t,authorUid:me.uid,authorName:nick,createdAt:serverTimestamp()
    });
    $('gb-input').value='';
  };
})();

/* === Drawer Logic === */
const drawer=$('drawer'),box=$('drawer-content'),closeBtn=$('drawer-close');
function openDrawer(html){box.innerHTML=html;drawer.style.display='flex';}
closeBtn.onclick=()=>drawer.style.display='none';

function openWriter(){
  openDrawer(`
    <h3>✏️ 새 글쓰기</h3>
    <input id="w-title" class="field" placeholder="제목"/><br>
    <textarea id="w-body" class="field" rows="6" placeholder="내용"></textarea><br>
    <button id="w-save" class="btn primary">저장</button>
  `);
  $('w-save').onclick=async()=>{
    const t=$('w-title').value.trim(),b=$('w-body').value.trim();
    if(!t||!b)return alert('제목과 내용을 입력하세요.');
    await addDoc(collection(db,'homes',auth.currentUser.uid,'posts'),{title:t,body:b,createdAt:serverTimestamp()});
    alert('저장 완료');drawer.style.display='none';
  };
}

function openPost(id,x){
  openDrawer(`
    <h3>${esc(x.title||'(제목없음)')}</h3>
    <div class="meta">${fmt(x.createdAt)}</div>
    <div style="margin-top:8px;white-space:pre-wrap">${esc(x.body||'')}</div>
  `);
}
