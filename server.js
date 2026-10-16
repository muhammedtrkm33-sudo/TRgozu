const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, '.data');
const DATABASE_FILE = path.join(ROOT, 'trgozu.db');
const USERS_FILE = path.join(DATA_DIR, 'citizens.json');
const SOS_FILE = path.join(DATA_DIR, 'sos.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const VOLUNTEERS_FILE = path.join(DATA_DIR, 'volunteers.json');
const PORT = Number(process.env.PORT) || 10000;
const SESSION_SECRET = process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(48).toString('hex'));
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
const weatherRequests = new Map();
const aiRequests = new Map();
const activeCitizens = new Map();

if (SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new sqlite3.Database(DATABASE_FILE);
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        pass TEXT NOT NULL,
        created TEXT,
        isVerified INTEGER DEFAULT 0,
        verificationCode TEXT,
        verificationExpires INTEGER,
        resetToken TEXT,
        resetExpires INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS user_data (
        email TEXT PRIMARY KEY,
        family TEXT DEFAULT '[]',
        announcements TEXT DEFAULT '[]',
        missingPersons TEXT DEFAULT '[]',
        helpRequests TEXT DEFAULT '[]',
        citizens TEXT DEFAULT '[]',
        sosList TEXT DEFAULT '[]',
        threads TEXT DEFAULT '[]',
        chatMessages TEXT DEFAULT '[]',
        lastUpdated TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL
    )`);
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

app.use(session({
    name: 'trgozu_session',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_TTL_MS
    }
}));

function rejectCrossOrigin(req, res, next) {
    const origin = req.get('origin');
    if (!origin) return next();
    try {
        if (new URL(origin).host === req.get('host')) return next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'İstek kaynağı reddedildi.' });
    }
    return res.status(403).json({ success: false, message: 'İstek kaynağı reddedildi.' });
}

app.use(['/api', '/save-user', '/logout'], rejectCrossOrigin);

function readJSON(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        return Array.isArray(value) ? value : [];
    } catch (error) {
        console.error('Data file could not be read:', path.basename(file));
        return [];
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function withDatabase(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (error, row) => error ? reject(error) : resolve(row));
    });
}

function runDatabase(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function allDatabase(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function derivePassword(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
            if (error) reject(error);
            else resolve(key.toString('hex'));
        });
    });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return `scrypt$${salt}$${await derivePassword(password, salt)}`;
}

async function verifyPassword(password, stored) {
    const [algorithm, salt, expected] = String(stored || '').split('$');
    if (algorithm !== 'scrypt' || !salt || !expected) return stored === password;
    const actual = Buffer.from(await derivePassword(password, salt), 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function allowRequest(limits, key, maximum, res) {
    const now = Date.now();
    const record = limits.get(key);
    if (record && now - record.startedAt < RATE_WINDOW_MS && record.count >= maximum) {
        res.status(429).json({ success: false, message: 'Çok fazla istek. Daha sonra tekrar deneyin.' });
        return false;
    }
    if (!record || now - record.startedAt >= RATE_WINDOW_MS) limits.set(key, { startedAt: now, count: 1 });
    else record.count += 1;
    return true;
}

function allowLogin(req, res) {
    const action = req.path === '/save-user'
        ? `${req.path}:${req.body?.mode || 'unknown'}`
        : req.path;
    return allowRequest(loginAttempts, `${req.ip}:${action}`, 10, res);
}

function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ success: false, message: 'Oturum açmanız gerekiyor.' });
    next();
}

function requireAdmin(req, res, next) {
    if (req.session.user?.role !== 'admin') return res.status(403).json({ success: false, message: 'Yetki gerekiyor.' });
    next();
}

function regenerateSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) return reject(error);
            req.session.user = user;
            req.session.save(saveError => saveError ? reject(saveError) : resolve());
        });
    });
}

async function sendEmail(to, subject, code, purpose) {
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.SMTP_USERNAME || process.env.EMAIL_USERNAME;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;
    if (!user || !pass) return false;

    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
    const secure = (process.env.SMTP_SECURE || process.env.EMAIL_SECURE) === 'true';
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: !secure,
        auth: { user, pass },
        tls: { minVersion: 'TLSv1.2' }
    });

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.EMAIL_FROM || `TR-GOZU <${user}>`,
            to,
            subject,
            text: `${purpose}: ${code}. Kod 1 saat geçerlidir.`,
            disableFileAccess: true,
            disableUrlAccess: true
        });
        return true;
    } catch (error) {
        console.error('Email delivery failed:', error.message);
        return false;
    } finally {
        transporter.close();
    }
}

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(email) {
    return /^[^\s@]+@gmail\.com$/i.test(email);
}

function setSessionUser(req, res, user) {
    regenerateSession(req, user)
        .then(() => res.json({
            success: true,
            user,
            unit: user.unit,
            isVerified: user.isVerified,
            securityLevel: user.isVerified ? 'Yüksek' : 'Düşük'
        }))
        .catch(error => {
            console.error('Session could not be created:', error.message);
            res.status(500).json({ success: false, message: 'Oturum açılamadı.' });
        });
}

app.post('/save-user', async (req, res) => {
    if (!allowLogin(req, res)) return;
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const password = typeof body.pass === 'string' ? body.pass : '';
    const mode = body.mode;

    if (mode === 'admin') {
        const expected = process.env.ADMIN_ACCESS_KEY || '';
        const supplied = typeof body.key === 'string' ? body.key : '';
        const expectedBuffer = Buffer.from(expected);
        const suppliedBuffer = Buffer.from(supplied);
        if (expected.length < 16) return res.status(503).json({ success: false, message: 'Yetkili anahtarı sunucuda ayarlanmamış.' });
        if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
            return res.status(401).json({ success: false, message: 'Yetkili anahtarı hatalı.' });
        }
        const unit = process.env.ADMIN_UNIT || 'Yetkili';
        return setSessionUser(req, res, { email: 'YETKILI@ADMIN', role: 'admin', unit });
    }

    if (!validEmail(email) || password.length < 8 || password.length > 128 || !['reg', 'login'].includes(mode)) {
        return res.status(400).json({ success: false, message: 'E-posta veya şifre geçersiz. Şifre en az 8 karakter olmalıdır.' });
    }

    try {
        const user = await withDatabase('SELECT * FROM users WHERE email = ?', [email]);
        if (mode === 'reg') {
            if (user?.isVerified) return res.status(409).json({ success: false, message: 'Bu e-posta zaten kayıtlı.' });
            const code = String(crypto.randomInt(100000, 1000000));
            const expires = Date.now() + 60 * 60 * 1000;
            const passwordHash = await hashPassword(password);
            if (user) {
                await runDatabase('UPDATE users SET pass = ?, verificationCode = ?, verificationExpires = ? WHERE email = ?', [passwordHash, code, expires, email]);
            } else {
                await runDatabase('INSERT INTO users (email, pass, created, isVerified, verificationCode, verificationExpires) VALUES (?, ?, ?, 0, ?, ?)', [email, passwordHash, new Date().toISOString(), code, expires]);
            }
            if (!await sendEmail(email, 'TR-GOZU Kayıt Doğrulama Kodu', code, 'Doğrulama kodunuz')) {
                return res.status(503).json({ success: false, message: 'E-posta gönderilemedi; sunucu SMTP ayarlarını kontrol edin.' });
            }
            return res.json({ success: true, message: user ? 'Yeni doğrulama kodu gönderildi.' : 'Kayıt başarılı. E-postanıza gelen kodla hesabınızı doğrulayın.' });
        }

        if (!user || !await verifyPassword(password, user.pass)) {
            return res.status(401).json({ success: false, message: 'E-posta veya şifre hatalı.' });
        }
        if (!String(user.pass).startsWith('scrypt$')) {
            await runDatabase('UPDATE users SET pass = ? WHERE email = ?', [await hashPassword(password), email]);
        }
        if (!user.isVerified) {
            return res.status(403).json({ success: false, needsVerification: true, message: 'E-posta doğrulamanız gerekiyor.' });
        }

        const loginTime = new Date().toISOString();
        const sessionUser = { email, role: 'citizen', isVerified: true, securityLevel: 'Yüksek', loginTime };
        await regenerateSession(req, sessionUser);
        activeCitizens.set(email, { ...sessionUser, sessionId: req.sessionID });
        return res.json({ success: true, message: 'Giriş başarılı.', isVerified: true, securityLevel: 'Yüksek' });
    } catch (error) {
        console.error('Account request failed:', error.message);
        return res.status(500).json({ success: false, message: 'İşlem tamamlanamadı.' });
    }
});

app.post('/api/auth/admin', (req, res) => {
    req.body = { ...(req.body || {}), mode: 'admin' };
    req.url = '/save-user';
    app.handle(req, res);
});

app.get('/check-session', (req, res) => res.json({ loggedIn: false }));

app.post('/logout', (req, res) => {
    const email = req.session.user?.email;
    if (email) activeCitizens.delete(email);
    req.session.destroy(error => {
        if (error) return res.status(500).json({ success: false, message: 'Çıkış yapılamadı.' });
        res.clearCookie('trgozu_session', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
        res.json({ success: true });
    });
});

app.post('/api/forgot-password', async (req, res) => {
    if (!allowLogin(req, res)) return;
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Geçerli bir e-posta gerekli.' });
    try {
        const user = await withDatabase('SELECT email FROM users WHERE email = ?', [email]);
        if (user) {
            const code = String(crypto.randomInt(100000, 1000000));
            await runDatabase('UPDATE users SET resetToken = ?, resetExpires = ? WHERE email = ?', [code, Date.now() + 60 * 60 * 1000, email]);
            if (!await sendEmail(email, 'TR-GOZU Şifre Sıfırlama Kodu', code, 'Şifre sıfırlama kodunuz')) {
                return res.status(503).json({ success: false, message: 'E-posta gönderilemedi; SMTP ayarlarını kontrol edin.' });
            }
        }
        res.json({ success: true, message: 'Adres kayıtlıysa sıfırlama kodu gönderildi.' });
    } catch (error) {
        console.error('Password reset request failed:', error.message);
        res.status(500).json({ success: false, message: 'İşlem tamamlanamadı.' });
    }
});

app.post('/api/verify-registration', async (req, res) => {
    if (!allowLogin(req, res)) return;
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!validEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'E-posta veya kod geçersiz.' });
    try {
        const user = await withDatabase('SELECT email FROM users WHERE email = ? AND verificationCode = ? AND verificationExpires > ?', [email, code, Date.now()]);
        if (!user) return res.status(400).json({ success: false, message: 'Kod geçersiz veya süresi dolmuş.' });
        await runDatabase('UPDATE users SET isVerified = 1, verificationCode = NULL, verificationExpires = NULL WHERE email = ?', [email]);
        await regenerateSession(req, { email, role: 'citizen', isVerified: true, securityLevel: 'Yüksek', loginTime: new Date().toISOString() });
        res.json({ success: true, message: 'Hesabınız doğrulandı.', isVerified: true, securityLevel: 'Yüksek' });
    } catch (error) {
        console.error('Registration verification failed:', error.message);
        res.status(500).json({ success: false, message: 'Doğrulama tamamlanamadı.' });
    }
});

app.post('/api/resend-verification-code', async (req, res) => {
    if (!allowLogin(req, res)) return;
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Geçerli bir e-posta gerekli.' });
    try {
        const user = await withDatabase('SELECT isVerified FROM users WHERE email = ?', [email]);
        if (!user || user.isVerified) return res.json({ success: true, message: 'Adres kayıtlı ve doğrulanmamışsa yeni kod gönderildi.' });
        const code = String(crypto.randomInt(100000, 1000000));
        await runDatabase('UPDATE users SET verificationCode = ?, verificationExpires = ? WHERE email = ?', [code, Date.now() + 60 * 60 * 1000, email]);
        if (!await sendEmail(email, 'TR-GOZU Doğrulama Kodu', code, 'Yeni doğrulama kodunuz')) {
            return res.status(503).json({ success: false, message: 'E-posta gönderilemedi; SMTP ayarlarını kontrol edin.' });
        }
        res.json({ success: true, message: 'Yeni doğrulama kodu gönderildi.' });
    } catch (error) {
        console.error('Verification resend failed:', error.message);
        res.status(500).json({ success: false, message: 'İşlem tamamlanamadı.' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    if (!allowLogin(req, res)) return;
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const password = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!validEmail(email) || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 128) {
        return res.status(400).json({ success: false, message: 'Bilgiler geçersiz; yeni şifre en az 8 karakter olmalıdır.' });
    }
    try {
        const user = await withDatabase('SELECT email FROM users WHERE email = ? AND resetToken = ? AND resetExpires > ?', [email, code, Date.now()]);
        if (!user) return res.status(400).json({ success: false, message: 'Kod geçersiz veya süresi dolmuş.' });
        await runDatabase('UPDATE users SET pass = ?, resetToken = NULL, resetExpires = NULL WHERE email = ?', [await hashPassword(password), email]);
        res.json({ success: true, message: 'Şifre güncellendi.' });
    } catch (error) {
        console.error('Password reset failed:', error.message);
        res.status(500).json({ success: false, message: 'İşlem tamamlanamadı.' });
    }
});

app.use('/api', requireAuth);

app.post('/api/chat', async (req, res) => {
    if (!allowRequest(aiRequests, req.ip, 20, res)) return;
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'AI_API_KEY is not configured.' });

    const body = req.body || {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 2000) {
        return res.status(400).json({ error: 'Message must be between 1 and 2000 characters.' });
    }

    const history = Array.isArray(body.messages)
        ? body.messages
            .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
            .slice(-12)
            .map(item => ({ role: item.role, content: item.content.slice(0, 2000) }))
        : [];
    if (history[history.length - 1]?.role !== 'user' || history[history.length - 1]?.content !== message) {
        history.push({ role: 'user', content: message });
    }

    let apiUrl;
    try {
        apiUrl = new URL(process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions');
        if (process.env.NODE_ENV === 'production' && apiUrl.protocol !== 'https:') {
            return res.status(500).json({ error: 'AI_API_URL must use HTTPS in production.' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'AI_API_URL is invalid.' });
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: process.env.AI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Türkçe yanıt veren TR-GOZU afet ve acil durum destek asistanısın. Kısa, anlaşılır ve güvenlik odaklı cevap ver. Güncel olay, konum veya sistem verisine erişimin olmadığını varsay; veri uydurma. Tıbbi teşhis koyma. Hayati tehlikede kullanıcıyı 112\'yi aramaya yönlendir. Uygulama dışı konularda nazikçe afet güvenliği kapsamına dön.'
                    },
                    ...history
                ],
                temperature: 0.4,
                max_tokens: 500
            }),
            signal: AbortSignal.timeout(25000)
        });
        if (!response.ok) {
            console.warn('AI provider returned HTTP', response.status);
            return res.status(502).json({ error: 'AI sağlayıcısı yanıt veremedi.' });
        }
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content;
        if (typeof reply !== 'string' || !reply.trim()) {
            return res.status(502).json({ error: 'AI sağlayıcısı boş yanıt verdi.' });
        }
        res.json({ reply: reply.trim() });
    } catch (error) {
        console.error('AI request failed:', error.name === 'TimeoutError' ? 'timeout' : error.message);
        res.status(502).json({ error: 'AI hizmetine ulaşılamadı.' });
    }
});

function checkWeatherRate(req, res) {
    return allowRequest(weatherRequests, req.ip, 120, res);
}

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

app.get('/api/active-citizens', requireAdmin, (req, res) => res.json({ success: true, citizens: Array.from(activeCitizens.values()) }));
app.get('/api/citizens', requireAdmin, (req, res) => res.json(readJSON(USERS_FILE)));

app.post('/api/citizen/update', (req, res) => {
    const body = req.body || {};
    const email = req.session.user.role === 'admin' ? normalizeEmail(body.email) : req.session.user.email;
    if (!email) return res.status(400).json({ success: false, message: 'E-posta geçersiz.' });
    const citizens = readJSON(USERS_FILE);
    const index = citizens.findIndex(user => user.email === email);
    const fields = ['lat', 'lng', 'lastActive', 'lastMoveAt', 'healthStatus', 'healthNote', 'battery', 'isSOS', 'isPanic'];
    const update = Object.fromEntries(fields.filter(key => body[key] !== undefined).map(key => [key, body[key]]));
    if (index < 0) citizens.push({ email, ...update });
    else Object.assign(citizens[index], update);
    writeJSON(USERS_FILE, citizens);
    res.json({ success: true });
});

app.post('/api/sos', (req, res) => {
    const list = readJSON(SOS_FILE);
    list.push({ ...(req.body || {}), user: req.session.user.email, time: new Date().toISOString() });
    writeJSON(SOS_FILE, list);
    res.json({ success: true });
});
app.get('/api/sos', requireAdmin, (req, res) => res.json(readJSON(SOS_FILE)));

app.post('/api/messages', async (req, res) => {
    const body = req.body || {};
    const recipient = typeof body.to === 'string' ? body.to : body.receiver;
    const text = typeof body.message === 'string' ? body.message : '';
    if (!recipient || !text || text.length > 4000) return res.status(400).json({ success: false, message: 'Mesaj geçersiz.' });
    const sender = req.session.user.role === 'admin' ? 'ADMIN' : req.session.user.email;
    try {
        await runDatabase('INSERT INTO messages (sender, receiver, message, timestamp) VALUES (?, ?, ?, ?)', [sender, recipient, text, new Date().toISOString()]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Mesaj kaydedilemedi.' });
    }
});

app.get('/api/messages/:userId', async (req, res) => {
    const requestedUser = decodeURIComponent(req.params.userId);
    const userId = req.session.user.role === 'admin' ? requestedUser : req.session.user.email;
    if (req.session.user.role !== 'admin' && requestedUser !== userId) {
        return res.status(403).json({ success: false, message: 'Bu mesajlara erişim yetkiniz yok.' });
    }
    try {
        const messages = await allDatabase('SELECT sender AS from, receiver AS to, message, timestamp AS time FROM messages WHERE sender = ? OR receiver = ?', [userId, userId]);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Mesajlar yüklenemedi.' });
    }
});

app.post('/api/volunteers', (req, res) => {
    const volunteers = readJSON(VOLUNTEERS_FILE);
    volunteers.push({ ...(req.body || {}), email: req.session.user.email });
    writeJSON(VOLUNTEERS_FILE, volunteers);
    res.json({ success: true });
});
app.get('/api/volunteers', requireAdmin, (req, res) => res.json(readJSON(VOLUNTEERS_FILE)));

const USER_DATA_FIELDS = ['family', 'announcements', 'missingPersons', 'helpRequests', 'citizens', 'sosList', 'threads', 'chatMessages'];
app.get('/api/load-user-data/:email', async (req, res) => {
    const email = normalizeEmail(decodeURIComponent(req.params.email));
    if (email !== req.session.user.email && req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bu verilere erişim yetkiniz yok.' });
    }
    try {
        const row = await withDatabase('SELECT * FROM user_data WHERE email = ?', [email]);
        if (!row) return res.json({ success: true, data: {} });
        const data = {};
        for (const field of USER_DATA_FIELDS) data[field] = row[field] ? JSON.parse(row[field]) : [];
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Kullanıcı verileri yüklenemedi.' });
    }
});

app.post('/api/save-user-data', async (req, res) => {
    const body = req.body || {};
    const email = req.session.user.email;
    const field = body.key === `chat_${email}` ? 'chatMessages' : body.key;
    if (req.session.user.role !== 'admin' && normalizeEmail(body.email) !== email) {
        return res.status(403).json({ success: false, message: 'Bu verileri değiştirme yetkiniz yok.' });
    }
    if (!USER_DATA_FIELDS.includes(field)) return res.status(400).json({ success: false, message: 'Veri alanı geçersiz.' });
    const serialized = JSON.stringify(body.value);
    if (serialized.length > 100000) return res.status(413).json({ success: false, message: 'Veri boyutu sınırı aşıldı.' });
    try {
        const row = await withDatabase('SELECT email FROM user_data WHERE email = ?', [email]);
        if (!row) {
            const initial = Object.fromEntries(USER_DATA_FIELDS.map(key => [key, '[]']));
            initial[field] = serialized;
            const columns = USER_DATA_FIELDS.join(',');
            const placeholders = USER_DATA_FIELDS.map(() => '?').join(',');
            await runDatabase(`INSERT INTO user_data (email, ${columns}, lastUpdated) VALUES (?, ${placeholders}, ?)`, [email, ...USER_DATA_FIELDS.map(key => initial[key]), new Date().toISOString()]);
        } else {
            await runDatabase(`UPDATE user_data SET ${field} = ?, lastUpdated = ? WHERE email = ?`, [serialized, new Date().toISOString(), email]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Kullanıcı verileri kaydedilemedi.' });
    }
});

app.use((req, res, next) => {
    if (/\.(?:json|env|db|sqlite|session|lock)$/i.test(req.path)) return res.sendStatus(404);
    next();
});

app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use((req, res) => res.sendStatus(404));

app.listen(PORT, '0.0.0.0', () => console.log(`TR-GOZU server listening on ${PORT}.`));