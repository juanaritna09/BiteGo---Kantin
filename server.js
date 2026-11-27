// server.js — REST API BiteGo (Express + PostgreSQL)
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { query, tx, seedIfEmpty } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' })); // 4 MB: foto dikirim sebagai data URL
app.use(express.static(path.join(__dirname, 'public'), { index: 'Web.html' }));

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Pelanggan tidak perlu login: setiap perangkat punya X-Client-Id → akun pelanggan tamu
const withUser = wrap(async (req, res, next) => {
  // Siswa yang sudah login memakai token; selain itu tetap sebagai tamu
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  if (token) {
    const p = verify(token);
    const s = p && await query(`SELECT id FROM users WHERE id = $1 AND role = 'pelanggan' AND aktif`, [p.uid]);
    if (!s || !s.rows.length) throw fail(401, 'Sesi berakhir, silakan masuk lagi');
    req.userId = s.rows[0].id;
    req.siswa = true;
    return next();
  }
  const cid = String(req.get('x-client-id') || '');
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(cid)) throw fail(400, 'Client ID tidak valid');
  const { rows } = await query(
    `INSERT INTO users (nama, email, password, role) VALUES ('Tamu', $1, '-', 'pelanggan')
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
    [`${cid}@tamu.bitego.local`]);
  req.userId = rows[0].id;
  next();
});

// Belanja hanya untuk siswa yang sudah login
const wajibSiswa = (req, res, next) => next(req.siswa ? undefined : fail(401, 'Silakan masuk untuk berbelanja'));

// ---------- Kategori, kantin, produk ----------
app.get('/api/kategori', wrap(async (req, res) => {
  const { rows } = await query('SELECT id, nama_kategori, slug, icon FROM kategori WHERE aktif ORDER BY id');
  res.json(rows);
}));

// Query 23
app.get('/api/kantin', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT k.id, k.nama_kantin, k.slug, k.deskripsi, k.slogan, k.lokasi, k.nomor_stand,
           k.gambar_kantin, k.status_buka,
           COALESCE(ROUND(AVG(u.rating), 1), 0) AS rating, COUNT(u.id) AS jumlah_ulasan,
           (SELECT COALESCE(array_agg(DISTINCT kt.nama_kategori), '{}')
              FROM produk p JOIN kategori kt ON kt.id = p.kategori_id WHERE p.kantin_id = k.id) AS kategori
    FROM kantin k LEFT JOIN ulasan u ON u.kantin_id = k.id
    WHERE k.aktif = TRUE GROUP BY k.id ORDER BY k.nama_kantin`);
  res.json(rows);
}));

// Query 27 + 28
app.get('/api/kantin/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const k = await query(`
    SELECT k.id, k.nama_kantin, k.deskripsi, k.slogan, k.lokasi, k.nomor_stand, k.gambar_kantin,
           k.banner_kantin, k.status_buka,
           COALESCE(ROUND(AVG(u.rating), 1), 0) AS rating, COUNT(u.id) AS jumlah_ulasan
    FROM kantin k LEFT JOIN ulasan u ON u.kantin_id = k.id
    WHERE k.id = $1 AND k.aktif GROUP BY k.id`, [id]);
  if (!k.rows.length) throw fail(404, 'Kantin tidak ditemukan');
  const p = await query(`
    SELECT p.id, p.nama_produk, p.deskripsi, p.harga, p.stok, p.gambar, p.tersedia, p.populer,
           kt.nama_kategori, kt.icon
    FROM produk p JOIN kategori kt ON kt.id = p.kategori_id
    WHERE p.kantin_id = $1 AND p.tersedia = TRUE ORDER BY p.nama_produk`, [id]);
  res.json({ ...k.rows[0], produk: p.rows });
}));

// Query 24, 25, 26 (filter opsional: q, kategori, populer)
app.get('/api/produk', wrap(async (req, res) => {
  const { q, kategori, populer } = req.query;
  const where = ['p.tersedia = TRUE', 'p.stok > 0', 'k.aktif = TRUE'];
  const params = [];
  if (q) { params.push(`%${q}%`); where.push(`p.nama_produk ILIKE $${params.length}`); }
  if (kategori) { params.push(kategori); where.push(`kt.slug = $${params.length}`); }
  if (populer) where.push('p.populer = TRUE');
  const { rows } = await query(`
    SELECT p.id, p.nama_produk, p.harga, p.stok, p.gambar, p.populer, p.kantin_id,
           k.nama_kantin, kt.nama_kategori, kt.icon
    FROM produk p JOIN kantin k ON k.id = p.kantin_id JOIN kategori kt ON kt.id = p.kategori_id
    WHERE ${where.join(' AND ')} ORDER BY p.nama_produk LIMIT 60`, params);
  res.json(rows);
}));

// ---------- Keranjang ----------
async function cartId(c, userId) {
  await c.query(`INSERT INTO keranjang (user_id) VALUES ($1) ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING`, [userId]);
  const { rows } = await c.query(`SELECT id FROM keranjang WHERE user_id = $1 AND status = 'active'`, [userId]);
  return rows[0].id;
}

async function readCart(userId) {
  // Query 29 (dikelompokkan per kantin di sini)
  const { rows } = await query(`
    SELECT k.id AS kantin_id, k.nama_kantin, k.status_buka, p.id AS produk_id, p.nama_produk,
           p.gambar, p.harga, p.stok, kt.icon, dk.jumlah, (p.harga * dk.jumlah) AS subtotal
    FROM keranjang kr
    JOIN detail_keranjang dk ON dk.keranjang_id = kr.id
    JOIN produk p ON p.id = dk.produk_id
    JOIN kantin k ON k.id = p.kantin_id
    JOIN kategori kt ON kt.id = p.kategori_id
    WHERE kr.user_id = $1 AND kr.status = 'active'
    ORDER BY k.nama_kantin, p.nama_produk`, [userId]);
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.kantin_id)) groups.set(r.kantin_id, { kantin_id: r.kantin_id, nama_kantin: r.nama_kantin, status_buka: r.status_buka, subtotal: 0, items: [] });
    const g = groups.get(r.kantin_id);
    g.items.push(r);
    g.subtotal += Number(r.subtotal);
  }
  // Query 30
  const t = await query(`
    SELECT COALESCE(SUM(dk.jumlah), 0) AS total_item, COALESCE(SUM(p.harga * dk.jumlah), 0) AS total_pembayaran
    FROM keranjang kr JOIN detail_keranjang dk ON dk.keranjang_id = kr.id JOIN produk p ON p.id = dk.produk_id
    WHERE kr.user_id = $1 AND kr.status = 'active'`, [userId]);
  return { kantin: [...groups.values()], total_item: Number(t.rows[0].total_item), total_pembayaran: Number(t.rows[0].total_pembayaran) };
}

app.get('/api/keranjang', withUser, wrap(async (req, res) => res.json(await readCart(req.userId))));

app.post('/api/keranjang', withUser, wajibSiswa, wrap(async (req, res) => {
  const produkId = Number(req.body.produk_id);
  const jumlah = Math.max(1, Number(req.body.jumlah) || 1);
  await tx(async (c) => {
    const p = await c.query(`SELECT p.stok, p.tersedia, k.status_buka FROM produk p JOIN kantin k ON k.id = p.kantin_id WHERE p.id = $1 AND k.aktif`, [produkId]);
    if (!p.rows.length || !p.rows[0].tersedia || p.rows[0].stok < 1) throw fail(400, 'Menu sedang tidak tersedia');
    if (!p.rows[0].status_buka) throw fail(400, 'Kantin sedang tutup');
    const kid = await cartId(c, req.userId);
    await c.query(`
      INSERT INTO detail_keranjang (keranjang_id, produk_id, jumlah) VALUES ($1,$2,LEAST($3::int,$4::int))
      ON CONFLICT (keranjang_id, produk_id) DO UPDATE SET jumlah = LEAST(detail_keranjang.jumlah + $3::int, $4::int)`,
      [kid, produkId, jumlah, p.rows[0].stok]);
  });
  res.json(await readCart(req.userId));
}));

app.patch('/api/keranjang/:produkId', withUser, wajibSiswa, wrap(async (req, res) => {
  const jumlah = Number(req.body.jumlah);
  await tx(async (c) => {
    const kid = await cartId(c, req.userId);
    if (jumlah < 1) return c.query('DELETE FROM detail_keranjang WHERE keranjang_id=$1 AND produk_id=$2', [kid, req.params.produkId]);
    await c.query(`UPDATE detail_keranjang dk SET jumlah = LEAST($3, p.stok) FROM produk p
                   WHERE p.id = dk.produk_id AND dk.keranjang_id = $1 AND dk.produk_id = $2`, [kid, req.params.produkId, jumlah]);
  });
  res.json(await readCart(req.userId));
}));

app.delete('/api/keranjang/:produkId', withUser, wrap(async (req, res) => {
  await query(`DELETE FROM detail_keranjang WHERE produk_id = $2 AND keranjang_id IN
               (SELECT id FROM keranjang WHERE user_id = $1 AND status = 'active')`, [req.userId, req.params.produkId]);
  res.json(await readCart(req.userId));
}));

app.delete('/api/keranjang', withUser, wrap(async (req, res) => {
  await query(`DELETE FROM detail_keranjang WHERE keranjang_id IN
               (SELECT id FROM keranjang WHERE user_id = $1 AND status = 'active')`, [req.userId]);
  res.json(await readCart(req.userId));
}));

// ---------- Pesanan ----------
app.post('/api/pesanan', withUser, wajibSiswa, wrap(async (req, res) => {
  const nama = String(req.body.nama || '').trim();
  const kelas = String(req.body.kelas || '').trim();
  const noHp = String(req.body.no_hp || '').trim() || null;
  if (!nama || !kelas) throw fail(400, 'Nama lengkap dan kelas wajib diisi');

  const kode = await tx(async (c) => {
    const kid = await cartId(c, req.userId);
    const { rows: items } = await c.query(`
      SELECT dk.produk_id, dk.jumlah, p.nama_produk, p.harga, p.stok, p.kantin_id, k.nama_kantin, k.status_buka
      FROM detail_keranjang dk JOIN produk p ON p.id = dk.produk_id JOIN kantin k ON k.id = p.kantin_id
      WHERE dk.keranjang_id = $1 ORDER BY p.kantin_id FOR UPDATE OF p`, [kid]);
    if (!items.length) throw fail(400, 'Keranjang masih kosong');
    for (const i of items) {
      if (!i.status_buka) throw fail(400, `${i.nama_kantin} sedang tutup`);
      if (i.stok < i.jumlah) throw fail(400, `Stok ${i.nama_produk} tinggal ${i.stok}`);
    }
    const total = items.reduce((s, i) => s + Number(i.harga) * i.jumlah, 0);
    const n = await c.query(`SELECT COUNT(*)::int + 1 AS n FROM pesanan WHERE waktu_pesan::date = CURRENT_DATE`);
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const kodePesanan = `BG-${ymd}-${String(n.rows[0].n).padStart(3, '0')}`;

    await c.query('UPDATE users SET nama=$2, kelas=$3, no_hp=$4 WHERE id=$1', [req.userId, nama, kelas, noHp]);
    const ps = await c.query(`
      INSERT INTO pesanan (kode_pesanan, user_id, nama_pemesan, kelas_pemesan, no_hp_pemesan, subtotal, total_pembayaran)
      VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`, [kodePesanan, req.userId, nama, kelas, noHp, total]);

    const perKantin = new Map();
    for (const i of items) perKantin.set(i.kantin_id, [...(perKantin.get(i.kantin_id) || []), i]);
    for (const [kantinId, list] of perKantin) {
      const sub = list.reduce((s, i) => s + Number(i.harga) * i.jumlah, 0);
      const pk = await c.query(`
        INSERT INTO pesanan_kantin (pesanan_id, kantin_id, kode_subpesanan, subtotal, waktu_diterima)
        VALUES ($1,$2,$3,$4,NOW()) RETURNING id`, [ps.rows[0].id, kantinId, `${kodePesanan}-K${kantinId}`, sub]);
      await c.query(`INSERT INTO riwayat_pesanan (pesanan_kantin_id, status_baru, keterangan) VALUES ($1,'pending','Pesanan diterima')`, [pk.rows[0].id]);
      for (const i of list) {
        await c.query(`INSERT INTO detail_pesanan (pesanan_kantin_id, produk_id, nama_produk, harga_satuan, jumlah, subtotal)
                       VALUES ($1,$2,$3,$4,$5,$6)`, [pk.rows[0].id, i.produk_id, i.nama_produk, i.harga, i.jumlah, Number(i.harga) * i.jumlah]);
        await c.query('UPDATE produk SET stok = stok - $2 WHERE id = $1', [i.produk_id, i.jumlah]);
      }
    }
    await c.query(`INSERT INTO pembayaran (pesanan_id, metode_pembayaran, jumlah_bayar) VALUES ($1,'cod',$2)`, [ps.rows[0].id, total]);
    await c.query(`UPDATE keranjang SET status = 'converted' WHERE id = $1`, [kid]);
    return kodePesanan;
  });
  res.status(201).json({ kode_pesanan: kode });
}));

// Query 31 — riwayat pesanan perangkat ini
app.get('/api/pesanan', withUser, wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT id, kode_pesanan, nama_pemesan, kelas_pemesan, total_pembayaran, status, waktu_pesan
    FROM pesanan WHERE user_id = $1 ORDER BY waktu_pesan DESC`, [req.userId]);
  res.json(rows);
}));

// Query 32, 33, 36 — status per kantin berdasarkan kode pesanan
app.get('/api/pesanan/:kode', wrap(async (req, res) => {
  const ps = await query(`SELECT id, kode_pesanan, nama_pemesan, kelas_pemesan, total_pembayaran, status, waktu_pesan
                          FROM pesanan WHERE kode_pesanan = $1`, [req.params.kode.toUpperCase()]);
  if (!ps.rows.length) throw fail(404, 'Nomor pesanan tidak ditemukan');
  const id = ps.rows[0].id;
  const subs = await query(`
    SELECT pk.id, pk.kode_subpesanan, k.nama_kantin, k.gambar_kantin, pk.subtotal, pk.status,
           pk.waktu_diterima, pk.waktu_diproses, pk.waktu_siap, pk.waktu_selesai
    FROM pesanan_kantin pk JOIN kantin k ON k.id = pk.kantin_id WHERE pk.pesanan_id = $1 ORDER BY pk.id`, [id]);
  const det = await query(`
    SELECT dp.pesanan_kantin_id, dp.nama_produk, dp.harga_satuan, dp.jumlah, dp.subtotal
    FROM detail_pesanan dp JOIN pesanan_kantin pk ON pk.id = dp.pesanan_kantin_id WHERE pk.pesanan_id = $1 ORDER BY dp.id`, [id]);
  const pay = await query(`SELECT metode_pembayaran, jumlah_bayar, status_pembayaran, waktu_pembayaran FROM pembayaran WHERE pesanan_id = $1`, [id]);
  res.json({
    pesanan: ps.rows[0],
    kantin: subs.rows.map((s) => ({ ...s, items: det.rows.filter((d) => d.pesanan_kantin_id === s.id) })),
    pembayaran: pay.rows[0] || null,
    diperbarui: new Date().toISOString(),
  });
}));


// =====================================================================
// WEB ADMIN PENJUAL  (/webadmin.html → API di /api/admin)
// =====================================================================
const SECRET = process.env.JWT_SECRET || 'bitego-dev-secret-ganti-di-produksi';
const PASSWORD_AWAL = 'bitego123';
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const admin = express.Router();
app.use('/api/admin', admin);

// ---------- token & password (tanpa dependensi tambahan) ----------
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const sign = (p) => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return `${b}.${hmac(b)}`; };
function verify(t) {
  const [b, sig] = String(t).split('.');
  if (!b || !sig) return null;
  const ok = hmac(b);
  if (sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}
const hash = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return `scrypt:${s}:${crypto.scryptSync(pw, s, 64).toString('hex')}`; };
function cocok(pw, h) {
  const [a, s, x] = String(h).split(':');
  if (a !== 'scrypt' || !s || !x) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(String(pw), s, 64), Buffer.from(x, 'hex'));
}

// Akun penjual dari Seed.sql punya password placeholder → beri password awal "bitego123"
async function siapkanAkunPenjual() {
  const r = await query(`UPDATE users SET password = $1 WHERE role = 'penjual' AND password IN ('-', '-placeholder-')`, [hash(PASSWORD_AWAL)]);
  if (r.rowCount) console.log(`Password awal ${r.rowCount} akun penjual: ${PASSWORD_AWAL} (segera ganti di menu Pengaturan)`);
}

// ---------- foto (data URL → file di public/uploads) ----------
function simpanFoto(dataUrl) {
  const i = String(dataUrl || '').indexOf(',');
  const head = dataUrl.slice(0, i), ext = head === 'data:image/png;base64' ? '.png' : head === 'data:image/jpeg;base64' ? '.jpg' : null;
  if (i < 0 || !ext) throw fail(400, 'Format foto harus JPG atau PNG');
  const buf = Buffer.from(dataUrl.slice(i + 1), 'base64');
  if (buf.length > 2 * 1024 * 1024) throw fail(400, 'Ukuran foto maksimal 2 MB');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const nama = crypto.randomBytes(10).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, nama), buf);
  return '/uploads/' + nama;
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'menu';

// ---------- login ----------
admin.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await query(`SELECT id, nama, password FROM users WHERE email = $1 AND role = 'penjual' AND aktif`, [String(email || '').trim().toLowerCase()]);
  if (!rows.length || !cocok(password || '', rows[0].password)) throw fail(401, 'Email atau password salah');
  res.json({ token: sign({ uid: rows[0].id, exp: Date.now() + 12 * 3600e3 }), nama: rows[0].nama });
}));

const auth = wrap(async (req, res, next) => {
  const p = verify((req.get('authorization') || '').replace(/^Bearer /, ''));
  if (!p) throw fail(401, 'Sesi berakhir, silakan login kembali');
  const { rows } = await query(`
    SELECT k.id, k.nama_kantin, k.deskripsi, k.status_buka, k.gambar_kantin,
           to_char(k.jam_buka, 'HH24:MI') AS jam_buka, to_char(k.jam_tutup, 'HH24:MI') AS jam_tutup,
           u.id AS uid, u.nama AS nama_pemilik
    FROM users u JOIN kantin k ON k.pemilik_id = u.id
    WHERE u.id = $1 AND u.role = 'penjual' AND u.aktif ORDER BY k.id LIMIT 1`, [p.uid]);
  if (!rows.length) throw fail(401, 'Akun tidak ditemukan');
  req.k = rows[0];
  next();
});

admin.get('/me', auth, (req, res) => res.json(req.k));

admin.get('/notif', auth, wrap(async (req, res) => {
  const a = await query(`SELECT COUNT(*)::int AS n FROM pesanan_kantin WHERE kantin_id = $1 AND status = 'pending'`, [req.k.id]);
  res.json({ menunggu: a.rows[0].n });
}));

// ---------- dashboard ----------
const SQL_PESANAN = `
  SELECT pk.id, ps.kode_pesanan, ps.nama_pemesan, ps.kelas_pemesan, pk.subtotal, pk.status, pk.created_at,
         (SELECT string_agg(dp.nama_produk || ' ×' || dp.jumlah, ', ' ORDER BY dp.id) FROM detail_pesanan dp WHERE dp.pesanan_kantin_id = pk.id) AS menu
  FROM pesanan_kantin pk JOIN pesanan ps ON ps.id = pk.pesanan_id`;

admin.get('/dashboard', auth, wrap(async (req, res) => {
  const kid = req.k.id;
  const s = await query(`
    SELECT COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS hari_ini,
           COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE - 1)::int AS kemarin,
           COUNT(*) FILTER (WHERE status IN ('pending','confirmed','processing'))::int AS diproses,
           COUNT(*) FILTER (WHERE status = 'ready')::int AS siap,
           COUNT(*) FILTER (WHERE status = 'completed' AND waktu_selesai::date = CURRENT_DATE)::int AS selesai
    FROM pesanan_kantin WHERE kantin_id = $1`, [kid]);
  const terbaru = await query(`${SQL_PESANAN} WHERE pk.kantin_id = $1 ORDER BY pk.created_at DESC LIMIT 5`, [kid]);
  res.json({ ...s.rows[0], terbaru: terbaru.rows });
}));

// ---------- produk ----------
admin.get('/produk', auth, wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT p.id, p.nama_produk, p.deskripsi, p.harga, p.stok, p.gambar, p.tersedia, p.kategori_id, kt.nama_kategori, kt.icon
    FROM produk p JOIN kategori kt ON kt.id = p.kategori_id WHERE p.kantin_id = $1 ORDER BY p.created_at DESC, p.id DESC`, [req.k.id]);
  res.json(rows);
}));

function bacaProduk(b) {
  const nama = String(b.nama_produk || '').trim(), harga = Number(b.harga), stok = Number(b.stok), kat = Number(b.kategori_id);
  if (!nama) throw fail(400, 'Nama produk wajib diisi');
  if (!kat) throw fail(400, 'Kategori wajib dipilih');
  if (!Number.isFinite(harga) || harga < 0) throw fail(400, 'Harga tidak valid');
  if (!Number.isInteger(stok) || stok < 0) throw fail(400, 'Stok harus bilangan bulat, minimal 0');
  const deskripsi = String(b.deskripsi || '').trim().slice(0, 200);
  return { nama, harga, stok, kat, deskripsi, tersedia: b.tersedia !== false };
}

admin.post('/produk', auth, wrap(async (req, res) => {
  const p = bacaProduk(req.body);
  const gambar = req.body.gambar_data ? simpanFoto(req.body.gambar_data) : null;
  let slug = slugify(p.nama);
  const ada = await query('SELECT 1 FROM produk WHERE kantin_id = $1 AND slug = $2', [req.k.id, slug]);
  if (ada.rows.length) slug += '-' + Date.now().toString(36).slice(-4);
  const { rows } = await query(`
    INSERT INTO produk (kantin_id, kategori_id, nama_produk, slug, deskripsi, harga, stok, gambar, tersedia)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [req.k.id, p.kat, p.nama, slug, p.deskripsi, p.harga, p.stok, gambar, p.tersedia]);
  res.status(201).json({ id: rows[0].id });
}));

admin.put('/produk/:id', auth, wrap(async (req, res) => {
  const p = bacaProduk(req.body);
  let gambar = undefined;
  if (req.body.gambar_data) gambar = simpanFoto(req.body.gambar_data);
  else if (req.body.hapus_gambar) gambar = null;
  const r = await query(`
    UPDATE produk SET kategori_id=$3, nama_produk=$4, deskripsi=$5, harga=$6, stok=$7, tersedia=$8,
           gambar = CASE WHEN $9::boolean THEN $10 ELSE gambar END
    WHERE id = $1 AND kantin_id = $2`, [req.params.id, req.k.id, p.kat, p.nama, p.deskripsi, p.harga, p.stok, p.tersedia, gambar !== undefined, gambar ?? null]);
  if (!r.rowCount) throw fail(404, 'Produk tidak ditemukan');
  res.json({ ok: true });
}));

admin.patch('/produk/:id/tersedia', auth, wrap(async (req, res) => {
  const r = await query('UPDATE produk SET tersedia = $3 WHERE id = $1 AND kantin_id = $2', [req.params.id, req.k.id, !!req.body.tersedia]);
  if (!r.rowCount) throw fail(404, 'Produk tidak ditemukan');
  res.json({ ok: true });
}));

admin.delete('/produk/:id', auth, wrap(async (req, res) => {
  try {
    const r = await query('DELETE FROM produk WHERE id = $1 AND kantin_id = $2', [req.params.id, req.k.id]);
    if (!r.rowCount) throw fail(404, 'Produk tidak ditemukan');
    res.json({ ok: true });
  } catch (e) {
    if (e.code !== '23503') throw e; // produk pernah dipesan → cukup disembunyikan agar riwayat tetap utuh
    await query('UPDATE produk SET tersedia = FALSE, stok = 0 WHERE id = $1 AND kantin_id = $2', [req.params.id, req.k.id]);
    res.json({ ok: true, disembunyikan: true });
  }
}));

// ---------- pesanan ----------
const FILTER = { menunggu: ['pending'], diproses: ['confirmed', 'processing'], siap: ['ready'], selesai: ['completed'] };

admin.get('/pesanan', auth, wrap(async (req, res) => {
  const limit = 6, page = Math.max(1, Number(req.query.page) || 1);
  const params = [req.k.id]; let where = 'pk.kantin_id = $1';
  if (FILTER[req.query.status]) { params.push(FILTER[req.query.status]); where += ` AND pk.status = ANY($${params.length})`; }
  if (req.query.q) { params.push(`%${req.query.q}%`); where += ` AND (ps.kode_pesanan ILIKE $${params.length} OR ps.nama_pemesan ILIKE $${params.length})`; }
  const total = await query(`SELECT COUNT(*)::int AS n FROM pesanan_kantin pk JOIN pesanan ps ON ps.id = pk.pesanan_id WHERE ${where}`, params);
  const rows = await query(`${SQL_PESANAN} WHERE ${where} ORDER BY pk.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params);
  const c = await query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status IN ('pending','confirmed','processing'))::int AS diproses,
           COUNT(*) FILTER (WHERE status = 'ready')::int AS siap,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS selesai
    FROM pesanan_kantin WHERE kantin_id = $1`, [req.k.id]);
  res.json({ rows: rows.rows, total: total.rows[0].n, limit, page, counts: c.rows[0] });
}));

async function sinkronPesanan(c, id) {
  const { rows } = await c.query('SELECT status FROM pesanan_kantin WHERE pesanan_id = $1', [id]);
  const aktif = rows.map((r) => r.status).filter((s) => s !== 'cancelled');
  const siap = (s) => s === 'ready' || s === 'completed';
  let s = 'pending';
  if (!aktif.length) s = 'cancelled';
  else if (aktif.every((x) => x === 'completed')) s = 'completed';
  else if (aktif.every(siap)) s = 'ready';
  else if (aktif.some(siap)) s = 'partially_ready';
  else if (aktif.some((x) => x === 'confirmed' || x === 'processing')) s = 'processing';
  await c.query('UPDATE pesanan SET status = $2 WHERE id = $1', [id, s]);
  if (s === 'completed') await c.query(`UPDATE pembayaran SET status_pembayaran = 'paid', waktu_pembayaran = NOW() WHERE pesanan_id = $1`, [id]);
}

const LANJUT = { pending: 'processing', confirmed: 'ready', processing: 'ready', ready: 'completed' };
const KOLOM_WAKTU = { processing: 'waktu_diproses', ready: 'waktu_siap', completed: 'waktu_selesai' };

admin.patch('/pesanan/:id/status', auth, wrap(async (req, res) => {
  const status = req.body.status;
  await tx(async (c) => {
    const { rows } = await c.query('SELECT id, status, pesanan_id FROM pesanan_kantin WHERE id = $1 AND kantin_id = $2 FOR UPDATE', [req.params.id, req.k.id]);
    if (!rows.length) throw fail(404, 'Pesanan tidak ditemukan');
    const cur = rows[0];
    const boleh = status === 'cancelled' ? ['pending', 'confirmed', 'processing'].includes(cur.status) : LANJUT[cur.status] === status;
    if (!boleh) throw fail(400, 'Perubahan status tidak diizinkan');
    const kolom = KOLOM_WAKTU[status];
    await c.query(`UPDATE pesanan_kantin SET status = $2${kolom ? `, ${kolom} = NOW()` : ''} WHERE id = $1`, [cur.id, status]);
    await c.query('INSERT INTO riwayat_pesanan (pesanan_kantin_id, admin_id, status_sebelumnya, status_baru) VALUES ($1,$2,$3,$4)', [cur.id, req.k.uid, cur.status, status]);
    if (status === 'cancelled') // kembalikan stok
      await c.query('UPDATE produk p SET stok = p.stok + dp.jumlah FROM detail_pesanan dp WHERE dp.pesanan_kantin_id = $1 AND dp.produk_id = p.id', [cur.id]);
    await sinkronPesanan(c, cur.pesanan_id);
  });
  res.json({ ok: true });
}));

// ---------- pengaturan ----------
admin.put('/pengaturan', auth, wrap(async (req, res) => {
  const b = req.body, nama = String(b.nama_kantin || '').trim();
  if (!nama) throw fail(400, 'Nama kantin wajib diisi');
  const jam = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!jam.test(b.jam_buka) || !jam.test(b.jam_tutup)) throw fail(400, 'Format jam operasional tidak valid');
  const foto = b.gambar_data ? simpanFoto(b.gambar_data) : null;
  await query(`
    UPDATE kantin SET nama_kantin=$2, deskripsi=$3, status_buka=$4, jam_buka=$5, jam_tutup=$6,
           gambar_kantin = COALESCE($7, gambar_kantin) WHERE id = $1`,
    [req.k.id, nama, String(b.deskripsi || '').trim().slice(0, 200), b.status_buka !== false, b.jam_buka, b.jam_tutup, foto]);
  res.json({ ok: true });
}));

admin.put('/password', auth, wrap(async (req, res) => {
  const pw = String(req.body.password_baru || '');
  if (pw.length < 6) throw fail(400, 'Password minimal 6 karakter');
  await query('UPDATE users SET password = $2 WHERE id = $1', [req.k.uid, hash(pw)]);
  res.json({ ok: true });
}));


// ---------- akun siswa & daftar toko ----------
const HARI = 24 * 3600e3;
const teks = (v, max) => String(v ?? '').trim().slice(0, max);

function bacaAkun(b) {
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Email tidak valid');
  if (email.endsWith('@tamu.bitego.local')) throw fail(400, 'Email tidak boleh digunakan');
  if (password.length < 6) throw fail(400, 'Password minimal 6 karakter');
  return { email, password };
}

// pindahkan isi keranjang tamu (perangkat ini) ke akun siswa
async function gabungKeranjang(req, userId) {
  const cid = String(req.get('x-client-id') || '');
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(cid)) return;
  await tx(async (c) => {
    const t = await c.query('SELECT id FROM users WHERE email = $1', [`${cid}@tamu.bitego.local`]);
    if (!t.rows.length) return;
    const lama = await c.query(`SELECT id FROM keranjang WHERE user_id = $1 AND status = 'active'`, [t.rows[0].id]);
    if (!lama.rows.length) return;
    const baru = await cartId(c, userId);
    await c.query(`
      INSERT INTO detail_keranjang (keranjang_id, produk_id, jumlah)
      SELECT $2::bigint, dk.produk_id, LEAST(dk.jumlah, p.stok)
      FROM detail_keranjang dk JOIN produk p ON p.id = dk.produk_id
      WHERE dk.keranjang_id = $1 AND p.stok > 0
      ON CONFLICT (keranjang_id, produk_id)
      DO UPDATE SET jumlah = GREATEST(detail_keranjang.jumlah, EXCLUDED.jumlah)`, [lama.rows[0].id, baru]);
    await c.query('DELETE FROM detail_keranjang WHERE keranjang_id = $1', [lama.rows[0].id]);
  });
}

const sesi = (u) => ({
  token: sign({ uid: u.id, exp: Date.now() + 30 * HARI }),
  siswa: { nama: u.nama, email: u.email, kelas: u.kelas, no_hp: u.no_hp },
});

// ---------- siswa ----------
app.post('/api/siswa/daftar', wrap(async (req, res) => {
  const b = req.body || {};
  const { email, password } = bacaAkun(b);
  const nama = teks(b.nama, 100), kelas = teks(b.kelas, 50), noHp = teks(b.no_hp, 20) || null;
  if (!nama || !kelas) throw fail(400, 'Nama lengkap dan kelas wajib diisi');
  const { rows } = await query(`
    INSERT INTO users (nama, email, password, kelas, no_hp, role)
    VALUES ($1,$2,$3,$4,$5,'pelanggan') ON CONFLICT (email) DO NOTHING
    RETURNING id, nama, email, kelas, no_hp`, [nama, email, hash(password), kelas, noHp]);
  if (!rows.length) throw fail(409, 'Email sudah terdaftar');
  await gabungKeranjang(req, rows[0].id);
  res.status(201).json(sesi(rows[0]));
}));

app.post('/api/siswa/login', wrap(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const { rows } = await query(`
    SELECT id, nama, email, kelas, no_hp, password FROM users
    WHERE email = $1 AND role = 'pelanggan' AND aktif`, [email]);
  if (!rows.length || !cocok(String(req.body?.password ?? ''), rows[0].password)) throw fail(401, 'Email atau password salah');
  await gabungKeranjang(req, rows[0].id);
  res.json(sesi(rows[0]));
}));

app.get('/api/siswa/me', withUser, wrap(async (req, res) => {
  if (!req.siswa) throw fail(401, 'Silakan masuk');
  const { rows } = await query('SELECT nama, email, kelas, no_hp FROM users WHERE id = $1', [req.userId]);
  res.json(rows[0]);
}));

// ---------- daftar toko baru (penjual) ----------
admin.post('/daftar', wrap(async (req, res) => {
  const b = req.body || {};
  const { email, password } = bacaAkun(b);
  const pemilik = teks(b.nama_pemilik, 100), nama = teks(b.nama_kantin, 150);
  if (!pemilik || !nama) throw fail(400, 'Nama pemilik dan nama kantin wajib diisi');
  const uid = await tx(async (c) => {
    const u = await c.query(`
      INSERT INTO users (nama, email, password, role) VALUES ($1,$2,$3,'penjual')
      ON CONFLICT (email) DO NOTHING RETURNING id`, [pemilik, email, hash(password)]);
    if (!u.rows.length) throw fail(409, 'Email sudah terdaftar');
    let slug = slugify(nama);
    const ada = await c.query('SELECT 1 FROM kantin WHERE slug = $1', [slug]);
    if (ada.rows.length) slug += '-' + u.rows[0].id;
    // toko baru berstatus tutup sampai penjual membukanya di Pengaturan
    await c.query(`
      INSERT INTO kantin (pemilik_id, nama_kantin, slug, deskripsi, lokasi, nomor_stand, status_buka)
      VALUES ($1,$2,$3,$4,'Kantin Sekolah',$5,FALSE)`,
      [u.rows[0].id, nama, slug, teks(b.deskripsi, 200), teks(b.nomor_stand, 50) || null]);
    return u.rows[0].id;
  });
  res.status(201).json({ token: sign({ uid, exp: Date.now() + 12 * 3600e3 }) });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  // Saat pengembangan, tampilkan penyebab asli error 500 agar mudah dilacak
  const dev = process.env.NODE_ENV !== 'production';
  const msg = err.status ? err.message : dev ? `Server error: ${err.message}` : 'Terjadi kesalahan pada server';
  res.status(err.status || 500).json({ error: msg });
});

const PORT = process.env.PORT || 3000;
seedIfEmpty()
  .catch((e) => console.error('Seed dilewati:', e.message))
  .then(() => siapkanAkunPenjual())
  .catch((e) => console.error('Akun penjual dilewati:', e.message))
  .finally(() => app.listen(PORT, () => console.log(`BiteGo berjalan di http://localhost:${PORT}`)));