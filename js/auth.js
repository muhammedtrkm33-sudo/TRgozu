// TR-GOZU Kimlik Doğrulama Modülü (Tam Sürüm)

const ADMIN_KEYS = {
    "AFAD2026": "AFAD Komuta Merkezi",
    "UMKE911": "UMKE Acil Müdahale",
    "AKUT123": "AKUT Operasyon",
    "ADMIN": "Sistem Yöneticisi"
};

let tempUserData = null;

// Sayfa yüklendiğinde session kontrolü
async function initAuth() {
    try {
        const res = await fetch('/check-session');
        const data = await res.json();
        if (data.loggedIn) {
            // Session var, direkt ana uygulamaya geç
            STATE.userRole = data.user.role;
            tempUserData = data.user;
            setCurrentUserEmail(data.user.email);
            document.getElementById('authSection').classList.add('hidden');
            initSystem();
        }
    } catch (e) {
        console.log('Session kontrolü başarısız, giriş ekranı gösteriliyor');
    }
}

// Sayfa yüklendiğinde çalıştır
document.addEventListener('DOMContentLoaded', initAuth);

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
        showToast('Devam etmek için kullanım koşullarını kabul etmelisiniz!');
        return;
    }
    if (tempUserData) {
        closeModal();
        document.getElementById('authSection').classList.add('hidden');
        initSystem();
    }
}

// --- KAYIT OL (Sunucu Odaklı) ---
async function valideKayit() {
    const email = document.getElementById('c_user').value.trim().toLowerCase();
    const pass = document.getElementById('c_pass').value;

    if (!email || !isValidEmail(email)) { showToast('Geçerli bir e-posta adresi girin!'); return; }
    if (!email.endsWith("@gmail.com")) { showToast('Sadece @gmail.com kabul edilir!'); return; }
    if (pass.length < 4) { showToast('Şifre en az 4 karakter olmalıdır!'); return; }

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
            tempUserData = { email };
            setCurrentUserEmail(email);
            showContract();
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
    if (newPass.length < 4) { showToast('Yeni şifre en az 4 karakter olmalıdır!'); return; }

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
    const mainApp = document.getElementById('mainApp');
    const displayUser = document.getElementById('displayUser');
    const roleBadge = document.getElementById('roleBadge');

    mainApp.classList.remove('hidden');
    displayUser.innerText = tempUserData.email || 'Kullanıcı';

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
        if (typeof loadFamilyMembers === 'function') loadFamilyMembers();
    }
    
    setTimeout(() => { if (window.map) window.map.invalidateSize(); }, 500);
    showToast(`Hoş geldiniz!`);
}

async function logout() {
    if (confirm('Çıkış yapmak istiyor musunuz?')) {
        try {
            await fetch('/logout', { method: 'POST' });
        } catch (e) {
            console.log('Logout request failed');
        }
        location.reload(); // En temiz çıkış yöntemi
    }
}

// Enter tuşu desteği
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const authSection = document.getElementById('authSection');
        if (!authSection.classList.contains('hidden')) {
            valideGiris();
        }
    }
});