# MediaBatchSave (Netlify + GitHub)

Website downloader media sosial: tempel sampai 25 link postingan, pilih Video atau Foto, unduh per file atau per kloter (.ZIP).

```
public/index.html                 halaman website (responsif, terang/gelap)
netlify/functions/api.mjs         server kecil: menyimpan kunci API, memanggil API, meneruskan file
netlify.toml                      pengaturan build Netlify
```

Nama menu di Netlify dan RapidAPI bisa sedikit berbeda dari tulisan di bawah, karena tampilannya sering diperbarui.

---

## Tahap 1. Siapkan akun (sekali saja)

1. **GitHub**: daftar di github.com bila belum punya.
2. **RapidAPI**: daftar di rapidapi.com.
3. **Netlify**: daftar di netlify.com dengan memilih **Sign up with GitHub** supaya langsung terhubung.

## Tahap 2. Ambil kunci API dari RapidAPI

1. Cari API downloader media sosial di RapidAPI yang menerima parameter `url` dan mengembalikan JSON.
2. Pilih paket gratis (**Basic**) lalu klik **Subscribe**.
3. Buka tab **Endpoints**, lalu catat tiga hal dari contoh kode:
   - `X-RapidAPI-Key` → nanti jadi `RAPIDAPI_KEY`
   - `X-RapidAPI-Host` → nanti jadi `RAPIDAPI_HOST`
   - Jalur endpoint unduh, misalnya `/download` → nanti jadi `RAPIDAPI_PATH` (dan nama parameter link bila bukan `url`)
4. Uji sekali di halaman RapidAPI dengan satu link TikTok. Pastikan balasannya berisi alamat video.

## Tahap 3. Taruh kode di GitHub

1. Di GitHub klik **New repository**, beri nama (misalnya `mediabatchsave`), pilih **Private** bila mau, lalu **Create**.
2. Di halaman repositori kosong klik **uploading an existing file**.
3. Seret **seluruh isi** folder proyek ini (folder `public`, folder `netlify`, `netlify.toml`, `package.json`, `.gitignore`, `README.md`) ke halaman itu. Struktur folder harus tetap sama, `index.html` harus ada di dalam `public`.
4. Klik **Commit changes**.

Jangan pernah menulis kunci API di file mana pun di repositori. Kunci hanya diisi di Netlify (tahap 4).

## Tahap 4. Hubungkan ke Netlify dan deploy

1. Masuk ke app.netlify.com, klik **Add new project > Import an existing project > GitHub**.
2. Izinkan Netlify mengakses repositori Anda lalu pilih repositori `mediabatchsave`.
3. Pengaturan build terisi sendiri dari `netlify.toml` (publish `public`, functions `netlify/functions`, build command kosong). Biarkan.
4. Buka **Add environment variables** (atau nanti di **Project configuration > Environment variables**) dan isi:

| Nama | Isi | Wajib |
|---|---|---|
| `RAPIDAPI_KEY` | kunci dari RapidAPI | ya |
| `RAPIDAPI_HOST` | host API, contoh `xxxx.p.rapidapi.com` | ya |
| `RAPIDAPI_PATH` | jalur endpoint, default `/download` | tidak |
| `RAPIDAPI_URL_PARAM` | nama parameter link, default `url` | tidak |
| `MAX_PROXY_BYTES` | batas ukuran file yang diteruskan server, default 19500000 | tidak |

5. Klik **Deploy**. Tunggu sampai statusnya **Published**.
6. Bila Anda mengubah variabel setelah deploy, jalankan **Deploys > Trigger deploy** agar nilai baru dipakai.

## Tahap 5. Periksa bahwa semuanya bekerja

1. Buka `https://NAMA-SITUS.netlify.app/api/health`. Harus tampil `{"ok":true,"configured":true}`. Bila `configured` bernilai `false`, variabel belum terbaca (ulangi langkah 4.6).
2. Buka halaman utama. Tidak boleh ada banner kuning.
3. Tempel satu link video publik, klik **Proses Link**, lalu klik **Unduh**. Uji juga **Unduh Kloter 1 (.ZIP)**.
4. Buka situs dari HP untuk memastikan tampilannya pas.

Ganti nama situs di **Project configuration > Change project name**. Untuk domain sendiri, buka **Domain management > Add a domain**.

## Tahap 6. Mengubah situs di kemudian hari

Ubah file di GitHub (ikon pensil di file, lalu **Commit changes**). Netlify otomatis men-deploy ulang dalam beberapa menit.

Untuk memasang iklan, ganti kotak `ad-space` di `public/index.html` dengan kode iklan Anda.

---

## Batasan paket gratis

- **File besar:** Netlify hanya mengizinkan respons streaming sampai 20 MB dan 60 detik. File di atas 19,5 MB tidak diteruskan lewat server. Tombol Unduh akan membuka file langsung dari sumbernya (simpan dari tab yang terbuka), dan file itu tidak ikut masuk ZIP. Video pendek dan foto biasanya muat.
- **Kuota:** paket gratis memakai 300 kredit per bulan dan berhenti bila habis. Bandwidth 1 GB memakan 20 kredit, jadi pantau di **Usage** di dashboard Netlify. Bila trafik besar, pertimbangkan Cloudflare Pages, yang tidak memiliki batas ukuran file ini.
- **Kuota RapidAPI** juga terbatas. Satu link = satu panggilan API.
- Link profil/akun belum didukung, hanya link per postingan.
- Format balasan tiap API berbeda. Server membaca format umum (tikwm dan daftar `medias`). Bila hasilnya kosong padahal link benar, buka **Logs > Functions** di Netlify, salin contoh balasan API, dan sesuaikan fungsi `normalize` di `api.mjs`.
- Unduh konten hanya dengan izin pembuatnya; aturan tiap platform tetap berlaku.

## Bila ada masalah

| Gejala | Penyebab dan solusi |
|---|---|
| Banner kuning "Server belum dihubungkan" | `RAPIDAPI_KEY` atau `RAPIDAPI_HOST` belum diisi, atau belum di-deploy ulang |
| "Kunci API ditolak" | Kunci salah atau belum Subscribe di RapidAPI |
| "Kuota API habis" | Jatah RapidAPI bulan ini terpakai |
| "Tidak ada video atau foto" | Postingan privat, atau format balasan API belum terbaca |
| Banner "Server unduhan tidak ditemukan" | Folder `netlify/functions` tidak ikut terunggah ke GitHub |
| Halaman 404 | `publish` bukan `public`, atau `index.html` tidak ada di dalam `public` |
