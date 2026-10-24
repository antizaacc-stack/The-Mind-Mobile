# The Mind Online

Server Node.js (WebSocket) + klien web. Semua pemain buka URL yang sama, masukkan kode ruang yang sama.

## Jalankan lokal
    npm install
    npm start        # http://localhost:3000 (HP di Wi-Fi yang sama: http://IP-LAPTOP:3000)

## Deploy gratis ke Render
1. Upload folder ini ke repo GitHub.
2. render.com > New > Web Service > pilih repo. Build: `npm install`, Start: `npm start`, Plan: Free
   (atau New > Blueprint, otomatis membaca render.yaml).
3. Bagikan URL `https://nama-app.onrender.com` ke teman.

Catatan paket Free: server tidur setelah 15 menit tanpa trafik (buka pertama bisa lambat sekitar 1 menit),
dan state game hilang kalau server restart. Klien otomatis menyambung ulang.
