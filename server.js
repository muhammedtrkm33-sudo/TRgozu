const express = require('express');
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
});

const readJSON = (file) => {
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error('Dosya okuma hatası:', e);
        return [];
    }
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

const emailUser = process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.SMTP_USER || process.env.SMTP_USERNAME;
const emailPass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
const emailHost = process.env.EMAIL_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
const emailPort = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
const emailSecure = (process.env.EMAIL_SECURE || process.env.SMTP_SECURE) === 'true';
const emailCredentialsArePlaceholder = (emailUser && /your[-_]?email/i.test(emailUser)) || (emailPass && /app[-_]?password/i.test(emailPass));
const emailConfigured = Boolean(emailUser && emailPass && !emailCredentialsArePlaceholder);

if (!emailConfigured) {
    console.error('!!! UYARI: EMAIL_USER / SMTP_USER ve EMAIL_PASS / SMTP_PASS environment değişkenleri doğru ayarlanmamış. .env veya Render environment değişkenlerinizi kontrol edin. Gmail için gerçek Gmail adresiniz ve Google App Password kullanın.');
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
                console.error('Gmail hata kodu 535: Kullanıcı adı veya şifre hatalı. App Password kullandığınızdan emin olun. 2FA açık olmalıdır.');
            }
        } else {
            console.log('Email sunucusu bağlantısı başarılı');
        }
    });
}

const sendEmail = async (to, subject, html) => {
    if (!transporter) {
        const errorMessage = 'Email yapılandırması eksik. EMAIL_USER / SMTP_USER ve EMAIL_PASS / SMTP_PASS environment değişkenlerini ayarlayın.';
        console.error(errorMessage);
        return { success: false, error: errorMessage };
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || emailUser,
            to,
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

app.post('/save-user', (req, res) => {
    const { email, pass, mode, key } = req.body;

    if (mode === 'reg') {
        if (!email || !pass) {
            return res.status(400).json({ success: false, message: "Email ve şifre gereklidir!" });
        }

        db.get(`SELECT email FROM users WHERE email = ?`, [email], (err, row) => {
            if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
            if (row) return res.status(400).json({ success: false, message: "Bu email zaten kayıtlı!" });

            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const verificationExpires = Date.now() + 3600000; // 1 saat

            db.run(`INSERT INTO users (email, pass, created, isVerified, verificationCode, verificationExpires) VALUES (?, ?, ?, 0, ?, ?)`,
                [email, pass, new Date().toISOString(), verificationCode, verificationExpires], async function(err) {
                if (err) return res.status(500).json({ success: false, message: "Kayıt hatası!" });

                const host = req.get('host') || `localhost:${PORT}`;
                const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
                const verifyLink = `${protocol}://${host}`;
                const emailResult = await sendEmail(email, 'TR-GOZU Kayıt Doğrulama Kodu', `<p>Hesabınızı doğrulamak için doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye geri dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`);
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
    }
});

// Şifre Sıfırlama Rotaları
app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
        
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        db.run(`UPDATE users SET resetToken = ?, resetExpires = ? WHERE email = ?`,
            [resetCode, Date.now() + 3600000, email], async function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
            
            const resetLinkHost = req.get('host') || `localhost:${PORT}`;
            const resetLinkProtocol = req.protocol || 'http';
            const resetLink = `${resetLinkProtocol}://${resetLinkHost}`;
            const emailResult = await sendEmail(email, 'TR-GOZU Şifre Sıfırlama Kodu', `<p>Şifrenizi sıfırlamak için doğrulama kodunuz: <b>${resetCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Eğer siteye dönmek isterseniz <a href="${resetLink}">buraya tıklayın</a>.</p>`);
            if (!emailResult.success) {
                return res.status(500).json({ success: false, message: `Mail gönderilemedi: ${emailResult.error}` });
            }
            return res.json({ success: true, message: "Doğrulama kodu mailinize gönderildi!" });
        });
    });
});

app.post('/api/verify-registration', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: "Email ve kod gereklidir!" });

    db.get(`SELECT * FROM users WHERE email = ? AND verificationCode = ? AND verificationExpires > ?`, 
        [email, code, Date.now()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });

        db.run(`UPDATE users SET isVerified = 1, verificationCode = NULL, verificationExpires = NULL WHERE email = ?`, 
            [email], function(err) {
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
});

app.post('/api/resend-verification-code', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email gereklidir!" });

    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
        if (user.isVerified) return res.status(400).json({ success: false, message: "Bu hesap zaten doğrulanmış." });

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        db.run(`UPDATE users SET verificationCode = ?, verificationExpires = ? WHERE email = ?`,
            [verificationCode, Date.now() + 3600000, email], async function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });

            const host = req.get('host') || `localhost:${PORT}`;
            const protocol = req.protocol || 'http';
            const verifyLink = `${protocol}://${host}`;
            const emailResult = await sendEmail(email, 'TR-GOZU Doğrulama Kodu Tekrar', `<p>Yeni doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`);
            if (!emailResult.success) {
                return res.status(500).json({ success: false, message: `Mail gönderilemedi: ${emailResult.error}` });
            }
            return res.json({ success: true, message: "Yeni doğrulama kodu gönderildi!" });
        });
    });
});

app.post('/api/reset-password', (req, res) => {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
        return res.status(400).json({ success: false, message: "Email, kod ve yeni şifre gereklidir!" });
    }

    db.get(`SELECT * FROM users WHERE email = ? AND resetToken = ? AND resetExpires > ?`, 
        [email, token, Date.now()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });
        
        db.run(`UPDATE users SET pass = ?, resetToken = NULL, resetExpires = NULL WHERE email = ?`, 
            [newPassword, email], function(err) {
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
});

app.get('/api/messages/:userId', (req, res) => {
    const msgs = readJSON(MESSAGES_FILE);
    const userId = decodeURIComponent(req.params.userId);
    res.json(msgs.filter(m => m.sender === userId || m.receiver === userId || m.receiver === 'ADMIN'));
});

// SUNUCUYU BAŞLAT
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu ${PORT} portunda tam yetkiyle aktif!`);
});
