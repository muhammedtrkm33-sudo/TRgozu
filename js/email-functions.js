// TR-GÖZÜ Email Yardımcı Modülü - SADELEŞTİRİLMİŞ

function normalizeEmailError(rawMessage, fallback) {
    const message = rawMessage ? String(rawMessage).trim() : '';
    if (!message || message === 'Failed to fetch' || message === 'null' || /network|fetch/i.test(message)) {
        return fallback;
    }
    return message;
}

// Şifre sıfırlama modalleri - Sadece görünüm yönetimi
window.openForgotPasswordModal = function() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        document.getElementById('resetEmail').value = '';
        document.getElementById('resetMessage').textContent = '';
        modal.classList.remove('hidden');
        document.getElementById('resetEmail').focus();
    }
}

window.closeForgotPasswordModal = function() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) modal.classList.add('hidden');
}

window.openResetPasswordModal = function() {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) {
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        document.getElementById('resetPasswordMessage').textContent = '';
        modal.classList.remove('hidden');
        document.getElementById('newPassword').focus();
    }
}

window.closeResetPasswordModal = function() {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) modal.classList.add('hidden');
}

// Yeni Şifreyi Kaydet (Sunucuya gönderir)
window.submitNewPassword = async function() {
    const password = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmNewPassword').value.trim();
    const msgEl = document.getElementById('resetPasswordMessage');

    // window.pendingPasswordReset auth.js'den geliyor
    if (!window.pendingPasswordReset || !window.pendingPasswordReset.email) {
        if (msgEl) msgEl.textContent = 'Lütfen önce kod girin.';
        return;
    }

    if (password.length < 8) {
        if (msgEl) msgEl.textContent = 'Şifre en az 8 karakter olmalıdır.';
        return;
    }

    if (password !== confirmPassword) {
        if (msgEl) msgEl.textContent = 'Şifreler eşleşmiyor.';
        return;
    }

    try {
        if (msgEl) msgEl.textContent = 'Şifre güncelleniyor...';

        // auth.js'deki apiCall'u kullanır
        const result = await apiCall('/api/save-user', {
            method: 'POST',
            body: {
                email: window.pendingPasswordReset.email,
                pass: password,
                mode: 'reg' // Şifre güncelleme aslında kullanıcıyı üzerine yazmadır
            }
        });

        if (result.success) {
            if (msgEl) msgEl.textContent = 'Şifreniz güncellendi! Giriş yapabilirsiniz.';
            window.pendingPasswordReset = null;
            setTimeout(() => {
                closeResetPasswordModal();
                if (typeof showToast === 'function') showToast('Şifre başarıyla güncellendi.');
                else alert('Şifre başarıyla güncellendi.');
            }, 1500);
        }
    } catch (error) {
        if (msgEl) msgEl.textContent = 'Hata: ' + error.message;
    }
}
