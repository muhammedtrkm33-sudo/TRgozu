const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('..'));

const USERS_FILE = './users.json';
const SOS_FILE = './sos.json';
const MESSAGES_FILE = './messages.json';
const VOLUNTEERS_FILE = './volunteers.json';

const readJSON = (file) => {
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file)); } catch (e) { return []; }
};
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

app.post('/save-user', (req, res) => {
    const { email, pass, mode } = req.body;
    let users = readJSON(USERS_FILE);
    const user = users.find(u => u.email === email);
    if (mode === 'reg') {
        if (user) return res.status(400).json({ success: false, message: "Bu email zaten kayitli!" });
        users.push({ email, pass, created: new Date().toISOString(), lat: null, lng: null, lastActive: null, healthStatus: null, battery: null, isSOS: false, isPanic: false });
        writeJSON(USERS_FILE, users);
        return res.json({ success: true, message: "Kayit basarili!" });
    }
    if (mode === 'login') {
        if (!user) return res.status(404).json({ success: false, message: "Kullanici bulunamadi!" });
        if (user.pass !== pass) return res.status(401).json({ success: false, message: "Sifre yanlis!" });
        return res.json({ success: true, message: "Giris basarili." });
    }
});

app.post('/api/citizen/update', (req, res) => {
    const { email, lat, lng, lastActive, lastMoveAt, healthStatus, healthNote, battery, isSOS, isPanic } = req.body;
    let users = readJSON(USERS_FILE);
    const idx = users.findIndex(u => u.email === email);
    if (idx === -1) {
        users.push({ email, lat, lng, lastActive, lastMoveAt, healthStatus, healthNote, battery, isSOS: isSOS || false, isPanic: isPanic || false });
    } else {
        if (lat !== undefined) users[idx].lat = lat;
        if (lng !== undefined) users[idx].lng = lng;
        if (lastActive !== undefined) users[idx].lastActive = lastActive;
        if (lastMoveAt !== undefined) users[idx].lastMoveAt = lastMoveAt;
        if (healthStatus !== undefined) users[idx].healthStatus = healthStatus;
        if (healthNote !== undefined) users[idx].healthNote = healthNote;
        if (battery !== undefined) users[idx].battery = battery;
        if (isSOS !== undefined) users[idx].isSOS = isSOS;
        if (isPanic !== undefined) users[idx].isPanic = isPanic;
    }
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.get('/api/citizens', (req, res) => res.json(readJSON(USERS_FILE)));

app.post('/api/sos', (req, res) => {
    let list = readJSON(SOS_FILE);
    list.push(req.body);
    writeJSON(SOS_FILE, list);
    res.json({ success: true });
});

app.get('/api/sos', (req, res) => res.json(readJSON(SOS_FILE)));

app.post('/api/messages', (req, res) => {
    let msgs = readJSON(MESSAGES_FILE);
    msgs.push(req.body);
    writeJSON(MESSAGES_FILE, msgs);
    res.json({ success: true });
});

app.get('/api/messages/:userId', (req, res) => {
    const msgs = readJSON(MESSAGES_FILE);
    const userId = decodeURIComponent(req.params.userId);
    res.json(msgs.filter(m => m.from === userId || m.to === userId));
});

app.post('/api/volunteers', (req, res) => {
    let vols = readJSON(VOLUNTEERS_FILE);
    vols.push(req.body);
    writeJSON(VOLUNTEERS_FILE, vols);
    res.json({ success: true });
});

app.get('/api/volunteers', (req, res) => res.json(readJSON(VOLUNTEERS_FILE)));

app.listen(process.env.PORT || 3000, () => console.log("TR-GOZU Backend " + (process.env.PORT || 3000) + " portunda aktif!"));
