/* ============== Firebase 초기화 ============== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, doc, getDocs, getDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const cfg = {
  apiKey: "AIzaSyACn_-2BLztKYmBKXtrKNtMsC-2Y238oug",
  authDomain: "woori-1ecf5.firebaseapp.com",
  projectId: "woori-1ecf5",
  storageBucket: "woori-1ecf5.firebasestorage.app",
  messagingSenderId: "1073097361525",
  appId: "1:1073097361525:web:3218ced6a040aaaf4d503c"
};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

/* ============== Cloudinary 설정 ============== */
const CLOUD_NAME = "dnx6obtjb";
const UPLOAD_PRESET = "sj_exe";

/* ============== DOM ============== */
const $ = (id) => document.getElementById(id);
const boardSel = $("select-board");
const catSel = $("select-cat");
const titleEl = $("input-title");
const bodyEl = $("input-body");
const imgBtn = $("btn-photo");
const saveBtn = $("btn-save");
const cancelBtn = $("btn-cancel");
const preview = $("preview");
const fallbackInput = $("fallback-file");

/* ============== 상태 ============== */
let user = null;
let myNick = "사용자";
let isAdmin = false;
let boards = [];
let draftImages = [];
let mode = "new";
let editId = null;
let editData = null;

/* ============== 유틸 ============== */
const params = new URLSearchParams(location.search);
const postId = params.get("id");
const err = (e) => {
  console.error(e);
  alert("게시글 처리 중 오류가 발생했습니다.\n" + e.message);
};
const thumb = (pid, w = 800) =>
  `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/f_auto,q_auto,c_fill,w_${w}/${pid}.jpg`;

/* ============== 로그인 확인 ============== */
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    alert("로그인이 필요합니다.");
    location.href = "/login.html";
    return;
  }
  user = u;
  const uSnap = await getDoc(doc(db, "users", u.uid));
  myNick = uSnap.data()?.nickname || u.displayName || "사용자";

  try {
    const aSnap = await getDoc(doc(db, "admins", u.uid));
    isAdmin = aSnap.exists();
  } catch {}

  await loadBoards();

  if (postId) {
    mode = "edit";
    editId = postId;
    await loadExistingPost(postId, u.uid);
  }
});

/* ============== 게시판 & 카테고리 로드 ============== */
async function loadBoards() {
  try {
    const snap = await getDocs(query(collection(db, "boards"), orderBy("order", "asc")));
    boards = [];
    boardSel.innerHTML = "";
    snap.forEach((d) => {
      const b = d.data();
      boards.push({ id: d.id, ...b });
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = b.name || d.id;
      boardSel.appendChild(opt);
    });
    if (boards.length > 0) loadCategories(boards[0].id);
    boardSel.addEventListener("change", (e) => loadCategories(e.target.value));
  } catch (e) {
    console.warn("게시판 목록 불러오기 실패:", e.message);
  }
}

function loadCategories(boardId) {
  catSel.innerHTML = "";
  const board = boards.find((b) => b.id === boardId);
  if (!board) return;
  (board.categories || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    catSel.appendChild(opt);
  });
}

/* ============== 기존 게시글 로드 (수정모드) ============== */
async function loadExistingPost(id, uid) {
  try {
    const ref = doc(db, "communityPosts", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert("존재하지 않는 게시글입니다.");
      location.href = "/index.html";
      return;
    }
    editData = snap.data();

    if (editData.authorUid !== uid && !isAdmin) {
      alert("수정 권한이 없습니다.");
      location.href = `/post-view.html?id=${id}`;
      return;
    }

    titleEl.value = editData.title || "";
    bodyEl.value = editData.body || "";
    draftImages = Array.isArray(editData.images) ? [...editData.images] : [];

    boardSel.value = editData.boardId || "";
    loadCategories(editData.boardId);
    setTimeout(() => (catSel.value = editData.category || ""), 300);

    renderPreview();
    document.title = "게시글 수정 · Freetalk";
    saveBtn.textContent = "수정 저장";
  } catch (e) {
    err(e);
  }
}

/* ============== Cloudinary 업로드 ============== */
function addImageFromCloudinary(info) {
  draftImages.push({
    pid: info.public_id,
    url: info.secure_url,
    w: info.width,
    h: info.height,
  });
  renderPreview();
}

let widget = null;
function openUploadWidget() {
  if (!window.cloudinary || !window.cloudinary.createUploadWidget) {
    fallbackInput.click();
    return;
  }
  if (!widget) {
    widget = window.cloudinary.createUploadWidget(
      {
        cloudName: CLOUD_NAME,
        uploadPreset: UPLOAD_PRESET,
        sources: ["local", "camera"],
        multiple: true,
        maxFiles: 5,
        clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
        folder: "freetalk/community",
      },
      (error, result) => {
        if (error) {
          console.error(error);
          alert("업로드 오류");
          return;
        }
        if (result?.event === "success") addImageFromCloudinary(result.info);
      }
    );
  }
  widget.open();
}
imgBtn.onclick = openUploadWidget;

fallbackInput.onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files.slice(0, 5 - draftImages.length)) {
    try {
      const fd = new FormData();
      fd.append("upload_preset", UPLOAD_PRESET);
      fd.append("file", file);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      addImageFromCloudinary(j);
    } catch (ex) {
      alert("업로드 실패: " + ex.message);
    }
  }
  e.target.value = "";
};

/* ============== 미리보기 렌더링 ============== */
function renderPreview() {
  preview.innerHTML = "";
  draftImages.forEach((img, idx) => {
    const box = document.createElement("div");
    box.className = "thumb";
    box.innerHTML = `
      <img src="${thumb(img.pid, 400)}">
      <button class="x">삭제</button>
    `;
    box.querySelector(".x").onclick = () => {
      draftImages.splice(idx, 1);
      renderPreview();
    };
    preview.appendChild(box);
  });
}

/* ============== 저장 ============== */
saveBtn.onclick = async () => {
  try {
    if (!auth.currentUser) return alert("로그인이 필요합니다.");
    const title = titleEl.value.trim();
    const body = bodyEl.value.trim();
    const boardId = boardSel.value || "free";
    const category = catSel.value || "일상";

    if (!title || !body) return alert("제목과 내용을 입력하세요.");

    const baseData = {
      title,
      body,
      images: draftImages,
      boardId,
      category,
      authorUid: user.uid,
      authorName: myNick,
    };

    if (mode === "edit" && editId) {
      await updateDoc(doc(db, "communityPosts", editId), {
        ...baseData,
        updatedAt: serverTimestamp(),
      });
      alert("게시글이 수정되었습니다.");
      location.href = `/post-view.html?id=${editId}`;
    } else {
      await addDoc(collection(db, "communityPosts"), {
        ...baseData,
        createdAt: serverTimestamp(),
      });
      alert("게시글이 등록되었습니다!");
      location.href = "/index.html";
    }
  } catch (e) {
    err(e);
  }
};

/* ============== 취소 ============== */
cancelBtn.onclick = () => {
  if (confirm("작성 내용을 취소하시겠습니까?")) {
    if (editId) location.href = `/post-view.html?id=${editId}`;
    else location.href = "/index.html";
  }
};
