// TR-GÖZÜ Aile Üyeleri Modülü

// Aile modalını aç
function openFamilyModal() {
    const modal = document.getElementById('familyModal');
    if (modal) modal.classList.remove('hidden');
}

// Aile modalını kapat
function closeFamilyModal() {
    const modal = document.getElementById('familyModal');
    if (modal) {
        modal.classList.add('hidden');
        const nameInput = document.getElementById('familyName');
        const phoneInput = document.getElementById('familyPhone');
        const relationInput = document.getElementById('familyRelation');
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (relationInput) relationInput.value = 'anne';
    }
}

// Aile üyesi ekle
function addFamilyMember() {
    const nameInput = document.getElementById('familyName');
    const phoneInput = document.getElementById('familyPhone');
    const relationInput = document.getElementById('familyRelation');

    if (!nameInput || !phoneInput || !relationInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const relation = relationInput.value;

    if (!name || !phone) {
        showToast('Ad ve telefon gerekli!');
        return;
    }

    if (typeof isValidPhone === 'function' && !isValidPhone(phone)) {
        showToast('Geçerli bir telefon numarası girin!');
        return;
    }

    const member = {
        id: typeof generateId === 'function' ? generateId() : Date.now().toString(),
        name,
        phone,
        relation,
        relationLabel: relationInput.options[relationInput.selectedIndex].text,
        addedAt: new Date().toISOString(),
        location: null
    };

    // Aile üyelerini kaydet
    const family = getFamilyMembers();
    family.push(member);
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'default';
    saveToStorage(`family_${email}`, family);

    closeFamilyModal();
    loadFamilyMembers();

    showToast('Aile üyesi eklendi!');
}

// Aile üyelerini al
function getFamilyMembers() {
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : null;
    if (!email) return [];
    return getFromStorage(`family_${email}`, []);
}

// Aile üyelerini yükle
function loadFamilyMembers() {
    const list = document.getElementById('familyList');
    if (!list) return;

    const family = getFamilyMembers();

    if (family.length === 0) {
        list.innerHTML = '<p style="font-size: 11px; color: var(--text-dim); padding: 10px;">Henüz aile üyesi eklenmemiş.</p>';
        return;
    }

    list.innerHTML = family.map(m => `
        <div class="family-card" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #fff;">${typeof escapeHtml === 'function' ? escapeHtml(m.name) : m.name}</span>
                <span style="font-size: 11px; color: var(--secondary);">${m.relationLabel || m.relation}</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
                 📞 ${typeof formatPhoneNumber === 'function' ? formatPhoneNumber(m.phone) : m.phone}
            </div>
            ${m.location ? `
                <div style="font-size: 10px; color: #2ecc71; margin-top: 4px;">
                     📍 Son görülme: ${typeof timeSince === 'function' ? timeSince(m.lastSeen) : m.lastSeen}
                </div>
            ` : ''}
            <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button class="btn btn-outline btn-sm" style="flex: 1; padding: 6px; font-size: 11px;"
                        onclick="callFamilyMember('${m.phone}')">
                    Ara
                </button>
                <button class="btn btn-outline btn-sm" style="flex: 1; padding: 6px; font-size: 11px; border-color: rgba(255,71,87,0.3); color: #ff4757;"
                        onclick="removeFamilyMember('${m.id}')">
                    Sil
                </button>
            </div>
        </div>
    `).join('');
}

// Aile üyesini ara
function callFamilyMember(phone) {
    window.location.href = `tel:${phone}`;
    showToast('Arama başlatılıyor...');
}

// Aile üyesini sil
function removeFamilyMember(id) {
    if (!confirm('Aile üyesini silmek istediğinize emin misiniz?')) return;

    let family = getFamilyMembers();
    family = family.filter(m => m.id !== id);
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'default';
    saveToStorage(`family_${email}`, family);
    loadFamilyMembers();

    showToast('Aile üyesi silindi.');
}

// Aile üyesinin konumunu güncelle
function updateFamilyMemberLocation(memberId, lat, lng) {
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'default';
    let family = getFromStorage(`family_${email}`, []);

    const member = family.find(m => m.id === memberId);
    if (member) {
        member.location = { lat, lng };
        member.lastSeen = new Date().toISOString();
        saveToStorage(`family_${email}`, family);
    }
}

// Aile üyelerinin konumlarını haritada göster
function showFamilyOnMap() {
    if (!window.map) return;
    const family = getFamilyMembers();

    family.forEach(m => {
        if (m.location && m.location.lat && m.location.lng) {
            L.circleMarker([m.location.lat, m.location.lng], {
                radius: 10,
                color: '#00d2ff',
                fillColor: '#00d2ff',
                fillOpacity: 0.5,
                weight: 2
            }).addTo(window.map).bindPopup(`
                <b>👨‍👩‍👧‍👦 ${typeof escapeHtml === 'function' ? escapeHtml(m.name) : m.name}</b><br>
                ${m.relationLabel || m.relation}<br>
                Son görülme: ${typeof timeSince === 'function' ? timeSince(m.lastSeen) : m.lastSeen}
            `);
        }
    });
}
// TR-GÖZÜ Aile Üyeleri Modülü

// Aile modalını aç
function openFamilyModal() {
    const modal = document.getElementById('familyModal');
    if (modal) modal.classList.remove('hidden');
}

// Aile modalını kapat
function closeFamilyModal() {
    const modal = document.getElementById('familyModal');
    if (modal) {
        modal.classList.add('hidden');
        const nameInput = document.getElementById('familyName');
        const phoneInput = document.getElementById('familyPhone');
        const relationInput = document.getElementById('familyRelation');
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (relationInput) relationInput.value = 'anne';
    }
}

// Aile üyesi ekle
function addFamilyMember() {
    const nameInput = document.getElementById('familyName');
    const phoneInput = document.getElementById('familyPhone');
    const relationInput = document.getElementById('familyRelation');

    if (!nameInput || !phoneInput || !relationInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const relation = relationInput.value;

    if (!name || !phone) {
        showToast('Ad ve telefon gerekli!');
        return;
    }

    if (typeof isValidPhone === 'function' && !isValidPhone(phone)) {
        showToast('Geçerli bir telefon numarası girin!');
        return;
    }

    const member = {
        id: typeof generateId === 'function' ? generateId() : Date.now().toString(),
        name,
        phone,
        relation,
        relationLabel: relationInput.options[relationInput.selectedIndex].text,
        addedAt: new Date().toISOString(),
        location: null
    };

    // Aile üyelerini kaydet
    const family = getFamilyMembers();
    family.push(member);
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'default';
    saveToStorage(`family_${email}`, family);

    closeFamilyModal();
    loadFamilyMembers();

    showToast('Aile üyesi eklendi!');
}

// Aile üyelerini al
function getFamilyMembers() {
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : null;
    if (!email) return [];
    return getFromStorage(`family_${email}`, []);
}

// Aile üyelerini yükle
function loadFamilyMembers() {
    const list = document.getElementById('familyList');
    if (!list) return;

    const family = getFamilyMembers();

    if (family.length === 0) {
        list.innerHTML = '<p style="font-size: 11px; color: var(--text-dim); padding: 10px;">Henüz aile üyesi eklenmemiş.</p>';
        return;
    }

    list.innerHTML = family.map(m => `
        <div class="family-card" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #fff;">${typeof escapeHtml === 'function' ? escapeHtml(m.name) : m.name}</span>
                <span style="font-size: 11px; color: var(--secondary);">${m.relationLabel || m.relation}</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
                 📞 ${typeof formatPhoneNumber === 'function' ? formatPhoneNumber(m.phone) : m.phone}
            </div>
            ${m.location ? `
                <div style="font-size: 10px; color: #2ecc71; margin-top: 4px;">
                     📍 Son görülme: ${typeof timeSince === 'function' ? timeSince(m.lastSeen) : m.lastSeen}
                </div>
            ` : ''}
            <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button class="btn btn-outline btn-sm" style="flex: 1; padding: 6px; font-size: 11px;"
                        onclick="callFamilyMember('${m.phone}')">
                    Ara
                </button>
                <button class="btn btn-outline btn-sm" style="flex: 1; padding: 6px; font-size: 11px; border-color: rgba(255,71,87,0.3); color: #ff4757;"
                        onclick="removeFamilyMember('${m.id}')">
                    Sil
                </button>
            </div>
        </div>
    `).join('');
}

// Aile üyesini ara
function callFamilyMember(phone) {
    window.location.href = `tel:${phone}`;
    showToast('Arama başlatılıyor...');
}

// Aile üyesini sil
function removeFamilyMember(id) {
    if (!confirm('Aile üyesini silmek istediğinize emin misiniz?')) return;

    let family = getFamilyMembers();
    family = family.filter(m => m.id !== id);
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'default';
    saveToStorage(`family_${email}`, family);
    loadFamilyMembers();

    showToast('Aile üyesi silindi.');
}

// Aile üyesinin konumunu güncelle
function updateFamilyMemberLocation(memberId, lat, lng) {
    const email = typeof getCurrentUserEmail === 'function' ? getCurrentUserEmail() : 'default';
    let family = getFromStorage(`family_${email}`, []);

    const member = family.find(m => m.id === memberId);
    if (member) {
        member.location = { lat, lng };
        member.lastSeen = new Date().toISOString();
        saveToStorage(`family_${email}`, family);
    }
}

// Aile üyelerinin konumlarını haritada göster
function showFamilyOnMap() {
    if (!window.map) return;
    const family = getFamilyMembers();

    family.forEach(m => {
        if (m.location && m.location.lat && m.location.lng) {
            L.circleMarker([m.location.lat, m.location.lng], {
                radius: 10,
                color: '#00d2ff',
                fillColor: '#00d2ff',
                fillOpacity: 0.5,
                weight: 2
            }).addTo(window.map).bindPopup(`
                <b>👨‍👩‍👧‍👦 ${typeof escapeHtml === 'function' ? escapeHtml(m.name) : m.name}</b><br>
                ${m.relationLabel || m.relation}<br>
                Son görülme: ${typeof timeSince === 'function' ? timeSince(m.lastSeen) : m.lastSeen}
            `);
        }
    });
}
