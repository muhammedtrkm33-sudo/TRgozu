const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const app = express();

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, '.data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const USERS_FILE = path.join(DATA_DIR, 'citizens.json');
const SOS_FILE = path.join(DATA_DIR, 'sos.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const VOLUNTEERS_FILE = path.join(DATA_DIR, 'volunteers.json');
const SESSION_COOKIE = 'trgozu_session';
const sessions = new Map();
const loginAttempts = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const weatherRequests = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
});

const readJSON = (file) => {
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
};
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

function getSessionToken(req) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/(?:^|;\s*)trgozu_session=([^;]+)/);
    return match ? match[1] : '';
}

function issueSession(res, session) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { ...session, expiresAt: Date.now() + SESSION_TTL_MS });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
}

function checkLoginRate(req, res) {
    const key = req.ip;
    const now = Date.now();
    const record = loginAttempts.get(key);
    if (record && now - record.startedAt < RATE_WINDOW_MS && record.count >= MAX_LOGIN_ATTEMPTS) {
        res.status(429).json({ success: false, message: 'Çok fazla giriş denemesi. Daha sonra tekrar deneyin.' });
        return false;
    }
    if (!record || now - record.startedAt >= RATE_WINDOW_MS) loginAttempts.set(key, { startedAt: now, count: 1 });
    else record.count += 1;
    return true;
}

function checkWeatherRate(req, res) {
    const now = Date.now();
    const record = weatherRequests.get(req.ip);
    if (record && now - record.startedAt < RATE_WINDOW_MS && record.count >= 120) {
        res.status(429).json({ error: 'İstek sınırına ulaşıldı.' });
        return false;
    }
    if (!record || now - record.startedAt >= RATE_WINDOW_MS) weatherRequests.set(req.ip, { startedAt: now, count: 1 });
    else record.count += 1;
    return true;
}

function rejectCrossOrigin(req, res, next) {
    const origin = req.get('origin');
    if (origin) {
        let originHost;
        try { originHost = new URL(origin).host; } catch (error) {
            return res.status(403).json({ success: false, message: 'İstek kaynağı reddedildi.' });
        }
        if (originHost !== req.get('host')) {
            return res.status(403).json({ success: false, message: 'İstek kaynağı reddedildi.' });
        }
    }
    next();
}

function scrypt(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
            if (error) reject(error);
            else resolve(key.toString('hex'));
        });
    });
}

app.use('/api', rejectCrossOrigin);

app.post('/api/auth/citizen', async (req, res) => {
    if (!checkLoginRate(req, res)) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const mode = body.mode;
    if (!/^[^\s@]+@gmail\.com$/i.test(email) || password.length < 8 || password.length > 128 || !['register', 'login'].includes(mode)) {
        return res.status(400).json({ success: false, message: 'E-posta, şifre veya işlem geçersiz. Şifre en az 8 karakter olmalıdır.' });
    }

    const accounts = readJSON(ACCOUNTS_FILE);
    const account = accounts.find(item => item.email === email);
    if (mode === 'register') {
        if (account) return res.status(409).json({ success: false, message: 'Bu e-posta zaten kayıtlı.' });
        const salt = crypto.randomBytes(16).toString('hex');
        accounts.push({ email, salt, passwordHash: await scrypt(password, salt), createdAt: new Date().toISOString() });
        writeJSON(ACCOUNTS_FILE, accounts);
    } else {
        const candidate = account ? await scrypt(password, account.salt) : '';
        const valid = account && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(account.passwordHash));
        if (!valid) {
            return res.status(401).json({ success: false, message: 'E-posta veya şifre hatalı.' });
        }
    }

    issueSession(res, { role: 'citizen', email });
    res.json({ success: true });
});

app.post('/api/auth/admin', (req, res) => {
    if (!checkLoginRate(req, res)) return;
    const expected = process.env.ADMIN_ACCESS_KEY || '';
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const supplied = typeof body.key === 'string' ? body.key : '';
    if (expected.length < 16) {
        return res.status(503).json({ success: false, message: 'Yetkili girişi sunucuda yapılandırılmamış.' });
    }
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
        return res.status(401).json({ success: false, message: 'Yetkili anahtarı hatalı.' });
    }
    issueSession(res, { role: 'admin', unit: process.env.ADMIN_UNIT || 'Yetkili' });
    res.json({ success: true, unit: process.env.ADMIN_UNIT || 'Yetkili' });
});

app.post('/api/auth/logout', (req, res) => {
    sessions.delete(getSessionToken(req));
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
    res.json({ success: true });
});

app.use('/api', (req, res, next) => {
    const token = getSessionToken(req);
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ success: false, message: 'Oturum açmanız gerekiyor.' });
    }
    req.session = session;
    next();
});

async function proxyWeather(req, res, endpoint, extra = {}) {
    if (!checkWeatherRate(req, res)) return;
    const apiKey = process.env.OPENWEATHER_API_KEY;
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!apiKey) return res.status(503).json({ error: 'Hava servisi sunucuda yapılandırılmamış.' });
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'Koordinatlar geçersiz.' });
    }

    const url = new URL(`https://api.openweathermap.org/data/2.5/${endpoint}`);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('appid', apiKey);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('lang', 'tr');
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return res.status(502).json({ error: 'Hava sağlayıcısı yanıt vermedi.' });
        res.json(await response.json());
    } catch (error) {
        res.status(502).json({ error: 'Hava sağlayıcısına ulaşılamadı.' });
    }
}

app.get('/api/weather/current', (req, res) => proxyWeather(req, res, 'weather'));
app.get('/api/weather/forecast', (req, res) => proxyWeather(req, res, 'forecast', { cnt: '16' }));
app.get('/api/weather/air-pollution', (req, res) => proxyWeather(req, res, 'air_pollution'));

app.use('/api', (req, res, next) => {
    if (req.session.role !== 'admin') return res.status(403).json({ success: false, message: 'Yetki gerekiyor.' });
    next();
});

app.post('/api/citizen/update', (req, res) => {
    const { email, lat, lng, lastActive, lastMoveAt, healthStatus, healthNote, battery, isSOS, isPanic } = req.body;
    const users = readJSON(USERS_FILE);
    const idx = users.findIndex(user => user.email === email);
    if (idx === -1) {
        users.push({ email, lat, lng, lastActive, lastMoveAt, healthStatus, healthNote, battery, isSOS: !!isSOS, isPanic: !!isPanic });
    } else {
        for (const [key, value] of Object.entries({ lat, lng, lastActive, lastMoveAt, healthStatus, healthNote, battery, isSOS, isPanic })) {
            if (value !== undefined) users[idx][key] = value;
        }
    }
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.get('/api/citizens', (req, res) => res.json(readJSON(USERS_FILE)));

app.post('/api/sos', (req, res) => {
    const list = readJSON(SOS_FILE);
    list.push(req.body);
    writeJSON(SOS_FILE, list);
    res.json({ success: true });
});

app.get('/api/sos', (req, res) => res.json(readJSON(SOS_FILE)));

app.post('/api/messages', (req, res) => {
    const messages = readJSON(MESSAGES_FILE);
    messages.push(req.body);
    writeJSON(MESSAGES_FILE, messages);
    res.json({ success: true });
});

app.get('/api/messages/:userId', (req, res) => {
    const messages = readJSON(MESSAGES_FILE);
    const userId = decodeURIComponent(req.params.userId);
    res.json(messages.filter(message => message.from === userId || message.to === userId));
});

app.post('/api/volunteers', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    volunteers.push(req.body);
    writeJSON(VOLUNTEERS_FILE, volunteers);
    res.json({ success: true });
});

app.get('/api/volunteers', (req, res) => res.json(readJSON(VOLUNTEERS_FILE)));

app.use((req, res, next) => {
    if (/\.(?:json|env|lock)$/i.test(req.path)) return res.sendStatus(404);
    next();
});
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use((req, res) => res.sendStatus(404));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`TR-GOZU ${port} portunda aktif.`));
