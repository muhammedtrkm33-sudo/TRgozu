// TR-GÖZÜ - ANDROID FINAL AUTH (YARIŞMA MODU)
let countdownTimer = null;

const getApiBase = () => {
    // Render'a dağıtım yapıldığında bu URL kullanılmalı:
    return 'https://trgozu.onrender.com';

    // Yerel testler için alttakileri kullanabilirsiniz:
    // return 'http://192.168.1.104:3000';
};

// GLOBAL API BASE TANIMI (Hata almamak için window nesnesine bağlıyoruz)
//window.AUTH_API_BASE = getApiBase();

// Eğer render.com kullanmak istersen alttaki satırı açabilirsin:
 window.AUTH_API_BASE = 'https://trgozu.onrender.com';


async function apiPost(endpoint, data) {
    const url = window.AUTH_API_BASE + endpoint;
    console.log("📡 İstek gönderiliyor:", url);
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Bypass-Tunnel-Reminder': 'true'
            },
            body: JSON.stringify(data)
        });

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("❌ JSON Parse Hatası:", text);
            throw new Error("Sunucu geçersiz yanıt verdi (HTML dönmüş olabilir).");
        }

        if (!response.ok) throw new Error(result.message || `Hata: ${response.status}`);
        return result;
    } catch (err) {
        console.error("🚨 Ağ Hatası:", err);
        throw new Error("Sunucuya ulaşılamıyor! (URL: " + url + ")");
    }
}

function startCountdown() {
    clearInterval(countdownTimer);
    let timeLeft = 120;
    const timerDisplay = document.getElementById('verificationTimer');
    countdownTimer = setInterval(() => {
        let mins = Math.floor(timeLeft / 60);
        let secs = timeLeft % 60;
        if (timerDisplay) timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (timeLeft <= 0) clearInterval(countdownTimer);
        timeLeft--;
    }, 1000);
}

// GİRİŞ YAP - Sunucu Doğrulamalı
window.validateLogin = async function() {
    const email = document.getElementById('c_user').value.trim().toLowerCase();
    const pass = document.getElementById('c_pass').value;

    if (!email || !pass) { alert("E-posta ve şifre gereklidir."); return; }

    showLoading(true);
    try {
        const res = await apiPost('/api/save-user', { email, pass, mode: 'login' });
        showLoading(false);
        if (res.success) {
            localStorage.setItem('currentUser', JSON.stringify({ email, role: 'citizen' }));
            location.reload();
        }
    } catch (err) {
        showLoading(false);
        alert("Giriş Başarısız: " + (err.message.includes('401') ? "Hatalı email veya şifre!" : err.message));
    }
};

// YETKİLİ GİRİŞİ (Lokal/Anahtar Bazlı)
window.handleAdminLoginLocal = function() {
    const key = document.getElementById('admin_key').value;
    if (key === 'TRGOZU2024' || key === 'AFAD123') {
        localStorage.setItem('currentUser', JSON.stringify({ email: 'yetkili@trgozu.gov.tr', role: 'admin' }));
        location.reload();
    } else {
        alert("Geçersiz Yetkili Anahtarı!");
    }
};

// ÇIKIŞ (ANA MENÜYE DÖN)
window.logout = function() {
    localStorage.removeItem('currentUser');
    location.reload();
};

// KAYIT OL
window.validateRegistration = async function() {
    const email = document.getElementById('c_user').value.trim().toLowerCase();
    const pass = document.getElementById('c_pass').value;

    if (!email.includes('@')) { alert("Geçerli bir e-posta girin."); return; }
    if (pass.length < 6) { alert("Şifre en az 6 karakter olmalıdır."); return; }

    showLoading(true);
    try {
        const res = await apiPost('/api/send-verification', { email, purpose: 'register' });
        showLoading(false);
        if (res.success) {
            window.pendingRegistration = { email, pass };
            document.getElementById('emailVerificationModal').classList.remove('hidden');
            document.getElementById('verificationEmail').textContent = email;
            startCountdown();
        }
    } catch (err) {
        showLoading(false);
        alert("Kayıt Hatası: " + err.message);
    }
};

window.resendVerificationCode = async function() {
    const email = (window.pendingRegistration || window.pendingPasswordReset || {}).email;
    if (!email) return;

    showLoading(true);
    try {
        const res = await apiPost('/api/send-verification', { email, purpose: 'resend' });
        showLoading(false);
        if (res.success) {
            alert("Yeni kod gönderildi.");
            startCountdown();
        }
    } catch (err) {
        showLoading(false);
        alert("Hata: " + err.message);
    }
};

window.verifyEmailCode = async function() {
    const code = document.getElementById('verificationCode').value.trim();
    const email = (window.pendingRegistration || window.pendingPasswordReset || {}).email;

    showLoading(true);
    try {
        const res = await apiPost('/api/verify-code', { email, code });
        if (res.success) {
            clearInterval(countdownTimer);
            document.getElementById('emailVerificationModal').classList.add('hidden');

            if (window.pendingRegistration) {
                // Email doğrulandı, şimdi kullanıcıyı sunucuya kalıcı olarak kaydet
                const saveRes = await apiPost('/api/save-user', {
                    email: window.pendingRegistration.email,
                    pass: window.pendingRegistration.pass,
                    mode: 'reg'
                });
                showLoading(false);
                if (saveRes.success) {
                    localStorage.setItem('currentUser', JSON.stringify({ email: window.pendingRegistration.email, role: 'citizen' }));
                    alert("Kayıt Başarılı! Uygulama açılıyor...");
                    location.reload();
                }
            } else if (window.pendingPasswordReset) {
                showLoading(false);
                window.openResetPasswordModal();
            }
        }
    } catch (err) {
        showLoading(false);
        alert("Hata: " + err.message);
    }
};

function handleLoggedInState(user) {
    console.log("🔐 Giriş durumu işleniyor:", user.email);
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('displayUser').textContent = user.email;

    // Role özel paneli göster
    const role = user.role || 'citizen';
    if (role === 'admin') {
        document.getElementById('adminPanel').classList.remove('hidden');
        document.getElementById('citizenPanel').classList.add('hidden');
        const badge = document.getElementById('roleBadge');
        if (badge) {
            badge.textContent = 'YETKİLİ';
            badge.className = 'badge';
            badge.style.background = '#c20000';
            badge.style.color = 'white';
        }
    } else {
        document.getElementById('citizenPanel').classList.remove('hidden');
        document.getElementById('adminPanel').classList.add('hidden');
        const badge = document.getElementById('roleBadge');
        if (badge) {
            badge.textContent = 'VATANDAŞ';
            badge.className = 'badge';
            badge.style.background = 'white';
            badge.style.color = '#0f172a';
        }
    }

    // Kritik modülleri başlat
    setTimeout(() => {
        console.log("🚀 Modüller başlatılıyor...");

        // 1. Harita Başlatma
        try {
            if (typeof window.initMap === 'function') {
                window.initMap();
                console.log("✅ Harita başarıyla başlatıldı.");
            }
        } catch (e) {
            console.error("❌ initMap hatası:", e);
        }

        // 2. Harita Boyutu Güncelleme (Android WebView Garantisi)
        const forceMapRedraw = () => {
            try {
                if (window.map) {
                    window.map.invalidateSize();
                    // Harita container'ının stilini zorla tetikle (bazı Android sürümleri için)
                    const m = document.getElementById('map');
                    if (m) {
                        const h = m.offsetHeight;
                        m.style.height = (h - 1) + 'px';
                        setTimeout(() => { m.style.height = '100%'; window.map.invalidateSize(); }, 50);
                    }
                    console.log('🔄 Harita boyutu zorla güncellendi');
                }
            } catch (e) {
                console.warn('⚠️ forceMapRedraw hatası:', e);
            }
        };
        setTimeout(forceMapRedraw, 300);
        setTimeout(forceMapRedraw, 1500);

        // 3. Admin Paneli Başlatma
        if (role === 'admin') {
            try {
                if (typeof window.startAdminView === 'function') {
                    window.startAdminView();
                    console.log("✅ Admin görünümü başlatıldı.");
                }
            } catch (e) {
                console.error("❌ startAdminView hatası:", e);
            }
        }

        // 4. Diğer Başlatmalar (Eski initApp yerine buraya eklenebilir)
        console.log("🏁 Uygulama başlatma tamamlandı.");

    }, 500);
}

window.switchAuth = (m) => {
    document.getElementById('citizenForm').classList.toggle('hidden', m !== 'citizen');
    document.getElementById('adminForm').classList.toggle('hidden', m === 'citizen');
    document.getElementById('tab-c').classList.toggle('active', m === 'citizen');
    document.getElementById('tab-a').classList.toggle('active', m !== 'citizen');
};
window.openForgotPasswordModal = () => {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        document.getElementById('resetEmail').value = '';
        const msgEl = document.getElementById('resetMessage');
        if (msgEl) msgEl.textContent = '';
        modal.classList.remove('hidden');
    }
};

window.closeForgotPasswordModal = () => {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) modal.classList.add('hidden');
};

window.closeEmailVerification = () => {
    const modal = document.getElementById('emailVerificationModal');
    if (modal) modal.classList.add('hidden');
};

window.startForgotPassword = async function() {
    const email = document.getElementById('resetEmail').value.trim().toLowerCase();
    const msgEl = document.getElementById('resetMessage');

    if (!email || !email.includes('@')) {
        if (msgEl) msgEl.textContent = "Geçerli bir e-posta girin.";
        return;
    }

    showLoading(true);
    try {
        const res = await apiPost('/api/send-verification', { email, purpose: 'reset' });
        showLoading(false);
        if (res.success) {
            window.pendingPasswordReset = { email };
            window.pendingRegistration = null; // Kayıtla çakışmasın
            window.closeForgotPasswordModal();
            document.getElementById('emailVerificationModal').classList.remove('hidden');
            document.getElementById('verificationEmail').textContent = email;
            startCountdown();
        }
    } catch (err) {
        showLoading(false);
        if (msgEl) msgEl.textContent = "Hata: " + err.message;
    }
};

window.openResetPasswordModal = () => {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) {
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        const msgEl = document.getElementById('resetPasswordMessage');
        if (msgEl) msgEl.textContent = '';
        modal.classList.remove('hidden');
    }
};

window.closeResetPasswordModal = () => {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) modal.classList.add('hidden');
};

window.submitNewPassword = async function() {
    const password = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmNewPassword').value.trim();
    const msgEl = document.getElementById('resetPasswordMessage');

    if (!window.pendingPasswordReset || !window.pendingPasswordReset.email) {
        if (msgEl) msgEl.textContent = 'Hata: E-posta bilgisi kayboldu.';
        return;
    }

    if (password.length < 6) {
        if (msgEl) msgEl.textContent = 'Şifre en az 6 karakter olmalıdır.';
        return;
    }

    if (password !== confirmPassword) {
        if (msgEl) msgEl.textContent = 'Şifreler eşleşmiyor.';
        return;
    }

    showLoading(true);
    try {
        const res = await apiPost('/api/save-user', {
            email: window.pendingPasswordReset.email,
            pass: password,
            mode: 'reg' // 'reg' modu existing user'ı günceller veya yeni oluşturur (server.js mantığına göre)
        });
        showLoading(false);
        if (res.success) {
            alert("Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz.");
            window.pendingPasswordReset = null;
            window.closeResetPasswordModal();
            location.reload();
        }
    } catch (err) {
        showLoading(false);
        if (msgEl) msgEl.textContent = "Hata: " + err.message;
    }
};

window.togglePassVisibility = () => {
    const p = document.getElementById('c_pass');
    p.type = p.type === 'password' ? 'text' : 'password';
};

// MODAL YÖNETİMİ
window.openAboutModal = () => {
    document.getElementById('aboutModal').classList.remove('hidden');
};

window.closeAboutModal = () => {
    document.getElementById('aboutModal').classList.add('hidden');
};

window.closeModal = () => {
    document.getElementById('contractModal').classList.add('hidden');
};

window.confirmContract = () => {
    const check = document.getElementById('acceptCheck');
    if (!check || !check.checked) {
        alert("Devam etmek için kullanım koşullarını kabul etmelisiniz.");
        return;
    }
    localStorage.setItem('contractAccepted', 'true');
    window.closeModal();
};

document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const contractAccepted = localStorage.getItem('contractAccepted');

    if (user) {
        handleLoggedInState(user);
    } else if (contractAccepted !== 'true') {
        document.getElementById('contractModal').classList.remove('hidden');
    }
});
