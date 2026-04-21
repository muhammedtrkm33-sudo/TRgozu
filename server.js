const express = require('express');
const fs = require('fs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const app = express();

// CORS Ayarı: Her yerden gelen isteğe izin ver (Android ve Web için şart)
app.use(cors());
app.use(express.json());

// Statik Dosyalar: index.html ana dizindeyse '.' kullanıyoruz
app.use(express.static('.'));

// PORT Ayarı: Render'daki ayarın 3000 ise bu kod ona uyar
const PORT = process.env.PORT || 3000;

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

// --- ROTALAR (ENDPOINTS) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/save-user', (req, res) => {
    const { email, pass, mode } = req.body;
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);

    if (mode === 'reg') {
        if (user) return res.status(400).json({ success: false, message: "Bu email zaten kayıtlı!" });
        users.push({ email, pass, created: new Date().toISOString() });
        writeJSON(USERS_FILE, users);
        sendEmail(email, 'Hoş Geldiniz', '<h2>TR-GOZU Kaydı Başarılı!</h2>');
        return res.json({ success: true, message: "Kayıt başarılı!" });
    }

    if (mode === 'login') {
        if (!user) return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı!" });
        if (user.pass !== pass) return res.status(401).json({ success: false, message: "Şifre yanlış!" });
        return res.json({ success: true, message: "Giriş başarılı." });
    }
});

// Şifre Sıfırlama Rotaları
app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    
    if (!user) return res.status(404).json({ success: false, message: "Bu email bulunamadı!" });
    
    const newPass = Math.random().toString(36).slice(-8);
    user.pass = newPass;
    writeJSON(USERS_FILE, users);
    
    sendEmail(email, 'Yeni Şifre', `<p>Yeni şifreniz: <b>${newPass}</b></p>`);
    res.json({ success: true, message: "Mail gönderildi!" });
});

// SUNUCUYU BAŞLAT
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunucu ${PORT} portunda tam yetkiyle aktif!`);
});