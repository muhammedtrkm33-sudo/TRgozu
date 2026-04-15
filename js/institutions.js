// TR-GOZU Kurum ve Kurulu Modl (Hastane Kapasitesi + OSRM Rota)

let selectedInstitution = null;

// Mock kurum detayları üret (adres, telefon, çalışma saatleri)
function generateMockInstitutionDetails(name, type) {
    // Hash tabanl tutarl mock veriler
    let hash = 0;
    const combined = name + type;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash) + combined.charCodeAt(i);
        hash |= 0;
    }
    const seed = Math.abs(hash);

    // Mock adresler
    const streets = ['Atatrk Caddesi', 'İstiklal Sokak', 'Cumhuriyet Bulvar', 'Gazi Mustafa Kemal Caddesi', 'İnn Sokak', 'Zafer Caddesi', 'Bar Bulvar', 'zgrlk Sokak'];
    const districts = ['Merkez', 'Yeniehir', 'ankaya', 'Kadky', 'skdar', 'Beikta', 'ili', 'Bakrky', 'mraniye', 'Pendik'];
    const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep'];

    const street = streets[seed % streets.length];
    const district = districts[(seed >> 8) % districts.length];
    const city = cities[(seed >> 16) % cities.length];
    const buildingNo = 10 + (seed % 190);
    const address = `${street} No:${buildingNo}, ${district}, ${city}`;

    // Mock telefonlar
    const areaCodes = ['216', '212', '232', '224', '242', '322', '332', '342'];
    const areaCode = areaCodes[seed % areaCodes.length];
    const phone1 = 1000000 + (seed % 9000000);
    const phone2 = 1000000 + ((seed >> 8) % 9000000);
    const phone = `(${areaCode}) ${phone1.toString().slice(0,3)}-${phone1.toString().slice(3)}`;

    // Mock alma saatleri
    const hourTypes = [
        '24 Saat Ak',
        '08:00-18:00',
        '09:00-17:00',
        '07:00-19:00',
        '24 Saat Acil Servis',
        '08:00-20:00',
        '06:00-22:00'
    ];
    const hours = hourTypes[seed % hourTypes.length];

    return { address, phone, hours };
}

// Hastane kapasitesi simle et (isim hash tabanl)
function simulateHospitalCapacity(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0;
    }
    const seed = Math.abs(hash);
    const totalBeds = 50 + (seed % 251);         // 50-300 yatak
    const occupancyPct = 50 + (seed % 46);        // %50-95 doluluk
    const available = Math.round(totalBeds * (1 - occupancyPct / 100));
    const emergencyOk = (seed % 3) !== 0;         // 2/3 orannda acil kapasitesi var

    return { totalBeds, occupancyPct, available, emergencyOk };
}

// Kurumlar yükle
async function loadInstitutions() {
    if (!STATE.currentLocation) {
        showToast('Konumunuzu aktif edin!');
        return;
    }

    showLoading(true);

    const units = await fetchNearbyUnits(
        STATE.currentLocation.lat,
        STATE.currentLocation.lng,
        20000
    );

    showLoading(false);

    const list = document.getElementById('institutionList');
    if (!list) return;

    if (units.length === 0) {
        list.innerHTML = '<p style="font-size: 11px; color: var(--text-dim);">Yaknda kurum bulunamad.</p>';
        return;
    }

    const hospitals = units.filter(u => u.type === 'hospital');
    const assembly = units.filter(u => ['assembly', 'park', 'school', 'square'].includes(u.type));
    const emergency = units.filter(u => ['police', 'fire', 'ambulance', 'gendarmerie', 'military'].includes(u.type));
    const government = units.filter(u => u.type === 'government');

    const lim = 8;
    list.innerHTML = `
        ${hospitals.length > 0 ? `
            <div style="margin-bottom: 10px;">
                <div style="font-size: 10px; color: var(--hospital); font-weight: 600; margin-bottom: 5px;"> HASTANE / SALK</div>
                ${hospitals.slice(0, lim).map(u => institutionCard(u)).join('')}
            </div>
        ` : ''}
        ${assembly.length > 0 ? `
            <div style="margin-bottom: 10px;">
                <div style="font-size: 10px; color: var(--success); font-weight: 600; margin-bottom: 5px;"> TOPLANMA / OKUL / MEYDAN</div>
                ${assembly.slice(0, lim).map(u => institutionCard(u)).join('')}
            </div>
        ` : ''}
        ${emergency.length > 0 ? `
            <div style="margin-bottom: 10px;">
                <div style="font-size: 10px; color: var(--warning); font-weight: 600; margin-bottom: 5px;"> POLİS  İTFAİYE  AMBULANS  JANDARMA</div>
                ${emergency.slice(0, lim).map(u => institutionCard(u)).join('')}
            </div>
        ` : ''}
        ${government.length > 0 ? `
            <div style="margin-bottom: 10px;">
                <div style="font-size: 10px; color: var(--secondary); font-weight: 600; margin-bottom: 5px;"> KAMU (KAYMAKAMLK / VALİLİK / KURUM)</div>
                ${government.slice(0, lim).map(u => institutionCard(u)).join('')}
            </div>
        ` : ''}
    `;
}

// Kurum kart HTML (hastanelere kapasite bilgisi eklendi + detayl bilgiler)
function institutionCard(unit) {
    const distance = STATE.currentLocation
        ? calculateDistance(
            STATE.currentLocation.lat, STATE.currentLocation.lng,
            unit.lat, unit.lng
          ).toFixed(1) + ' km'
        : '-';

    const icons = {
        hospital: '', police: '', fire: '',
        ambulance: '', assembly: '', park: '',
        school: '', square: '', unknown: '',
        gendarmerie: '', military: '', government: ''
    };

    // Mock detay bilgileri (gerçek OSM verisi yok)
    const mockDetails = generateMockInstitutionDetails(unit.name, unit.type);

    let capacityHtml = '';
    if (unit.type === 'hospital') {
        const cap = simulateHospitalCapacity(unit.name);
        const occColor = cap.occupancyPct >= 90 ? '#ff4757'
            : cap.occupancyPct >= 75 ? '#ffa502' : '#2ecc71';
        const occBar = Math.round(cap.occupancyPct);

        capacityHtml = `
            <div class="hospital-capacity">
                <div style="display:flex;justify-content:space-between;margin-bottom:2px">
                    <span style="color:#aaa;font-size:10px">Doluluk</span>
                    <span style="color:${occColor};font-weight:bold;font-size:10px">%${occBar}</span>
                </div>
                <div style="background:rgba(255,255,255,0.1);border-radius:3px;height:4px;overflow:hidden">
                    <div style="background:${occColor};height:100%;width:${occBar}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:2px;font-size:10px;color:#888">
                    <span>Toplam: ${cap.totalBeds} yatak</span>
                    <span style="color:${cap.available > 0 ? '#2ecc71' : '#ff4757'}">Bo: ${cap.available}</span>
                    <span>${cap.emergencyOk ? ' Acil OK' : ' Acil Dolu'}</span>
                </div>
            </div>
        `;
    }

    return `
        <div class="institution-card" onclick="selectInstitution(${unit.lat}, ${unit.lng}, '${escapeHtml(unit.name)}', '${unit.type}')">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 1.2rem;">${icons[unit.type] || ''}</span>
                <span style="font-size: 11px; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 10px;">${distance}</span>
            </div>
            <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; line-height: 1.3;">${escapeHtml(unit.name)}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">
                 ${escapeHtml(mockDetails.address)}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">
                 ${mockDetails.phone}
            </div>
            <div style="font-size: 10px; color: var(--text-dim); margin-bottom: 6px;">
                 ${mockDetails.hours}
            </div>
            ${capacityHtml}
        </div>
    `;
}

// Kurum seç - OSRM rota kullan
async function selectInstitution(lat, lng, name, type) {
    selectedInstitution = { lat, lng, name, type };

    if (window.map) {
        flyToLocation(lat, lng, 15);
    }

    if (STATE.currentLocation && typeof drawOSRMRoute === 'function') {
        const colors = {
            hospital: '#ffffff', assembly: '#2ecc71', park: '#27ae60',
            school: '#f39c12', police: '#c20000', fire: '#e67e22',
            ambulance: '#e74c3c', square: '#1abc9c',
            gendarmerie: '#8e44ad', military: '#5d4e75', government: '#16a085'
        };
        showToast(`${name} iin rota hesaplanyor...`);
        await drawOSRMRoute(
            STATE.currentLocation.lat, STATE.currentLocation.lng,
            lat, lng,
            colors[type] || '#00d2ff',
            name
        );
    } else if (STATE.currentLocation) {
        addMarkerToMap(lat, lng, '#2ecc71', `${type.toUpperCase()}: ${name}`);
    }

    showToast(`${name} seildi  rota izildi.`);
}

// Kurum modalın aç
function openInstitutionModal() {
    const modal = document.getElementById('institutionModal');
    if (modal) {
        modal.classList.remove('hidden');
        loadInstitutions();
    }
}

// Kurum modalın kapat
function closeInstitutionModal() {
    const modal = document.getElementById('institutionModal');
    if (modal) modal.classList.add('hidden');
}

// Kuruma rotayı göster
async function navigateToInstitution() {
    if (!selectedInstitution) {
        showToast('Lütfen önce bir kurum seçin!');
        return;
    }

    if (STATE.currentLocation && typeof drawOSRMRoute === 'function') {
        await drawOSRMRoute(
            STATE.currentLocation.lat, STATE.currentLocation.lng,
            selectedInstitution.lat, selectedInstitution.lng,
            '#2ecc71',
            selectedInstitution.name
        );
    } else if (window.map && STATE.currentLocation) {
        window.map.fitBounds([
            [STATE.currentLocation.lat, STATE.currentLocation.lng],
            [selectedInstitution.lat, selectedInstitution.lng]
        ], { padding: [50, 50] });
    }

    closeInstitutionModal();
    showToast('Rota çizildi! Haritayı takip edin.');
}

// En yakın kurumu bul
async function findNearestInstitution(type) {
    if (!STATE.currentLocation) return null;

    const units = await fetchNearbyUnits(
        STATE.currentLocation.lat,
        STATE.currentLocation.lng,
        30000
    );

    const typeGroups = {
        assembly: ['assembly', 'park', 'school', 'square'],
        hospital: ['hospital'],
        emergency: ['police', 'fire', 'ambulance', 'gendarmerie', 'military'],
        government: ['government']
    };

    const allowedTypes = typeGroups[type] || [type];
    const filtered = units.filter(u => allowedTypes.includes(u.type));

    if (filtered.length === 0) return null;

    filtered.sort((a, b) => {
        const da = calculateDistance(STATE.currentLocation.lat, STATE.currentLocation.lng, a.lat, a.lng);
        const db = calculateDistance(STATE.currentLocation.lat, STATE.currentLocation.lng, b.lat, b.lng);
        return da - db;
    });

    return filtered[0];
}

// Tüm kurumlar haritaya ekle
async function addAllInstitutionsToMap() {
    if (!STATE.currentLocation) return;

    const units = await fetchNearbyUnits(
        STATE.currentLocation.lat,
        STATE.currentLocation.lng,
        20000
    );

    units.forEach(unit => {
        if (typeof addUnitMarker === 'function') {
            addUnitMarker(unit);
        }
    });
}

