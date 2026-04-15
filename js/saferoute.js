// TR-GOZU Güvenli Rota Modülü (ana hat: OSRM + map.js drawOSRMRoute)

let routeEnabled = false;
let dangerousZones = [];

// Güvenli rotayı göster
function showSafeRoute() {
    if (!STATE.currentLocation) {
        showToast('Konumunuzu aktif edin!');
        return;
    }

    routeEnabled = !routeEnabled;
    const btn = document.getElementById('btnRoute');

    if (btn) btn.classList.toggle('active', routeEnabled);

    if (routeEnabled) {
        calculateAndDisplayRoute();
    } else {
        clearRoute();
    }
}

// Rotayı temizle
function clearRoute() {
    if (typeof clearMapRouteLayer === 'function') {
        clearMapRouteLayer();
    }
    dangerousZones.forEach((z) => {
        try {
            if (window.map) window.map.removeLayer(z);
        } catch (e) {
            /* ignore */
        }
    });
    dangerousZones = [];
}

const SAFE_ROUTE_MAX_TARGETS = 15;

// Güvenli rotayı OSRM ile çiz - TÜM KURUM TÜRLERİNE ROTA
async function calculateAndDisplayRoute() {
    clearRoute();

    const { lat: startLat, lng: startLng } = STATE.currentLocation;

    let targets = [];

    // Tüm kurum türlerini dahil et
    const institutionTypes = [
        { key: 'hospitalsWithin5km', types: ['hospital'], color: '#9b59b6', label: 'Sağlık Kuruluşu' },
        { key: 'policeWithin5km', types: ['police'], color: '#3498db', label: 'Polis' },
        { key: 'fireWithin5km', types: ['fire'], color: '#e74c3c', label: 'İtfaiye' },
        { key: 'ambulanceWithin5km', types: ['ambulance'], color: '#f39c12', label: 'Ambulans' },
        { key: 'gendarmerieWithin5km', types: ['gendarmerie'], color: '#2c3e50', label: 'Jandarma' },
        { key: 'militaryWithin5km', types: ['military'], color: '#95a5a6', label: 'Askerî' },
        { key: 'governmentWithin5km', types: ['government'], color: '#f1c40f', label: 'Kamu' },
        { key: 'assembliesWithin5km', types: ['assembly', 'park', 'school', 'square'], color: '#2ecc71', label: 'Toplanma Alanı' }
    ];

    institutionTypes.forEach(({ key, types, color, label }) => {
        const institutions = STATE[key] || [];
        institutions.forEach((u) => {
            if (u.lat == null || u.lng == null) return;
            targets.push({
                lat: u.lat,
                lng: u.lng,
                color: color,
                type: types[0],
                label: label,
                popupHtml: `<b>${label}</b><br>${escapeHtml(u.name || 'İsimsiz')}<br><small style="color:#94a3b8">${label} çizgisi - OSRM yol</small>`
            });
        });
    });

    // Duplikasyonları temizle
    const dedup = new Set();
    targets = targets.filter((t) => {
        const k = `${Number(t.lat).toFixed(5)},${Number(t.lng).toFixed(5)}`;
        if (dedup.has(k)) return false;
        dedup.add(k);
        return true;
    });

    let capped = false;
    if (targets.length > SAFE_ROUTE_MAX_TARGETS) {
        targets = targets.slice(0, SAFE_ROUTE_MAX_TARGETS);
        capped = true;
    }

    // Eğer hiç hedef yoksa geniş arama yap veya mock data kullan
    if (targets.length === 0) {
        const searchTypes = ['hospital', 'police', 'fire', 'ambulance', 'gendarmerie', 'military', 'government', 'assembly'];
        for (const type of searchTypes) {
            const inst = typeof findNearestInstitution === 'function' ? await findNearestInstitution(type) : null;
            if (inst && inst.lat != null && inst.lng != null) {
                const color = type === 'hospital' ? '#9b59b6' :
                             type === 'police' ? '#3498db' :
                             type === 'fire' ? '#e74c3c' :
                             type === 'ambulance' ? '#f39c12' :
                             type === 'gendarmerie' ? '#2c3e50' :
                             type === 'military' ? '#95a5a6' :
                             type === 'government' ? '#f1c40f' : '#2ecc71';

                const label = type === 'hospital' ? 'Sağlık Kuruluşu' :
                             type === 'police' ? 'Polis' :
                             type === 'fire' ? 'İtfaiye' :
                             type === 'ambulance' ? 'Ambulans' :
                             type === 'gendarmerie' ? 'Jandarma' :
                             type === 'military' ? 'Askerî' :
                             type === 'government' ? 'Kamu' : 'Toplanma Alanı';

                targets.push({
                    lat: inst.lat,
                    lng: inst.lng,
                    color: color,
                    type: type,
                    label: label,
                    popupHtml: `<b>${label}</b> <small>(geniş arama)</small><br>${escapeHtml(inst.name || 'İsimsiz')}`
                });
                break; // Sadece bir tane ekle geniş aramadan
            }
        }

        // Eğer hala hiç kurum bulunamadıysa, mock data ekle
        if (targets.length === 0) {
            console.log('OSM verisi bulunamadı, mock data ekleniyor...');
            targets = generateMockInstitutions(startLat, startLng);
        }
    }

    if (targets.length === 0) {
        showToast('Yakında kurum bulunamadı. Konumu açıp bir süre bekleyin.');
        routeEnabled = false;
        const btn = document.getElementById('btnRoute');
        if (btn) btn.classList.remove('active');
        return;
    }

    if (typeof drawMultipleOSRMRoutes !== 'function') {
        showToast('Rota modülü yüklenemedi.');
        routeEnabled = false;
        const btn = document.getElementById('btnRoute');
        if (btn) btn.classList.remove('active');
        return;
    }

    if (targets.length > 1) {
        showToast(`${targets.length} kurum için rota hesaplanıyor, lütfen bekleyin`);
    }

    await drawMultipleOSRMRoutes(targets, startLat, startLng);

    // Tehlikeli bölgeleri göster
    const dangers = findDangerousZones();
    dangers.forEach((danger) => {
        const circle = L.circleMarker([danger.lat, danger.lng], {
            radius: 15,
            color: '#ff4757',
            fillColor: '#ff4757',
            fillOpacity: 0.5,
            weight: 2,
            dashArray: '5, 5'
        }).addTo(window.map);

        const reason = typeof escapeHtml === 'function' ? escapeHtml(danger.reason) : danger.reason;
        circle.bindPopup(`
            <b style="color: #ff4757">Dikkat gerektiren bölge</b><br>
            ${reason}
        `);

        dangerousZones.push(circle);
    });

    // En yakın konumları köşede göster
    showNearestLocations(targets);

    let msg = `${targets.length} kurum için rota çizildi.`;
    if (capped) {
        msg = `İlk ${SAFE_ROUTE_MAX_TARGETS} kurum gösterildi. ` + msg;
    }
    showToast(msg);
}

// Tehlikeli bölgeleri bul
function findDangerousZones() {
    const dangers = [];
    const sosList = typeof getSOSList === 'function' ? getSOSList() : [];
    const citizens = typeof getCitizens === 'function' ? getCitizens() : [];

    sosList.forEach((s) => {
        if (s.resolved) return;

        if (s.lat && s.lng && s.time) {
            const hoursSince = (Date.now() - new Date(s.time)) / 3600000;
            if (hoursSince < 24) {
                dangers.push({
                    lat: s.lat,
                    lng: s.lng,
                    reason: s.isPanic ? 'Panik sinyali' : 'SOS bildirimi',
                    severity: s.isPanic ? 'high' : 'medium'
                });
            }
        }
    });

    citizens.forEach((c) => {
        if (c.healthStatus === 'kritik' || c.healthStatus === 'enkaz') {
            if (c.lat && c.lng) {
                dangers.push({
                    lat: c.lat,
                    lng: c.lng,
                    reason: c.healthStatus === 'enkaz' ? 'Enkaz altında' : 'Kritik sağlık durumu',
                    severity: 'critical'
                });
            }
        }
    });

    const closedRoads = getFromStorage('closedRoads', []);
    closedRoads.forEach((road) => {
        dangers.push({
            lat: road.lat,
            lng: road.lng,
            reason: `Kapalı yol: ${road.name}`,
            severity: 'medium'
        });
    });

    return dangers;
}

// Yolu kapalı olarak işaretle
function markRoadAsClosed(lat, lng, name) {
    const closedRoads = getFromStorage('closedRoads', []);
    closedRoads.push({ lat, lng, name, time: new Date().toISOString() });
    saveToStorage('closedRoads', closedRoads);

    if (window.map) {
        L.circleMarker([lat, lng], {
            radius: 12,
            color: '#ff4757',
            fillColor: '#ff4757',
            fillOpacity: 0.5,
            weight: 3,
            dashArray: '8, 4'
        })
            .addTo(window.map)
            .bindPopup(`<b>Kapalı yol</b><br>${typeof escapeHtml === 'function' ? escapeHtml(name) : name}`);
    }

    showToast(`Yol kapalı olarak işaretlendi: ${name}`);
}

// Alternatif rota hesapla
function calculateAlternativeRoute(obstacles) {
    if (!STATE.currentLocation || !obstacles || obstacles.length === 0) return null;

    const alternatives = [];
    const { lat, lng } = STATE.currentLocation;

    const angles = [30, 60, 90, 120, 150];

    angles.forEach((angle) => {
        const rad = (angle * Math.PI) / 180;
        const newLat = lat + 0.01 * Math.cos(rad);
        const newLng = lng + 0.01 * Math.sin(rad);
        alternatives.push({ lat: newLat, lng: newLng, angle });
    });

    return alternatives;
}

// En yakın konumları köşede göster
function showNearestLocations(targets) {
    if (!targets || targets.length === 0 || !STATE.currentLocation) return;

    const { lat: userLat, lng: userLng } = STATE.currentLocation;

    // Mesafeye göre sırala
    const sortedTargets = targets
        .map(target => ({
            ...target,
            distance: calculateDistance(userLat, userLng, target.lat, target.lng)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 10);

    // Köşe panelini oluştur/güncelle
    let cornerPanel = document.getElementById('nearestLocationsPanel');
    if (!cornerPanel) {
        cornerPanel = document.createElement('div');
        cornerPanel.id = 'nearestLocationsPanel';
        cornerPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.95);
            border: 2px solid var(--primary);
            border-radius: 8px;
            padding: 12px;
            max-width: 320px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 1000;
            font-size: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            backdrop-filter: blur(10px);
        `;
        document.body.appendChild(cornerPanel);
    }

    cornerPanel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px; color: var(--primary); display: flex; align-items: center;">
            🏥 En Yakın Kurumlar
            <span style="margin-left: auto; font-size: 10px; background: var(--primary); color: white; padding: 2px 6px; border-radius: 10px;">${sortedTargets.length}</span>
        </div>
        ${sortedTargets.map((target, index) => {
            const capacity = target.type === 'hospital' ? simulateHospitalCapacity(target.name || 'Bilinmiyor') : null;
            const icon = getInstitutionIcon(target.type);
            const phone = getInstitutionPhone(target.type, target.name);
            const hours = getInstitutionHours(target.type);

            return `
            <div style="margin-bottom: 8px; padding: 8px; border-radius: 6px; background: ${target.color}15; border-left: 4px solid ${target.color};">
                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 14px; margin-right: 6px;">${icon}</span>
                    <div style="flex: 1;">
                        <div style="font-weight: bold; font-size: 11px; color: #333;">${index + 1}. ${target.label}</div>
                        <div style="font-size: 10px; color: #666; margin-top: 2px;">${target.name || 'İsimsiz'}</div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 10px; color: #666;">📍 ${target.distance.toFixed(1)} km</span>
                    ${capacity ? `<span style="font-size: 9px; background: #e8f5e8; color: #2e7d32; padding: 1px 4px; border-radius: 3px;">${capacity.available}/${capacity.totalBeds} yatak</span>` : ''}
                </div>

                ${phone ? `<div style="font-size: 9px; color: #666; margin-bottom: 2px;">📞 ${phone}</div>` : ''}
                ${hours ? `<div style="font-size: 9px; color: #666; margin-bottom: 4px;">⏰ ${hours}</div>` : ''}

                <div style="display: flex; gap: 4px;">
                    <button onclick="flyToLocation(${target.lat}, ${target.lng})" style="flex: 1; font-size: 9px; padding: 3px 6px; margin: 0; background: ${target.color}; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        Git
                    </button>
                    <button onclick="showInstitutionDetails('${target.type}', '${(target.name || 'İsimsiz').replace(/'/g, "\\'")}', ${target.lat}, ${target.lng}, ${target.distance.toFixed(1)})" style="font-size: 9px; padding: 3px 6px; margin: 0; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        Detay
                    </button>
                </div>
            </div>
        `}).join('')}
        <div style="text-align: center; margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;">
            <button onclick="document.getElementById('nearestLocationsPanel').remove()" style="font-size: 10px; padding: 6px 12px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Kapat
            </button>
        </div>
    `;
}

// Mock kurumlar oluştur
function generateMockInstitutions(lat, lng) {
    const institutions = [
        { type: 'hospital', name: 'Şehir Hastanesi', distance: 2.1 },
        { type: 'police', name: 'İl Emniyet Müdürlüğü', distance: 1.8 },
        { type: 'fire', name: 'İl İtfaiye Müdürlüğü', distance: 2.3 },
        { type: 'ambulance', name: '112 Acil Servis', distance: 1.5 },
        { type: 'gendarmerie', name: 'Jandarma Karakolu', distance: 3.2 },
        { type: 'military', name: 'Askerî Garnizon', distance: 4.1 },
        { type: 'government', name: 'Valilik Binası', distance: 2.8 },
        { type: 'park', name: 'Şehir Parkı', distance: 0.8 }
    ];

    return institutions.map((inst, index) => {
        const angle = (index * 45) * (Math.PI / 180);
        const distance = inst.distance * 0.009;
        const newLat = lat + distance * Math.cos(angle);
        const newLng = lng + distance * Math.sin(angle);

        const color = inst.type === 'hospital' ? '#9b59b6' :
                     inst.type === 'police' ? '#3498db' :
                     inst.type === 'fire' ? '#e74c3c' :
                     inst.type === 'ambulance' ? '#f39c12' :
                     inst.type === 'gendarmerie' ? '#2c3e50' :
                     inst.type === 'military' ? '#95a5a6' :
                     inst.type === 'government' ? '#f1c40f' : '#2ecc71';

        const label = inst.type === 'hospital' ? 'Sağlık Kuruluşu' :
                     inst.type === 'police' ? 'Polis' :
                     inst.type === 'fire' ? 'İtfaiye' :
                     inst.type === 'ambulance' ? 'Ambulans' :
                     inst.type === 'gendarmerie' ? 'Jandarma' :
                     inst.type === 'military' ? 'Askerî' :
                     inst.type === 'government' ? 'Kamu' : 'Toplanma Alanı';

        return {
            lat: newLat,
            lng: newLng,
            color: color,
            type: inst.type,
            label: label,
            name: inst.name,
            popupHtml: `<b>${label}</b> <small>(yaklaşık konum)</small><br>${escapeHtml(inst.name)}<br><small style="color:#94a3b8">~${inst.distance} km</small>`
        };
    });
}

// Kurum türüne göre ikon döndür
function getInstitutionIcon(type) {
    const icons = {
        hospital: '🏥',
        police: '👮',
        fire: '🚒',
        ambulance: '🚑',
        gendarmerie: '💂',
        military: '🎖️',
        government: '🏛️',
        park: '🌳',
        school: '🏫',
        square: '🏙️'
    };
    return icons[type] || '🏛️';
}

// Kurum türüne göre örnek telefon numarası
function getInstitutionPhone(type, name) {
    const phones = {
        hospital: '112',
        police: '155',
        fire: '110',
        ambulance: '112',
        gendarmerie: '156'
    };
    return phones[type] || '112';
}

// Kurum türüne göre çalışma saatleri
function getInstitutionHours(type) {
    const hours = {
        hospital: '24/7',
        police: '24/7',
        fire: '24/7',
        ambulance: '24/7',
        gendarmerie: '24/7',
        military: '24/7',
        government: '08:00-17:00',
        park: '7/24 Açık',
        school: '08:00-17:00'
    };
    return hours[type] || '7/24';
}

// Hastane kapasitesi simüle et
function simulateHospitalCapacity(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0;
    }
    const seed = Math.abs(hash);
    const totalBeds = 50 + (seed % 251);
    const occupancyPct = 50 + (seed % 46);
    const available = Math.round(totalBeds * (1 - occupancyPct / 100));
    return { totalBeds, occupancyPct, available };
}

// Kurum detaylarını göster
function showInstitutionDetails(type, name, lat, lng, distance) {
    const icon = getInstitutionIcon(type);
    const phone = getInstitutionPhone(type, name);
    const hours = getInstitutionHours(type);
    const capacity = type === 'hospital' ? simulateHospitalCapacity(name) : null;

    const details = `
        <b>${icon} ${name}</b><br>
        <small>Tür: ${type.charAt(0).toUpperCase() + type.slice(1)}</small><br>
        <small>Mesafe: ${distance} km</small><br>
        ${phone ? `<small>Telefon: ${phone}</small><br>` : ''}
        ${hours ? `<small>Saatler: ${hours}</small><br>` : ''}
        ${capacity ? `<small>Kapasite: ${capacity.available}/${capacity.totalBeds} yatak</small><br>` : ''}
        <small>Koordinatlar: ${lat.toFixed(4)}, ${lng.toFixed(4)}</small>
    `;

    if (window.map) {
        L.popup()
            .setLatLng([lat, lng])
            .setContent(details)
            .openOn(window.map);
    } else {
        showToast(details.replace(/<br>/g, '\n').replace(/<[^>]*>/g, ''));
    }
}
