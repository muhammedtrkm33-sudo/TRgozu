// TR-GÖZÜ Kayıp Kişi Modülü

// Kayıp kişi modalını aç
function openMissingPersonModal() {
    const modal = document.getElementById('missingPersonModal');
    if (modal) modal.classList.remove('hidden');
}

// Kayıp kişi modalını kapat
function closeMissingPersonModal() {
    const modal = document.getElementById('missingPersonModal');
    if (modal) {
        modal.classList.add('hidden');
        // Formu temizle
        const elements = ['missingName', 'missingAge', 'missingGender', 'missingLastSeen', 'missingLastSeenTime', 'missingNotes'];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id === 'missingGender') el.value = 'erkek';
                else el.value = '';
            }
        });
    }
}

// Kayıp kişi bildir
function submitMissingPerson() {
    const nameInput = document.getElementById('missingName');
    const ageInput = document.getElementById('missingAge');
    const genderInput = document.getElementById('missingGender');
    const lastSeenInput = document.getElementById('missingLastSeen');
    const lastSeenTimeInput = document.getElementById('missingLastSeenTime');
    const notesInput = document.getElementById('missingNotes');

    if (!nameInput) return;

    const name = nameInput.value.trim();
    const age = ageInput ? ageInput.value.trim() : '';
    const gender = genderInput ? genderInput.value : 'erkek';
    const lastSeen = lastSeenInput ? lastSeenInput.value.trim() : '';
    const lastSeenTime = lastSeenTimeInput ? lastSeenTimeInput.value : '';
    const notes = notesInput ? notesInput.value.trim() : '';
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'anonim';

    if (!name) {
        showToast('İsim gerekli!');
        return;
    }

    const missing = {
        id: typeof generateId === 'function' ? generateId() : Date.now().toString(),
        reportedBy: email,
        name,
        age: age ? parseInt(age, 10) : null,
        gender,
        lastSeen,
        lastSeenTime: lastSeenTime || null,
        notes,
        location: (window.STATE && window.STATE.currentLocation) ? window.STATE.currentLocation : null,
        status: 'missing',
        found: false,
        createdAt: new Date().toISOString()
    };

    // Kayıp kişileri kaydet
    const missingList = getMissingPersons();
    missingList.push(missing);
    saveToStorage('missingPersons', missingList);

    closeMissingPersonModal();
    loadMissingPersons();

    showToast('Kayıp kişi bildirildi!');
    if (typeof playSound === 'function') playSound('alert');
}

// Kayıp kişileri al
function getMissingPersons() {
    return getFromStorage('missingPersons', []);
}

// Kayıp kişileri yükle
function loadMissingPersons() {
    const list = document.getElementById('missingPersonList');
    if (!list) return;

    const missingList = getMissingPersons();

    // Sadece bulunmamışları göster
    const active = missingList.filter(m => !m.found);

    if (active.length === 0) {
        list.innerHTML = '<p style="font-size: 11px; color: var(--text-dim); padding: 10px;">Henüz kayıp kişi bildirimi yok.</p>';
        return;
    }

    list.innerHTML = active.map(m => `
        <div class="missing-card" onclick="viewMissingPerson('${m.id}')" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,71,87,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #fff;">${typeof escapeHtml === 'function' ? escapeHtml(m.name) : m.name}</span>
                ${m.age ? `<span style="font-size: 11px; color: #94a3b8;">${m.age} yaş</span>` : ''}
            </div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
                ${getGenderIcon(m.gender)} ${m.gender === 'erkek' ? 'Erkek' : m.gender === 'kadin' ? 'Kadın' : 'Diğer'}
            </div>
            ${m.lastSeen ? `
                <div style="font-size: 10px; color: #ffa502; margin-top: 4px;">
                     📍 Son görülme: ${typeof escapeHtml === 'function' ? escapeHtml(m.lastSeen) : m.lastSeen}
                </div>
            ` : ''}
            <div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">
                👤 Bildiren: ${m.reportedBy}
            </div>
            ${(window.STATE && window.STATE.userRole === 'admin') ? `
                <button class="btn btn-success btn-sm" style="margin-top: 8px; padding: 6px; width: 100%; font-size: 11px;"
                        onclick="markAsFound('${m.id}', event)">
                     ✅ Bulundu İşaretle
                </button>
            ` : ''}
        </div>
    `).join('');
}

// Kayıp kişiyi görüntüle
function viewMissingPerson(id) {
    const missingList = getMissingPersons();
    const person = missingList.find(m => m.id === id);

    if (!person) return;

    // Haritaya git
    if (person.location && typeof flyToLocation === 'function') {
        flyToLocation(person.location.lat, person.location.lng, 15);
        if (typeof addMarkerToMap === 'function') {
            addMarkerToMap(person.location.lat, person.location.lng, '#ff4757', `Kayıp: ${person.name}`);
        }
    }

    // Detay göster (Modern bir modal yerine basit alert şimdilik)
    alert(`
        🔍 Kayıp Kişi Bilgileri
        
        İsim: ${person.name}
        Yaş: ${person.age || 'Bilgi yok'}
        Cinsiyet: ${person.gender === 'erkek' ? 'Erkek' : person.gender === 'kadin' ? 'Kadın' : 'Diğer'}
        Son Görülme: ${person.lastSeen || 'Bilgi yok'}
        Son Görülme Zamanı: ${person.lastSeenTime ? person.lastSeenTime : 'Bilgi yok'}
        Notlar: ${person.notes || 'Yok'}
        Bildiren: ${person.reportedBy}
    `);
}

// Bulundu işaretle
function markAsFound(id, event) {
    if (event) event.stopPropagation();

    if (!confirm('Bu kişiyi bulundu olarak işaretlemek istediğinize emin misiniz?')) return;

    let missingList = getMissingPersons();
    const person = missingList.find(m => m.id === id);

    if (person) {
        person.found = true;
        person.foundAt = new Date().toISOString();
        person.foundBy = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'admin';
        saveToStorage('missingPersons', missingList);
        loadMissingPersons();

        showToast(`${person.name} bulundu olarak işaretlendi!`);
        if (typeof playSound === 'function') playSound('success');
    }
}

// Cinsiyet ikonu
function getGenderIcon(gender) {
    if (gender === 'erkek') return '👨';
    if (gender === 'kadin') return '👩';
    return '👤';
}

// Kayıp kişiyi haritada göster
function showMissingPersonsOnMap() {
    if (!window.map) return;
    const missingList = getMissingPersons();
    const active = missingList.filter(m => !m.found);

    active.forEach(m => {
        if (m.location && m.location.lat && m.location.lng) {
            L.circleMarker([m.location.lat, m.location.lng], {
                radius: 12,
                color: '#ff4757',
                fillColor: '#ff4757',
                fillOpacity: 0.5,
                weight: 2
            }).addTo(window.map).bindPopup(`
                <b style="color: #ff4757">🔍 Kayıp Kişi</b><br>
                <b>${typeof escapeHtml === 'function' ? escapeHtml(m.name) : m.name}</b><br>
                ${m.age ? `${m.age} yaş` : ''}<br>
                Son görülme: ${typeof escapeHtml === 'function' ? escapeHtml(m.lastSeen || '-') : (m.lastSeen || '-')}
            `);
        }
    });
}

// Admin: Kayıp kişileri haritada göster
function loadAdminMissingPersons() {
    const list = document.getElementById('missingPersonList');
    if (!list) return;

    const missingList = getMissingPersons();

    if (missingList.length === 0) {
        list.innerHTML = '<p style="font-size: 11px; color: var(--text-dim); padding: 10px;">Henüz kayıt yok.</p>';
        return;
    }

    list.innerHTML = missingList.map(m => {
        const statusClass = m.found ? 'background: rgba(46,204,113,0.1); border-color: rgba(46,204,113,0.3);' : '';
        const statusBadge = m.found ? '✅ BULUNDU' : '🔍 KAYIP';

        return `
            <div class="admin-card missing-card" style="${statusClass} margin-bottom: 8px; padding: 10px; border-radius: 8px;" onclick="viewMissingPerson('${m.id}')">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: #fff;">${typeof escapeHtml === 'function' ? escapeHtml(m.name) : m.name}</span>
                    <span style="font-size: 10px; color: ${m.found ? '#2ecc71' : '#ff4757'}; font-weight: bold;">
                        ${statusBadge}
                    </span>
                </div>
                ${m.location ? `
                    <div style="font-size: 10px; color: #2ecc71; margin-top: 4px;">
                         📍 Konum kaydedildi
                    </div>
                ` : ''}
                <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
                     👤 Bildiren: ${m.reportedBy}
                </div>
            </div>
        `;
    }).join('');
}
