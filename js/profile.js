import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, collection, query, where, orderBy, onSnapshot,
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const cfg={
  apiKey:"AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain:"woori-1ecf5.firebaseapp.com",
  projectId:"woori-1ecf5",
  storageBucket:"woori-1ecf5.firebasestorage.app",
  messagingSenderId:"1073097361525",
  appId:"1:1073097361525:web:3218ced6a040aaaf4d503c"
};
const app=initializeApp(cfg);
const auth=getAuth(app);
const db=getFirestore(app);

/* === 공통 === */
const $=s=>document.querySelector(s);
const esc=s=>String(s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]||m));
const fmt=ts=>{try{const d=ts?.toDate?.()||new Date();return d.toLocaleString();}catch{return'';}};

/* === Cloudinary 설정 === */
const CLOUD_NAME='dnx6obtjb';
const UPLOAD_PRESET='sj_exe';

/* === 탭 전환 === */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');
    tab.classList.add('active');
    $('#tab-'+tab.dataset.tab).style.display='block';
  });
});

/* === 로그인 상태 === */
onAuthStateChanged(auth, async(u)=>{
  if(!u){ alert('로그인이 필요합니다.'); location.href='/login.html'; return; }

  $('#nick').textContent = u.displayName || '사용자';
  $('#avatar span').textContent = (u.displayName?.[0]||'U').toUpperCase();

  try{
    const homeSnap=await getDoc(doc(db,'homes',u.uid));
    const bio=homeSnap.data()?.bio||'';
    $('#bio-text').value=bio;
    $('#bio-sub').textContent=bio||'소개글을 설정해 보세요.';
  }catch(e){ console.warn('홈 데이터 없음:',e); }

  try{
    const us=await getDoc(doc(db,'users',u.uid));
    const avatarUrl=us.data()?.avatarUrl;
    if(avatarUrl){
      const img=document.createElement('img');
      img.src=avatarUrl;
      $('#avatar').innerHTML='';
      $('#avatar').appendChild(img);
    }
  }catch{}

  loadMyPosts(u.uid);
  $('#bio-save').onclick=()=>saveBio(u.uid);
  $('#logout').onclick=()=>{signOut(auth).then(()=>location.href='/index.html');};

  /* === 프로필 이미지 클릭 업로드 === */
  $('#avatar').addEventListener('click',()=>openUploadWidget(u.uid));
});

/* === 소개글 저장 === */
async function saveBio(uid){
  const bio=$('#bio-text').value.trim();
  try{
    await setDoc(doc(db,'homes',uid),{bio,updatedAt:serverTimestamp()},{merge:true});
    $('#bio-sub').textContent=bio||'소개글을 설정해 보세요.';
    alert('✅ Mini홈 소개글이 저장되었습니다.');
  }catch(e){
    console.error('Bio save fail:',e);
    alert('저장 실패: '+(e.message||e.code));
  }
}

/* === 내 글 목록 === */
function loadMyPosts(uid){
  const qy=query(collection(db,'communityPosts'),where('authorUid','==',uid),orderBy('createdAt','desc'));
  const list=$('#my-posts');
  onSnapshot(qy,snap=>{
    list.innerHTML='';
    if(snap.empty){list.innerHTML='<div class="meta">작성한 글이 없습니다.</div>';return;}
    snap.forEach(d=>{
      const x=d.data()||{};
      const el=document.createElement('div');
      el.className='item';
      el.innerHTML=`<a href="/post-view.html?id=${d.id}"><b>${esc(x.title||'(제목 없음)')}</b></a>
        <div class="meta">${fmt(x.createdAt)} · ${esc(x.boardId||'-')}</div>`;
      list.appendChild(el);
    });
  });
}

/* === Cloudinary 업로드 위젯 === */
function openUploadWidget(uid){
  if(!window.cloudinary){alert('Cloudinary 로드 오류');return;}
  const widget=cloudinary.createUploadWidget({
    cloudName:CLOUD_NAME,
    uploadPreset:UPLOAD_PRESET,
    sources:['local','camera'],
    multiple:false,
    cropping:true,
    maxImageWidth:800,
    folder:'freetalk/avatars'
  },async(error,result)=>{
    if(error){console.error(error);return;}
    if(result?.event==='success'){
      const info=result.info;
      const url=info.secure_url;
      await updateDoc(doc(db,'users',uid),{avatarUrl:url,updatedAt:serverTimestamp()});
      const img=document.createElement('img');
      img.src=url;
      $('#avatar').innerHTML='';
      $('#avatar').appendChild(img);
      alert('✅ 프로필 이미지가 업데이트되었습니다!');
    }
  });
  widget.open();
}
