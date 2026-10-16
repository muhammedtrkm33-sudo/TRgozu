<<<<<<< HEAD
﻿const crypto = require('node:crypto');
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
=======
﻿const express = require('express');
const fs = require('fs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// .env desteği: proje kökünde bir .env varsa okuyup process.env'e aktar
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const value = trimmed.slice(idx + 1).trim();
            if (!(key in process.env)) {
                process.env[key] = value;
            }
        }
    });
}

// Aktif vatandaşları takip etmek için global array
let activeCitizens = [];

// JSON dosya tabanlı depolama
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// SQLite database
const db = new sqlite3.Database(path.join(__dirname, 'trgozu.db'));

// Initialize database tables
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
    
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        receiver TEXT,
        message TEXT,
        timestamp TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_data (
        email TEXT PRIMARY KEY,
        family TEXT,
        announcements TEXT,
        missingPersons TEXT,
        helpRequests TEXT,
        citizens TEXT,
        sosList TEXT,
        threads TEXT,
        chatMessages TEXT,
        lastUpdated TEXT
    )`);
>>>>>>> 1133934dd4a11d70d65700a33dea7c1f2654970d
});

const readJSON = (file) => {
    if (!fs.existsSync(file)) return [];
<<<<<<< HEAD
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
=======
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error('Dosya okuma hatası:', e);
        return [];
    }
>>>>>>> 1133934dd4a11d70d65700a33dea7c1f2654970d
};

const writeJSON = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Dosya yazma hatası:', e);
    }
};

// CORS Ayarı: Her yerden gelen isteğe izin ver (Android ve Web için şart)
app.use(cors());
app.use(express.json());

// JSON parse hatalarını sessizce handle et
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.warn('Geçersiz JSON request', req.method, req.path);
        return res.status(400).json({ success: false, message: 'Geçersiz JSON' });
    }
    next();
});

// Session Ayarı
app.use(session({
    secret: 'tr-gozu-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Render'da HTTPS varsa true yap
        maxAge: 24 * 60 * 60 * 1000 // 24 saat
    }
}));

// Statik Dosyalar: index.html ana dizindeyse '.' kullanıyoruz
app.use(express.static('.'));

// PORT Ayarı: Render'daki ayarın 10000 ise bu kod ona uyar
const PORT = process.env.PORT || 10000;

const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.SMTP_USERNAME || process.env.EMAIL_USERNAME;
const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD;
const emailHost = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
const emailPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : (process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587);
const emailSecure = (process.env.SMTP_SECURE || process.env.EMAIL_SECURE) === 'true';
const emailFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM || (emailUser ? `TR-GOZU <${emailUser}>` : undefined);
const emailCredentialsArePlaceholder = (emailUser && /your[-_]?email/i.test(emailUser)) || (emailPass && /app[-_]?password/i.test(emailPass));
const emailConfigured = Boolean(emailUser && emailPass && !emailCredentialsArePlaceholder);

if (!emailConfigured) {
    console.error('!!! UYARI: SMTP_USER / SMTP_PASS veya EMAIL_USER / EMAIL_PASS environment değişkenleri eksik veya hatalı. Render ortamınızı kontrol edin.');
} else {
    console.log(`Email yapılandırması kullanılıyor: ${emailUser} @ ${emailHost}:${emailPort} secure=${emailSecure} from=${emailFrom}`);
}

const transporter = emailConfigured ? nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailSecure,
    auth: {
        user: emailUser,
        pass: emailPass
    },
    requireTLS: !emailSecure,
    tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
    }
}) : null;

if (transporter) {
    transporter.verify((error, success) => {
        if (error) {
            console.error('Email bağlantı hatası:', error);
            if (error.responseCode === 535) {
                console.error('SMTP kullanıcı adı veya şifre hatalı. Lütfen SMTP_USER/SMTP_PASS bilgilerinizi kontrol edin.');
            }
        } else {
            console.log('Email sunucusu bağlantısı başarılı');
        }
    });
}

const sendEmail = async (to, subject, html) => {
    if (!transporter) {
        const errorMessage = 'Email yapılandırması eksik. SMTP_USER / SMTP_PASS veya EMAIL_USER / EMAIL_PASS ortam değişkenlerini ayarlayın.';
        console.error(errorMessage);
        return { success: false, error: errorMessage };
    }

    try {
        const info = await transporter.sendMail({
            from: emailFrom,
            to,
            replyTo: emailFrom,
            subject,
            html
        });
        console.log(`Email gönderildi: ${to}`, info.messageId);
        return { success: true, info };
    } catch (error) {
        console.error('Email hatası:', error);
        return { success: false, error: error.message || error };
    }
};

// Session kontrol middleware'i
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        return res.status(401).json({ success: false, message: "Oturum açmanız gerekiyor!" });
    }
}

// --- ROTALAR (ENDPOINTS) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/active-citizens', requireAuth, (req, res) => {
    // Sadece yetkililer görebilir
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: "Yetkisiz erişim!" });
    }
    return res.json({ success: true, citizens: activeCitizens });
});

// Session kontrolü - Otomatik girişi devre dışı bırak
app.get('/check-session', (req, res) => {
    // Her zaman loggedIn: false döndür - Kullanıcı her açılışta manuel giriş yapsın
    return res.json({ loggedIn: false });
});

// Logout
app.post('/logout', (req, res) => {
    // Aktif vatandaşlar listesinden çıkar
    if (req.session.user && req.session.user.role === 'citizen') {
        activeCitizens = activeCitizens.filter(c => c.email !== req.session.user.email);
    }
    
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Çıkış yapılamadı!" });
        }
        return res.json({ success: true, message: "Çıkış başarılı." });
    });
});

<<<<<<< HEAD
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
=======
app.post('/save-user', (req, res) => {
    const { email, pass, mode, key } = req.body;

    if (mode === 'reg') {
        if (!email || !pass) {
            return res.status(400).json({ success: false, message: "Email ve şifre gereklidir!" });
        }

        db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, row) => {
            if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
            if (row && row.isVerified) {
                return res.status(400).json({ success: false, message: "Bu email zaten kayıtlı!" });
            }

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const verificationExpires = Date.now() + 3600000; // 1 saat
            const host = req.get('host') || `localhost:${PORT}`;
            const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
            const verifyLink = `${protocol}://${host}`;
            const emailHtml = `<p>Hesabınızı doğrulamak için doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye geri dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`;

            if (row) {
                db.run(`UPDATE users SET pass = ?, verificationCode = ?, verificationExpires = ? WHERE email = ?`,
                    [pass, verificationCode, verificationExpires, email], async function(err) {
                    if (err) return res.status(500).json({ success: false, message: "Kayıt hatası!" });

                    const emailResult = await sendEmail(email, 'TR-GOZU Kayıt Doğrulama Kodu', emailHtml);
                    if (!emailResult.success) {
                        return res.status(500).json({ success: false, message: `Mail gönderilemedi: ${emailResult.error}` });
                    }
                    return res.json({ success: true, message: "Hesabınız doğrulanmamıştı; yeni kod mailinize gönderildi." });
                });
                return;
            }

            db.run(`INSERT INTO users (email, pass, created, isVerified, verificationCode, verificationExpires) VALUES (?, ?, ?, 0, ?, ?)`,
                [email, pass, new Date().toISOString(), verificationCode, verificationExpires], async function(err) {
                if (err) return res.status(500).json({ success: false, message: "Kayıt hatası!" });

                const emailResult = await sendEmail(email, 'TR-GOZU Kayıt Doğrulama Kodu', emailHtml);
                if (!emailResult.success) {
                    return res.status(500).json({ success: false, message: `Mail gönderilemedi: ${emailResult.error}` });
                }
                return res.json({ success: true, message: "Kayıt başarılı! Mailinize gönderilen kodla hesabınızı doğrulayın." });
            });
        });
        return;
    }

    if (mode === 'login') {
        if (!email || !pass) {
            return res.status(400).json({ success: false, message: "Email ve şifre gereklidir!" });
        }

        db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
            if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
            if (!user) return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı!" });
            if (user.pass !== pass) return res.status(401).json({ success: false, message: "Şifre yanlış!" });

            // Güvenlik seviyesini belirle
            const securityLevel = user.isVerified ? 'Yüksek' : 'Düşük';
            const securityMessage = user.isVerified ? 'Email doğrulandı' : 'Bu hesap doğrulanmadı - Güvenlik Düşük';

            req.session.user = {
                email: user.email,
                role: 'citizen',
                isVerified: user.isVerified,
                securityLevel: securityLevel,
                loginTime: new Date().toISOString()
            };

            const citizenInfo = {
                email: user.email,
                isVerified: user.isVerified,
                securityLevel: securityLevel,
                loginTime: new Date().toISOString(),
                sessionId: req.sessionID
            };
            const existingIndex = activeCitizens.findIndex(c => c.email === user.email);
            if (existingIndex >= 0) {
                activeCitizens[existingIndex] = citizenInfo;
            } else {
                activeCitizens.push(citizenInfo);
            }

            return res.json({ 
                success: true, 
                message: "Giriş başarılı.", 
                isVerified: user.isVerified,
                securityLevel: securityLevel,
                securityMessage: securityMessage
            });
        });
        return;
    }

    if (mode === 'admin') {
        const adminKeys = JSON.parse(fs.readFileSync(path.join(__dirname, 'yetkili.json'), 'utf8'));
        const keyEntry = adminKeys.authorized_keys.find(item => item.key === key);
        const unit = keyEntry ? keyEntry.unit : null;
        if (unit) {
            req.session.user = {
                email: 'YETKILI@ADMIN',
                role: 'admin',
                unit: unit,
                tc: unit,
                loginTime: new Date().toISOString()
            };
            return res.json({ success: true, message: "Yetkili giriş başarılı.", unit });
        } else {
            return res.status(401).json({ success: false, message: "Hatalı Yetkili Anahtarı!" });
        }
>>>>>>> 1133934dd4a11d70d65700a33dea7c1f2654970d
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

<<<<<<< HEAD
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
=======
// Şifre Sıfırlama Rotaları
app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    const normalizedEmail = email ? email.trim().toLowerCase() : '';

    if (!normalizedEmail) {
        return res.status(400).json({ success: false, message: "Email gereklidir!" });
>>>>>>> 1133934dd4a11d70d65700a33dea7c1f2654970d
    }
    if (!emailConfigured) {
        return res.status(500).json({ success: false, message: "Email yapılandırması eksik. Lütfen EMAIL_USER / SMTP_USER ve EMAIL_PASS / SMTP_PASS ortam değişkenlerini kontrol edin." });
    }

    db.get(`SELECT * FROM users WHERE email = ?`, [normalizedEmail], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
        
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        db.run(`UPDATE users SET resetToken = ?, resetExpires = ? WHERE email = ?`,
            [resetCode, Date.now() + 3600000, normalizedEmail], async function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
            
            const resetLinkHost = req.get('host') || `localhost:${PORT}`;
            const resetLinkProtocol = req.get('x-forwarded-proto') || req.protocol || 'http';
            const resetLink = `${resetLinkProtocol}://${resetLinkHost}`;
            const emailResult = await sendEmail(normalizedEmail, 'TR-GOZU Şifre Sıfırlama Kodu', `<p>Şifrenizi sıfırlamak için doğrulama kodunuz: <b>${resetCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Eğer siteye dönmek isterseniz <a href="${resetLink}">buraya tıklayın</a>.</p>`);
            if (!emailResult.success) {
                return res.status(500).json({ success: false, message: `Mail gönderilemedi: ${emailResult.error}` });
            }
            return res.json({ success: true, message: "Doğrulama kodu mailinize gönderildi!" });
        });
    });
});

app.post('/api/verify-registration', (req, res) => {
    const { email, code } = req.body;
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !code) return res.status(400).json({ success: false, message: "Email ve kod gereklidir!" });

<<<<<<< HEAD
app.post('/api/sos', (req, res) => {
    const list = readJSON(SOS_FILE);
    list.push(req.body);
    writeJSON(SOS_FILE, list);
    res.json({ success: true });
=======
    db.get(`SELECT * FROM users WHERE email = ? AND verificationCode = ? AND verificationExpires > ?`, 
        [normalizedEmail, code, Date.now()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });

        db.run(`UPDATE users SET isVerified = 1, verificationCode = NULL, verificationExpires = NULL WHERE email = ?`, 
            [normalizedEmail], function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
            
            req.session.user = {
                email: user.email,
                role: 'citizen',
                isVerified: true,
                securityLevel: 'Yüksek',
                loginTime: new Date().toISOString()
            };
            
            return res.json({ 
                success: true, 
                message: "Hesabınız doğrulandı! Hoş geldiniz.",
                isVerified: true,
                securityLevel: 'Yüksek'
            });
        });
    });
>>>>>>> 1133934dd4a11d70d65700a33dea7c1f2654970d
});

app.post('/api/resend-verification-code', (req, res) => {
    const { email } = req.body;
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    if (!normalizedEmail) return res.status(400).json({ success: false, message: "Email gereklidir!" });

<<<<<<< HEAD
app.post('/api/messages', (req, res) => {
    const messages = readJSON(MESSAGES_FILE);
    messages.push(req.body);
    writeJSON(MESSAGES_FILE, messages);
    res.json({ success: true });
=======
    db.get(`SELECT * FROM users WHERE email = ?`, [normalizedEmail], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
        if (user.isVerified) return res.status(400).json({ success: false, message: "Bu hesap zaten doğrulanmış." });

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        db.run(`UPDATE users SET verificationCode = ?, verificationExpires = ? WHERE email = ?`,
            [verificationCode, Date.now() + 3600000, normalizedEmail], async function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });

            const host = req.get('host') || `localhost:${PORT}`;
            const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
            const verifyLink = `${protocol}://${host}`;
            const emailResult = await sendEmail(normalizedEmail, 'TR-GOZU Doğrulama Kodu Tekrar', `<p>Yeni doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`);
            if (!emailResult.success) {
                return res.status(500).json({ success: false, message: `Mail gönderilemedi: ${emailResult.error}` });
            }
            return res.json({ success: true, message: "Yeni doğrulama kodu gönderildi!" });
        });
    });
});

app.post('/api/reset-password', (req, res) => {
    const { email, token, newPassword } = req.body;
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !token || !newPassword) {
        return res.status(400).json({ success: false, message: "Email, kod ve yeni şifre gereklidir!" });
    }

    db.get(`SELECT * FROM users WHERE email = ? AND resetToken = ? AND resetExpires > ?`, 
        [normalizedEmail, token, Date.now()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });
        
        db.run(`UPDATE users SET pass = ?, resetToken = NULL, resetExpires = NULL WHERE email = ?`, 
            [newPassword, normalizedEmail], function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
            res.json({ success: true, message: "Şifre başarıyla güncellendi!" });
        });
    });
});

// Kullanıcı verilerini sunucudan yükle
app.get('/api/load-user-data/:email', (req, res) => {
    const email = decodeURIComponent(req.params.email);
    db.get(`SELECT * FROM user_data WHERE email = ?`, [email], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!row) {
            // Yeni kullanıcı, boş data oluştur
            db.run(`INSERT INTO user_data (email, family, announcements, missingPersons, helpRequests, citizens, sosList, threads, chatMessages, lastUpdated) 
                    VALUES (?, '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', ?)`,
                [email, new Date().toISOString()]);
            return res.json({ success: true, data: {} });
        }
        res.json({ 
            success: true, 
            data: {
                family: row.family ? JSON.parse(row.family) : [],
                announcements: row.announcements ? JSON.parse(row.announcements) : [],
                missingPersons: row.missingPersons ? JSON.parse(row.missingPersons) : [],
                helpRequests: row.helpRequests ? JSON.parse(row.helpRequests) : [],
                citizens: row.citizens ? JSON.parse(row.citizens) : [],
                sosList: row.sosList ? JSON.parse(row.sosList) : [],
                threads: row.threads ? JSON.parse(row.threads) : [],
                chatMessages: row.chatMessages ? JSON.parse(row.chatMessages) : []
            }
        });
    });
});

// Kullanıcı verilerini sunucuya kaydet
app.post('/api/save-user-data', (req, res) => {
    const { email, key, value } = req.body;
    if (!email || !key) return res.status(400).json({ success: false, message: "Email ve key gereklidir!" });

    db.get(`SELECT * FROM user_data WHERE email = ?`, [email], (err, row) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        
        const data = row || {
            email,
            family: '[]',
            announcements: '[]',
            missingPersons: '[]',
            helpRequests: '[]',
            citizens: '[]',
            sosList: '[]',
            threads: '[]',
            chatMessages: '[]'
        };

        // Güncellenecek alanı ayarla
        if (key === 'family') data.family = JSON.stringify(value);
        else if (key === 'announcements') data.announcements = JSON.stringify(value);
        else if (key === 'missingPersons') data.missingPersons = JSON.stringify(value);
        else if (key === 'helpRequests') data.helpRequests = JSON.stringify(value);
        else if (key === 'citizens') data.citizens = JSON.stringify(value);
        else if (key === 'sosList') data.sosList = JSON.stringify(value);
        else if (key === 'threads') data.threads = JSON.stringify(value);
        else if (key === 'chatMessages') data.chatMessages = JSON.stringify(value);

        data.lastUpdated = new Date().toISOString();

        if (row) {
            db.run(`UPDATE user_data SET family=?, announcements=?, missingPersons=?, helpRequests=?, citizens=?, sosList=?, threads=?, chatMessages=?, lastUpdated=? WHERE email=?`,
                [data.family, data.announcements, data.missingPersons, data.helpRequests, data.citizens, data.sosList, data.threads, data.chatMessages, data.lastUpdated, email],
                function(err) {
                    if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
                    res.json({ success: true, message: "Veri kaydedildi." });
                }
            );
        } else {
            db.run(`INSERT INTO user_data (email, family, announcements, missingPersons, helpRequests, citizens, sosList, threads, chatMessages, lastUpdated) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [email, data.family, data.announcements, data.missingPersons, data.helpRequests, data.citizens, data.sosList, data.threads, data.chatMessages, data.lastUpdated],
                function(err) {
                    if (err) return res.status(500).json({ success: false, message: "Kayıt hatası!" });
                    res.json({ success: true, message: "Veri kaydedildi." });
                }
            );
        }
    });
>>>>>>> 1133934dd4a11d70d65700a33dea7c1f2654970d
});

app.get('/api/messages/:userId', (req, res) => {
    const messages = readJSON(MESSAGES_FILE);
    const userId = decodeURIComponent(req.params.userId);
<<<<<<< HEAD
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
=======
    res.json(msgs.filter(m => m.sender === userId || m.receiver === userId || m.receiver === 'ADMIN'));
});

// SUNUCUYU BAŞLAT
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu ${PORT} portunda tam yetkiyle aktif!`);
});
>>>>>>> 1133934dd4a11d70d65700a33dea7c1f2654970d
