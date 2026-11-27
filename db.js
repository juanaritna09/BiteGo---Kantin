// db.js — koneksi PostgreSQL + helper transaksi + data awal (opsional)
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'bitego',
  password: process.env.DB_PASSWORD || 'admin',
  port: Number(process.env.DB_PORT) || 5432,
});

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Mengisi contoh kantin & menu jika tabel kantin masih kosong
async function seedIfEmpty() {
  const { rows } = await query('SELECT 1 FROM kantin LIMIT 1');
  if (rows.length) return;

  const data = [
    ['Kantin Bu Siti', 'Makanan enak, harga bersahabat!', 'Stand 1', [
      ['makanan-berat', 'Nasi Goreng Spesial', 15000, 25, true],
      ['makanan-berat', 'Mie Goreng', 14000, 20, false],
      ['makanan-berat', 'Bakso Kuah', 16000, 18, false],
      ['minuman', 'Es Teh Manis', 3000, 30, false]]],
    ['Kantin Pak Budi', 'Masakan rumahan dengan rasa istimewa.', 'Stand 2', [
      ['makanan-berat', 'Mie Ayam Bakso', 14000, 22, true],
      ['makanan-berat', 'Nasi Ayam Geprek', 15000, 15, false],
      ['minuman', 'Es Jeruk', 5000, 20, false]]],
    ['Kantin Bu Ani', 'Jajanan sehat dan bergizi.', 'Stand 3', [
      ['minuman', 'Es Teh Manis', 3000, 40, true],
      ['minuman', 'Es Kopi Susu', 5000, 15, false],
      ['dessert', 'Kue Lapis', 4000, 15, false]]],
    ['Kantin Bu Rina', 'Aneka makanan ringan yang nikmat.', 'Stand 4', [
      ['makanan-ringan', 'Risoles Mayo', 5000, 12, true],
      ['jajanan', 'Sosis Bakar', 4000, 20, false]]],
  ];

  await tx(async (c) => {
    for (const [i, [nama, slogan, stand, menu]] of data.entries()) {
      // Akun penjual contoh (password placeholder — ganti dengan hash sungguhan saat login penjual dibuat)
      const u = await c.query(
        `INSERT INTO users (nama, email, password, role) VALUES ($1,$2,'-', 'penjual') RETURNING id`,
        [`Pemilik ${nama}`, `penjual${i + 1}@bitego.local`]);
      const k = await c.query(
        `INSERT INTO kantin (pemilik_id, nama_kantin, slug, slogan, deskripsi, lokasi, nomor_stand)
         VALUES ($1,$2,$3,$4,$4,'Kantin Sekolah',$5) RETURNING id`,
        [u.rows[0].id, nama, slugify(nama), slogan, stand]);
      for (const [kat, np, harga, stok, pop] of menu) {
        await c.query(
          `INSERT INTO produk (kantin_id, kategori_id, nama_produk, slug, harga, stok, populer)
           VALUES ($1,(SELECT id FROM kategori WHERE slug=$2),$3,$4,$5,$6,$7)`,
          [k.rows[0].id, kat, np, slugify(np), harga, stok, pop]);
      }
    }
  });
  console.log('Data awal kantin & menu dibuat.');
}

module.exports = { pool, query, tx, seedIfEmpty };
