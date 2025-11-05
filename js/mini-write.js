import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const cfg={apiKey:"AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",authDomain:"woori-1ecf5.firebaseapp.com",projectId:"woori-1ecf5"};
const app=initializeApp(cfg);const auth=getAuth(app);const db=getFirestore(app);
const params=new URLSearchParams(location.search);const nick=decodeURIComponent(params.get('u')||'');
const $=id=>document.getElementById(id);

onAuthStateChanged(auth,async u=>{
  if(!u)return location.href='/login.html';
  const us=await getDoc(doc(db,'users',u.uid));
  const myNick=us.data()?.nickname||'';
  if(myNick!==nick){alert('자신의 Mini홈에서만 글을 작성할 수 있습니다.');history.back();return;}
  $('save').onclick=async()=>{
    const title=$('title').value.trim(),body=$('body').value.trim();
    if(!title||!body)return alert('제목과 내용을 입력하세요.');
    await addDoc(collection(db,'homes',u.uid,'posts'),{title,body,createdAt:serverTimestamp()});
    alert('글이 저장되었습니다.');location.href=`/mini.html?u=${encodeURIComponent(nick)}`;
  };
});
