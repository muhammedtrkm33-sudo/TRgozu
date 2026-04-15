// TR-GOZU A Ynlendirme Modl

// A ynlendirmeyi altr
async function runARouting() {
    const resultsDiv = document.getElementByd('routingResults');
    if (resultsDiv) {
        resultsDiv.innerHTML = '<p style="font-size: 11px; color: var(--text-dim);"> A analiz yapyor...</p>';
    }

    showToast('A ekip ynlendirme balatld...');

    const citizens = getCitizens();
    const sosList = getSOSList();
    const volunteers = getVolunteers();

    // SOS olanlar ncelikli grupla
    const urgentCases = citizens.filter(c =>
        c.isSOS || c.isPanic ||
        c.healthStatus === 'kritik' ||
        c.healthStatus === 'enkaz'
    );

    // Blgesel gruplama
    const regions = groupByRegion(urgentCases);

    // Ynlendirme nerileri
    const routing = [];

    for (const region of regions) {
        const center = calculateRegionCenter(region.cases);
        const teamCount = Math.ceil(region.cases.length / 3); // Her ekip max 3 vaka

        routing.push({
            region,
            center,
            teamCount,
            priority: calculateRegionPriority(region.cases)
        });

        // Haritaya iaretle
        if (window.map && region.cases.length > 0) {
            addRegionMarker(center.lat, center.lng, region.cases.length, region.priority);
        }
    }

    // U' gncelle
    if (resultsDiv) {
        resultsDiv.innerHTML = routing.map(r => `
            <div class="routing-card" style="border-left-color: ${getPriorityColor(r.priority)};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>Blge ${r.region.name || 'Merkez'}</strong>
                    <span style="background: ${getPriorityColor(r.priority)}; padding: 2px 8px; border-radius: 8px; font-size: 10px; color: white;">
                        ${r.priority.toUpperCase()}
                    </span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                     ${r.center.lat.toFixed(3)}, ${r.center.lng.toFixed(3)}<br>
                     ${r.cases.length} acil vaka<br>
                     ${r.teamCount} ekip gerekli
                </div>
                <button class="btn btn-outline btn-sm" style="margin-top: 8px; padding: 6px 10px;"
                        onclick="flyToLocation(${r.center.lat}, ${r.center.lng})">
                    Haritada Gster
                </button>
            </div>
        `).join('');
    }

    showToast(`A analiz tamamland! ${routing.length} blge tespit edildi.`);
}

// Blgeye gre grupla
function groupByRegion(cases) {
    const groups = {};

    cases.forEach(c => {
        if (!c.lat || !c.lng) return;

        // Koordinatlar 0.1 dereceye yuvarla (yaklak 11 km)
        const gridLat = Math.round(c.lat * 10) / 10;
        const gridLng = Math.round(c.lng * 10) / 10;
        const key = `${gridLat},${gridLng}`;

        if (!groups[key]) {
            groups[key] = {
                name: `Blge ${Object.keys(groups).length + 1}`,
                lat: gridLat,
                lng: gridLng,
                cases: []
            };
        }
        groups[key].cases.push(c);
    });

    return Object.values(groups);
}

// Blge merkezini hesapla
function calculateRegionCenter(cases) {
    if (cases.length === 0) {
        return { lat: 0, lng: 0 };
    }

    const totalLat = cases.reduce((sum, c) => sum + (c.lat || 0), 0);
    const totalLng = cases.reduce((sum, c) => sum + (c.lng || 0), 0);

    return {
        lat: totalLat / cases.length,
        lng: totalLng / cases.length
    };
}

// Blge nceliini hesapla
function calculateRegionPriority(cases) {
    let score = 0;

    cases.forEach(c => {
        if (c.isPanic) score += 30;
        if (c.isSOS) score += 20;
        if (c.healthStatus === 'enkaz') score += 25;
        if (c.healthStatus === 'kritik') score += 15;
        if (c.healthStatus === 'yaraliyim') score += 10;
    });

    if (score >= 70) return 'critical';
    if (score >= 40) return 'high';
    if (score >= 20) return 'medium';
    return 'low';
}

// ncelik rengini al
function getPriorityColor(priority) {
    const colors = {
        critical: 'var(--primary)',
        high: 'var(--warning)',
        medium: 'var(--secondary)',
        low: 'var(--success)'
    };
    return colors[priority] || 'var(--text-muted)';
}

// Blge marker ekle
function addRegionMarker(lat, lng, count, priority) {
    const color = getPriorityColor(priority);

    L.circleMarker([lat, lng], {
        radius: Math.min(30, count * 3),
        color: color,
        fillColor: color,
        fillOpacity: 0.4,
        weight: 3
    }).addTo(window.map).bindPopup(`
        <b style="color: ${color}">${count} Acil Vaka</b><br>
        ncelik: ${priority.toUpperCase()}
    `);
}

// Ekip ynlendirme nerisi al
function getTeamRecommendation(lat, lng) {
    const volunteers = findNearbyVolunteers(lat, lng, 10);
    const units = []; // fetchNearbyUnits arsndan gelecek

    return {
        volunteers: volunteers.slice(0, 5),
        nearestUnits: units.slice(0, 3),
        safestRoute: calculateSafestRoute(lat, lng)
    };
}

