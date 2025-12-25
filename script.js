// ================= CONFIGURATION =================
const firebaseConfig = {
    apiKey: "AIzaSyABwJfEkkbNB8GurZkyj67R8ksVNEXZ11I",
    authDomain: "ryadanur1-375a8.firebaseapp.com",
    projectId: "ryadanur1-375a8",
    storageBucket: "ryadanur1-375a8.firebasestorage.app",
    messagingSenderId: "858244114090",
    appId: "1:858244114090:web:42cee8e98e3984164392d3"
};
const CLOUD_NAME = "djzfruh22"; 
const CLOUD_PRESET = "udyvggup";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Global State ---
let currentUser = null;
let userData = null;
let isLoginMode = true;
let selectedSup = null;
let currentTab = 'active'; 
let requestsCache = [];
let uploadQueue = []; 
let tempActionData = {}; 
let selectedTech = null; 
let selectedEng = null; 
let newProfilePicFile = null;
let isFirstLoad = true;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let isRegistering = false;

// Global Vars for Admin, Reports & Feed
let systemSpecialties = [];
let systemLocations = [];
let systemFloors = []; 
let reportChart = null;
let postsListener = null;
let selectedManagerForReport = null;

// --- Helpers (New 2 & 6: English Digits & Time Utils) ---
function toEng(str) {
    if(!str) return '';
    return str.toString().replace(/[٠-٩]/g, d => "0123456789"['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

function formatDateTime(timestamp) {
    if (!timestamp) return '---';
    const date = timestamp.toDate();
    return {
        date: date.toLocaleDateString('en-GB'),
        time: date.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})
    };
}

function generateUniqueCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
// --- Authentication Logic ---
auth.onAuthStateChanged(async u => {
    if(isRegistering) return;

    if(u) {
        if(!u.emailVerified) {
            document.getElementById('loader').classList.add('hidden');
            toast("⚠️ يجب تفعيل البريد الإلكتروني أولاً.");
            auth.signOut();
            showScreen('auth-screen');
            return;
        }
        currentUser = u;
        await loadUser();
    } else {
        document.getElementById('loader').classList.add('hidden');
        showScreen('auth-screen');
    }
});

// --- Handle Auth (Create Account / Login) ---
async function handleAuth() {
    const email = document.getElementById('email').value; 
    const pass = document.getElementById('password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    const btn = document.getElementById('auth-btn'); 

    if(!isLoginMode) {
         if(pass !== confirmPass) return toast("❌ كلمة المرور غير متطابقة");
         if(pass.length < 6) return toast("❌ كلمة المرور ضعيفة");
    }

    btn.disabled=true; btn.innerText = "جاري المعالجة...";
    
    try {
        if(isLoginMode) {
            await auth.signInWithEmailAndPassword(email, pass);
        } else {
            isRegistering = true; 

            const role = document.querySelector('input[name="auth-role"]:checked').value;
            const gender = document.querySelector('input[name="auth-gender"]:checked').value;
            const fullName = document.getElementById('reg-name').value;
            const jobTitle = document.getElementById('reg-job').value;
            const locationVal = document.getElementById('reg-loc').value;
            const phone = document.getElementById('reg-phone').value;
            const defaultPic = gender === 'male' ? 'https://cdn-icons-png.flaticon.com/512/4140/4140048.png' : 'https://cdn-icons-png.flaticon.com/512/4140/4140047.png';

            if(role === 'manager') {
                  const mSnap = await db.collection('users').where('role', '==', 'manager').get();
                  if(mSnap.size >= 4) throw new Error("⛔ تم اكتمال عدد المديرين (4).");
            }

            const cred = await auth.createUserWithEmailAndPassword(email, pass);

            await db.collection('users').doc(cred.user.uid).set({
                email: email,
                role: role,
                fullName: fullName,
                gender: gender,
                photoUrl: defaultPic,
                shortId: Math.random().toString(36).substr(2,6).toUpperCase(),
                jobTitle: jobTitle,
                location: locationVal,
                phone: phone,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await cred.user.sendEmailVerification();
            toast("✅ تم إنشاء الحساب. راجع بريدك للتفعيل.");
            
            isRegistering = false; 
            toggleAuth(); 
        }
    } catch(e) { 
        console.error(e);
        toast(e.message); 
        isRegistering = false;
    } finally { 
        btn.disabled=false; 
        btn.innerText = isLoginMode?"تسجيل الدخول":"إنشاء حساب"; 
    }
}

function toggleAuth() { 
    isLoginMode = !isLoginMode; 
    const regFields = document.getElementById('reg-fields');
    const confirmPass = document.getElementById('confirm-pass-field');
    if (isLoginMode) {
        regFields.classList.add('hidden'); confirmPass.classList.add('hidden');
        document.getElementById('auth-btn').innerText = "تسجيل الدخول";
        document.getElementById('auth-switch-text').innerHTML = "ليس لديك حساب؟ <b style='color:var(--primary)'>إنشاء حساب جديد</b>";
    } else {
        regFields.classList.remove('hidden'); confirmPass.classList.remove('hidden');
        document.getElementById('auth-btn').innerText = "إنشاء حساب";
        document.getElementById('auth-switch-text').innerHTML = "لديك حساب بالفعل؟ <b style='color:var(--primary)'>تسجيل الدخول</b>";
    }
}

// --- Core User Loading & System Setup ---
async function loadUser() {
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if(doc.exists) {
            userData = doc.data();
            if(!userData.shortId) {
                await db.collection('users').doc(currentUser.uid).update({shortId: Math.random().toString(36).substr(2,6).toUpperCase()});
            }
            
            await fetchSystemData();

            renderHeader();
            showScreen('app-container');
            setupRoleUI(); 
            
            loadFeed();
            loadTeam(); 
            loadFriendReqs();
            loadProfilePageData();
            
            document.getElementById('req-date').valueAsDate = new Date();
            // Force English Time format for input
            const now = new Date();
            const timeString = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
            document.getElementById('req-time').value = timeString;

            checkUnseenNotifications();

            setTimeout(() => { document.getElementById('loader').classList.add('hidden'); }, 500);
        }
    } catch(e) { 
        console.error(e);
        document.getElementById('loader').classList.add('hidden');
        toast("⚠️ خطأ في تحميل البيانات"); 
    }
}

// --- Admin: System Data ---
async function fetchSystemData() {
    try {
        const doc = await db.collection('system_settings').doc('config').get();
        if(doc.exists) {
            const data = doc.data();
            systemSpecialties = data.specialties || [];
            systemLocations = data.locations || [];
            systemFloors = data.floors || [];
        } else {
            // Defaults
            systemSpecialties = ['كهرباء', 'سباكة', 'نجارة', 'تكييف', 'شبكات (IT)', 'أجهزة طبية'];
            systemLocations = ['المبنى الإداري', 'كلية الطب', 'كلية الصيدلة', 'كلية الهندسة', 'كلية الأسنان', 'المسجد'];
            systemFloors = ['الدور الأرضي', 'الدور الأول', 'الدور الثاني', 'الدور الثالث'];
            await db.collection('system_settings').doc('config').set({
                specialties: systemSpecialties,
                locations: systemLocations,
                floors: systemFloors
            });
        }
        populateDropdowns();
        renderAdminLists();
    } catch(e) { console.error("Error fetching system data", e); }
}

function populateDropdowns() {
    const typeSelect = document.getElementById('req-type');
    const locSelect = document.getElementById('req-faculty');
    const floorSelect = document.getElementById('req-floor');
    const invLocSelect = document.getElementById('inv-faculty');
    const invFloorSelect = document.getElementById('inv-floor');

    typeSelect.innerHTML = '<option value="">اختر التخصص...</option>';
    systemSpecialties.forEach(spec => { typeSelect.innerHTML += `<option value="${spec}">${spec}</option>`; });

    let locOptions = '<option value="">اختر المبنى/الكلية...</option>';
    systemLocations.forEach(loc => { locOptions += `<option value="${loc}">${loc}</option>`; });
    locSelect.innerHTML = locOptions + '<option value="Other">موقع آخر...</option>';
    invLocSelect.innerHTML = locOptions;

    let floorOptions = '<option value="">اختر الدور...</option>';
    systemFloors.forEach(f => { floorOptions += `<option value="${f}">${f}</option>`; });
    floorSelect.innerHTML = floorOptions;
    invFloorSelect.innerHTML = floorOptions;
}

// --- Role UI Setup ---
function setupRoleUI() {
    const r = userData.role;
    const shortcuts = document.getElementById('manager-shortcuts');
    const staffShortcuts = document.getElementById('staff-shortcuts'); 
    const adminBtn = document.getElementById('btn-admin-panel');
    const settingsManagerArea = document.getElementById('settings-manager-area');
    const settingsStaffArea = document.getElementById('settings-staff-area'); 
    const createPostBox = document.getElementById('create-post-box');
    const navCreateBtn = document.getElementById('nav-create-btn'); 

    if(r === 'manager' || r === 'engineer' || r === 'technician') {
         navCreateBtn.classList.add('hidden');
         document.getElementById('page-create').innerHTML = "<div style='text-align:center; padding:50px; color:#999;'><i class='fa-solid fa-lock fa-2x'></i><p>غير مصرح بإنشاء بلاغات لهذا الحساب.</p></div>";
    }
    if(r === 'manager' || r === 'engineer') {
        shortcuts.classList.remove('hidden');
        settingsManagerArea.classList.remove('hidden');
        if(r === 'manager') adminBtn.classList.remove('hidden');
    }
    if(r === 'supervisor' || r === 'employee') {
        staffShortcuts.classList.remove('hidden');
        settingsStaffArea.classList.remove('hidden');
    }
    if(r === 'manager' || r === 'engineer' || r === 'supervisor') {
        createPostBox.classList.remove('hidden'); 
    }
}

// --- Admin Panel Logic ---
async function addSystemData(type) {
    let inputId = (type === 'specialties') ? 'new-spec-input' : (type === 'locations' ? 'new-loc-input' : 'new-floor-input');
    let val = document.getElementById(inputId).value.trim();
    if(!val) return;
    try {
        await db.collection('system_settings').doc('config').update({ [type]: firebase.firestore.FieldValue.arrayUnion(val) });
        document.getElementById(inputId).value = ""; toast("✅ تم الإضافة"); await fetchSystemData();
    } catch(e) { toast("خطأ"); }
}

async function deleteSystemData(type, item) {
    if(!confirm("هل أنت متأكد من الحذف؟")) return;
    try {
        await db.collection('system_settings').doc('config').update({ [type]: firebase.firestore.FieldValue.arrayRemove(item) });
        toast("🗑️ تم الحذف"); await fetchSystemData(); 
    } catch(e) { toast("خطأ"); }
}

function renderAdminLists() {
    const specsDiv = document.getElementById('admin-specs-list');
    const locsDiv = document.getElementById('admin-locs-list');
    const floorsDiv = document.getElementById('admin-floors-list');
    
    specsDiv.innerHTML = ""; systemSpecialties.forEach(item => { specsDiv.innerHTML += `<div class="admin-list-item"><span>${item}</span><div class="delete-icon" onclick="deleteSystemData('specialties', '${item}')"><i class="fa-solid fa-trash"></i></div></div>`; });
    locsDiv.innerHTML = ""; systemLocations.forEach(item => { locsDiv.innerHTML += `<div class="admin-list-item"><span>${item}</span><div class="delete-icon" onclick="deleteSystemData('locations', '${item}')"><i class="fa-solid fa-trash"></i></div></div>`; });
    floorsDiv.innerHTML = ""; systemFloors.forEach(item => { floorsDiv.innerHTML += `<div class="admin-list-item"><span>${item}</span><div class="delete-icon" onclick="deleteSystemData('floors', '${item}')"><i class="fa-solid fa-trash"></i></div></div>`; });
}

// --- Navigation ---
function nav(p, el) { 
    document.querySelectorAll('.page-section').forEach(x=>x.classList.add('hidden')); 
    document.getElementById('page-'+p).classList.remove('hidden'); 
    
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); 
    if(p !== 'create' && p !== 'reports' && p !== 'admin-settings' && p !== 'inventory') {
        if(el) el.classList.add('active'); 
    }

    if(p==='profile') loadProfilePageData(); 
    if(p==='reports') generateReports(); 
    if(p==='albayan') { loadFeedPosts(); document.getElementById('feed-badge').classList.remove('active'); }
    if(p==='inventory') loadInventory();
}

function showScreen(id) { 
    ['auth-screen','app-container'].forEach(x => document.getElementById(x).classList.add('hidden')); 
    document.getElementById(id).classList.remove('hidden'); 
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function logout() { auth.signOut(); location.reload(); }
function toast(m) { const t=document.getElementById('toast'); t.innerHTML=m; t.style.display='block'; setTimeout(()=>t.style.display='none',3000); }

function renderHeader() {
    const roleMap = { 'employee': 'موظف', 'supervisor': 'مشرف', 'manager': 'مدير', 'technician': 'فني', 'engineer': 'مهندس' };
    document.getElementById('banner-name').innerText = userData.fullName;
    document.getElementById('banner-role').innerText = roleMap[userData.role] || userData.role;
    document.getElementById('banner-id').innerText = "ID: " + toEng(userData.shortId);
    document.getElementById('banner-img').src = userData.photoUrl;
    const frameEl = document.getElementById('banner-frame');
    frameEl.className = 'frame-overlay ' + (userData.frame || '');
}

// --- Media & Recording ---
function handleFiles(input) { Array.from(input.files).forEach(file => { addToQueue(file); }); }
function addToQueue(f) {
    uploadQueue.push(f);
    const grid = document.getElementById('preview-grid');
    const index = uploadQueue.length - 1;
    let content = f.type.startsWith('image') ? `<img src="${URL.createObjectURL(f)}">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#eee;color:#777;"><i class="fa-solid fa-file"></i></div>`;
    grid.innerHTML += `<div class="media-item">${content}<div class="remove-file" onclick="uploadQueue.splice(${index},1); this.parentElement.remove()">x</div></div>`;
}

async function toggleRecording() {
    const btn = document.getElementById('mic-trigger');
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
                addToQueue(audioFile);
            };
            mediaRecorder.start();
            isRecording = true;
            btn.classList.add('recording');
            toast("بدأ التسجيل...");
        } catch (err) { toast("❌ الميكروفون غير متاح"); }
    } else {
        if(mediaRecorder) { mediaRecorder.stop(); isRecording = false; btn.classList.remove('recording'); toast("تم حفظ التسجيل"); }
    }
}

// --- FEED (Updated for Requirements 1 & 2) ---
function loadFeed() {
    let q = db.collection('requests');
    if(userData.role === 'employee') q = q.where('userId','==',currentUser.uid);
    else if(userData.role === 'supervisor') q = q.where('supervisorId','==',currentUser.uid);
    else if(userData.role === 'engineer') q = q.where('engineerId','==',currentUser.uid);
    else if(userData.role === 'technician') q = q.where('technicianId','==',currentUser.uid);

    q.onSnapshot(snap => {
        const currentIds = requestsCache.map(r => r.id);
        let newItems = [];
        let updatedCache = [];
        snap.forEach(doc => {
            const data = {id: doc.id, ...doc.data()};
            updatedCache.push(data);
            if (!isFirstLoad && !currentIds.includes(doc.id)) newItems.push(data);
        });
        requestsCache = updatedCache;
        requestsCache.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        if(!isFirstLoad && newItems.length > 0) checkAndPlaySound(newItems);
        isFirstLoad = false;
        renderFeed();
    });
}

function checkAndPlaySound(newRequests) {
    let notify = false;
    if(userData.role === 'supervisor' && newRequests.some(r => r.status === 'pending')) notify = true;
    if(userData.role === 'engineer' && newRequests.some(r => r.status === 'at_engineer')) notify = true;
    if(userData.role === 'technician' && newRequests.some(r => r.status === 'at_tech')) notify = true;
    if(userData.role === 'employee' && newRequests.some(r => r.status === 'pending_confirmation')) notify = true;
    if (notify) {
        const audio = document.getElementById('sound-notify-req');
        if(audio) audio.play().catch(e => console.log("Audio block"));
        toast("🔔 إشعار جديد");
        document.querySelector('.bell-badge').style.display = 'block';
    }
}

function renderFeed() {
    const container = document.getElementById('requests-feed'); container.innerHTML = "";
    let list = requestsCache;
    if(currentTab === 'trash') list = list.filter(r => r.isDeleted === true);
    else {
        list = list.filter(r => r.isDeleted !== true);
        if(currentTab === 'active') list = list.filter(r => ['pending','at_engineer','at_tech','working','pending_confirmation'].includes(r.status));
        else if(currentTab === 'history') list = list.filter(r => ['done','rejected'].includes(r.status));
    }

    if(list.length === 0) { container.innerHTML = `<div style="text-align:center; padding:50px 20px; color:var(--text-muted);"><i class="fa-regular fa-clipboard fa-3x" style="opacity:0.5; margin-bottom:10px;"></i><p>لا يوجد بيانات</p></div>`; return; }

    list.forEach(d => {
        let statusClass = 'st-' + d.status;
        let statusText = getStatusLabel(d.status);
        let codeBadge = `<span class="req-code">#${toEng(d.uniqueCode || '---')}</span>`;
        let timeInfo = formatDateTime(d.createdAt); // Req 2: Date/Time next to everything
        
        let actionBtns = "";
        let deleteBtn = "";
        if(userData.role === 'manager' && currentTab !== 'trash') deleteBtn = `<button onclick="event.stopPropagation(); softDelete('${d.id}')" class="btn-ghost btn-sm" style="color:var(--error); border-color:var(--border); margin-left:10px;"><i class="fa-solid fa-trash"></i></button>`;
        else if (userData.role === 'manager' && currentTab === 'trash') deleteBtn = `<button onclick="event.stopPropagation(); restoreReq('${d.id}')" class="btn-ghost btn-sm" style="color:var(--success); margin-left:5px;">استعادة</button><button onclick="event.stopPropagation(); hardDelete('${d.id}')" class="btn-ghost btn-sm" style="color:var(--error);">حذف نهائي</button>`;

        // Action Buttons Logic (Same as before)
        if(currentTab === 'active') {
            if(userData.role === 'supervisor' && d.status === 'pending') actionBtns = `<div style="display:flex; gap:10px;"><button onclick="event.stopPropagation(); openAction('${d.id}','sup_approve')" class="btn-main btn-sm" style="background:var(--success);">توجيه للمهندس</button><button onclick="event.stopPropagation(); openAction('${d.id}','reject')" class="btn-main btn-danger btn-sm">رفض</button></div>`;
            else if(userData.role === 'engineer' && d.status === 'at_engineer') actionBtns = `<div style="display:flex; gap:10px;"><button onclick="event.stopPropagation(); openAction('${d.id}','eng_assign')" class="btn-main btn-sm" style="background:var(--purple); color:#fff;">تعيين الفني</button><button onclick="event.stopPropagation(); openAction('${d.id}','reject')" class="btn-main btn-danger btn-sm">رفض</button></div>`;
            else if(userData.role === 'technician') {
                if(d.status === 'at_tech') actionBtns = `<button onclick="event.stopPropagation(); openAction('${d.id}','tech_start')" class="btn-main btn-sm" style="background:var(--warning); color:#fff;">بدء العمل</button>`;
                else if (d.status === 'working') actionBtns = `<button onclick="event.stopPropagation(); openAction('${d.id}','tech_finish')" class="btn-main btn-sm" style="background:var(--success);">تم الإصلاح</button>`;
                else if (d.status === 'pending_confirmation') actionBtns = `<span style="font-size:11px; color:var(--text-muted); font-weight:bold;">بانتظار تأكيد الموظف...</span>`;
            } else if(userData.role === 'employee' && d.status === 'pending_confirmation' && d.userId === currentUser.uid) {
                actionBtns = `<div style="display:flex; gap:5px; width:100%;"><button onclick="event.stopPropagation(); openAction('${d.id}','emp_confirm')" class="btn-main btn-sm" style="background:var(--success); flex:1;">تأكيد وإنهاء</button><button onclick="event.stopPropagation(); openAction('${d.id}','emp_deny')" class="btn-main btn-danger btn-sm" style="flex:1;">لم يتم</button></div>`;
            }
        }

        let prioIcon = d.priority === 'high' ? '<i class="fa-solid fa-fire" style="color:var(--error)"></i>' : '';
        let prioColor = d.priority === 'high' ? 'var(--error)' : d.priority === 'medium' ? 'var(--warning)' : 'var(--success)';
        
        // Req 1 & 2: Improved Card Design with English numbers and Time
        container.innerHTML += `
        <div class="glass-card request-card" onclick="openRequestDetails('${d.id}')" style="border-right: 4px solid ${prioColor};">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${d.userData.photoUrl}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid var(--surface-light);">
                    <div>
                        <b style="font-size:13px; display:block; color:var(--text);">${d.userData.fullName}</b>
                        <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto'; display:flex; gap:5px; align-items:center;">
                            ${timeInfo.date} <span style="width:3px;height:3px;background:#ccc;border-radius:50%;"></span> ${timeInfo.time}
                        </div>
                    </div>
                </div>
                ${codeBadge}
            </div>
            
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--surface-light);">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-size:11px; font-weight:bold; color:var(--primary); background:rgba(0,86,179,0.05); padding:2px 8px; border-radius:6px;">${d.type}</span>
                    <span class="status-pill ${statusClass}">${statusText}</span>
                </div>
                <div style="font-size:14px; color:var(--text); line-height:1.5;">${prioIcon} ${d.description}</div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:11px; color:var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${d.faculty}</div>
                ${deleteBtn}
            </div>
            ${actionBtns ? `<div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--border);"> ${actionBtns} </div>` : ''}
        </div>`;
    });
}

// --- Create Request Workflow ---
async function openSupModal() { 
    if(!document.getElementById('req-desc').value) return toast("⚠️ الوصف مطلوب");
    if(!document.getElementById('req-type').value) return toast("⚠️ نوع العطل مطلوب");
    
    document.getElementById('sup-modal').classList.remove('hidden'); 
    const l=document.getElementById('sup-list'); 
    l.innerHTML="<p style='text-align:center'>جاري تحميل المشرفين (الأصدقاء)...</p>"; 
    
    const friendsSnap = await db.collection('users').doc(currentUser.uid).collection('friends').get();
    if(friendsSnap.empty) { l.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'><p>لا يوجد أصدقاء.</p></div>"; return; }
    const friendIds = friendsSnap.docs.map(doc => doc.data().friendId);
    
    const snap = await db.collection('users').where('role','==','supervisor').get();
    l.innerHTML="";
    let count = 0;
    snap.forEach(d=>{ 
        if(friendIds.includes(d.id)) { 
            const u=d.data(); 
            l.innerHTML+=`<div class="manager-card" onclick="selectSup(this, '${d.id}')"><img src="${u.photoUrl}"><span>${u.fullName}</span></div>`;
            count++;
        }
    }); 
    if(count === 0) l.innerHTML = "<div style='text-align:center; padding:20px; color:var(--text-muted);'><p>لم يتم العثور على مشرفين.</p></div>";
}

function selectSup(el, id) { 
    document.querySelectorAll('.manager-card').forEach(d=>d.classList.remove('selected'));
    el.classList.add('selected'); selectedSup=id; 
}

async function sendRequestFinal() { 
    if(!selectedSup) return toast("⚠️ اختر مشرف");
    const btn=document.getElementById('confirm-send-btn'); btn.disabled=true; btn.innerText="جاري الإرسال...";
    
    try { 
        let mediaLinks = [];
        for(const file of uploadQueue) {
            const fd = new FormData(); fd.append('file', file); fd.append('upload_preset', CLOUD_PRESET);
            if(file.type.startsWith('audio')) fd.append('resource_type', 'video'); 
            const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {method:'POST', body:fd});
            const d = await res.json();
            let type = file.type.startsWith('video') ? 'video' : (file.type.startsWith('audio') ? 'audio' : 'image');
            mediaLinks.push({url: d.secure_url, type: type});
        }
        
        const facSelect = document.getElementById('req-faculty');
        let facText = facSelect.options[facSelect.selectedIndex].text;
        if(facSelect.value === 'Other') facText = "موقع آخر";
        const floorSelect = document.getElementById('req-floor');
        let floorText = floorSelect.value || '';
        const roomVal = document.getElementById('req-room').value;

        // Old location string format kept for compatibility, but we rely on fields now
        const loc = `${facText} - ${floorText} - ${roomVal}`; 
        const uniqueCode = generateUniqueCode();

        await db.collection('requests').add({ 
            userId:currentUser.uid, 
            userData:{ fullName:userData.fullName, photoUrl:userData.photoUrl }, 
            supervisorId:selectedSup, 
            status:'pending', 
            type: document.getElementById('req-type').value,
            priority: document.querySelector('input[name="prio"]:checked').value,
            time: document.getElementById('req-time').value, 
            date: document.getElementById('req-date').value, 
            description: document.getElementById('req-desc').value, 
            location: loc, // Legacy support
            faculty: facText, // Req 3: Save separately
            floor: floorText, // Req 3
            room: roomVal, // Req 3
            media: mediaLinks,
            uniqueCode: uniqueCode, 
            isDeleted: false,
            createdBy: userData.fullName, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp() 
        }); 
        
        toast("✅ تم الإرسال. كود البلاغ: " + uniqueCode); closeModal('sup-modal'); 
        nav('home', document.querySelector('.nav-item:first-child'));
        uploadQueue=[]; document.getElementById('preview-grid').innerHTML=""; document.getElementById('req-desc').value="";
    } catch(e){ toast("❌ خطأ"); console.error(e); } finally{ btn.disabled=false; btn.innerText="إرسال البلاغ"; } 
}

// --- Action Logic & Response Speed (Req 6) ---
async function openAction(id, type) {
    tempActionData = { id, type };
    document.getElementById('action-modal').classList.remove('hidden');
    document.getElementById('act-comment').value = "";
    
    document.getElementById('eng-select-area').classList.add('hidden');
    document.getElementById('tech-select-area').classList.add('hidden');
    document.getElementById('tech-finish-form').classList.add('hidden');

    const titles = { 'sup_approve': 'قبول وتوجيه للمهندس', 'eng_assign': 'تعيين الفني المختص', 'tech_start': 'بدء التنفيذ', 'tech_finish': 'إنهاء العمل', 'emp_confirm': 'تأكيد إتمام الإصلاح', 'emp_deny': 'رفض الاستلام', 'reject': 'رفض الطلب' };
    document.getElementById('act-title').innerText = titles[type] || 'إجراء';

    if(type === 'sup_approve') { document.getElementById('eng-select-area').classList.remove('hidden'); loadEngineers(); }
    else if(type === 'eng_assign') {
        document.getElementById('tech-select-area').classList.remove('hidden');
        document.querySelector('input[name="tech-type"][value="internal"]').checked = true;
        toggleTechType('internal'); loadTechnicians();
    }
    else if (type === 'tech_finish') {
        document.getElementById('tech-finish-form').classList.remove('hidden');
        document.getElementById('cost-items-container').innerHTML = ''; addCostItemRow(); 
    }
}

function addCostItemRow() {
    const container = document.getElementById('cost-items-container');
    const div = document.createElement('div');
    div.className = 'cost-item-row';
    div.innerHTML = `<input type="text" class="cost-name" placeholder="اسم المادة/الأداة" style="flex:2; font-size:12px;"><input type="number" class="cost-val en-num" placeholder="السعر" style="flex:1; font-size:12px;">`;
    container.appendChild(div);
}

async function loadEngineers() {
    const list = document.getElementById('eng-list-action'); list.innerHTML = "جاري التحميل...";
    const snap = await db.collection('users').where('role','==','engineer').get();
    list.innerHTML = "";
    if(snap.empty) { list.innerHTML = "<p style='grid-column:span 2;color:red;font-size:11px;'>لا يوجد مهندسين</p>"; return; }
    snap.forEach(doc => { const u = doc.data(); list.innerHTML += `<div class="tech-select-card" onclick="selEng(this, '${doc.id}', '${u.fullName}')"><img src="${u.photoUrl}"><div style="font-size:12px; font-weight:bold;">${u.fullName}</div></div>`; });
}
function selEng(el, id, name) { document.querySelectorAll('#eng-list-action .tech-select-card').forEach(d=>d.classList.remove('selected')); el.classList.add('selected'); selectedEng={id, name}; }

function toggleTechType(val) {
    if(val === 'internal') { document.getElementById('tech-list-action').classList.remove('hidden'); document.getElementById('ext-tech-form').classList.add('hidden'); } 
    else { document.getElementById('tech-list-action').classList.add('hidden'); document.getElementById('ext-tech-form').classList.remove('hidden'); }
}

async function loadTechnicians() {
    const list = document.getElementById('tech-list-action'); list.innerHTML = "جاري التحميل...";
    const snap = await db.collection('users').where('role','==','technician').get();
    list.innerHTML = "";
    if(snap.empty) { list.innerHTML = "<p style='grid-column:span 2;color:red;font-size:11px;'>لا يوجد فنيين</p>"; return; }
    snap.forEach(doc => { const u = doc.data(); list.innerHTML += `<div class="tech-select-card" onclick="selTech(this, '${doc.id}', '${u.fullName}')"><img src="${u.photoUrl}"><div style="font-size:12px; font-weight:bold;">${u.fullName}</div></div>`; });
}
function selTech(el, id, name) { document.querySelectorAll('#tech-list-action .tech-select-card').forEach(d=>d.classList.remove('selected')); el.classList.add('selected'); selectedTech={id, name}; }

async function submitAction() {
    const { id, type } = tempActionData;
    const comment = document.getElementById('act-comment').value;
    const btn = document.getElementById('act-submit-btn');
    btn.disabled = true;

    try {
        let updateData = { lastUpdate: firebase.firestore.FieldValue.serverTimestamp() };
        if(comment) updateData.notes = comment;

        if(type === 'sup_approve') {
            if(!selectedEng) return toast("⚠️ اختر مهندس");
            updateData.status = 'at_engineer'; updateData.engineerId = selectedEng.id; updateData.engineerName = selectedEng.name;
            updateData.supApprovedAt = firebase.firestore.FieldValue.serverTimestamp(); // Req 2: Timestamp
        }
        else if(type === 'eng_assign') {
            const techType = document.querySelector('input[name="tech-type"]:checked').value;
            if(techType === 'internal') {
                if(!selectedTech) return toast("⚠️ اختر فني");
                updateData.status = 'at_tech'; updateData.technicianId = selectedTech.id; updateData.technicianName = selectedTech.name; updateData.techType = 'internal';
            } else {
                const name = document.getElementById('ext-name').value;
                if(!name) return toast("⚠️ ادخل اسم الفني");
                updateData.status = 'working'; updateData.technicianName = name + " (تعاقد)"; updateData.techType = 'external';
                updateData.extTechData = { name: name, phone: document.getElementById('ext-phone').value, company: document.getElementById('ext-company').value, cost: document.getElementById('ext-cost').value };
            }
            updateData.techAssignedAt = firebase.firestore.FieldValue.serverTimestamp(); // Req 6: Start point for response time
        }
        else if(type === 'tech_start') { updateData.status = 'working'; updateData.workStartedAt = firebase.firestore.FieldValue.serverTimestamp(); }
        else if(type === 'tech_finish') { 
            updateData.status = 'pending_confirmation';
            updateData.techFinishedAt = firebase.firestore.FieldValue.serverTimestamp();
            let items = []; let totalCost = 0;
            document.querySelectorAll('.cost-item-row').forEach(row => {
                const name = row.querySelector('.cost-name').value.trim();
                const val = parseFloat(row.querySelector('.cost-val').value) || 0;
                if(name) { items.push({name, price: val}); totalCost += val; }
            });
            if(items.length > 0) { updateData.usedMaterials = items; updateData.totalCost = totalCost; }
        }
        else if(type === 'emp_confirm') { 
            updateData.status = 'done'; 
            updateData.completedAt = firebase.firestore.FieldValue.serverTimestamp(); // Req 6: End point for response time
        }
        else if(type === 'emp_deny') { updateData.status = 'working'; updateData.notes = "رفض الموظف الاستلام: " + comment; }
        else if(type === 'reject') { updateData.status = 'rejected'; updateData.rejectedBy = userData.fullName; }

        await db.collection('requests').doc(id).update(updateData);
        toast("✅ تم تنفيذ الإجراء"); closeModal('action-modal');
    } catch(e) { console.error(e); toast("خطأ في النظام"); } 
    finally { btn.disabled = false; }
}

// --- Search & Utils ---
async function searchUser() {
    const q = document.getElementById('search-query').value.trim();
    const resDiv = document.getElementById('search-results');
    if(!q) return;
    resDiv.classList.remove('hidden'); resDiv.innerHTML = 'جاري البحث...';
    
    let users = [];
    let s1 = await db.collection('users').where('shortId','==',q).get();
    let s2 = await db.collection('users').where('email','==',q).get();
    s1.forEach(d=>users.push({id:d.id, ...d.data()}));
    s2.forEach(d=> { if(!users.find(u=>u.id===d.id)) users.push({id:d.id, ...d.data()}); });
    
    resDiv.innerHTML = "";
    if(users.length === 0) { resDiv.innerHTML = '<p style="text-align:center; color:#999; font-size:12px;">غير موجود</p>'; return; }
    users.forEach(u => {
        if(u.id === currentUser.uid) return;
        const roleMap = {'employee':'موظف', 'supervisor':'مشرف', 'technician':'فني', 'manager':'مدير', 'engineer': u.gender==='female'?'مهندسة':'مهندس'};
        resDiv.innerHTML += `<div style="display:flex; align-items:center; justify-content:space-between; padding:10px; background:var(--surface-light); border-radius:10px; margin-bottom:5px; border:1px solid var(--border);"><div style="display:flex; align-items:center; gap:10px;"><img src="${u.photoUrl}" style="width:35px; height:35px; border-radius:50%;"><div><b style="font-size:12px; color:var(--text);">${u.fullName}</b><br><span style="font-size:10px; color:var(--gold);">${roleMap[u.role]||u.role}</span></div></div><button onclick="addFriend('${u.id}', '${u.fullName}', '${u.photoUrl}')" class="btn-main btn-sm">إضافة +</button></div>`;
    });
}

async function addFriend(tid, tname, tpic) {
    await db.collection('friend_requests').add({ fromId: currentUser.uid, toId: tid, status: 'pending', fromData: { name: userData.fullName, pic: userData.photoUrl }, toData: { name: tname, pic: tpic } });
    toast("✅ تم إرسال الطلب");
}

async function loadTeam() {
    const list = document.getElementById('team-list'); list.innerHTML = "";
    const snap = await db.collection('users').doc(currentUser.uid).collection('friends').get();
    if(snap.empty) { list.innerHTML = "<p style='text-align:center; color:#999; font-size:12px;'>لا يوجد أصدقاء</p>"; return; }
    snap.forEach(d => { const f = d.data(); list.innerHTML += `<div class="friend-item" onclick="viewUserProfile('${f.friendId}')"><img src="${f.pic}" style="width:40px;height:40px;border-radius:50%;"><b>${f.name}</b></div>`; });
}

async function loadFriendReqs() {
    const div = document.getElementById('friend-reqs');
    const list = document.getElementById('reqs-list');
    const snap = await db.collection('friend_requests').where('toId','==',currentUser.uid).where('status','==','pending').get();
    if(snap.empty) { div.classList.add('hidden'); return; }
    div.classList.remove('hidden'); list.innerHTML = "";
    snap.forEach(d => {
        const r = d.data();
        list.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border-radius:10px; margin-bottom:5px;"><div style="display:flex; align-items:center; gap:10px;"><img src="${r.fromData.pic}" style="width:30px;height:30px;border-radius:50%;"><span>${r.fromData.name}</span></div><div><button onclick="acceptFriend('${d.id}', '${r.fromId}', '${r.fromData.name}', '${r.fromData.pic}')" class="btn-main btn-sm" style="background:var(--success);">قبول</button></div></div>`;
    });
}

async function acceptFriend(reqId, fid, fname, fpic) {
    await db.collection('users').doc(currentUser.uid).collection('friends').add({ friendId: fid, name: fname, pic: fpic });
    await db.collection('users').doc(fid).collection('friends').add({ friendId: currentUser.uid, name: userData.fullName, pic: userData.photoUrl });
    await db.collection('friend_requests').doc(reqId).delete();
    toast("✅ تم قبول الصداقة"); loadFriendReqs(); loadTeam();
}

function switchTab(tab, el) {
    currentTab = tab; 
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
    el.classList.add('active'); 
    renderFeed();
}

function getStatusLabel(s) {
    const map = { 'pending': 'في انتظار المشرف', 'at_engineer': 'عند المهندس', 'at_tech': 'عند الفني', 'working': 'قيد التنفيذ', 'pending_confirmation': 'بانتظار تأكيدك', 'done': 'مكتمل', 'rejected': 'مرفوض' };
    return map[s] || s;
}

// --- DETAILS MODAL: Split Location, Timeline Times, Zoom, Response Time ---
function openRequestDetails(id) {
    const d = requestsCache.find(r => r.id === id);
    document.getElementById('request-details-modal').classList.remove('hidden');
    
    // Req 4: Image Zoom
    let mediaHtml = "";
    if(d.media) {
        d.media.forEach((m, idx) => {
            if(m.type === 'audio') mediaHtml += `<div class="media-item" onclick="openMediaViewer('${id}', ${idx})" style="background:#e0f2fe;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-play-circle fa-2x"></i></div>`;
            else mediaHtml += `<div class="media-item" onclick="openMediaViewer('${id}', ${idx})"><img src="${m.url}"></div>`;
        });
    }

    // Timeline Logic (Req 2: Add Times)
    const t1 = formatDateTime(d.createdAt);
    const t2 = formatDateTime(d.supApprovedAt);
    const t3 = formatDateTime(d.techAssignedAt);
    const t4 = formatDateTime(d.workStartedAt);
    const t5 = formatDateTime(d.techFinishedAt);
    const t6 = formatDateTime(d.completedAt);

    let steps = [{ title: 'تم الإنشاء', detail: `${d.createdBy}`, time: t1.time + ' ' + t1.date, active: true }];
    
    let supActive = d.status !== 'pending' && d.status !== 'rejected';
    steps.push({ title: 'موافقة المشرف', detail: supActive ? 'تم' : '...', time: supActive ? t2.time : '', active: supActive });

    let engActive = ['at_tech', 'working', 'pending_confirmation', 'done'].includes(d.status);
    steps.push({ title: 'تعيين الفني', detail: engActive ? (d.engineerName || 'تم') : '...', time: engActive ? t3.time : '', active: engActive });

    let techWorking = ['working', 'pending_confirmation', 'done'].includes(d.status);
    steps.push({ title: 'بدء العمل', detail: d.technicianName || '...', time: techWorking ? t4.time : '', active: techWorking });

    let techFinished = ['pending_confirmation', 'done'].includes(d.status);
    steps.push({ title: 'تم الإصلاح', detail: techFinished ? 'بانتظار التأكيد' : '...', time: techFinished ? t5.time : '', active: techFinished });

    let empConfirmed = d.status === 'done';
    steps.push({ title: 'الإغلاق (الموظف)', detail: empConfirmed ? 'مكتمل' : '...', time: empConfirmed ? t6.time : '', active: empConfirmed });

    let tlHtml = '<div class="timeline">';
    if (d.status === 'rejected') {
          tlHtml += `<div class="timeline-item active rejected"><div class="tl-icon"><i class="fa-solid fa-xmark"></i></div><div class="tl-content"><h4>مرفوض</h4><span class="tl-detail">بواسطة: ${d.rejectedBy || 'غير محدد'}</span></div></div>`;
    } else {
        steps.forEach(step => {
            tlHtml += `
            <div class="timeline-item ${step.active ? 'active' : ''}">
                <div class="tl-icon"><i class="fa-solid fa-check"></i></div>
                <div class="tl-content">
                    <h4>${step.title}</h4>
                    <span class="tl-detail">${step.detail}</span>
                    ${step.time ? `<span class="tl-time en-num">${step.time}</span>` : ''}
                </div>
            </div>`;
        });
    }
    tlHtml += '</div>';
    
    let costHtml = '';
    if(d.usedMaterials && d.usedMaterials.length > 0) {
        costHtml = `<div style="background:#f8fafc; padding:15px; border-radius:12px; margin-top:15px; border:1px dashed var(--border);"><p style="font-weight:bold; color:var(--primary); font-size:12px; margin-bottom:10px;">المواد المستخدمة:</p><ul style="padding-right:20px; font-size:12px; margin:0;">${d.usedMaterials.map(m => `<li>${m.name} (<span class="en-num">${m.price}</span> ج.م)</li>`).join('')}</ul><p style="margin-top:10px; font-weight:bold; font-size:13px;">الإجمالي: <span class="en-num">${d.totalCost}</span> ج.م</p></div>`;
    }

    // Req 3: Separate Location Table
    const locTable = `
    <table class="detail-table">
        <tr><td class="dt-label">الكلية/المبنى</td><td class="dt-val">${d.faculty || '-'}</td></tr>
        <tr><td class="dt-label">الدور</td><td class="dt-val">${d.floor || '-'}</td></tr>
        <tr><td class="dt-label">الغرفة/القاعة</td><td class="dt-val en-num">${d.room || '-'}</td></tr>
    </table>`;

    // Req 6: Response Speed Calculation
    let responseTimeHtml = '';
    if(d.techAssignedAt && d.completedAt) {
        let diffMs = d.completedAt.seconds * 1000 - d.techAssignedAt.seconds * 1000;
        let hrs = Math.floor(diffMs / 3600000);
        let mins = Math.floor((diffMs % 3600000) / 60000);
        responseTimeHtml = `<div style="background:#ecfdf5; border:1px solid var(--success); color:#065f46; padding:10px; border-radius:12px; text-align:center; font-size:12px; margin-bottom:15px;">🚀 سرعة الاستجابة: <b class="en-num">${hrs}h ${mins}m</b></div>`;
    }

    document.getElementById('req-details-content').innerHTML = `
        ${responseTimeHtml}
        ${tlHtml}
        <div style="text-align:center; margin-bottom:15px;"><span class="req-code en-num" style="font-size:16px;">#${toEng(d.uniqueCode||'---')}</span></div>
        <p style="font-size:12px; color:#666; margin-bottom:5px;"><strong>المنشئ:</strong> <span onclick="viewUserProfile('${d.userId}')" style="color:var(--primary); cursor:pointer;">${d.userData.fullName}</span> (ID: <span class="en-num">${toEng(d.userId.substring(0,5))}</span>)</p>
        <p><strong>الوصف:</strong> ${d.description}</p>
        ${locTable}
        ${d.extTechData ? `<div style="background:#fff7ed;padding:10px;border-radius:10px;margin-top:10px;"><p style="margin:0;font-weight:bold;color:#c2410c;">فني خارجي:</p><p style="margin:0;font-size:12px;">${d.extTechData.name} - <span class="en-num">${d.extTechData.phone}</span></p></div>` : ''}
        ${costHtml}
        <div class="media-grid">${mediaHtml}</div>
    `;
}

// Req 4: Image Zoom Handler
function openMediaViewer(reqId, startIndex) {
    const d = requestsCache.find(r => r.id === reqId);
    if(!d || !d.media) return;
    const content = document.getElementById('media-viewer-content');
    content.innerHTML = "";
    d.media.forEach(m => {
        if(m.type === 'video') content.innerHTML += `<video controls src="${m.url}" class="full-media-item" style="margin-bottom:15px;"></video>`;
        else if (m.type === 'audio') content.innerHTML += `<audio controls src="${m.url}" style="width:80%; margin-bottom:15px;"></audio>`;
        else content.innerHTML += `<img src="${m.url}" class="full-media-item" style="margin-bottom:15px; cursor:zoom-in;" onclick="this.style.transform = this.style.transform === 'scale(2)' ? 'scale(1)' : 'scale(2)'">`;
    });
    document.getElementById('media-viewer-modal').classList.remove('hidden');
}

async function softDelete(id) { openConfirmModal("نقل للمهملات؟", async () => { await db.collection('requests').doc(id).update({isDeleted:true}); toast("تم النقل"); }); }
async function hardDelete(id) { openConfirmModal("حذف نهائي؟ لا يمكن التراجع.", async () => { await db.collection('requests').doc(id).delete(); toast("تم الحذف"); }); }
async function restoreReq(id) { await db.collection('requests').doc(id).update({isDeleted:false}); toast("تم الاستعادة"); }

function openConfirmModal(msg, action) {
    document.getElementById('confirm-modal-msg').innerText = msg;
    document.getElementById('confirm-modal').classList.remove('hidden');
    const btn = document.getElementById('confirm-yes-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.onclick = function() { action(); closeModal('confirm-modal'); };
}

function loadProfilePageData() {
    document.getElementById('edit-current-pic').src = userData.photoUrl;
    document.getElementById('edit-id-display').innerText = toEng(userData.shortId);
    document.getElementById('edit-name').value = userData.fullName;
    document.getElementById('edit-job').value = userData.jobTitle;
    document.getElementById('edit-loc').value = userData.location;
    document.getElementById('edit-phone').value = toEng(userData.phone);
    document.getElementById('edit-gender').value = userData.gender;
}

async function saveProfile() {
    const newName = document.getElementById('edit-name').value;
    const newJob = document.getElementById('edit-job').value;
    const newLoc = document.getElementById('edit-loc').value;
    const newPhone = document.getElementById('edit-phone').value;
    const newGender = document.getElementById('edit-gender').value;
    let picUrl = userData.photoUrl;
    const btn = document.getElementById('save-profile-btn');
    btn.innerText = "جاري الحفظ..."; btn.disabled = true;

    if(newProfilePicFile) {
          const fd = new FormData(); fd.append('file', newProfilePicFile); fd.append('upload_preset', CLOUD_PRESET);
          const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {method:'POST', body:fd});
          const d = await res.json();
          picUrl = d.secure_url;
    }

    const selectedFrameEl = document.querySelector('.frame-option.selected');
    let frameClass = '';
    if(selectedFrameEl.classList.contains('f-gold')) frameClass = 'f-gold';
    if(selectedFrameEl.classList.contains('f-blue')) frameClass = 'f-blue';
    if(selectedFrameEl.classList.contains('f-grad')) frameClass = 'f-grad';

    await db.collection('users').doc(currentUser.uid).update({ fullName: newName, jobTitle: newJob, location: newLoc, phone: newPhone, gender: newGender, photoUrl: picUrl, frame: frameClass });
    toast("✅ تم تحديث الملف الشخصي"); btn.innerText = "حفظ التعديلات"; btn.disabled = false; location.reload(); 
}

function previewProfilePic(i) { newProfilePicFile = i.files[0]; document.getElementById('edit-current-pic').src = URL.createObjectURL(i.files[0]); }
function copyId() { navigator.clipboard.writeText(userData.shortId); toast("تم نسخ ID"); }
function selectFrame(el, c) { document.querySelectorAll('.frame-option').forEach(f=>f.classList.remove('selected')); el.classList.add('selected'); }

// --- Reports Logic ---
function generateReports() {
    let start = document.getElementById('report-start-date').valueAsDate;
    let end = document.getElementById('report-end-date').valueAsDate;
    if(!start) start = new Date(0); if(!end) end = new Date(); end.setHours(23, 59, 59);

    const reportData = requestsCache.filter(r => { const rDate = new Date(r.date); return rDate >= start && rDate <= end && r.isDeleted !== true; });
    const total = reportData.length;
    const done = reportData.filter(r => r.status === 'done').length;
    const rejected = reportData.filter(r => r.status === 'rejected').length;
    const active = total - done - rejected;
    const pHigh = reportData.filter(r => r.priority === 'high').length;
    const pMed = reportData.filter(r => r.priority === 'medium').length;
    const pLow = reportData.filter(r => r.priority === 'low').length;

    document.getElementById('rep-total').innerText = toEng(total); document.getElementById('rep-done').innerText = toEng(done);
    document.getElementById('rep-rejected').innerText = toEng(rejected); document.getElementById('rep-active').innerText = toEng(active);
    document.getElementById('rep-prio-high').innerText = toEng(pHigh); document.getElementById('rep-prio-med').innerText = toEng(pMed);
    document.getElementById('rep-prio-low').innerText = toEng(pLow);

    updateChart([done, active, rejected]); renderTechTable(reportData);
}

function updateChart(data) {
    if(reportChart) reportChart.destroy();
    const ctx = document.getElementById('statusChart').getContext('2d');
    reportChart = new Chart(ctx, { type: 'doughnut', data: { labels: ['مكتمل', 'قيد العمل', 'مرفوض'], datasets: [{ data: data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
}

function renderTechTable(data) {
    const tbody = document.getElementById('tech-performance-body'); tbody.innerHTML = "";
    const techs = {};
    data.forEach(r => { if(r.technicianName) { const name = r.technicianName; if(!techs[name]) techs[name] = { total: 0, done: 0, pic: 'https://cdn-icons-png.flaticon.com/512/3237/3237472.png' }; techs[name].total++; if(r.status === 'done') techs[name].done++; } });

    if(Object.keys(techs).length === 0) { tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>لا يوجد بيانات فنيين</td></tr>"; return; }

    for (const [name, stats] of Object.entries(techs)) {
        const efficiency = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
        let badgeColor = efficiency >= 80 ? 'green' : (efficiency >= 50 ? 'orange' : 'red');
        tbody.innerHTML += `<tr><td><div class="tech-row"><img src="${stats.pic}"><span>${name}</span></div></td><td style="text-align:center" class="en-num">${stats.total}</td><td style="text-align:center; color:var(--success); font-weight:bold;" class="en-num">${stats.done}</td><td style="text-align:center"><span class="en-num" style="color:${badgeColor}; font-weight:bold;">%${efficiency}</span></td></tr>`;
    }
}

function exportReportsPDF() {
    const element = document.getElementById('page-reports');
    const opt = { margin:0.5, filename:`report_${new Date().toISOString().slice(0,10)}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true}, jsPDF:{unit:'in',format:'a4',orientation:'portrait'} };
    html2pdf().set(opt).from(element).save();
}

// --- Inventory Logic ---
function loadInventory() {
    const body = document.getElementById('inventory-body');
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;">جاري التحميل...</td></tr>';
    
    db.collection('inventory').where('userId', '==', currentUser.uid).onSnapshot(snap => {
        body.innerHTML = "";
        if(snap.empty) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا يوجد أصناف في عهدتك</td></tr>'; return; }
        
        snap.forEach(doc => {
            const item = doc.data(); const id = doc.id;
            let locationStr = item.faculty ? item.faculty : '';
            if(item.floor) locationStr += ` - ${item.floor}`;
            if(item.room) locationStr += ` (غرفة: ${item.room})`;

            body.innerHTML += `
            <tr>
                <td><div style="font-weight:bold;">${item.name}</div><div style="font-size:10px; color:var(--text-muted);">${locationStr}</div></td>
                <td><div class="stepper-container"><div class="stepper-btn" onclick="updateInvStepper('${id}', -1, 'total')">-</div><div class="stepper-input en-num">${item.total}</div><div class="stepper-btn" onclick="updateInvStepper('${id}', 1, 'total')">+</div></div></td>
                <td><div class="stepper-container"><div class="stepper-btn" onclick="updateInvStepper('${id}', -1, 'current')">-</div><div class="stepper-input en-num" style="color:${item.current < item.total ? 'var(--error)' : 'var(--success)'}">${item.current}</div><div class="stepper-btn" onclick="updateInvStepper('${id}', 1, 'current')">+</div></div></td>
                <td style="font-size:11px; text-align:center;">${item.updatedBy || '-'}</td>
                <td style="text-align:center;"><div class="delete-icon" onclick="deleteInventoryItem('${id}')" style="margin:0 auto;"><i class="fa-solid fa-trash"></i></div></td>
            </tr>`;
        });
    });
}

async function addInventoryItem() {
    const name = document.getElementById('inv-name').value;
    const total = parseInt(document.getElementById('inv-total').value);
    const current = parseInt(document.getElementById('inv-current').value);
    
    const facSelect = document.getElementById('inv-faculty');
    const floorSelect = document.getElementById('inv-floor');
    const room = document.getElementById('inv-room').value;
    
    let facText = facSelect.options[facSelect.selectedIndex].text; if(facSelect.value === "") facText = ""; 
    let floorText = floorSelect.value ? floorSelect.value : "";

    if(!name || isNaN(total) || isNaN(current)) return toast("⚠️ أدخل بيانات صحيحة");
    
    await db.collection('inventory').add({
        name: name, total: total, current: current, faculty: facText, floor: floorText, room: room,
        updatedBy: userData.fullName, userId: currentUser.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    document.getElementById('inv-name').value = ""; document.getElementById('inv-total').value = ""; document.getElementById('inv-current').value = "";
    toast("✅ تم إضافة الصنف");
}

async function updateInvStepper(id, change, field) {
    const doc = await db.collection('inventory').doc(id).get();
    if(doc.exists) {
        let newVal = (doc.data()[field] || 0) + change;
        if(newVal < 0) newVal = 0;
        await db.collection('inventory').doc(id).update({ [field]: newVal, updatedBy: userData.fullName, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    }
}

async function deleteInventoryItem(id) { if(confirm("حذف الصنف من العهدة؟")) { await db.collection('inventory').doc(id).delete(); toast("تم الحذف"); } }

// --- Send Report Logic (Req 5: Modern Manager Select) ---
async function openSendReportModal() {
    const list = document.getElementById('manager-select-list');
    const modal = document.getElementById('send-report-modal');
    const btn = document.getElementById('confirm-send-rep-btn');
    list.innerHTML = "<p style='text-align:center;'>جاري تحميل المديرين...</p>";
    btn.disabled = true;
    modal.classList.remove('hidden');
    
    try {
        const snap = await db.collection('users').where('role', '==', 'manager').get();
        list.innerHTML = "";
        if(snap.empty) { list.innerHTML = "<p style='text-align:center; color:#999;'>لا يوجد مديرين مسجلين</p>"; return; }
        
        snap.forEach(doc => {
            const u = doc.data();
            // Req 5: Use manager-card style (Modern)
            list.innerHTML += `<div class="manager-card" onclick="selectManager(this, '${doc.id}')"><img src="${u.photoUrl}"><div><div style="font-weight:bold; font-size:12px;">${u.fullName}</div><div style="font-size:10px; color:var(--text-muted);">${u.jobTitle || 'مدير'}</div></div></div>`;
        });
    } catch(e) { console.error(e); list.innerHTML = "<p style='color:red; text-align:center;'>خطأ في التحميل</p>"; }
}

function selectManager(el, uid) {
    document.querySelectorAll('#manager-select-list .manager-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    selectedManagerForReport = uid;
    document.getElementById('confirm-send-rep-btn').disabled = false;
}

async function confirmSendReport() {
    if(!selectedManagerForReport) return;
    const btn = document.getElementById('confirm-send-rep-btn');
    btn.innerText = "جاري الإرسال..."; btn.disabled = true;
    
    try {
        const snap = await db.collection('inventory').where('userId', '==', currentUser.uid).get();
        let items = []; snap.forEach(doc => items.push(doc.data()));
        if(items.length === 0) { toast("⚠️ عهدتك فارغة، لا يوجد ما يتم إرساله."); closeModal('send-report-modal'); return; }
        
        await db.collection('inventory_reports').add({
            senderName: userData.fullName, senderId: currentUser.uid, recipientId: selectedManagerForReport, 
            role: userData.role, reportDate: firebase.firestore.FieldValue.serverTimestamp(),
            itemCount: items.length, inventoryData: items, status: 'unread'
        });
        toast("✅ تم إرسال التقرير للمدير بنجاح"); closeModal('send-report-modal');
    } catch(e) { console.error(e); toast("❌ حدث خطأ أثناء الإرسال"); } 
    finally { btn.innerText = "إرسال الآن"; btn.disabled = false; selectedManagerForReport = null; }
}

// --- Feed Logic ---
function checkUnseenNotifications() {
    db.collection('posts').orderBy('createdAt', 'desc').limit(5).get().then(snap => {
        let hasUnseen = false;
        snap.forEach(doc => { const p = doc.data(); if(!p.seenBy || !p.seenBy.includes(currentUser.uid)) hasUnseen = true; });
        if(hasUnseen) document.getElementById('feed-badge').classList.add('active');
    });
}

function loadFeedPosts() {
    if(postsListener) return; 
    const container = document.getElementById('albayan-feed');
    container.innerHTML = '<div style="text-align:center; padding:20px;">جاري التحميل...</div>';

    postsListener = db.collection('posts').orderBy('createdAt', 'desc').limit(20)
        .onSnapshot(snap => {
            container.innerHTML = "";
            if(snap.empty) { container.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">لا يوجد منشورات</div>'; return; }
            
            let hasUnseenInStream = false;
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const p = change.doc.data();
                    const now = new Date().getTime() / 1000;
                    if (p.createdAt && (now - p.createdAt.seconds) < 30 && p.authorId !== currentUser.uid) {
                         const audio = document.getElementById('sound-notify-post');
                         if(audio) audio.play().catch(e=>console.log("Audio block"));
                    }
                }
            });

            snap.forEach(doc => {
                const p = doc.data();
                if(!p.seenBy || !p.seenBy.includes(currentUser.uid)) { hasUnseenInStream = true; }
                renderPostItem(doc);
            });
            
            if(!document.getElementById('page-albayan').classList.contains('hidden')) { markPostsAsSeen(snap.docs); } 
            else if (hasUnseenInStream) { document.getElementById('feed-badge').classList.add('active'); }
        });
}

function renderPostItem(doc) {
    const p = doc.data(); const pid = doc.id;
    const container = document.getElementById('albayan-feed');
    const isLiked = p.likes && p.likes.includes(currentUser.uid);
    const likeIcon = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    const likeClass = isLiked ? 'liked' : '';
    const likeCount = p.likes ? p.likes.length : 0;
    const seenCount = p.seenBy ? p.seenBy.length : 0;
    // Req 2: Add exact Time to post
    const timeInfo = formatDateTime(p.createdAt); 
    
    let delBtn = '';
    if(p.authorId === currentUser.uid || userData.role === 'manager') delBtn = `<i class="fa-solid fa-trash" onclick="deletePost('${pid}')" style="cursor:pointer; color:var(--text-muted); font-size:12px;"></i>`;

    const html = `
    <div class="feed-post" id="post-${pid}">
        <div class="post-header">
            <div class="post-author" onclick="viewUserProfile('${p.authorId}')">
                <img src="${p.authorPic}">
                <div class="post-meta">
                    <h4>${p.authorName} <span style="font-weight:normal; font-size:10px; color:var(--primary);">(${p.role})</span></h4>
                    <span class="en-num" style="font-size:10px;">${timeInfo.date} - ${timeInfo.time}</span>
                </div>
            </div>
            ${delBtn}
        </div>
        <div class="post-body">${p.content}</div>
        <div class="post-actions">
            <div class="action-group">
                <button class="act-btn ${likeClass}" onclick="toggleLike('${pid}')"><i class="${likeIcon}"></i> <span class="en-num">${likeCount}</span></button>
                <button class="act-btn" onclick="toggleComments('${pid}')"><i class="fa-regular fa-comment"></i> تعليق</button>
            </div>
            <div class="seen-indicator" onclick="showSeenUsers('${pid}')"><i class="fa-solid fa-eye"></i> <span class="en-num">${seenCount}</span></div>
        </div>
        <div id="comments-${pid}" class="comments-section">
            <div id="comments-list-${pid}"></div>
            <div style="display:flex; gap:10px; margin-top:10px;">
                <input type="text" id="comment-input-${pid}" placeholder="اكتب تعليقاً..." style="padding:8px; border-radius:20px; font-size:12px;">
                <button onclick="addComment('${pid}')" class="btn-sm btn-main" style="width:auto;"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
        </div>
    </div>`;
    container.innerHTML += html;
}

async function createPost() {
    const content = document.getElementById('new-post-content').value.trim();
    if(!content) return;
    try {
        await db.collection('posts').add({
            content: content, authorId: currentUser.uid, authorName: userData.fullName, authorPic: userData.photoUrl,
            role: userData.role, createdAt: firebase.firestore.FieldValue.serverTimestamp(), likes: [], seenBy: [currentUser.uid]
        });
        document.getElementById('new-post-content').value = ""; toast("✅ تم النشر");
    } catch(e) { toast("خطأ في النشر"); }
}

async function deletePost(pid) { if(!confirm("حذف المنشور؟")) return; await db.collection('posts').doc(pid).delete(); toast("تم الحذف"); }

async function toggleLike(pid) {
    const postRef = db.collection('posts').doc(pid);
    const doc = await postRef.get();
    if(!doc.exists) return;
    const likes = doc.data().likes || [];
    if(likes.includes(currentUser.uid)) await postRef.update({ likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    else await postRef.update({ likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
}

function toggleComments(pid) {
    const sec = document.getElementById(`comments-${pid}`);
    sec.classList.toggle('show');
    if(sec.classList.contains('show')) loadComments(pid);
}

function loadComments(pid) {
    const list = document.getElementById(`comments-list-${pid}`);
    db.collection('posts').doc(pid).collection('comments').orderBy('createdAt', 'asc').onSnapshot(snap => {
        list.innerHTML = "";
        snap.forEach(d => {
            const c = d.data();
            const t = formatDateTime(c.createdAt); // Req 2: Comment Time
            let del = '';
            if(c.authorId === currentUser.uid || userData.role === 'manager') del = `<i class="fa-solid fa-xmark delete-comment" onclick="deleteComment('${pid}', '${d.id}')"></i>`;
            list.innerHTML += `
            <div class="comment-item">
                <img src="${c.authorPic}" onclick="viewUserProfile('${c.authorId}')">
                <div class="comment-box">
                    <span class="comment-name" onclick="viewUserProfile('${c.authorId}')">${c.authorName} <span class="en-num" style="font-size:9px;color:#999;font-weight:normal;">${t.time}</span></span>
                    <span class="comment-text">${c.text}</span>
                    <span class="reply-btn" onclick="prepareReply('${pid}', '${c.authorName}')">رد</span>
                    ${del}
                </div>
            </div>`;
        });
    });
}

function prepareReply(pid, name) { const input = document.getElementById(`comment-input-${pid}`); input.value = `@${name} `; input.focus(); }

async function addComment(pid) {
    const inp = document.getElementById(`comment-input-${pid}`);
    const text = inp.value.trim();
    if(!text) return;
    await db.collection('posts').doc(pid).collection('comments').add({
        text: text, authorId: currentUser.uid, authorName: userData.fullName, authorPic: userData.photoUrl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    inp.value = "";
}

async function deleteComment(pid, cid) { await db.collection('posts').doc(pid).collection('comments').doc(cid).delete(); }

async function markPostsAsSeen(docs) {
    docs.forEach(doc => {
        const p = doc.data();
        if(!p.seenBy || !p.seenBy.includes(currentUser.uid)) {
            db.collection('posts').doc(doc.id).update({ seenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
        }
    });
}

async function showSeenUsers(pid) {
    const modal = document.getElementById('seen-users-modal');
    const list = document.getElementById('seen-users-list');
    list.innerHTML = "جاري التحميل...";
    modal.classList.remove('hidden');

    try {
        const postDoc = await db.collection('posts').doc(pid).get();
        const seenIds = postDoc.data().seenBy || [];
        if(seenIds.length === 0) { list.innerHTML = "<p style='text-align:center;color:#999'>لم يشاهده أحد بعد</p>"; return; }

        const usersSnap = await db.collection('users').get();
        list.innerHTML = "";
        let found = 0;
        usersSnap.forEach(uDoc => {
            if(seenIds.includes(uDoc.id)) {
                const u = uDoc.data();
                list.innerHTML += `<div class="seen-user-item" onclick="viewUserProfile('${uDoc.id}')"><img src="${u.photoUrl}"><span>${u.fullName}</span></div>`;
                found++;
            }
        });
        if(found === 0) list.innerHTML = "<p>بيانات غير متوفرة</p>";
    } catch(e) { list.innerHTML = "خطأ في التحميل"; }
}

async function viewUserProfile(uid) {
    if(uid === currentUser.uid) { nav('profile', document.querySelector('.nav-item:nth-child(5)')); return; }
    const modal = document.getElementById('friend-profile-modal');
    modal.classList.remove('hidden');
    document.getElementById('fp-name').innerText = "جاري التحميل...";
    const doc = await db.collection('users').doc(uid).get();
    if(doc.exists) {
        const u = doc.data();
        const roleMap = { 'employee': 'موظف', 'supervisor': 'مشرف', 'manager': 'مدير', 'technician': 'فني', 'engineer': 'مهندس' };
        document.getElementById('fp-pic').src = u.photoUrl;
        document.getElementById('fp-name').innerText = u.fullName;
        document.getElementById('fp-role').innerText = roleMap[u.role] || u.role;
        const infoDiv = document.getElementById('fp-info') || document.createElement('div');
        infoDiv.id = 'fp-info';
        infoDiv.style.marginTop = "15px"; infoDiv.style.color = "#666"; infoDiv.style.fontSize = "13px";
        infoDiv.innerHTML = `<p><i class="fa-solid fa-briefcase"></i> ${u.jobTitle || '-'}</p><p><i class="fa-solid fa-location-dot"></i> ${u.location || '-'}</p>`;
        const actionsDiv = document.getElementById('fp-actions');
        actionsDiv.innerHTML = "";
        const friendCheck = await db.collection('users').doc(currentUser.uid).collection('friends').where('friendId','==',uid).get();
        if(friendCheck.empty) {
            actionsDiv.innerHTML = `<button onclick="addFriend('${doc.id}', '${u.fullName}', '${u.photoUrl}')" class="btn-main btn-sm">إضافة صديق +</button>`;
        } else {
            actionsDiv.innerHTML = `<span style="color:green; font-weight:bold;"><i class="fa-solid fa-check"></i> صديق</span>`;
        }
    }
}