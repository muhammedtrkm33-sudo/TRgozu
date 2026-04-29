# Email Gönderme Konfigürasyonu - Setup Rehberi

## Düzeltilen Hatalar ✅
1. **Response gönderme hataları** - `return` ifadeleri eksikti (6 yer)
2. **Email konfigürasyonu dokümantasyonu** - `.env` dosyası daha açık hale getirildi

---

## Gmail Kullanarak Email Gönderme

### Adım 1: 2-Faktörlü Doğrulamayı Etkinleştirin
1. Google Hesabınıza giriş yapın: https://myaccount.google.com
2. Sol menüden **Güvenlik** seçin
3. "2-Adımlı Doğrulama"yı etkinleştirin

### Adım 2: Uygulama Şifresi Oluşturun
1. https://myaccount.google.com/apppasswords adresine gidin
2. Uygulama: **Mail** seçin
3. Cihaz: **Windows Bilgisayar** (veya kullandığınız sistem) seçin
4. **Şifre Oluştur** butonuna tıklayın
5. Verilen 16 karakterlik şifreyi kopyalayın

### Adım 3: .env Dosyasını Güncelleyin
`.env` dosyasını açın ve şu bilgileri girin:

```
EMAIL_USER=sizin-email@gmail.com
EMAIL_PASS=16karakterlikSifre
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
PORT=10000
```

---

## Diğer Email Sağlayıcılar Kullanma

Eğer Gmail yerine başka bir SMTP sunucusu kullanmak istiyorsanız:

### Outlook/Hotmail:
```
EMAIL_USER=isim@outlook.com
EMAIL_PASS=sifre
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

### SendGrid:
```
EMAIL_USER=apikey
EMAIL_PASS=SG.your-api-key-here
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
```

### Mailgun:
```
EMAIL_USER=postmaster@mg.yourdomain.com
EMAIL_PASS=password
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_SECURE=false
```

---

## Email Göndermenin Çalıştığını Test Etme

1. Sunucuyu başlatın:
```bash
node server.js
```

2. Konsolda şunu göreceksiniz:
```
Email sunucusu bağlantısı başarılı
```

3. Uygulamada bir hesap oluşturun ve doğrulama emailini alıp almadığınızı kontrol edin

---

## Sorun Giderme

### "Email yapılandırması eksik" hatası
- `EMAIL_USER` ve `EMAIL_PASS` değerlerinin `.env` dosyasında olduğundan emin olun
- Placeholder değerler ("your-email@gmail.com") yerine gerçek bilgiler kullanın

### "Email sunucusu bağlantı hatası"
- EMAIL_USER, EMAIL_PASS, EMAIL_HOST, EMAIL_PORT değerlerini kontrol edin
- EMAIL_SECURE değerinin doğru olduğundan emin olun (Gmail için `false`)
- Güvenlik duvarı/proxy ayarlarını kontrol edin

### Email gönderilmiyor ama hata yok
- Sunucuyu yeniden başlatın
- `.env` dosyasında değişiklik yaptıktan sonra mutlaka server'i restart edin
- Konsol loglarını kontrol edin (`Email gönderildi:` satırını arayın)

---

## Güvenlik Notu
- `.env` dosyasını **asla** Git'e yüklemez, `.gitignore` dosyasına ekleyin
- Şifreler ve API anahtarlarını hiçbir yere commit etmeyin
- `.env.example` dosyası sadece örnek değerleri içermeli
