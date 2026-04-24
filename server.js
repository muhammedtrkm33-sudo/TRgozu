const express = require('express');
const fs = require('fs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const session = require('express-session');
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
};

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
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (mode === 'reg') {
        if (user) return res.status(400).json({ success: false, message: "Bu email zaten kayıtlı!" });
        
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationExpires = Date.now() + 3600000; // 1 saat
        users.push({ email, pass, created: new Date().toISOString(), isVerified: false, verificationCode, verificationExpires });
        writeJSON(USERS_FILE, users);
        
        const host = req.get('host') || `localhost:${PORT}`;
        const protocol = req.protocol || 'http';
        const verifyLink = `${protocol}://${host}`;
        sendEmail(email, 'TR-GOZU Kayıt Doğrulama Kodu', `<p>Hesabınızı doğrulamak için doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye geri dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`);
        return res.json({ success: true, message: "Kayıt başarılı! Mailinize gönderilen kodla hesabınızı doğrulayın." });
    }

    if (mode === 'login') {
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
    }

    if (mode === 'admin') {
        const { key } = req.body;
        const adminKeys = JSON.parse(fs.readFileSync(path.join(__dirname, 'yetkili.json'), 'utf8'));
        const unit = adminKeys[key];
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
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    
    if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
    
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetToken = resetCode;
    user.resetExpires = Date.now() + 3600000; // 1 saat
    writeJSON(USERS_FILE, users);
    
    const resetLinkHost = req.get('host') || `localhost:${PORT}`;
    const resetLinkProtocol = req.protocol || 'http';
    const resetLink = `${resetLinkProtocol}://${resetLinkHost}`;
    sendEmail(email, 'TR-GOZU Şifre Sıfırlama Kodu', `<p>Şifrenizi sıfırlamak için doğrulama kodunuz: <b>${resetCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Eğer siteye dönmek isterseniz <a href="${resetLink}">buraya tıklayın</a>.</p>`);
    res.json({ success: true, message: "Doğrulama kodu mailinize gönderildi!" });
});

app.post('/api/verify-registration', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: "Email ve kod gereklidir!" });

    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email && u.verificationCode === code && u.verificationExpires > Date.now());
    if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });

    user.isVerified = true;
    delete user.verificationCode;
    delete user.verificationExpires;
    writeJSON(USERS_FILE, users);
    
    // Doğrulama sonrası otomatik giriş için session oluştur
    req.session.user = {
        email: user.email,
        role: 'citizen',
        loginTime: new Date().toISOString()
    };
    
    res.json({ success: true, message: "Hesabınız doğrulandı! Hoş geldiniz." });
});

app.post('/api/resend-verification-code', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email gereklidir!" });

    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
    if (user.isVerified) return res.status(400).json({ success: false, message: "Bu hesap zaten doğrulanmış." });

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = verificationCode;
    user.verificationExpires = Date.now() + 3600000;
    writeJSON(USERS_FILE, users);

    const host = req.get('host') || `localhost:${PORT}`;
    const protocol = req.protocol || 'http';
    const verifyLink = `${protocol}://${host}`;
    sendEmail(email, 'TR-GOZU Doğrulama Kodu Tekrar', `<p>Yeni doğrulama kodunuz: <b>${verificationCode}</b></p><p>Bu kod 1 saat geçerlidir.</p><p>Siteye dönmek için <a href="${verifyLink}">buraya tıklayın</a>.</p>`);
    res.json({ success: true, message: "Yeni doğrulama kodu gönderildi!" });
});

app.post('/api/reset-password', (req, res) => {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) {
        return res.status(400).json({ success: false, message: "Email, kod ve yeni şifre gereklidir!" });
    }

    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email && u.resetToken === token && u.resetExpires > Date.now());
    
    if (!user) return res.status(400).json({ success: false, message: "Geçersiz kod veya süresi dolmuş!" });
    
    user.pass = newPassword;
    delete user.resetToken;
    delete user.resetExpires;
    writeJSON(USERS_FILE, users);
    
    res.json({ success: true, message: "Şifre başarıyla güncellendi!" });
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
