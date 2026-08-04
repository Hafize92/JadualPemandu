# Jadual Pemandu

Aplikasi web statik untuk rekod live penggunaan kereta projek jabatan.

## Fungsi

- Paparan kalendar untuk pengguna melihat kenderaan, pemandu, penyelia, destinasi, tarikh dan masa guna, serta tarikh dan masa selesai.
- Dashboard Penyelia untuk penyelia mengisi rekod penggunaan kenderaan yang dipertanggungjawabkan.
- Dashboard Admin untuk mengurus kenderaan, projek, kontrak, PIC, pemandu, penyelia, kapasiti, dan akses pengguna.
- Sync live menggunakan Firebase Auth dan Cloud Firestore apabila konfigurasi Firebase diisi.
- Watermark tetap: `Hafize | ver1.0.0`.

## Struktur Firebase

Koleksi Firestore:

- `vehicles/{vehicleId}`
- `bookings/{bookingId}`
- `users/{uid}`

Peranan pengguna dalam `users/{uid}.role`:

- `viewer`: hanya lihat jadual.
- `supervisor`: boleh tulis rekod penggunaan untuk kenderaan dibenarkan.
- `admin`: boleh urus semua rekod, kenderaan, kapasiti, dan akses.

Password pengguna disimpan oleh Firebase Authentication, bukan Firestore.

## Setup Firebase

1. Cipta projek Firebase.
2. Aktifkan Authentication dengan provider Email/Password.
3. Aktifkan Cloud Firestore.
4. Cipta Web App dalam Firebase dan salin konfigurasi ke `firebase-config.js`.
5. Cipta akaun admin dan penyelia dalam Firebase Authentication.
6. Salin UID akaun daripada Firebase Authentication.
7. Tambah dokumen `users/{uid}` untuk admin dahulu:

```json
{
  "displayName": "Admin Jadual",
  "email": "admin@example.com",
  "role": "admin",
  "allowedVehicleIds": []
}
```

8. Deploy rules Firestore daripada `firestore.rules`.
9. Tambah kenderaan melalui Dashboard Admin atau import contoh daripada `seed-data.sample.json`.

## Deploy Firebase Hosting

Pasang Firebase CLI dan log masuk:

```powershell
npm install -g firebase-tools
firebase login
```

Sediakan `.firebaserc` berdasarkan `.firebaserc.example`, kemudian deploy:

```powershell
firebase deploy
```

## Versi

Versi semasa: `ver1.0.0`.

- Pindaan minor: `ver1.0.1`.
- Pindaan major: `ver1.1.0`.
