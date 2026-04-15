const express = require('express');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Mevcut dizindeki .env'yi oku

const app = express();

// Render ve Android WebView için en geniş CORS izinleri
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
app.use(express.json());

// Ortam değişkenlerini al
const MAIL_USER = (process.env.SMTP_USER || 'trgozu@gmail.com').trim();
const MAIL_PASS = (process.env.SMTP_PASS || 'hdbpstxkuqyntspq').replace(/\s+/g, '');
const MAIL_FROM = (process.env.SMTP_FROM || MAIL_USER).trim();

// Mail transporter - GMAIL GÜVENLİ AYARLAR
const mailTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: MAIL_USER,
        pass: MAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

mailTransporter.verify((err) => {
    if (err) {
        console.error('❌ Mail Hatası:', err.message);
    } else {
        console.log('✅ Mail Sistemi Aktif:', MAIL_USER);
    }
});

// Yardımcı Fonksiyonlar
const hashPassword = (p) => crypto.createHash('sha256').update(String(p)).digest('hex');
const USERS_FILE = './users.json';
const SOS_FILE = './sos.json';
const MESSAGES_FILE = './messages.json';
const VOLUNTEERS_FILE = './volunteers.json';

const readJSON = (f) => {
    if (!fs.existsSync(f)) return [];
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; }
};
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8');

let verificationCodes = {};

// --- ROTALAR ---

// Mail Doğrulama Kodu Gönder
app.post('/api/send-verification', async (req, res) => {
    const { email, purpose = 'register' } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: "Geçersiz e-posta adresi." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[email] = { code, expires: Date.now() + 5 * 60 * 1000 };

    try {
        await mailTransporter.sendMail({
            from: `"TR-GÖZÜ" <${MAIL_FROM}>`,
            to: email,
            subject: 'TR-GÖZÜ Doğrulama Kodunuz',
            text: `Doğrulama kodunuz: ${code}`,
            html: `
                <div style="font-family:sans-serif;text-align:center;padding:30px;border:2px solid #c20000;border-radius:10px;max-width:400px;margin:auto;">
                    <h2 style="color:#c20000;margin-bottom:20px;">TR-GÖZÜ</h2>
                    <p style="font-size:16px;color:#333;">Sisteme giriş/kayıt için doğrulama kodunuz:</p>
                    <div style="letter-spacing:8px;background:#f8f9fa;padding:15px;font-size:32px;font-weight:bold;color:#000;border-radius:5px;margin:20px 0;border:1px solid #ddd;">
                        ${code}
                    </div>
                    <p style="font-size:12px;color:#888;">Bu kod 5 dakika boyunca geçerlidir.</p>
                    <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
                    <p style="font-size:11px;color:#aaa;">Bu e-posta TR-GÖZÜ Acil Durum Yönetim Sistemi tarafından otomatik olarak gönderilmiştir.</p>
                </div>`
        });
        res.json({ success: true, message: "Kod gönderildi." });
    } catch (e) {
        console.error("Mail gönderme hatası:", e);
        res.status(500).json({ success: false, error: "Mail gönderilemedi: " + e.message });
    }
});

// Kod Doğrula
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;
    const data = verificationCodes[email];
    if (data && data.code === code && Date.now() < data.expires) {
        delete verificationCodes[email];
        return res.json({ success: true });
    }
    res.status(400).json({ success: false, message: "Geçersiz veya süresi dolmuş kod." });
});

// Kullanıcı Kayıt ve Giriş
app.post('/api/save-user', (req, res) => {
    const { email, pass, mode } = req.body;
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (mode === 'reg') {
        if (user) return res.status(400).json({ success: false, message: "Bu email zaten kayıtlı." });
        users.push({ email, passHash: hashPassword(pass), created: new Date().toISOString(), healthStatus: 'iyiyim' });
        writeJSON(USERS_FILE, users);
        return res.json({ success: true, message: "Kayıt başarılı." });
    }

    if (user && (user.passHash === hashPassword(pass) || user.pass === pass)) {
        return res.json({ success: true, message: "Giriş başarılı." });
    }
    res.status(401).json({ success: false, message: "Hatalı giriş bilgileri." });
});

// Email Kontrolü
app.post('/api/check-email', (req, res) => {
    const users = readJSON(USERS_FILE);
    res.json({ success: true, exists: users.some(u => u.email === req.body.email) });
});

// SOS ve Takip İşlemleri
app.post('/api/citizen/update', (req, res) => {
    let users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.email === req.body.email);
    const data = { ...req.body, lastActive: new Date().toISOString() };
    if (idx === -1) users.push(data); else users[idx] = { ...users[idx], ...data };
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.get('/api/citizens', (req, res) => res.json(readJSON(USERS_FILE)));

app.post('/api/sos', (req, res) => {
    let list = readJSON(SOS_FILE);
    list.push({ ...req.body, timestamp: new Date().toISOString() });
    writeJSON(SOS_FILE, list);
    res.json({ success: true });
});

app.get('/api/admin-units', (req, res) => res.json(["AFAD Komuta Merkezi", "AKUT Operasyon", "KIZILAY Lojistik", "UMKE Sağlık"]));

// Mesajlaşma
app.post('/api/messages', (req, res) => {
    let msgs = readJSON(MESSAGES_FILE);
    msgs.push({ ...req.body, timestamp: new Date().toISOString() });
    writeJSON(MESSAGES_FILE, msgs);
    res.json({ success: true });
});

app.get('/api/messages/:userId', (req, res) => {
    const userId = decodeURIComponent(req.params.userId);
    res.json(readJSON(MESSAGES_FILE).filter(m => m.from === userId || m.to === userId));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);

    // Aynı Wi-Fi zorunluluğunu kaldırmak için Localtunnel başlat
    try {
        const localtunnel = require('localtunnel');
        const tunnel = await localtunnel({ port: PORT, subdomain: 'trgozu-test' });
        console.log('🚀 DIŞ DÜNYAYA AÇILDIK!');
        console.log('🔗 Kamu URL:', tunnel.url);
        console.log('⚠️  Bu URL\'yi auth.js içindeki AUTH_API_BASE kısmına yazmalısın.');

        tunnel.on('close', () => {
            console.log('Tunnel kapandı.');
        });
    } catch (err) {
        console.log('Localtunnel başlatılamadı (İnternet veya paket eksik olabilir):', err.message);
    }
});
