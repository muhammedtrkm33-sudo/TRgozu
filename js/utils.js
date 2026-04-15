// TR-GÖZÜ Yardımcı Fonksiyonlar

// Benzersiz ID oluştur
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * Fetch işlemini hata durumunda otomatik tekrar eder.
 * Şebeke kopmalarına ve zaman aşımlarına karşı dirençlidir.
 * @param {string} url
 * @param {object} options
 * @param {number} retries Tekrar sayısı (Varsayılan: 10 - Yüksek dayanıklılık için)
 * @param {number} backoff Bekleme süresi çarpanı (ms)
 */
async function fetchWithRetry(url, options = {}, retries = 10, backoff = 1500) {
    const timeout = options.timeout || 15000; // 15s varsayılan timeout
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    // Render ve Android WebView uyumu için en temel ayarlar
    options.mode = 'cors';
    options.credentials = 'omit';
    options.signal = controller.signal;

    if (!options.headers) {
        options.headers = { 'Content-Type': 'application/json' };
    } else if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(url, options);
        clearTimeout(id);

        // Sunucu bazlı geçici hatalar (5xx, 408, 429) durumunda tekrar dene
        if (!response.ok) {
            if (retries > 0 && (response.status >= 500 || response.status === 408 || response.status === 429)) {
                console.warn(`Sunucu hatası (${response.status}), ${backoff}ms içinde tekrar deneniyor... Kalan: ${retries}`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                return fetchWithRetry(url, options, retries - 1, Math.min(backoff * 1.5, 30000));
            }
        }
        return response;
    } catch (error) {
        clearTimeout(id);
        // Ağ bağlantısı yoksa veya koptuysa veya Timeout olduysa
        if (retries > 0) {
            const isTimeout = error.name === 'AbortError';
            const isOffline = !navigator.onLine;
            const waitTime = isOffline ? Math.max(backoff, 5000) : backoff;

            console.warn(`Ağ/Bağlantı hatası (${error.name}): ${error.message}. ${isOffline ? 'Cihaz çevrimdışı. ' : ''}${waitTime}ms sonra tekrar denenecek. Kalan: ${retries}`);

            await new Promise(resolve => setTimeout(resolve, waitTime));
            return fetchWithRetry(url, options, retries - 1, Math.min(backoff * 1.5, 30000));
        }
        console.error('Maksimum deneme sayısına ulaşıldı veya kritik hata:', error);
        throw error;
    }
}

// Mesafeyi hesapla (km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Konumu Türkçe formatla
function formatLocation(lat, lng) {
    if (lat === null || lng === null || lat === undefined || lng === undefined) return 'Konum Bilgisi Yok';
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Tarih formatla
function formatDate(date) {
    if (!date) return '-';
    try {
        const d = new Date(date);
        return d.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return '-';
    }
}

// Yaş hesapla
function calculateAge(birthDate) {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// Yön hesapla
function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

// Yön adı
function getDirectionName(bearing) {
    const directions = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
}

// HTML'yi temizle
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Local Storage yardımcıları
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Storage kayıt hatası:', e);
        return false;
    }
}

function getFromStorage(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        console.error('Storage okuma hatası:', e);
        return defaultValue;
    }
}

function removeFromStorage(key) {
    localStorage.removeItem(key);
}

// Debounce fonksiyonu
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Ses çal (Web Audio API ile alarm)
function playSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.warn('Audio API desteklenmiyor');
            return;
        }

        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        switch(type) {
            case 'sos':
                oscillator.frequency.value = 800;
                playSOSPattern(gainNode, audioContext);
                break;
            case 'alert':
                oscillator.frequency.value = 1200;
                playAlarmPattern(oscillator, gainNode, audioContext);
                break;
            case 'success':
                oscillator.frequency.value = 600;
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.5);
                break;
            default:
                oscillator.frequency.value = 500;
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.5);
        }
    } catch (e) {
        console.warn('Audio hatası:', e.message);
    }
}

function playAlarmPattern(oscillator, gainNode, audioContext) {
    const now = audioContext.currentTime;
    const bip = 0.15;
    const pause = 0.1;
    const duration = 3;

    oscillator.start(now);
    
    let time = now;
    while (time - now < duration) {
        gainNode.gain.setValueAtTime(0.6, time);
        time += bip;
        gainNode.gain.setValueAtTime(0, time);
        time += pause;
    }
    
    oscillator.stop(now + duration);
}

function playSOSPattern(gainNode, audioContext) {
    const now = audioContext.currentTime;
    const dit = 0.1;
    const dah = 0.3;
    const gap = 0.1;
    const letterGap = 0.3;

    let time = now;

    // S (dit dit dit)
    for (let i = 0; i < 3; i++) {
        gainNode.gain.setValueAtTime(0.5, time);
        time += dit;
        gainNode.gain.setValueAtTime(0, time);
        time += gap;
    }
    time += letterGap;

    // O (dah dah dah)
    for (let i = 0; i < 3; i++) {
        gainNode.gain.setValueAtTime(0.5, time);
        time += dah;
        gainNode.gain.setValueAtTime(0, time);
        time += gap;
    }
    time += letterGap;

    // S (dit dit dit)
    for (let i = 0; i < 3; i++) {
        gainNode.gain.setValueAtTime(0.5, time);
        time += dit;
        gainNode.gain.setValueAtTime(0, time);
        time += gap;
    }

    const oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 800;
    oscillator.connect(gainNode);
    oscillator.start(now);
    oscillator.stop(time);
}

// Bildirim gönder
function sendNotification(title, body, options = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body: body,
                icon: options.icon || 'assets/trgozu.jpg',
                badge: options.badge || 'assets/trgozu.jpg',
                tag: options.tag || 'trgozu-notification',
                requireInteraction: options.requireInteraction || false
            });
        } catch (e) {
            console.warn('Bildirim gönderilemedi:', e);
        }
    }
}

// Bildirim izni iste
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (e) {
            console.error('Bildirim izni hatası:', e);
        }
    }
    return Notification.permission === 'granted';
}

// Hava durumu ikonu
function getWeatherIcon(weatherMain) {
    const icons = {
        Clear: '☀️',
        Clouds: '☁️',
        Rain: '🌧️',
        Drizzle: '🌦️',
        Thunderstorm: '⛈️',
        Snow: '❄️',
        Mist: '🌫️',
        Fog: '🌫️',
        Haze: '🌫️'
    };
    return icons[weatherMain] || '🌡️';
}

// Risk seviyesi hesapla
function calculateRiskLevel(value, thresholds = { low: 30, medium: 60, high: 80 }) {
    if (value >= thresholds.high) return 'high';
    if (value >= thresholds.medium) return 'medium';
    if (value >= thresholds.low) return 'low';
    return 'none';
}

// Öncelik puanı hesapla
function calculatePriorityScore(factors) {
    let score = 0;
    if (factors.healthStatus === 'kritik') score += 50;
    if (factors.healthStatus === 'enkaz') score += 60;
    if (factors.healthStatus === 'yaraliyim') score += 30;
    if (factors.isSOS) score += 40;
    if (factors.isPanic) score += 30;
    if (factors.battery && factors.battery < 10) score += 20;
    if (factors.timeSinceActive < 5) score += 10;
    return Math.min(100, score);
}

// Hafifletilmiş tarih gösterimi
function timeAgo(date) {
    if (!date) return 'Belirsiz';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = {
        yıl: 31536000,
        ay: 2592000,
        hafta: 604800,
        gün: 86400,
        saat: 3600,
        dakika: 60
    };

    for (const [name, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${name} önce`;
        }
    }
    return 'Az önce';
}

// Para birimi formatla (TL)
function formatCurrency(amount) {
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY'
    }).format(amount);
}

// Telefon numarasını formatla
function formatPhoneNumber(phone) {
    if (!phone) return '-';
    const cleaned = ('' + phone).replace(/\D/g, '');
    const match = cleaned.match(/^(\d{4})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
        return '0' + match[1] + ' ' + match[2] + ' ' + match[3] + ' ' + match[4];
    }
    return phone;
}

// E-posta doğrula
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Telefon doğrula
function isValidPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 13;
}

// Sidebar aç/kapat (Mobil uyumlu)
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}
window.toggleSidebar = toggleSidebar;

// Konsola log yaz
function debugLog(...args) {
    if (typeof DEBUG !== 'undefined' && DEBUG) {
        console.log('[TR-GÖZÜ]', ...args);
    }
}
