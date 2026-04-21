// TR-GOZU Kimlik Doğrulama Modülü (Tam Sürüm)

const ADMIN_KEYS = {
    "AFAD2026": "AFAD Komuta Merkezi",
    "UMKE911": "UMKE Acil Müdahale",
    "AKUT123": "AKUT Operasyon",
    "ADMIN": "Sistem Yöneticisi"
};

let tempUserData = null;

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
            showContract();
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

// --- ŞİFREMİ UNUTTUM (İstediğin Mantık) ---
async function forgotPassword() {
    const emailInput = document.getElementById('c_user');
    const email = emailInput.value.trim().toLowerCase();

    // 1. Boşluk Kontrolü
    if (!email) {
        showToast("HATA: E-posta alanı boş kalamaz!");
        emailInput.style.border = "2px solid #ef4444"; // Kırmızı vurgu
        emailInput.focus();
        setTimeout(() => emailInput.style.border = "", 2000);
        return;
    }

    if (!isValidEmail(email)) { showToast("Lütfen geçerli bir e-posta girin!"); return; }

    const onay = confirm(email + " adresine yeni bir şifre gönderilsin mi?");
    if (!onay) return;

    try {
        const res = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
            alert("Şifreniz sıfırlandı! Yeni şifreniz Gmail adresinize gönderildi.");
        } else {
            alert("Hata: " + data.message); // Sunucuda kayıtlı değilse burası çalışır
        }
    } catch (e) { showToast("İşlem başarısız!"); }
}

// Yetkili girişi (Yerel Anahtarlar)
function handleAdminGirisLocal() {
    const key = document.getElementById('admin_key').value.trim();
    const unit = ADMIN_KEYS[key];
    if (unit) {
        STATE.userRole = 'admin';
        tempUserData = { email: 'YETKILI@ADMIN', unit: unit, tc: unit };
        showContract();
    } else { showToast('Hatalı Yetkili Anahtarı!'); }
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

function logout() {
    if (confirm('Çıkış yapmak istiyor musunuz?')) {
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