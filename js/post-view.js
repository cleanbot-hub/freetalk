import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, runTransaction, serverTimestamp,
  updateDoc, deleteDoc, collection, addDoc, query, orderBy, onSnapshot, setDoc, getDocs
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

const cfg={apiKey:"AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
authDomain:"woori-1ecf5.firebaseapp.com",projectId:"woori-1ecf5"};
const app=initializeApp(cfg); const db=getFirestore(app); const auth=getAuth(app);

const $=s=>document.querySelector(s);
const esc=s=>String(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]||m));
const fmt=t=>{try{const d=t?.toDate?.()||new Date();return d.toLocaleString();}catch{return '';}};
const cloudThumb=(pid,w=1280)=>`https://res.cloudinary.com/dnx6obtjb/image/upload/f_auto,q_auto,c_limit,w_${w}/${pid}.jpg`;

const id=new URL(location.href).searchParams.get('id');
if(!id){ alert('잘못된 링크입니다.'); }

/* ===== 상태 ===== */
let curUser=null, isAdmin=false, postDoc=null, canEdit=false, liked=false;

/* ===== 유틸 ===== */
function openModal(m){ m.style.display='flex'; m.setAttribute('aria-hidden','false'); }
function closeModal(m){ m.style.display='none'; m.setAttribute('aria-hidden','true'); }

/* ===== 로그인/관리자 ===== */
onAuthStateChanged(auth, async (u)=>{
  curUser=u||null;
  try{ isAdmin = !!u && (await getDoc(doc(db,'admins',u.uid))).exists(); }catch{ isAdmin=false; }
  await loadPost();          // 권한 표시에 영향 → 다시 세팅
  watchLikes();              // 좋아요 토글 표시
});

/* ===== 글 로드 + 조회수 증가 ===== */
async function loadPost(){
  const ref=doc(db,'communityPosts',id);
  const snap=await getDoc(ref);
  if(!snap.exists()){
    document.body.innerHTML='<div class="wrap"><div class="panel">글을 찾을 수 없습니다.</div></div>';
    return;
  }
  postDoc=snap.data();

  $('#title').textContent = postDoc.title || '(제목 없음)';
  $('#meta').textContent  = `${postDoc.authorName||'익명'} · ${fmt(postDoc.createdAt)}`;
  $('#body').textContent  = postDoc.body || '';

  // 이미지 렌더
  const box = $('#images'); box.innerHTML='';
  const imgs = Array.isArray(postDoc.images) ? postDoc.images : [];
  imgs.forEach(img=>{
    const url = typeof img==='string' ? img
      : (img.url || (img.pid ? cloudThumb(img.pid, 1600) : ''));
    if(!url) return;
    const el=document.createElement('img'); el.src=url; el.alt='';
    box.appendChild(el);
  });

  // 권한 버튼
  canEdit = !!curUser && (isAdmin || (postDoc.authorUid && postDoc.authorUid===curUser.uid));
  $('#btn-edit').style.display   = canEdit ? 'inline-block' : 'none';
  $('#btn-delete').style.display = canEdit ? 'inline-block' : 'none';

  // 조회수 +1
  try{
    await runTransaction(db, async (tx)=>{
      const ds = await tx.get(ref);
      if(!ds.exists()) return;
      const cur = Number(ds.data().views||0);
      tx.update(ref,{ views: cur + 1, lastViewedAt: serverTimestamp() });
    });
    $('#view-count').textContent = `조회수 ${(Number(postDoc.views||0)+1)}`;
  }catch{
    $('#view-count').textContent = `조회수 ${postDoc.views||0}`;
  }

  // 댓글 구독 시작
  watchComments();
}
loadPost();

/* ===== 수정/삭제 ===== */
const em = $('#edit-modal');
$('#btn-edit').addEventListener('click', ()=>{
  if(!canEdit) return;
  $('#em-title').value = postDoc.title || '';
  $('#em-body').value  = postDoc.body  || '';
  openModal(em);
});
$('#em-cancel').addEventListener('click', ()=>closeModal(em));
$('#em-save').addEventListener('click', async ()=>{
  if(!canEdit) return;
  const title = $('#em-title').value.trim();
  const body  = $('#em-body').value.trim();
  if(!title) return alert('제목을 입력하세요.');
  try{
    await updateDoc(doc(db,'communityPosts',id), {
      title, body, editedAt: serverTimestamp()
    });
    closeModal(em);
    await loadPost();
    alert('수정되었습니다.');
  }catch(e){ console.error(e); alert('수정 실패'); }
});

$('#btn-delete').addEventListener('click', async ()=>{
  if(!canEdit) return;
  if(!confirm('정말 삭제하시겠습니까?')) return;
  try{
    await deleteDoc(doc(db,'communityPosts',id));
    alert('삭제되었습니다.');
    location.replace('board.html'); // 목록으로
  }catch(e){ console.error(e); alert('삭제 실패'); }
});

/* ===== 좋아요 =====
   구조: communityPosts/{id}/likes/{uid} => { at: serverTimestamp() }  */
const likeBtn = $('#btn-like');
async function checkLiked(){
  if(!curUser){ liked=false; likeBtn.classList.remove('on'); $('#like-icon').textContent='♡'; return; }
  try{
    const s = await getDoc(doc(db,'communityPosts',id,'likes',curUser.uid));
    liked = s.exists();
    likeBtn.classList.toggle('on', liked);
    $('#like-icon').textContent = liked ? '♥' : '♡';
  }catch{ liked=false; }
}
async function toggleLike(){
  if(!curUser) return alert('로그인 후 이용해주세요.');
  try{
    if(liked){
      await deleteDoc(doc(db,'communityPosts',id,'likes',curUser.uid));
    }else{
      await setDoc(doc(db,'communityPosts',id,'likes',curUser.uid), { at: serverTimestamp(), uid: curUser.uid });
    }
  }catch(e){ console.error(e); }
}
function watchLikes(){
  // 총 개수 실시간
  onSnapshot(collection(db,'communityPosts',id,'likes'), snap=>{
    $('#like-count').textContent = String(snap.size||0);
  });
  checkLiked();
}
likeBtn.addEventListener('click', toggleLike);

/* ===== 댓글 =====
   경로: communityPosts/{id}/comments/{autoId}
   필드: {text, authorUid, authorName, createdAt}  */
const cmtList  = $('#cmt-list');
const cmtText  = $('#cmt-text');
const cmtForm  = $('#cmt-form');
function watchComments(){
  const qy = query(collection(db,'communityPosts',id,'comments'), orderBy('createdAt','asc'));
  onSnapshot(qy, snap=>{
    cmtList.innerHTML='';
    if(snap.empty){ cmtList.innerHTML='<div class="empty">댓글이 없습니다.</div>'; return; }
    snap.forEach(d=>{
      const x=d.data()||{};
      const row=document.createElement('div');
      row.className='cmt';
      const me = curUser?.uid && x.authorUid===curUser.uid;
      const canDel = isAdmin || me;
      row.innerHTML = `
        <div class="head">
          <div class="who">${esc(x.authorName||'익명')}</div>
          <div class="tools">
            <span class="meta">${fmt(x.createdAt)}</span>
            ${canDel?'<button class="btn small danger" data-del>삭제</button>':''}
          </div>
        </div>
        <div class="text">${esc(x.text||'')}</div>
      `;
      row.querySelector('[data-del]')?.addEventListener('click', async ()=>{
        if(!confirm('댓글을 삭제할까요?')) return;
        try{ await deleteDoc(doc(db,'communityPosts',id,'comments',d.id)); }catch(e){ console.error(e); alert('삭제 실패'); }
      });
      cmtList.appendChild(row);
    });
  });
}
cmtForm.addEventListener('submit', async ()=>{
  if(!curUser) return alert('로그인 후 이용해주세요.');
  const t=(cmtText.value||'').trim(); if(!t) return;
  try{
    await addDoc(collection(db,'communityPosts',id,'comments'),{
      text:t, authorUid:curUser.uid, authorName:curUser.displayName||'사용자',
      createdAt: serverTimestamp()
    });
    cmtText.value='';
  }catch(e){ console.error(e); alert('등록 실패'); }
});