const express = require('express');
const fs = require('fs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const app = express();

// CORS Ayarı: Her yerden gelen isteğe izin ver (Android ve Web için şart)
app.use(cors());
app.use(express.json());

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

// Email Ayarı (Environment Variables kullanmanı öneririm)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'trgozu@gmail.com',
        pass: process.env.EMAIL_PASS || 'czclgweldsrwlsnx' 
    }
});

const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER || 'trgozu@gmail.com',
            to,
            subject,
            html
        });
        console.log(`Email gönderildi: ${to}`);
    } catch (error) {
        console.error('Email hatası:', error);
    }
};

// SQLite Database Bağlantısı
const db = new sqlite3.Database('./trgozu.db', (err) => {
    if (err) {
        console.error('Database bağlantı hatası:', err.message);
    } else {
        console.log('SQLite veritabanına bağlandı.');
    }
});

// Tabloları oluştur
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        pass TEXT NOT NULL,
        created TEXT NOT NULL,
        isVerified INTEGER DEFAULT 0,
        verificationCode TEXT,
        verificationExpires INTEGER,
        resetToken TEXT,
        resetExpires INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT DEFAULT 'text'
    )`);
});

// DOSYA YOLLARI: Render'da silinmemesi için garantili yol
const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

const readJSON = (file) => {
    if (!fs.existsSync(file)) return [];
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Dosya okuma hatası:", e);
        return [];
    }
};

const writeJSON = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Dosya yazma hatası:", e);
    }
});

// Session kontrol middleware'i
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, message: "Oturum açmanız gerekiyor!" });
    }
}

// --- ROTALAR (ENDPOINTS) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Session kontrolü
app.get('/check-session', (req, res) => {
    if (req.session.user) {
        res.json({ 
            loggedIn: true, 
            user: req.session.user 
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Çıkış yapılamadı!" });
        }
        res.json({ success: true, message: "Çıkış başarılı." });
    });
});

app.post('/save-user', (req, res) => {
    const { email, pass, mode } = req.body;

    if (mode === 'reg') {
        // Email zaten kayıtlı mı kontrol et
        db.get("SELECT email FROM users WHERE email = ?", [email], (err, row) => {
            if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
            if (row) return res.status(400).json({ success: false, message: "Bu email zaten kayıtlı!" });
            
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const verificationExpires = Date.now() + 3600000; // 1 saat
            
            db.run("INSERT INTO users (email, pass, created, isVerified, verificationCode, verificationExpires) VALUES (?, ?, ?, 0, ?, ?)", 
                [email, pass, new Date().toISOString(), verificationCode, verificationExpires], function(err) {
                if (err) return res.status(500).json({ success: false, message: "Kayıt hatası!" });
                
                const host = req.get('host') || `localhost:${PORT}`;
                const protocol = req.protocol || 'http';
                const verifyLink = `${protocol}://${host}`;
                sendEmail(email, 'TR-GOZU Kayıt Doğrulama Kodu', `<p>Hesabınızı doğrulamak için doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye geri dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`);
                return res.json({ success: true, message: "Kayıt başarılı! Mailinize gönderilen kodla hesabınızı doğrulayın." });
            });
        });
    }

    if (mode === 'login') {
        db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
            if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
            if (!user) return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı!" });
            if (!user.isVerified) return res.status(403).json({ success: false, message: "Email doğrulanmamış!" });
            if (user.pass !== pass) return res.status(401).json({ success: false, message: "Şifre yanlış!" });
            
            // Session'a kullanıcı bilgisini kaydet
            req.session.user = {
                email: user.email,
                role: 'citizen',
                loginTime: new Date().toISOString()
            };
            
            return res.json({ success: true, message: "Giriş başarılı." });
        });
    }

    if (mode === 'admin') {
        const { key } = req.body;
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
    
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
        
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const resetExpires = Date.now() + 3600000; // 1 saat
        
        db.run("UPDATE users SET resetToken = ?, resetExpires = ? WHERE email = ?", 
            [resetCode, resetExpires, email], function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
            
            const resetLinkHost = req.get('host') || `localhost:${PORT}`;
            const resetLinkProtocol = req.protocol || 'http';
            const resetLink = `${resetLinkProtocol}://${resetLinkHost}`;
            sendEmail(email, 'TR-GOZU Şifre Sıfırlama Kodu', `<p>Şifrenizi sıfırlamak için doğrulama kodunuz: <b>${resetCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Eğer siteye dönmek isterseniz <a href="${resetLink}">buraya tıklayın</a>.</p>`);
            res.json({ success: true, message: "Doğrulama kodu mailinize gönderildi!" });
        });
    });
});

app.post('/api/verify-registration', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: "Email ve kod gereklidir!" });

    db.get("SELECT * FROM users WHERE email = ? AND verificationCode = ? AND verificationExpires > ?", 
        [email, code, Date.now()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });

        db.run("UPDATE users SET isVerified = 1, verificationCode = NULL, verificationExpires = NULL WHERE email = ?", 
            [email], function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
            
            // Doğrulama sonrası otomatik giriş için session oluştur
            req.session.user = {
                email: user.email,
                role: 'citizen',
                loginTime: new Date().toISOString()
            };
            
            res.json({ success: true, message: "Hesabınız doğrulandı! Hoş geldiniz." });
        });
    });
});

app.post('/api/resend-verification-code', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email gereklidir!" });

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
        if (user.isVerified) return res.status(400).json({ success: false, message: "Bu hesap zaten doğrulanmış." });

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationExpires = Date.now() + 3600000;

        db.run("UPDATE users SET verificationCode = ?, verificationExpires = ? WHERE email = ?", 
            [verificationCode, verificationExpires, email], function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });

            const host = req.get('host') || `localhost:${PORT}`;
            const protocol = req.protocol || 'http';
            const verifyLink = `${protocol}://${host}`;
            sendEmail(email, 'TR-GOZU Doğrulama Kodu Tekrar', `<p>Yeni doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`);
            res.json({ success: true, message: "Yeni doğrulama kodu gönderildi!" });
        });
    });
});

app.post('/api/reset-password', (req, res) => {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
        return res.status(400).json({ success: false, message: "Email, kod ve yeni şifre gereklidir!" });
    }

    db.get("SELECT * FROM users WHERE email = ? AND resetToken = ? AND resetExpires > ?", 
        [email, token, Date.now()], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: "Veritabanı hatası!" });
        if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });
        
        db.run("UPDATE users SET pass = ?, resetToken = NULL, resetExpires = NULL WHERE email = ?", 
            [newPassword, email], function(err) {
            if (err) return res.status(500).json({ success: false, message: "Güncelleme hatası!" });
            res.json({ success: true, message: "Şifre başarıyla güncellendi!" });
        });
    });
});
});

app.get('/api/messages/:userId', (req, res) => {
    const msgs = readJSON(MESSAGES_FILE);
    const userId = decodeURIComponent(req.params.userId);
    // Burada hem gelen hem giden mesajları eksiksiz döndürdüğünden emin ol
    res.json(msgs.filter(m => m.from === userId || m.to === userId || m.to === 'ADMIN'));
});

// SUNUCUYU BAŞLAT
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu ${PORT} portunda tam yetkiyle aktif!`);
});

// Uygulama kapatıldığında veritabanını kapat
process.on('exit', () => {
    db.close((err) => {
        if (err) {
            console.error('Veritabanı kapatma hatası:', err.message);
        } else {
            console.log('Veritabanı bağlantısı kapatıldı.');
        }
    });
});
