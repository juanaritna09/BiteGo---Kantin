
-- ============================================================
-- 1. EXTENSION
-- Harus dibuat SEBELUM index GIN trigram (dipakai di bagian 14)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 2. USERS
-- Menyimpan data administrator, pelanggan, dan penjual
-- ============================================================

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    no_hp VARCHAR(20),
    kelas VARCHAR(50),

    role VARCHAR(20) NOT NULL DEFAULT 'pelanggan'
        CHECK (role IN ('admin', 'pelanggan', 'penjual')),

    foto_profil TEXT,
    aktif BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. KANTIN
-- Menyimpan identitas dan informasi setiap toko kantin
-- ============================================================

CREATE TABLE kantin (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pemilik_id BIGINT NOT NULL,

    nama_kantin VARCHAR(150) NOT NULL,
    slug VARCHAR(180) UNIQUE NOT NULL,
    deskripsi TEXT,
    slogan VARCHAR(255),

    lokasi VARCHAR(150),
    nomor_stand VARCHAR(50),

    gambar_kantin TEXT,
    banner_kantin TEXT,

    status_buka BOOLEAN NOT NULL DEFAULT TRUE,
    aktif BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_kantin_pemilik
        FOREIGN KEY (pemilik_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

-- ============================================================
-- 4. KATEGORI
-- Menyimpan kategori makanan, minuman, dan jajanan
-- ============================================================

CREATE TABLE kategori (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    nama_kategori VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) UNIQUE NOT NULL,
    deskripsi TEXT,
    icon VARCHAR(100),

    aktif BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. PRODUK
-- Menyimpan seluruh menu dari berbagai kantin
-- ============================================================

CREATE TABLE produk (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    kantin_id BIGINT NOT NULL,
    kategori_id BIGINT NOT NULL,

    nama_produk VARCHAR(150) NOT NULL,
    slug VARCHAR(180) NOT NULL,
    deskripsi TEXT,

    harga NUMERIC(12,2) NOT NULL
        CHECK (harga >= 0),

    stok INTEGER NOT NULL DEFAULT 0
        CHECK (stok >= 0),

    gambar TEXT,

    tersedia BOOLEAN NOT NULL DEFAULT TRUE,
    populer BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_produk_kantin
        FOREIGN KEY (kantin_id)
        REFERENCES kantin(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_produk_kategori
        FOREIGN KEY (kategori_id)
        REFERENCES kategori(id)
        ON DELETE RESTRICT,

    CONSTRAINT unique_produk_slug_per_kantin
        UNIQUE (kantin_id, slug)
);

-- ============================================================
-- 6. ULASAN KANTIN
-- Menyimpan rating dan ulasan pelanggan
-- ============================================================

CREATE TABLE ulasan (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    kantin_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,

    rating SMALLINT NOT NULL
        CHECK (rating BETWEEN 1 AND 5),

    komentar TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ulasan_kantin
        FOREIGN KEY (kantin_id)
        REFERENCES kantin(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_ulasan_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

-- ============================================================
-- 7. KERANJANG
-- Menyimpan keranjang belanja setiap pelanggan
-- Satu pelanggan memiliki satu keranjang aktif
-- ============================================================

CREATE TABLE keranjang (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'converted', 'abandoned')),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_keranjang_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX unique_active_cart_per_user
ON keranjang(user_id)
WHERE status = 'active';

-- ============================================================
-- 8. DETAIL KERANJANG
-- Menyimpan produk yang dipilih pelanggan
-- Mendukung produk dari berbagai kantin
-- ============================================================

CREATE TABLE detail_keranjang (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    keranjang_id BIGINT NOT NULL,
    produk_id BIGINT NOT NULL,

    jumlah INTEGER NOT NULL DEFAULT 1
        CHECK (jumlah > 0),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_detail_keranjang
        FOREIGN KEY (keranjang_id)
        REFERENCES keranjang(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_detail_keranjang_produk
        FOREIGN KEY (produk_id)
        REFERENCES produk(id)
        ON DELETE RESTRICT,

    CONSTRAINT unique_produk_per_keranjang
        UNIQUE (keranjang_id, produk_id)
);

-- ============================================================
-- 9. PESANAN
-- Menyimpan transaksi utama pelanggan
-- Satu transaksi dapat mencakup beberapa kantin
-- ============================================================

CREATE TABLE pesanan (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    kode_pesanan VARCHAR(50) UNIQUE NOT NULL,

    user_id BIGINT NOT NULL,

    nama_pemesan VARCHAR(100) NOT NULL,
    kelas_pemesan VARCHAR(50) NOT NULL,
    no_hp_pemesan VARCHAR(20),

    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (subtotal >= 0),

    total_pembayaran NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (total_pembayaran >= 0),

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'processing',
            'partially_ready',
            'ready',
            'completed',
            'cancelled'
        )),

    catatan TEXT,

    waktu_pesan TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pesanan_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);

-- ============================================================
-- 10. PESANAN KANTIN
-- Memisahkan pesanan utama berdasarkan masing-masing kantin
-- Setiap penjual mengelola subpesanannya sendiri
-- ============================================================

CREATE TABLE pesanan_kantin (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    pesanan_id BIGINT NOT NULL,
    kantin_id BIGINT NOT NULL,

    kode_subpesanan VARCHAR(60) UNIQUE NOT NULL,

    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (subtotal >= 0),

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'confirmed',
            'processing',
            'ready',
            'completed',
            'cancelled'
        )),

    catatan TEXT,

    waktu_diterima TIMESTAMPTZ,
    waktu_diproses TIMESTAMPTZ,
    waktu_siap TIMESTAMPTZ,
    waktu_selesai TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pesanan_kantin
        FOREIGN KEY (pesanan_id)
        REFERENCES pesanan(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_subpesanan_kantin
        FOREIGN KEY (kantin_id)
        REFERENCES kantin(id)
        ON DELETE RESTRICT,

    CONSTRAINT unique_kantin_per_pesanan
        UNIQUE (pesanan_id, kantin_id)
);

-- ============================================================
-- 11. DETAIL PESANAN
-- Menyimpan rincian produk pada setiap subpesanan kantin
-- Harga dan nama produk disimpan sebagai snapshot transaksi
-- ============================================================

CREATE TABLE detail_pesanan (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    pesanan_kantin_id BIGINT NOT NULL,
    produk_id BIGINT NOT NULL,

    nama_produk VARCHAR(150) NOT NULL,
    harga_satuan NUMERIC(12,2) NOT NULL
        CHECK (harga_satuan >= 0),

    jumlah INTEGER NOT NULL
        CHECK (jumlah > 0),

    subtotal NUMERIC(12,2) NOT NULL
        CHECK (subtotal >= 0),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_detail_subpesanan
        FOREIGN KEY (pesanan_kantin_id)
        REFERENCES pesanan_kantin(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_detail_produk
        FOREIGN KEY (produk_id)
        REFERENCES produk(id)
        ON DELETE RESTRICT
);

-- ============================================================
-- 12. PEMBAYARAN
-- Menyimpan pembayaran untuk satu transaksi utama
-- ============================================================

CREATE TABLE pembayaran (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    pesanan_id BIGINT NOT NULL UNIQUE,

    metode_pembayaran VARCHAR(30) NOT NULL
        CHECK (metode_pembayaran IN (
            'cod',
            'tunai',
            'transfer',
            'qris'
        )),

    jumlah_bayar NUMERIC(12,2) NOT NULL
        CHECK (jumlah_bayar >= 0),

    status_pembayaran VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status_pembayaran IN (
            'pending',
            'paid',
            'failed',
            'refunded'
        )),

    referensi_pembayaran VARCHAR(150),

    bukti_pembayaran TEXT,

    waktu_pembayaran TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pembayaran_pesanan
        FOREIGN KEY (pesanan_id)
        REFERENCES pesanan(id)
        ON DELETE RESTRICT
);

-- ============================================================
-- 13. RIWAYAT PESANAN
-- Mencatat perubahan status masing-masing subpesanan
-- ============================================================

CREATE TABLE riwayat_pesanan (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    pesanan_kantin_id BIGINT NOT NULL,
    admin_id BIGINT,

    status_sebelumnya VARCHAR(30),
    status_baru VARCHAR(30) NOT NULL,

    keterangan TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_riwayat_subpesanan
        FOREIGN KEY (pesanan_kantin_id)
        REFERENCES pesanan_kantin(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_riwayat_admin
        FOREIGN KEY (admin_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- ============================================================
-- 14. INDEX PRODUK
-- Mempercepat pencarian produk dan filter kategori
-- ============================================================

CREATE INDEX idx_produk_kantin
ON produk(kantin_id);

CREATE INDEX idx_produk_kategori
ON produk(kategori_id);

CREATE INDEX idx_produk_nama
ON produk USING GIN (nama_produk gin_trgm_ops);

CREATE INDEX idx_produk_tersedia
ON produk(tersedia);

CREATE INDEX idx_produk_populer
ON produk(populer);

-- ============================================================
-- 15. INDEX KANTIN
-- Mempercepat pencarian dan filter toko
-- ============================================================

CREATE INDEX idx_kantin_pemilik
ON kantin(pemilik_id);

CREATE INDEX idx_kantin_status
ON kantin(status_buka);

CREATE INDEX idx_kantin_aktif
ON kantin(aktif);

-- ============================================================
-- 16. INDEX KERANJANG
-- Mempercepat pengambilan data keranjang
-- ============================================================

CREATE INDEX idx_detail_keranjang
ON detail_keranjang(keranjang_id);

-- ============================================================
-- 17. INDEX PESANAN
-- Mempercepat pencarian transaksi pelanggan
-- ============================================================

CREATE INDEX idx_pesanan_user
ON pesanan(user_id);

CREATE INDEX idx_pesanan_status
ON pesanan(status);

CREATE INDEX idx_pesanan_waktu
ON pesanan(waktu_pesan DESC);

CREATE INDEX idx_pesanan_kantin
ON pesanan_kantin(kantin_id);

CREATE INDEX idx_pesanan_kantin_status
ON pesanan_kantin(status);

CREATE INDEX idx_detail_pesanan_subpesanan
ON detail_pesanan(pesanan_kantin_id);

-- ============================================================
-- 18. INDEX PEMBAYARAN DAN RIWAYAT
-- ============================================================

CREATE INDEX idx_pembayaran_status
ON pembayaran(status_pembayaran);

CREATE INDEX idx_riwayat_subpesanan
ON riwayat_pesanan(pesanan_kantin_id);

CREATE INDEX idx_ulasan_kantin
ON ulasan(kantin_id);

-- ============================================================
-- 20. FUNCTION UPDATED_AT
-- Memperbarui timestamp ketika data diubah
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 21. TRIGGER UPDATED_AT
-- ============================================================

CREATE TRIGGER trg_users_updated
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_kantin_updated
BEFORE UPDATE ON kantin
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_produk_updated
BEFORE UPDATE ON produk
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_keranjang_updated
BEFORE UPDATE ON keranjang
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_detail_keranjang_updated
BEFORE UPDATE ON detail_keranjang
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pesanan_updated
BEFORE UPDATE ON pesanan
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pesanan_kantin_updated
BEFORE UPDATE ON pesanan_kantin
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_pembayaran_updated
BEFORE UPDATE ON pembayaran
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 22. DATA AWAL KATEGORI
-- ============================================================

INSERT INTO kategori
(nama_kategori, slug, deskripsi, icon)
VALUES
('Makanan Berat', 'makanan-berat', 'Menu makanan utama', '🍲'),
('Makanan Ringan', 'makanan-ringan', 'Berbagai makanan ringan', '🥪'),
('Minuman', 'minuman', 'Berbagai jenis minuman', '🥤'),
('Jajanan', 'jajanan', 'Aneka jajanan kantin', '🍢'),
('Dessert', 'dessert', 'Makanan penutup dan hidangan manis', '🧁');

-- ============================================================
-- 23. QUERY MENAMPILKAN DAFTAR KANTIN
-- Menampilkan informasi toko dan rating
-- ============================================================

SELECT
    k.id,
    k.nama_kantin,
    k.slug,
    k.deskripsi,
    k.slogan,
    k.lokasi,
    k.nomor_stand,
    k.gambar_kantin,
    k.status_buka,
    COALESCE(ROUND(AVG(u.rating), 1), 0) AS rating,
    COUNT(u.id) AS jumlah_ulasan
FROM kantin k
LEFT JOIN ulasan u ON u.kantin_id = k.id
WHERE k.aktif = TRUE
GROUP BY k.id
ORDER BY k.nama_kantin;

-- ============================================================
-- 24. QUERY MENAMPILKAN PRODUK
-- Menampilkan produk beserta informasi kantin dan kategori
-- ============================================================

SELECT
    p.id,
    p.nama_produk,
    p.slug,
    p.deskripsi,
    p.harga,
    p.stok,
    p.gambar,
    p.tersedia,
    p.populer,
    k.nama_kantin,
    kt.nama_kategori
FROM produk p
JOIN kantin k ON p.kantin_id = k.id
JOIN kategori kt ON p.kategori_id = kt.id
WHERE
    p.tersedia = TRUE
    AND p.stok > 0
    AND k.aktif = TRUE
ORDER BY p.created_at DESC;

-- ============================================================
-- 25. QUERY PENCARIAN PRODUK
-- ============================================================

SELECT
    p.id,
    p.nama_produk,
    p.harga,
    p.gambar,
    k.nama_kantin,
    kt.nama_kategori
FROM produk p
JOIN kantin k ON p.kantin_id = k.id
JOIN kategori kt ON p.kategori_id = kt.id
WHERE
    p.nama_produk ILIKE '%nasi%'
    AND p.tersedia = TRUE
    AND p.stok > 0
    AND k.aktif = TRUE
ORDER BY p.nama_produk;

-- ============================================================
-- 26. QUERY MENU POPULER
-- ============================================================

SELECT
    p.id,
    p.nama_produk,
    p.harga,
    p.gambar,
    k.nama_kantin
FROM produk p
JOIN kantin k ON p.kantin_id = k.id
WHERE
    p.populer = TRUE
    AND p.tersedia = TRUE
    AND p.stok > 0
    AND k.aktif = TRUE
ORDER BY p.nama_produk;

-- ============================================================
-- 27. QUERY DETAIL KANTIN
-- ============================================================

SELECT
    k.id,
    k.nama_kantin,
    k.deskripsi,
    k.slogan,
    k.lokasi,
    k.nomor_stand,
    k.gambar_kantin,
    k.banner_kantin,
    k.status_buka,
    COALESCE(ROUND(AVG(u.rating), 1), 0) AS rating,
    COUNT(u.id) AS jumlah_ulasan
FROM kantin k
LEFT JOIN ulasan u ON u.kantin_id = k.id
WHERE k.id = 1
GROUP BY k.id;

-- ============================================================
-- 28. QUERY PRODUK BERDASARKAN KANTIN
-- ============================================================

SELECT
    p.id,
    p.nama_produk,
    p.deskripsi,
    p.harga,
    p.stok,
    p.gambar,
    p.tersedia,
    kt.nama_kategori
FROM produk p
JOIN kategori kt ON p.kategori_id = kt.id
WHERE
    p.kantin_id = 1
    AND p.tersedia = TRUE
ORDER BY p.nama_produk;

-- ============================================================
-- 29. QUERY ISI KERANJANG
-- Mengelompokkan produk berdasarkan kantin
-- ============================================================

SELECT
    k.nama_kantin,
    p.id AS produk_id,
    p.nama_produk,
    p.gambar,
    p.harga,
    dk.jumlah,
    (p.harga * dk.jumlah) AS subtotal
FROM keranjang kr
JOIN detail_keranjang dk ON dk.keranjang_id = kr.id
JOIN produk p ON p.id = dk.produk_id
JOIN kantin k ON k.id = p.kantin_id
WHERE
    kr.user_id = 1
    AND kr.status = 'active'
ORDER BY k.nama_kantin, p.nama_produk;

-- ============================================================
-- 30. QUERY TOTAL KERANJANG
-- ============================================================

SELECT
    COUNT(dk.id) AS jumlah_jenis_produk,
    COALESCE(SUM(dk.jumlah), 0) AS total_item,
    COALESCE(SUM(p.harga * dk.jumlah), 0) AS total_pembayaran
FROM keranjang kr
JOIN detail_keranjang dk ON dk.keranjang_id = kr.id
JOIN produk p ON p.id = dk.produk_id
WHERE
    kr.user_id = 1
    AND kr.status = 'active';

-- ============================================================
-- 31. QUERY RIWAYAT PESANAN PELANGGAN
-- ============================================================

SELECT
    ps.id,
    ps.kode_pesanan,
    ps.nama_pemesan,
    ps.kelas_pemesan,
    ps.total_pembayaran,
    ps.status,
    ps.waktu_pesan
FROM pesanan ps
WHERE ps.user_id = 1
ORDER BY ps.waktu_pesan DESC;

-- ============================================================
-- 32. QUERY DETAIL STATUS PESANAN PER KANTIN
-- ============================================================

SELECT
    ps.kode_pesanan,
    pk.kode_subpesanan,
    k.nama_kantin,
    pk.subtotal,
    pk.status,
    pk.waktu_diterima,
    pk.waktu_diproses,
    pk.waktu_siap,
    pk.waktu_selesai
FROM pesanan_kantin pk
JOIN pesanan ps ON ps.id = pk.pesanan_id
JOIN kantin k ON k.id = pk.kantin_id
WHERE ps.id = 1
ORDER BY pk.id;

-- ============================================================
-- 33. QUERY DETAIL PRODUK PESANAN
-- ============================================================

SELECT
    ps.kode_pesanan,
    k.nama_kantin,
    dp.nama_produk,
    dp.harga_satuan,
    dp.jumlah,
    dp.subtotal
FROM detail_pesanan dp
JOIN pesanan_kantin pk ON pk.id = dp.pesanan_kantin_id
JOIN pesanan ps ON ps.id = pk.pesanan_id
JOIN kantin k ON k.id = pk.kantin_id
WHERE ps.id = 1;

-- ============================================================
-- 34. QUERY RIWAYAT STATUS PESANAN
-- ============================================================

SELECT
    ps.kode_pesanan,
    k.nama_kantin,
    rp.status_sebelumnya,
    rp.status_baru,
    rp.keterangan,
    rp.created_at
FROM riwayat_pesanan rp
JOIN pesanan_kantin pk ON pk.id = rp.pesanan_kantin_id
JOIN pesanan ps ON ps.id = pk.pesanan_id
JOIN kantin k ON k.id = pk.kantin_id
WHERE ps.id = 1
ORDER BY rp.created_at ASC;

-- ============================================================
-- 35. QUERY PESANAN MASUK PENJUAL
-- ============================================================

SELECT
    pk.id,
    pk.kode_subpesanan,
    ps.kode_pesanan,
    ps.nama_pemesan,
    ps.kelas_pemesan,
    ps.no_hp_pemesan,
    pk.subtotal,
    pk.status,
    pk.created_at
FROM pesanan_kantin pk
JOIN pesanan ps ON ps.id = pk.pesanan_id
JOIN kantin k ON k.id = pk.kantin_id
WHERE
    k.pemilik_id = 1
    AND pk.status IN ('pending', 'confirmed', 'processing', 'ready')
ORDER BY pk.created_at DESC;

-- ============================================================
-- 36. QUERY PEMBAYARAN
-- ============================================================

SELECT
    ps.kode_pesanan,
    ps.total_pembayaran,
    pb.metode_pembayaran,
    pb.jumlah_bayar,
    pb.status_pembayaran,
    pb.waktu_pembayaran
FROM pembayaran pb
JOIN pesanan ps ON ps.id = pb.pesanan_id
WHERE ps.id = 1;

-- ============================================================
-- 37. QUERY LAPORAN PENJUALAN PER KANTIN
-- ============================================================

SELECT
    k.nama_kantin,
    COUNT(pk.id) AS jumlah_subpesanan,
    COALESCE(SUM(pk.subtotal), 0) AS total_penjualan
FROM pesanan_kantin pk
JOIN kantin k ON k.id = pk.kantin_id
WHERE pk.status = 'completed'
GROUP BY k.id, k.nama_kantin
ORDER BY total_penjualan DESC;

-- ============================================================
-- 38. QUERY LAPORAN PENJUALAN KESELURUHAN
-- ============================================================

SELECT
    COUNT(id) AS jumlah_transaksi,
    COALESCE(SUM(total_pembayaran), 0) AS total_pendapatan
FROM pesanan
WHERE status = 'completed';

-- ============================================================
-- 39. QUERY PRODUK TERLARIS
-- ============================================================

SELECT
    dp.produk_id,
    dp.nama_produk,
    SUM(dp.jumlah) AS total_terjual
FROM detail_pesanan dp
JOIN pesanan_kantin pk ON pk.id = dp.pesanan_kantin_id
WHERE pk.status = 'completed'
GROUP BY dp.produk_id, dp.nama_produk
ORDER BY total_terjual DESC;

-- ============================================================
-- 40. QUERY DATA ULASAN KANTIN
-- ============================================================

SELECT
    u.id,
    us.nama AS nama_pelanggan,
    u.rating,
    u.komentar,
    u.created_at
FROM ulasan u
JOIN users us ON us.id = u.user_id
WHERE u.kantin_id = 1
ORDER BY u.created_at DESC;

-- ============================================================
-- END OF BITEGO DATABASE
-- ============================================================




-- ============================================================
-- DATA CONTOH BITEGO (users, kantin, produk, ulasan)
-- Jalankan SETELAH Query.sql bagian B selesai, saat terhubung ke
-- database "bitego". Jalankan sebelum / sesudah "npm start" boleh,
-- tetapi jika server sudah mengisi data contohnya sendiri, hapus
-- dulu dengan baris TRUNCATE di bawah (hapus tanda -- di depannya).
-- ============================================================

-- TRUNCATE users, kantin, produk, ulasan, pesanan RESTART IDENTITY CASCADE;

-- ============================================================
-- 1. USERS: 4 penjual, 1 admin, 3 pelanggan
-- Password hanya placeholder (login penjual/admin belum dibuat)
-- ============================================================

INSERT INTO users (nama, email, password, no_hp, kelas, role) VALUES
('Admin BiteGo',     'admin@bitego.local',    '-placeholder-', '081200000000', NULL, 'admin'),
('Siti Rahayu',      'bu.siti@bitego.local',  '-placeholder-', '081211110001', NULL, 'penjual'),
('Budi Santoso',     'pak.budi@bitego.local', '-placeholder-', '081211110002', NULL, 'penjual'),
('Ani Wulandari',    'bu.ani@bitego.local',   '-placeholder-', '081211110003', NULL, 'penjual'),
('Rina Marlina',     'bu.rina@bitego.local',  '-placeholder-', '081211110004', NULL, 'penjual'),
('Gian Nur Azkiya',  'gian@bitego.local',     '-placeholder-', '081222220001', 'XI RPL B', 'pelanggan'),
('Rani Putri',       'rani@bitego.local',     '-placeholder-', '081222220002', 'X TKJ A',  'pelanggan'),
('Dimas Pratama',    'dimas@bitego.local',    '-placeholder-', '081222220003', 'XII MM 1', 'pelanggan');

-- ============================================================
-- 2. KANTIN (gambar_kantin dikosongkan: tampilan memakai papan nama)
-- ============================================================

INSERT INTO kantin (pemilik_id, nama_kantin, slug, deskripsi, slogan, lokasi, nomor_stand, status_buka)
SELECT u.id, v.nama, v.slug, v.deskripsi, v.slogan, 'Kantin Sekolah', v.stand, TRUE
FROM (VALUES
('bu.siti@bitego.local','Kantin Bu Siti','kantin-bu-siti','Nasi, mie, dan aneka lauk lezat.','Makanan enak, harga bersahabat!','Stand 1'),
('pak.budi@bitego.local','Kantin Pak Budi','kantin-pak-budi','Makanan rumahan dengan rasa istimewa.','Masakan rumahan dengan rasa istimewa.','Stand 2'),
('bu.ani@bitego.local','Kantin Bu Ani','kantin-bu-ani','Snack, minuman, dan dessert segar.','Jajanan sehat dan bergizi.','Stand 3'),
('bu.rina@bitego.local','Kantin Bu Rina','kantin-bu-rina','Aneka makanan ringan dan jajanan yang nikmat.','Aneka camilan yang nikmat.','Stand 4')
) AS v(email, nama, slug, deskripsi, slogan, stand)
JOIN users u ON u.email = v.email;

-- ============================================================
-- 3. PRODUK (gambar: foto placeholder berdasarkan kata kunci;
--    ganti dengan foto asli kapan saja lewat UPDATE produk SET gambar = ...)
-- ============================================================

INSERT INTO produk (kantin_id, kategori_id, nama_produk, slug, deskripsi, harga, stok, gambar, populer)
SELECT k.id, kt.id, v.nama, v.slug, v.deskripsi, v.harga, v.stok, v.gambar, v.populer
FROM (VALUES
('kantin-bu-siti','makanan-berat','Nasi Goreng Spesial','nasi-goreng-spesial','Nasi goreng dengan telur mata sapi, ayam suwir, dan acar.',15000,25,'https://loremflickr.com/480/360/fried,rice?lock=1',TRUE),
('kantin-bu-siti','makanan-berat','Mie Goreng','mie-goreng','Mie goreng bumbu kecap dengan sayur dan telur.',14000,20,'https://loremflickr.com/480/360/fried,noodles?lock=2',FALSE),
('kantin-bu-siti','makanan-berat','Bakso Kuah','bakso-kuah','Bakso sapi dengan kuah kaldu hangat dan mie.',16000,18,'https://loremflickr.com/480/360/meatball,soup?lock=3',FALSE),
('kantin-bu-siti','makanan-berat','Nasi Uduk','nasi-uduk','Nasi gurih santan dengan ayam goreng dan sambal.',13000,20,'https://loremflickr.com/480/360/coconut,rice?lock=4',FALSE),
('kantin-bu-siti','makanan-berat','Soto Ayam','soto-ayam','Soto ayam kuning dengan soun, telur, dan koya.',15000,16,'https://loremflickr.com/480/360/chicken,soup?lock=5',FALSE),
('kantin-bu-siti','makanan-ringan','Tahu Isi','tahu-isi','Tahu goreng isi sayuran, renyah di luar.',3000,30,'https://loremflickr.com/480/360/fried,tofu?lock=6',FALSE),
('kantin-bu-siti','minuman','Es Teh Manis','es-teh-manis','Teh manis dingin segar.',3000,30,'https://loremflickr.com/480/360/iced,tea?lock=7',FALSE),
('kantin-bu-siti','minuman','Es Jeruk','es-jeruk','Perasan jeruk segar dengan es batu.',5000,25,'https://loremflickr.com/480/360/orange,juice?lock=8',FALSE),
('kantin-pak-budi','makanan-berat','Mie Ayam Bakso','mie-ayam-bakso','Mie ayam dengan bakso dan pangsit goreng.',14000,22,'https://loremflickr.com/480/360/chicken,noodles?lock=9',TRUE),
('kantin-pak-budi','makanan-berat','Nasi Ayam Geprek','nasi-ayam-geprek','Ayam goreng tepung digeprek dengan sambal bawang.',15000,15,'https://loremflickr.com/480/360/fried,chicken?lock=10',TRUE),
('kantin-pak-budi','makanan-berat','Nasi Rames','nasi-rames','Nasi dengan sayur, tempe orek, telur, dan sambal.',13000,20,'https://loremflickr.com/480/360/indonesian,food?lock=11',FALSE),
('kantin-pak-budi','makanan-berat','Ayam Goreng Kremes','ayam-goreng-kremes','Ayam goreng bumbu kuning dengan kremesan.',17000,12,'https://loremflickr.com/480/360/fried,chicken,crispy?lock=12',FALSE),
('kantin-pak-budi','makanan-berat','Nasi Pecel','nasi-pecel','Nasi dengan sayuran rebus dan bumbu kacang.',12000,14,'https://loremflickr.com/480/360/peanut,sauce,salad?lock=13',FALSE),
('kantin-pak-budi','minuman','Teh Botol Dingin','teh-botol-dingin','Teh botol dingin, cocok saat siang hari.',4000,30,'https://loremflickr.com/480/360/bottle,tea?lock=14',FALSE),
('kantin-pak-budi','minuman','Air Mineral','air-mineral','Air mineral kemasan 600 ml.',3000,50,'https://loremflickr.com/480/360/mineral,water?lock=15',FALSE),
('kantin-bu-ani','minuman','Es Teh Manis','es-teh-manis','Teh manis dingin segar.',3000,40,'https://loremflickr.com/480/360/iced,tea?lock=16',TRUE),
('kantin-bu-ani','minuman','Es Kopi Susu','es-kopi-susu','Kopi susu gula aren dengan es.',5000,15,'https://loremflickr.com/480/360/iced,coffee,milk?lock=17',FALSE),
('kantin-bu-ani','minuman','Jus Alpukat','jus-alpukat','Jus alpukat kental dengan susu coklat.',8000,12,'https://loremflickr.com/480/360/avocado,juice?lock=18',FALSE),
('kantin-bu-ani','minuman','Susu Coklat','susu-coklat','Susu coklat dingin dalam gelas.',6000,20,'https://loremflickr.com/480/360/chocolate,milk?lock=19',FALSE),
('kantin-bu-ani','makanan-ringan','Roti Bakar','roti-bakar','Roti bakar dengan selai coklat dan keju.',7000,14,'https://loremflickr.com/480/360/toast,bread?lock=20',FALSE),
('kantin-bu-ani','makanan-ringan','Salad Buah','salad-buah','Potongan buah segar dengan saus yogurt.',7000,10,'https://loremflickr.com/480/360/fruit,salad?lock=21',FALSE),
('kantin-bu-ani','dessert','Kue Lapis','kue-lapis','Kue lapis kenyal warna-warni.',4000,15,'https://loremflickr.com/480/360/layer,cake?lock=22',FALSE),
('kantin-bu-ani','dessert','Puding Coklat','puding-coklat','Puding coklat lembut dengan vla vanila.',5000,18,'https://loremflickr.com/480/360/chocolate,pudding?lock=23',FALSE),
('kantin-bu-rina','makanan-ringan','Risoles Mayo','risoles-mayo','Risoles isi sayur, telur, dan mayones.',5000,12,'https://loremflickr.com/480/360/spring,roll,fried?lock=24',TRUE),
('kantin-bu-rina','makanan-ringan','Kentang Goreng','kentang-goreng','Kentang goreng renyah dengan saus sambal.',6000,20,'https://loremflickr.com/480/360/french,fries?lock=25',FALSE),
('kantin-bu-rina','makanan-ringan','Lumpia Goreng','lumpia-goreng','Lumpia isi rebung dan ayam, digoreng garing.',4000,22,'https://loremflickr.com/480/360/fried,spring,roll?lock=26',FALSE),
('kantin-bu-rina','jajanan','Siomay','siomay','Siomay ikan dengan bumbu kacang dan jeruk nipis.',8000,16,'https://loremflickr.com/480/360/dumpling,steamed?lock=27',TRUE),
('kantin-bu-rina','jajanan','Batagor','batagor','Bakso tahu goreng dengan saus kacang.',9000,15,'https://loremflickr.com/480/360/fried,fishball?lock=28',FALSE),
('kantin-bu-rina','jajanan','Sosis Bakar','sosis-bakar','Sosis bakar dengan saus tomat dan mayones.',4000,20,'https://loremflickr.com/480/360/grilled,sausage?lock=29',FALSE),
('kantin-bu-rina','jajanan','Cilok','cilok','Cilok kenyal dengan bumbu kacang pedas.',5000,25,'https://loremflickr.com/480/360/meatball,skewer?lock=30',FALSE),
('kantin-bu-rina','dessert','Pisang Coklat','pisang-coklat','Pisang goreng dengan lelehan coklat.',5000,18,'https://loremflickr.com/480/360/banana,chocolate?lock=31',FALSE),
('kantin-bu-rina','dessert','Donat Gula','donat-gula','Donat empuk bertabur gula halus.',3000,24,'https://loremflickr.com/480/360/donut,sugar?lock=32',FALSE),
('kantin-bu-rina','minuman','Es Cincau','es-cincau','Es cincau hijau dengan sirup gula merah.',4000,20,'https://loremflickr.com/480/360/grass,jelly,drink?lock=33',FALSE)
) AS v(kantin_slug, kategori_slug, nama, slug, deskripsi, harga, stok, gambar, populer)
JOIN kantin   k  ON k.slug  = v.kantin_slug
JOIN kategori kt ON kt.slug = v.kategori_slug;

-- ============================================================
-- 4. ULASAN
-- ============================================================

INSERT INTO ulasan (kantin_id, user_id, rating, komentar)
SELECT k.id, u.id, v.rating, v.komentar
FROM (VALUES
('kantin-bu-siti','gian@bitego.local',5,'Nasi gorengnya enak, porsinya pas.'),
('kantin-bu-siti','rani@bitego.local',5,'Bakso kuahnya hangat, penjualnya ramah.'),
('kantin-bu-siti','dimas@bitego.local',4,'Enak, tapi antre saat istirahat pertama.'),
('kantin-pak-budi','gian@bitego.local',5,'Mie ayam baksonya juara.'),
('kantin-pak-budi','dimas@bitego.local',4,'Ayam gepreknya pedas mantap.'),
('kantin-bu-ani','rani@bitego.local',5,'Es kopi susunya segar dan murah.'),
('kantin-bu-ani','gian@bitego.local',4,'Puding coklatnya lembut.'),
('kantin-bu-rina','dimas@bitego.local',5,'Siomaynya enak, bumbu kacangnya pas.'),
('kantin-bu-rina','rani@bitego.local',4,'Risoles selalu cepat habis.')
) AS v(kantin_slug, email, rating, komentar)
JOIN kantin k ON k.slug = v.kantin_slug
JOIN users  u ON u.email = v.email;

-- ============================================================
-- 5. CEK HASIL
-- ============================================================

SELECT k.nama_kantin, COUNT(p.id) AS jumlah_menu
FROM kantin k LEFT JOIN produk p ON p.kantin_id = k.id
GROUP BY k.id ORDER BY k.nama_kantin;
SELECT id, nama_produk, gambar FROM produk LIMIT 5;


-- ============================================================
-- UPDATE GAMBAR PRODUK
-- Mengganti sumber gambar lama (loremflickr) dengan placehold.co
-- (layanan gambar yang stabil, dipakai luas oleh developer).
-- Jalankan di database "bitego". Aman dijalankan berulang kali.
-- ============================================================

UPDATE produk p
SET gambar = v.gambar
FROM (VALUES
  ('Nasi Goreng Spesial', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Nasi+Goreng+Spesial'),
  ('Mie Goreng', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Mie+Goreng'),
  ('Bakso Kuah', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Bakso+Kuah'),
  ('Nasi Uduk', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Nasi+Uduk'),
  ('Soto Ayam', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Soto+Ayam'),
  ('Tahu Isi', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Tahu+Isi'),
  ('Es Teh Manis', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Es+Teh+Manis'),
  ('Es Jeruk', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Es+Jeruk'),
  ('Mie Ayam Bakso', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Mie+Ayam+Bakso'),
  ('Nasi Ayam Geprek', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Nasi+Ayam+Geprek'),
  ('Nasi Rames', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Nasi+Rames'),
  ('Ayam Goreng Kremes', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Ayam+Goreng+Kremes'),
  ('Nasi Pecel', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Nasi+Pecel'),
  ('Teh Botol Dingin', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Teh+Botol+Dingin'),
  ('Air Mineral', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Air+Mineral'),
  ('Es Kopi Susu', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Es+Kopi+Susu'),
  ('Jus Alpukat', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Jus+Alpukat'),
  ('Susu Coklat', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Susu+Coklat'),
  ('Roti Bakar', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Roti+Bakar'),
  ('Salad Buah', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Salad+Buah'),
  ('Kue Lapis', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Kue+Lapis'),
  ('Puding Coklat', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Puding+Coklat'),
  ('Risoles Mayo', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Risoles+Mayo'),
  ('Kentang Goreng', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Kentang+Goreng'),
  ('Lumpia Goreng', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Lumpia+Goreng'),
  ('Siomay', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Siomay'),
  ('Batagor', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Batagor'),
  ('Sosis Bakar', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Sosis+Bakar'),
  ('Cilok', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Cilok'),
  ('Pisang Coklat', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Pisang+Coklat'),
  ('Donat Gula', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Donat+Gula'),
  ('Es Cincau', 'https://placehold.co/480x360/FFF1E0/C2410C/png?text=Es+Cincau')
) AS v(nama_produk, gambar)
WHERE p.nama_produk = v.nama_produk;

-- Cek hasil
SELECT id, nama_produk, gambar FROM produk ORDER BY id LIMIT 10;

INSERT INTO users (nama, email, password, role)
VALUES ('Admin Kantin', 'admin123@bitego.local', '-placeholder-', 'penjual')
ON CONFLICT (email) DO NOTHING;

INSERT INTO kantin (pemilik_id, nama_kantin, slug, deskripsi, slogan, lokasi, nomor_stand)
SELECT id, 'Kantin Admin', 'kantin-admin', 'Kantin untuk mencoba fitur admin.',
       'Silakan coba kelola menu di sini!', 'Kantin Sekolah', 'Stand 5'
FROM users WHERE email = 'admin123@bitego.local'
ON CONFLICT (slug) DO NOTHING;


ALTER TABLE kantin
    ADD COLUMN IF NOT EXISTS jam_buka  TIME NOT NULL DEFAULT '07:00',
    ADD COLUMN IF NOT EXISTS jam_tutup TIME NOT NULL DEFAULT '14:00';
