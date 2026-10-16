// TR-GOZU Kimlik Doğrulama Modülü (Tam Sürüm)

let tempUserData = null;

for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && key.startsWith('user_')) localStorage.removeItem(key);
}
// Giriş türünü değiştir
function switchAuth(type) {
    document.getElementById('citizenForm').classList.toggle('hidden', type !== 'citizen');
    document.getElementById('adminForm').classList.toggle('hidden', type !== 'admin');
    document.getElementById('tab-c').classList.toggle('active', type === 'citizen');
    document.getElementById('tab-a').classList.toggle('active', type === 'admin');
}

// Şifre görünürlüğünü değiştir
function togglePassVisibility() {
    const passInput = document.getElementById('c_pass');
    const toggleIcon = document.getElementById('toggleTC');
    if (passInput.type === "password") {
        passInput.type = "text";
        toggleIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    } else {
        passInput.type = "password";
        toggleIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
}

// Kullanım koşulları modalını yönet
function showContract() { document.getElementById('contractModal').classList.remove('hidden'); }
function closeModal() { document.getElementById('contractModal').classList.add('hidden'); }

function confirmContract() {
    if (!document.getElementById('acceptCheck').checked) {
        showToast('Devam etmek için kullanım koşullarını kabul etmelisiniz.');
        return;
    }
    if (!tempUserData) return;
    closeModal();
    document.getElementById('authSection').classList.add('hidden');
    initSystem();
}

// --- KAYIT OL (Sunucu Odaklı) ---
async function valideKayit() {
    const email = document.getElementById('c_user').value.trim().toLowerCase();
    const pass = document.getElementById('c_pass').value;

    if (!email || !isValidEmail(email)) { showToast('Geçerli bir e-posta adresi girin!'); return; }
    if (pass.length < 8) { showToast('Şifre en az 8 karakter olmalıdır!'); return; }

    try {
        const res = await fetch('/save-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pass, mode: 'reg' })
        });
        const data = await res.json();
        if (data.success) {
            STATE.userRole = 'citizen';
            tempUserData = { email };
            setCurrentUserEmail(email);
            showToast(data.message);
            showVerifyModal();
        } else {
            showToast(data.message);
        }
    } catch (e) { showToast('Sunucu bağlantı hatası!'); }
}

// --- GİRİŞ YAP (Sunucu Odaklı) ---
async function valideGiris() {
    const email = document.getElementById('c_user').value.trim().toLowerCase();
    const pass = document.getElementById('c_pass').value;

    if (!email || !pass) { showToast('E-posta ve şifre gerekli!'); return; }

    try {
        const res = await fetch('/save-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pass, mode: 'login' })
        });
        const data = await res.json();
        if (data.success) {
            STATE.userRole = 'citizen';
            STATE.isVerified = data.isVerified;
            STATE.securityLevel = data.securityLevel;
            tempUserData = { email, isVerified: data.isVerified, securityLevel: data.securityLevel };
            setCurrentUserEmail(email);
            // Otomatik giriş devre dışı - localStorage'a kaydetme
            // localStorage.setItem('autoLogin', JSON.stringify({ email, pass }));

            showContract();
        } else if (data.needsVerification) {
            STATE.userRole = 'citizen';
            tempUserData = { email };
            setCurrentUserEmail(email);
            showVerifyModal();
        } else {
            showToast(data.message);
        }
    } catch (e) { showToast('Giriş başarısız, sunucuya ulaşılamıyor!'); }
}

let forgotEmailSent = false;

function forgotPassword() {
    document.getElementById('forgot_email').value = document.getElementById('c_user').value.trim().toLowerCase();
    document.getElementById('forgot_code').value = '';
    document.getElementById('forgot_new_pass').value = '';
    document.getElementById('forgotStatus').textContent = 'Kayıtlı e-posta adresinizi girin. Doğrulama kodu gönderilecektir.';
    document.getElementById('forgotModal').classList.remove('hidden');
}

function closeForgotModal() {
    document.getElementById('forgotModal').classList.add('hidden');
}

async function sendForgotCode() {
    const email = document.getElementById('forgot_email').value.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
        showToast('Lütfen geçerli bir e-posta girin!');
        return;
    }

    try {
        const res = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
            forgotEmailSent = true;
            document.getElementById('forgotStatus').textContent = 'Doğrulama kodu gönderildi. Mailinizi kontrol edin.';
            showToast(data.message);
        } else {
            showToast(data.message);
        }
    } catch (e) {
        showToast('Sunucuya bağlanamadı!');
    }
}

async function resetPasswordWithCode() {
    const email = document.getElementById('forgot_email').value.trim().toLowerCase();
    const code = document.getElementById('forgot_code').value.trim();
    const newPass = document.getElementById('forgot_new_pass').value;

    if (!email || !isValidEmail(email)) { showToast('Geçerli bir e-posta girin!'); return; }
    if (!code) { showToast('Lütfen kodu girin!'); return; }
    if (newPass.length < 8) { showToast('Yeni şifre en az 8 karakter olmalıdır!'); return; }

    try {
        const res = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token: code, newPassword: newPass })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message);
            closeForgotModal();
        } else {
            showToast(data.message);
        }
    } catch (e) {
        showToast('Şifre güncelleme başarısız oldu!');
    }
}

function showVerifyModal() {
    document.getElementById('verify_email').value = document.getElementById('c_user').value.trim().toLowerCase();
    document.getElementById('verify_code').value = '';
    document.getElementById('verifyStatus').textContent = 'Mailinize gönderilen doğrulama kodunu girin.';
    document.getElementById('verifyModal').classList.remove('hidden');
}

function closeVerifyModal() {
    document.getElementById('verifyModal').classList.add('hidden');
}

async function verifyRegistrationCode() {
    const email = document.getElementById('verify_email').value.trim().toLowerCase();
    const code = document.getElementById('verify_code').value.trim();

    if (!email || !isValidEmail(email)) { showToast('Geçerli bir e-posta girin!'); return; }
    if (!code) { showToast('Lütfen kodu girin!'); return; }

    try {
        const res = await fetch('/api/verify-registration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code })
        });
        const data = await res.json();
        if (data.success) {
            STATE.isVerified = true;
            STATE.securityLevel = 'Yüksek';
            showToast(data.message);
            closeVerifyModal();
            showContract();
        } else {
            showToast(data.message);
        }
    } catch (e) {
        showToast('Doğrulama başarısız oldu!');
    }
}

async function resendVerificationCode() {
    const email = document.getElementById('verify_email').value.trim().toLowerCase();
    if (!email || !isValidEmail(email)) { showToast('Geçerli bir e-posta girin!'); return; }

    try {
        const res = await fetch('/api/resend-verification-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message);
            document.getElementById('verifyStatus').textContent = 'Yeni kod gönderildi. Mailinizi kontrol edin.';
        } else {
            showToast(data.message);
        }
    } catch (e) {
        showToast('Kod tekrar gönderilemedi!');
    }
}

// Yetkili girişi (Server odaklı)
async function handleAdminGirisLocal() {
    const key = document.getElementById('admin_key').value.trim();
    
    if (!key) { showToast('Yetkili anahtarı gerekli!'); return; }

    try {
        const res = await fetch('/save-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, mode: 'admin' })
        });
        const data = await res.json();
        if (data.success) {
            STATE.userRole = 'admin';
            tempUserData = { email: 'YETKILI@ADMIN', unit: data.unit, tc: data.unit };
            setCurrentUserEmail('YETKILI@ADMIN');
            showContract();
        } else {
            showToast(data.message);
        }
    } catch (e) { showToast('Yetkili girişi başarısız!'); }
}

// Sistemi Başlat ve Arayüzü Yükle
function initSystem() {
    // Her cihazda temiz başla - eski localStorage verilerini sıfırla
    const keysToKeep = ['currentUserEmail', 'autoLogin'];
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
        if (!keysToKeep.includes(key)) {
            localStorage.removeItem(key);
        }
    });

    const mainApp = document.getElementById('mainApp');
    const displayUser = document.getElementById('displayUser');
    const roleBadge = document.getElementById('roleBadge');

    mainApp.classList.remove('hidden');
    displayUser.innerText = tempUserData.email || 'Kullanıcı';
    if (typeof initMap === 'function') initMap();

    if (STATE.userRole === 'admin') {
        document.getElementById('adminPanel').classList.remove('hidden');
        document.getElementById('citizenPanel').classList.add('hidden');
        roleBadge.innerText = tempUserData.unit || "YETKILI";
        roleBadge.style.background = "var(--primary)";
        if (typeof startAdminView === "function") startAdminView();
    } else {
        document.getElementById('citizenPanel').classList.remove('hidden');
        document.getElementById('adminPanel').classList.add('hidden');
        roleBadge.innerText = "VATANDAŞ";
        roleBadge.style.background = "var(--secondary)";
        
        // Sunucudan kullanıcı verilerini yükle
        if (typeof loadUserDataFromServer === 'function') {
            loadUserDataFromServer().then(() => {
                if (typeof loadFamilyMembers === 'function') loadFamilyMembers();
            });
        } else {
            if (typeof loadFamilyMembers === 'function') loadFamilyMembers();
            if (typeof loadHelpRequests === 'function') loadHelpRequests();
        }
    }

    if (window.map) setTimeout(() => window.map.invalidateSize(), 300);
    if (STATE.userRole === 'citizen' && typeof requestNotificationPermission === 'function') {
        requestNotificationPermission();
    }
    showToast(`${STATE.userRole === 'admin' ? 'Yetkili' : 'Vatandaş'} olarak hoş geldiniz!`);
}

function initAuthEnterSubmit() {
    document.addEventListener('keydown', onAuthSectionEnter);
}

function onAuthSectionEnter(event) {
    if (event.key !== 'Enter' || event.repeat) return;
    const contract = document.getElementById('contractModal');
    if (contract && !contract.classList.contains('hidden')) {
        event.preventDefault();
        confirmContract();
        return;
    }
    if (!['c_user', 'c_pass', 'admin_key'].includes(event.target?.id)) return;
    event.preventDefault();
    if (event.target.id === 'admin_key') handleAdminGirisLocal();
    else valideGiris();
}

document.addEventListener('DOMContentLoaded', initAuthEnterSubmit);

// Yetkili görünümünü güncelle
function updateAdminView() {
    const listContainer = document.getElementById('adminGmailList');
    if (!listContainer) return;

    listContainer.innerHTML = "";
    const citizens = getCitizens();

    if (citizens.length === 0) {
        listContainer.innerHTML = "<p style='font-size: 11px; color: var(--text-dim);'>Henüz kayıtlı vatandaş yok.</p>";
        return;
    }

    citizens.forEach(c => {
        const healthBadge = c.healthStatus ? CONFIG.HEALTH_STATUS[c.healthStatus]?.icon || '' : '';
        const statusColor = c.isSOS ? 'var(--primary)' : c.isPanic ? 'var(--primary)' : 'var(--secondary)';

        listContainer.innerHTML += `
            <div class="admin-card" onclick="flyToLocation(${c.lat || 0}, ${c.lng || 0})">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 12px; word-break: break-all; color: ${statusColor};">
                        ${c.isSOS ? '🆘 ' : ''}${c.isPanic ? '🚨 ' : ''}${c.email}
                    </span>
                    ${healthBadge}
                </div>
                ${c.lastActive ? `<div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">Son: ${timeSince(c.lastActive)}</div>` : ''}
            </div>
        `;
    });
}

// Sidebar'ı aç/kapat (mobilde alt çekmece)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');

    // Harita boyutını güncelle - birden fazla kez çünkü animasyon var
    setTimeout(() => {
        if (window.map) window.map.invalidateSize();
    }, 150);
    setTimeout(() => {
        if (window.map) window.map.invalidateSize();
    }, 350);
    setTimeout(() => {
        if (window.map) window.map.invalidateSize();
    }, 600);
}

// Çıkış yap
function logout() {
    if (confirm('Çıkış yapmak istediğinize emin misiniz?')) {
        fetch('/logout', { method: 'POST' }).catch(() => {});
        // Temizlik
        STATE.userRole = null;
        tempUserData = null;
        STATE.userEmail = null;
        STATE.currentLocation = null;
        STATE.isLocationActive = false;

        // UI'ı sıfırla
        document.getElementById('mainApp').classList.add('hidden');
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('citizenPanel').classList.add('hidden');
        document.getElementById('adminPanel').classList.add('hidden');

        // Formları temizle
        document.getElementById('c_user').value = '';
        document.getElementById('c_pass').value = '';
        document.getElementById('admin_key').value = '';

        // Timer'ları temizle
        if (window.adminRefreshTimer) {
            clearInterval(window.adminRefreshTimer);
        }
        if (window.trackingTimer) {
            clearInterval(window.trackingTimer);
        }

        const voiceFab = document.querySelector('.voice-fab');
        if (voiceFab) voiceFab.classList.add('hidden');

        showToast('Güvenli çıkış yapıldı.');
    }
}
