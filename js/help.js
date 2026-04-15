// TR-GÖZÜ Akıllı Yardım Modülü

// Yardım talep modalını aç
function openHelpRequestModal() {
    const modal = document.getElementById('helpRequestModal');
    if (modal) modal.classList.remove('hidden');
}

// Yardım talep modalını kapat
function closeHelpRequestModal() {
    const modal = document.getElementById('helpRequestModal');
    if (modal) {
        modal.classList.add('hidden');
        const typeInput = document.getElementById('helpType');
        const descInput = document.getElementById('helpDesc');
        if (typeInput) typeInput.value = 'su';
        if (descInput) descInput.value = '';
    }
}

// Yardım talebi gönder
function submitHelpRequest() {
    const typeInput = document.getElementById('helpType');
    const descInput = document.getElementById('helpDesc');

    if (!typeInput || !descInput) return;

    const type = typeInput.value;
    const desc = descInput.value.trim();
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : null;

    if (!email) {
        showToast('Giriş yapmanız gerekiyor!');
        return;
    }

    const helpRequest = {
        id: typeof generateId === 'function' ? generateId() : Date.now().toString(),
        user: email,
        type,
        typeLabel: (CONFIG.HELP_TYPES && CONFIG.HELP_TYPES[type]?.label) || type,
        typeIcon: (CONFIG.HELP_TYPES && CONFIG.HELP_TYPES[type]?.icon) || '',
        description: desc,
        location: (window.STATE && window.STATE.currentLocation) ? window.STATE.currentLocation : null,
        priority: (CONFIG.HELP_TYPES && CONFIG.HELP_TYPES[type]?.priority) || 'low',
        status: 'pending',
        createdAt: new Date().toISOString()
    };

    // Yardım taleplerini kaydet
    const requests = getHelpRequests();
    requests.push(helpRequest);
    saveToStorage('helpRequests', requests);

    closeHelpRequestModal();
    loadHelpRequests();

    showToast('Yardım talebiniz iletildi!');
    if (typeof playSound === 'function') playSound('success');
}

// Yardım taleplerini al
function getHelpRequests() {
    return getFromStorage('helpRequests', []);
}

// Yardım taleplerini yükle
function loadHelpRequests() {
    const list = document.getElementById('helpRequestsList');
    if (!list) return;

    const requests = getHelpRequests();
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : null;

    // Kullanıcının taleplerini filtrele
    const userRequests = requests.filter(r => r.user === email);

    if (userRequests.length === 0) {
        list.innerHTML = '<p style="font-size: 11px; color: var(--text-dim); padding: 10px;">Henüz yardım talebiniz yok.</p>';
        return;
    }

    list.innerHTML = userRequests.map(r => `
        <div class="help-card" style="border-left: 4px solid ${getPriorityColor(r.priority)}; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 1.2rem;">${r.typeIcon || ''}</span>
                <span style="font-size: 10px; color: ${getPriorityColor(r.priority)}; font-weight: bold;">${r.priority.toUpperCase()}</span>
            </div>
            <div style="font-size: 13px; font-weight: 600; margin-top: 4px; color: #fff;">
                ${r.typeLabel}
            </div>
            ${r.description ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">${typeof escapeHtml === 'function' ? escapeHtml(r.description) : r.description}</div>` : ''}
            <div style="font-size: 10px; color: var(--text-dim); margin-top: 6px; display: flex; justify-content: space-between;">
                <span>${typeof timeSince === 'function' ? timeSince(r.createdAt) : r.createdAt}</span>
                <span style="color: ${getStatusColor(r.status)};">
                    ${getStatusIcon(r.status)} ${r.status.toUpperCase()}
                </span>
            </div>
        </div>
    `).join('');
}

// Öncelik rengini al
function getPriorityColor(priority) {
    const colors = {
        critical: '#ff4757',
        high: '#ffa502',
        medium: '#2ecc71',
        low: '#94a3b8'
    };
    return colors[priority] || '#94a3b8';
}

// Durum rengini al
function getStatusColor(status) {
    const colors = {
        pending: '#ffa502',
        in_progress: '#00d2ff',
        resolved: '#2ecc71',
        cancelled: '#94a3b8'
    };
    return colors[status] || '#94a3b8';
}

// Durum ikonu
function getStatusIcon(status) {
    const icons = {
        pending: '⏳',
        in_progress: '⚙️',
        resolved: '✅',
        cancelled: '❌'
    };
    return icons[status] || '';
}

// Admin: Tüm yardım taleplerini yükle
function loadAllHelpRequests() {
    const requests = getHelpRequests();

    if (requests.length === 0) {
        return '<p style="font-size: 11px; color: var(--text-dim); padding: 10px;">Yardım talebi yok.</p>';
    }

    return requests.map(r => `
        <div class="admin-card help-card" onclick="processHelpRequest('${r.id}')" style="border-left: 4px solid ${getPriorityColor(r.priority)};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 1.2rem;">${r.typeIcon || ''}</span>
                <span style="font-size: 10px; background: ${getPriorityColor(r.priority)}; padding: 2px 8px; border-radius: 8px; color: white; font-weight: bold;">
                    ${r.priority.toUpperCase()}
                </span>
            </div>
            <div style="font-size: 13px; font-weight: 600; margin-top: 4px; color: #fff;">
                ${r.typeLabel}
            </div>
            <div style="font-size: 11px; color: #94a3b8;">
                 👤 ${r.user}
            </div>
            ${r.location ? `
                <div style="font-size: 10px; color: #2ecc71; margin-top: 4px;">
                     📍 Konum paylaşıldı
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Yardım talebini işle
function processHelpRequest(requestId) {
    const requests = getHelpRequests();
    const request = requests.find(r => r.id === requestId);

    if (!request) return;

    // Haritaya git
    if (request.location && typeof flyToLocation === 'function') {
        flyToLocation(request.location.lat, request.location.lng, 16);
    }

    showToast(`${request.typeLabel} talebi seçildi.`);
}

// Yakın yardım taleplerini bul
function findNearbyHelpRequests(lat, lng, radiusKm = 5) {
    const requests = getHelpRequests();

    return requests.filter(r => {
        if (!r.location || r.status === 'resolved') return false;
        const dist = typeof calculateDistance === 'function' ? calculateDistance(lat, lng, r.location.lat, r.location.lng) : 999;
        return dist <= radiusKm;
    }).map(r => ({
        ...r,
        distance: typeof calculateDistance === 'function' ? calculateDistance(lat, lng, r.location.lat, r.location.lng) : 999
    })).sort((a, b) => {
        // Önce kritik, sonra mesafe
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.distance - b.distance;
    });
}
