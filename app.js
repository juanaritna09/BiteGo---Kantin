// app.js — frontend BiteGo: routing hash + komunikasi dengan REST API (server.js)
// Jika halaman dibuka lewat Live Server (port 5500, dll.) atau file://, arahkan API ke server Express di port 3000.
const STATIC_DEV = location.protocol === 'file:' || ['5500', '5501', '5173', '8080'].includes(location.port);
const API = window.API_BASE || (STATIC_DEV ? 'http://localhost:3000/api' : '/api');
const CID = localStorage.getItem('bg_cid') || (() => {
  const v = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)).replace(/[^a-zA-Z0-9-]/g, '');
  localStorage.setItem('bg_cid', v); return v;
})();

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const rp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jam = (t) => t ? new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':') : '';

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-Client-Id': CID, ...authSiswa() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && siswaToken() && path !== '/siswa/login') keluarSiswa('#/masuk');
  if (!r.ok) throw new Error(d.error || 'Terjadi kesalahan');
  return d;
}

// ---------- kelas Tailwind yang dipakai berulang ----------
const K = {
  wrap: 'mx-auto max-w-[1160px] px-4 md:px-5',
  btn: 'inline-flex items-center justify-center gap-2 rounded-xl bg-o px-[18px] py-2.5 font-bold text-white transition hover:bg-od active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
  btnLine: 'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-[18px] py-2.5 font-bold text-o ring-[1.5px] ring-inset ring-o transition hover:bg-cream',
  btnDanger: 'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-[18px] py-2.5 font-bold text-red-600 ring-[1.5px] ring-inset ring-red-200 transition hover:bg-red-50',
  card: 'flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sh',
  pad: 'flex flex-1 flex-col gap-1.5 p-3.5',
  h3: 'text-[1.05rem] font-extrabold',
  sub: 'text-sm text-muted',
  price: 'font-extrabold text-od',
  grid: 'grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-[18px]',
  secHead: 'mb-3.5 flex items-center justify-between',
  h2: 'text-[1.35rem] font-extrabold tracking-tight',
  pagehead: 'bg-gradient-to-r from-cream to-peach py-6',
  h1: 'text-[clamp(1.6rem,4vw,2.3rem)] font-extrabold tracking-tight',
  crumb: 'mb-2 inline-block font-semibold text-muted',
  search: 'relative flex h-[52px] items-center gap-2.5 rounded-full border border-line bg-white px-5 shadow-sh focus-within:ring-2 focus-within:ring-o',
  searchIn: 'h-full flex-1 bg-transparent outline-none',
  chip: 'flex flex-none items-center gap-2 whitespace-nowrap rounded-[14px] bg-white px-[18px] py-2.5 font-semibold shadow-sh data-[on=true]:bg-o data-[on=true]:text-white',
  sideBtn: 'flex w-full gap-2.5 rounded-xl px-3 py-2.5 text-left font-semibold hover:bg-cream data-[on=true]:bg-o data-[on=true]:text-white',
  box: 'mb-4 overflow-hidden rounded-2xl border border-line bg-white shadow-sh',
  hd: 'flex items-center justify-between gap-2.5 bg-cream px-4 py-3 font-extrabold',
  hdL: 'flex items-center gap-2.5',
  row: 'flex flex-wrap items-center gap-3.5 border-t border-line px-4 py-3 md:flex-nowrap',
  grow: 'min-w-0 flex-1 basis-1/2',
  two: 'my-6 grid items-start gap-[22px] md:grid-cols-[1fr_340px]',
  sum: 'p-[18px] md:sticky md:top-[84px]',
  ln: 'flex justify-between py-1',
  tot: 'my-3 border-t border-line py-3 [&>b]:block [&>b]:text-[2rem] [&>b]:tracking-tight [&>b]:text-od',
  note: 'rounded-xl bg-cream p-3 text-[.9rem]',
  noteBlue: 'rounded-xl bg-[#EAF2FF] p-3 text-[.9rem]',
  label: 'mb-1.5 block text-sm font-bold',
  input: 'h-[46px] w-full rounded-xl border border-[#E6D9CA] bg-white px-3.5 focus:border-o focus:outline focus:outline-[3px] focus:outline-o',
  step: 'inline-grid h-[26px] w-[26px] place-items-center rounded-full bg-o text-[.85rem] text-white',
  qty: 'flex items-center overflow-hidden rounded-[10px] border border-line',
  qtyBtn: 'h-[34px] w-8 text-lg font-bold hover:bg-cream disabled:opacity-40',
  trash: 'h-[34px] w-[34px] rounded-[10px] bg-red-100 text-red-600',
  sign: 'relative grid h-[120px] place-items-center bg-gradient-to-b from-[#9CC98B] to-[#7DB06F]',
  signTxt: '-rotate-[1.5deg] rounded-sm border-4 border-[#C0392B] bg-[#F9F1E4] px-3.5 py-0.5 text-center text-lg font-extrabold leading-tight',
  tag: 'rounded-md bg-[#F4EEE8] px-2 text-xs text-muted',
  empty: 'px-5 py-12 text-center text-muted',
};
const PILL = {
  ok: 'bg-green-100 text-green-600', off: 'bg-red-100 text-red-600',
  warn: 'bg-amber-100 text-amber-700', stok: 'bg-white text-green-600 shadow-sh',
};
const pill = (text, kind = 'ok', extra = '') => `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[.78rem] font-bold ${PILL[kind]} ${extra}">${text}</span>`;

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.dataset.show = 'true';
  clearTimeout(toastT); toastT = setTimeout(() => (t.dataset.show = 'false'), 2200);
}
function setBadge(n) { for (const id of ['#badge', '#badge2']) $(id).textContent = n || ''; }
async function refreshBadge() { if (!siswaToken()) return setBadge(0); try { setBadge((await api('/keranjang')).total_item); } catch {} }

// ---------- komponen ----------
const kantinSign = (k) => `<div class="${K.sign}">${k.gambar_kantin ? `<img class="absolute inset-0 h-full w-full object-cover" src="${esc(k.gambar_kantin)}" alt="">` : ''}<span class="${K.signTxt}">${esc(k.nama_kantin).replace(/^Kantin /, 'Kantin<br>')}</span>${k.status_buka === undefined ? '' : pill(k.status_buka ? '● Buka' : '● Tutup', k.status_buka ? 'ok' : 'off', 'absolute bottom-2.5 right-2.5')}</div>`;
const foodImg = (p, extra = '', size = 'h-[130px] text-6xl') => `<div class="relative grid place-items-center overflow-hidden bg-gradient-to-br from-cream to-peach ${size}">${p.gambar ? `<img class="absolute inset-0 h-full w-full object-cover" src="${esc(p.gambar)}" alt="" loading="lazy">` : esc(p.icon || '🍽️')}${extra}</div>`;
const foodSm = (p) => foodImg(p, '', 'h-[60px] w-[72px] flex-none rounded-xl text-3xl');

function prodCard(p, showKantin = true) {
  return `<article class="${K.card}">${foodImg(p, p.stok ? pill('Stok: ' + p.stok, 'stok', 'absolute bottom-2 right-2') : '')}
    <div class="${K.pad}"><h3 class="${K.h3}">${esc(p.nama_produk)}</h3>${showKantin ? `<span class="${K.sub}">${esc(p.nama_kantin)}</span>` : ''}
    <span class="${K.price}">${rp(p.harga)}</span>
    <button class="${K.btn}" data-add="${p.id}" ${p.stok < 1 ? 'disabled' : ''}>🛒 ${p.stok < 1 ? 'Habis' : 'Tambah'}</button></div></article>`;
}
const emptyBox = (icon, title, text, link) => `<div class="${K.empty}"><div class="text-5xl">${icon}</div><b class="block text-xl text-ink">${title}</b>${text}${link || ''}</div>`;
const setNav = (k) => document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.on = String(a.dataset.nav === k)));
const markOn = (nodes, on) => nodes.forEach((n) => (n.dataset.on = String(n === on)));

// ---------- halaman: beranda / jelajahi ----------
async function home(_, key) {
  setNav(key);
  const S = { q: '', kat: '' };
  const [kategori, kantin] = await Promise.all([api('/kategori'), api('/kantin')]);
  app.innerHTML = `
    <section class="overflow-hidden bg-gradient-to-r from-cream to-peach"><div class="${K.wrap} grid min-h-[300px] items-center gap-5 md:grid-cols-[1.1fr_.9fr]">
      <div><h1 class="text-[clamp(2rem,5vw,3.2rem)] font-extrabold leading-[1.1] tracking-tighter">Lapar di Sekolah?<br><b class="text-o">BiteGo</b> Solusinya!</h1>
      <p class="mb-5 mt-3.5 max-w-[420px] text-[#4a3f35]">Temukan makanan favoritmu dari berbagai kantin sekolah, pesan dengan mudah tanpa harus antre.</p>
      <a class="${K.btn}" href="#/jelajahi">🔍 Jelajahi Kantin →</a></div>
      <div class="text-center text-[clamp(6rem,18vw,12rem)] leading-none drop-shadow-xl" aria-hidden="true">🍳</div></div></section>
    <div class="${K.wrap}">
      <label class="${K.search} mx-auto -mt-6 mb-5 max-w-[640px]"><span aria-hidden="true">🔍</span><input id="q" type="search" class="${K.searchIn}" placeholder="Cari nama kantin atau makanan favoritmu…" aria-label="Cari"></label>
      <div class="flex gap-2.5 overflow-x-auto px-0.5 pb-3.5 pt-1 [scrollbar-width:none]" id="chips"><button class="${K.chip}" data-on="true" data-kat="">▦ Semua</button>${kategori.map((k) => `<button class="${K.chip}" data-on="false" data-kat="${k.slug}">${esc(k.icon)} ${esc(k.nama_kategori)}</button>`).join('')}</div>
      <section class="my-6"><div class="${K.secHead}"><h2 class="${K.h2}">🏪 Daftar Toko Kantin</h2></div><div class="${K.grid}" id="kantinGrid"></div></section>
      <section class="my-6"><div class="${K.secHead}"><h2 class="${K.h2}" id="menuTitle">⭐ Menu Populer</h2></div><div class="${K.grid}" id="menuGrid"></div></section>
    </div>`;

  const drawKantin = () => {
    const list = kantin.filter((k) => !S.q || k.nama_kantin.toLowerCase().includes(S.q.toLowerCase()));
    $('#kantinGrid').innerHTML = list.length ? list.map((k) => `<article class="${K.card}">${kantinSign(k)}<div class="${K.pad}">
      <h3 class="${K.h3}">${esc(k.nama_kantin)}</h3><span class="${K.sub}">${esc(k.deskripsi || '')}</span>
      <div class="flex flex-wrap gap-1.5">${(k.kategori || []).map((t) => `<span class="${K.tag}">${esc(t)}</span>`).join('')}</div>
      <a class="${K.btn} mt-auto" href="#/kantin/${k.id}">Lihat Menu →</a></div></article>`).join('')
      : emptyBox('🏪', 'Kantin tidak ditemukan', 'Coba kata kunci lain.');
  };
  const drawMenu = async () => {
    const filtering = S.q || S.kat;
    const p = new URLSearchParams(); if (S.q) p.set('q', S.q); if (S.kat) p.set('kategori', S.kat); if (!filtering) p.set('populer', 1);
    $('#menuTitle').textContent = filtering ? 'Hasil Menu' : '⭐ Menu Populer';
    const rows = await api('/produk?' + p);
    $('#menuGrid').innerHTML = rows.length ? rows.map((r) => prodCard(r)).join('') : emptyBox('🍽️', 'Menu belum ada', 'Belum ada menu yang cocok dengan pencarianmu.');
  };
  let t;
  $('#q').oninput = (e) => { S.q = e.target.value.trim(); drawKantin(); clearTimeout(t); t = setTimeout(drawMenu, 250); };
  $('#chips').onclick = (e) => {
    const b = e.target.closest('[data-kat]'); if (!b) return;
    S.kat = b.dataset.kat; markOn(document.querySelectorAll('#chips [data-kat]'), b); drawMenu();
  };
  drawKantin(); await drawMenu();
  if (key === 'jelajahi') $('#q').focus();
}

// ---------- halaman: detail kantin ----------
async function kantinPage([id]) {
  setNav('jelajahi');
  const k = await api('/kantin/' + id);
  const S = { q: '', kat: '', urut: 'populer' };
  const kats = [...new Map(k.produk.map((p) => [p.nama_kategori, p.icon])).entries()];
  app.innerHTML = `
    <section class="${K.pagehead}"><div class="${K.wrap}"><a class="${K.crumb}" href="#/">🏠 Beranda › ${esc(k.nama_kantin)}</a>
      <div class="flex flex-wrap items-center gap-[22px]"><div class="w-full overflow-hidden rounded-2xl shadow-sh md:w-[200px]">${kantinSign({ ...k, status_buka: undefined })}</div><div>
        <h1 class="${K.h1}">${esc(k.nama_kantin)} ${pill('● ' + (k.status_buka ? 'Buka' : 'Tutup'), k.status_buka ? 'ok' : 'off', 'align-middle')}</h1>
        <p class="text-muted">“${esc(k.slogan || k.deskripsi || '')}”</p>
        <p class="text-muted">⭐ <b class="text-ink">${k.rating}</b> (${k.jumlah_ulasan} ulasan) &nbsp;|&nbsp; 📍 ${esc(k.nomor_stand || k.lokasi || '')}</p></div></div></div></section>
    <div class="${K.wrap} my-6 grid gap-[22px] md:grid-cols-[230px_1fr]">
      <aside class="h-fit rounded-2xl border border-line bg-white p-4 shadow-sh" id="kats"><h2 class="mb-2.5 text-lg font-extrabold">Kategori Menu</h2>
        <div class="flex gap-1.5 overflow-x-auto md:flex-col md:overflow-visible"><button class="${K.sideBtn} w-auto whitespace-nowrap md:w-full" data-on="true" data-kat="">▦ Semua</button>${kats.map(([n, i]) => `<button class="${K.sideBtn} w-auto whitespace-nowrap md:w-full" data-on="false" data-kat="${esc(n)}">${esc(i)} ${esc(n)}</button>`).join('')}</div></aside>
      <div><div class="mb-4 flex flex-wrap gap-3"><label class="${K.search} !h-[46px] min-w-0 flex-1"><span>🔍</span><input id="q" type="search" class="${K.searchIn}" placeholder="Cari menu di ${esc(k.nama_kantin)}…" aria-label="Cari menu"></label>
        <select class="h-[46px] rounded-xl border border-line bg-white px-3 shadow-sh" id="urut" aria-label="Urutkan"><option value="populer">Urutkan: Terpopuler</option><option value="murah">Harga terendah</option><option value="nama">Nama A–Z</option></select></div>
      <div class="${K.grid}" id="menu"></div></div></div>`;
  const draw = () => {
    let l = k.produk.filter((p) => (!S.kat || p.nama_kategori === S.kat) && p.nama_produk.toLowerCase().includes(S.q.toLowerCase()));
    l.sort((a, b) => S.urut === 'murah' ? a.harga - b.harga : S.urut === 'nama' ? a.nama_produk.localeCompare(b.nama_produk) : (b.populer - a.populer) || a.nama_produk.localeCompare(b.nama_produk));
    $('#menu').innerHTML = l.length ? l.map((p) => prodCard(p, false)).join('') : emptyBox('🍽️', 'Menu tidak ditemukan', 'Coba kata kunci atau kategori lain.');
  };
  $('#q').oninput = (e) => { S.q = e.target.value.trim(); draw(); };
  $('#urut').onchange = (e) => { S.urut = e.target.value; draw(); };
  $('#kats').onclick = (e) => {
    const b = e.target.closest('[data-kat]'); if (!b) return;
    S.kat = b.dataset.kat; markOn(document.querySelectorAll('#kats [data-kat]'), b); draw();
  };
  draw();
}

// ---------- halaman: keranjang ----------
async function cartPage() {
  setNav('keranjang');
  if (!siswaToken()) return mintaMasuk();
  const c = await api('/keranjang'); setBadge(c.total_item);
  const head = `<section class="${K.pagehead}"><div class="${K.wrap}"><h1 class="${K.h1}">🛒 Keranjang Belanja</h1><p class="text-muted">Cek kembali pesananmu sebelum checkout 😊</p></div></section>`;
  if (!c.kantin.length) { app.innerHTML = head + `<div class="${K.wrap}">${emptyBox('🛒', 'Keranjangmu masih kosong', 'Pilih menu favoritmu dulu, yuk.', `<br><a class="${K.btn} mt-3.5" href="#/jelajahi">Jelajahi Kantin →</a>`)}</div>`; return; }
  app.innerHTML = head + `<div class="${K.wrap} ${K.two}"><div>
    ${c.kantin.map((g) => `<div class="${K.box}"><div class="${K.hd}"><span class="${K.hdL}">🏪 ${esc(g.nama_kantin)} ${pill(g.status_buka ? 'Buka' : 'Tutup', g.status_buka ? 'ok' : 'off')}</span><span>Subtotal: <span class="${K.price}">${rp(g.subtotal)}</span></span></div>
      ${g.items.map((i) => `<div class="${K.row}">${foodSm(i)}<div class="${K.grow}"><b>${esc(i.nama_produk)}</b><br><span class="${K.price}">${rp(i.harga)}</span></div>
        <div class="${K.qty}"><button class="${K.qtyBtn}" data-qty="${i.produk_id}" data-to="${i.jumlah - 1}" aria-label="Kurangi">−</button><b class="min-w-[34px] text-center">${i.jumlah}</b><button class="${K.qtyBtn}" data-qty="${i.produk_id}" data-to="${i.jumlah + 1}" aria-label="Tambah" ${i.jumlah >= i.stok ? 'disabled' : ''}>+</button></div>
        <button class="${K.trash}" data-del="${i.produk_id}" aria-label="Hapus ${esc(i.nama_produk)}">🗑</button><b>${rp(i.subtotal)}</b></div>`).join('')}</div>`).join('')}
    <button class="${K.btnDanger}" id="clear">🗑 Hapus Semua Pesanan</button></div>
    <aside class="${K.box} ${K.sum}"><h2 class="text-lg font-extrabold">📄 Ringkasan Pesanan</h2><div class="mt-2.5">${c.kantin.map((g) => `<div class="${K.ln}"><span>Subtotal ${esc(g.nama_kantin)}</span><b>${rp(g.subtotal)}</b></div>`).join('')}</div>
      <div class="${K.tot}">Total Pembayaran<b>${rp(c.total_pembayaran)}</b></div>
      <a class="${K.btn} w-full !py-3.5 text-[1.05rem]" href="#/checkout">✓ Checkout Sekarang →</a>
      <div class="${K.note} mt-3">Checkout sekali klik untuk semua pesanan dari berbagai kantin!</div></aside></div>`;
  $('#clear').onclick = async () => { if (confirm('Hapus semua pesanan di keranjang?')) { await api('/keranjang', { method: 'DELETE' }); route(); } };
}

// ---------- halaman: checkout ----------
async function checkoutPage() {
  setNav('keranjang');
  if (!siswaToken()) return mintaMasuk();
  const c = await api('/keranjang');
  if (!c.kantin.length) { location.hash = '#/keranjang'; return; }
  const me = JSON.parse(localStorage.getItem('bg_me') || '{}');
  app.innerHTML = `<section class="${K.pagehead}"><div class="${K.wrap}"><a class="${K.crumb}" href="#/keranjang">← Kembali ke Keranjang</a><h1 class="${K.h1}">📋 Selesaikan Pesananmu!</h1><p class="text-muted">Lengkapi informasi berikut untuk melanjutkan pemesanan.</p></div></section>
  <form class="${K.wrap} ${K.two}" id="f" novalidate><div class="${K.box}">
    <div class="${K.hd}"><span class="${K.hdL}"><span class="${K.step}">1</span> Informasi Pemesan</span></div>
    <div class="p-4"><div class="mb-3.5"><label class="${K.label}" for="nama">Nama Lengkap *</label><input class="${K.input}" id="nama" required autocomplete="name" value="${esc(me.nama)}"></div>
    <div class="mb-3.5"><label class="${K.label}" for="kelas">Kelas *</label><input class="${K.input}" id="kelas" required placeholder="Contoh: XI RPL B" value="${esc(me.kelas)}"></div>
    <div><label class="${K.label}" for="hp">No. HP (opsional)</label><input class="${K.input}" id="hp" type="tel" autocomplete="tel" value="${esc(me.hp)}"></div></div>
    <div class="${K.hd}"><span class="${K.hdL}"><span class="${K.step}">2</span> Detail Pesanan</span></div>
    ${c.kantin.map((g) => `<div class="${K.hd} !bg-white border-t border-line"><span class="${K.hdL}">🏪 ${esc(g.nama_kantin)}</span><span class="${K.price}">${rp(g.subtotal)}</span></div>
      ${g.items.map((i) => `<div class="${K.row}">${foodSm(i)}<div class="${K.grow}"><b>${esc(i.nama_produk)}</b><br><span class="${K.sub}">${i.jumlah} × ${rp(i.harga)}</span></div><b>${rp(i.subtotal)}</b></div>`).join('')}`).join('')}
    <div class="${K.hd}"><span class="${K.hdL}"><span class="${K.step}">3</span> Metode Pembayaran</span></div>
    <div class="m-4 flex items-center gap-3.5 rounded-2xl border-2 border-o bg-cream p-3.5"><span class="text-3xl">💵</span><div class="flex-1"><b>Bayar di Kantin (COD)</b><br><span class="${K.sub}">Bayar langsung kepada penjual saat mengambil pesanan.</span></div>${pill('✓ Dipilih')}</div></div>
    <aside class="${K.box} ${K.sum}"><h2 class="text-lg font-extrabold">📄 Rincian Pembayaran</h2><div class="mt-2.5">${c.kantin.map((g) => `<div class="${K.ln}"><span>${esc(g.nama_kantin)}</span><b>${rp(g.subtotal)}</b></div>`).join('')}</div>
      <div class="${K.tot}">Total Pembayaran<b>${rp(c.total_pembayaran)}</b></div>
      <div class="${K.noteBlue} mb-4">Setelah memesan, kamu akan mendapat nomor pesanan untuk mengambil makanan di kantin.</div>
      <button class="${K.btn} w-full !py-3.5 text-[1.05rem]" id="go">✓ Pesan Sekarang →</button><p id="err" role="alert" class="mt-2.5 font-semibold text-red-600"></p></aside></form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const body = { nama: $('#nama').value.trim(), kelas: $('#kelas').value.trim(), no_hp: $('#hp').value.trim() };
    if (!body.nama || !body.kelas) { $('#err').textContent = 'Nama lengkap dan kelas wajib diisi.'; return; }
    $('#go').disabled = true;
    try {
      const r = await api('/pesanan', { method: 'POST', body });
      localStorage.setItem('bg_me', JSON.stringify({ nama: body.nama, kelas: body.kelas, hp: body.no_hp }));
      localStorage.setItem('bg_last', r.kode_pesanan); setBadge(0);
      location.hash = '#/status/' + r.kode_pesanan;
    } catch (err) { $('#err').textContent = err.message; $('#go').disabled = false; }
  };
}

// ---------- halaman: status pesanan ----------
let poll;
const STEP = { pending: 0, confirmed: 1, processing: 1, ready: 2, completed: 3 };
const LABEL = { pending: ['Pesanan Diterima', 'warn'], confirmed: ['Sedang Diproses', 'warn'], processing: ['Sedang Diproses', 'warn'], ready: ['Siap Diambil', 'ok'], completed: ['Selesai', 'ok'], cancelled: ['Dibatalkan', 'off'] };

async function statusPage([kode]) {
  setNav('');
  const render = async () => {
    const d = await api('/pesanan/' + encodeURIComponent(kode));
    const p = d.pesanan, subs = d.kantin;
    const step = Math.min(...subs.map((s) => STEP[s.status] ?? 0));
    const t = subs[0] || {};
    const times = [jam(t.waktu_diterima), jam(subs.map((s) => s.waktu_diproses).filter(Boolean).sort()[0]), '', ''];
    const names = [['🛒', 'Pesanan Diterima'], ['👨‍🍳', 'Sedang Diproses'], ['🍴', 'Siap Diambil'], ['✓', 'Selesai']];
    const siap = subs.filter((s) => s.status === 'ready').map((s) => s.nama_kantin);
    const ov = p.status === 'cancelled' ? ['Pesanan Dibatalkan', 'off'] : [step >= 3 ? 'Pesanan Selesai' : 'Pesananmu ' + names[step][1].replace('Pesanan ', ''), 'ok'];
    const tl = names.map((n, i) => {
      const act = i <= step;
      return `<div class="relative flex items-center gap-3 font-bold before:absolute before:-top-3.5 before:left-[21px] before:h-3.5 before:w-1 first:before:hidden md:block md:before:left-[-50%] md:before:top-[22px] md:before:h-1 md:before:w-full ${act ? 'text-ink before:bg-o' : 'text-muted before:bg-[#E7DFD6]'}">
        <span class="relative z-10 grid h-[46px] w-[46px] flex-none place-items-center rounded-full text-xl md:mx-auto md:mb-1.5 ${act ? 'bg-o' : 'bg-[#E7DFD6]'}">${n[0]}</span>
        <span class="text-[.92rem]">${n[1]}<small class="block font-medium text-muted">${times[i] || (i === step || i === step + 1 ? 'Menunggu…' : '')}</small></span></div>`;
    }).join('');
    app.innerHTML = `<section class="${K.pagehead}"><div class="${K.wrap}"><h1 class="${K.h1}">📋 Status Pesanan</h1><p class="text-muted">Pantau perkembangan pesananmu di sini!</p></div></section>
    <div class="${K.wrap}"><div class="${K.box} mt-[22px] p-5">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><span class="${K.sub}">Nomor Pesanan</span>
        <div class="flex flex-wrap items-center gap-3 text-[clamp(1.5rem,4vw,2.2rem)] font-extrabold tracking-tight">${esc(p.kode_pesanan)} <button class="${K.btnLine} !px-3 !py-1.5 text-base" id="copy">⧉ Salin</button></div></div>${pill(esc(ov[0]), ov[1], '!px-4 !py-2 !text-[.95rem]')}</div>
      <p class="mt-2">👤 ${esc(p.nama_pemesan)} | ${esc(p.kelas_pemesan)} &nbsp; 📅 ${new Date(p.waktu_pesan).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <div class="mb-2 mt-6 grid gap-3.5 text-left md:grid-cols-4 md:gap-0 md:text-center">${tl}</div></div>
      <div class="${K.secHead}"><h2 class="${K.h2}">🏪 Detail Pesanan per Kantin</h2></div>
      <div class="grid gap-[18px] md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">${subs.map((s) => { const l = LABEL[s.status] || [s.status, 'ok']; return `<article class="flex items-start justify-between gap-3 overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-sh"><div><h3 class="${K.h3}">${esc(s.nama_kantin)}</h3>
        ${s.items.map((i) => `<div class="${K.sub}">${esc(i.nama_produk)} × ${i.jumlah}</div>`).join('')}</div><div class="text-right">${pill(l[0], l[1])}<br><b>${rp(s.subtotal)}</b></div></article>`; }).join('')}</div>
      <div class="${K.box} mt-[18px]"><div class="${K.hd} text-lg"><span>🧮 Total Pembayaran${d.pembayaran ? ` <span class="${K.sub} font-medium">(${d.pembayaran.metode_pembayaran.toUpperCase()} · ${d.pembayaran.status_pembayaran === 'paid' ? 'lunas' : 'bayar di kantin'})</span>` : ''}</span><span class="${K.price} text-2xl">${rp(p.total_pembayaran)}</span></div></div>
      ${siap.length && step < 3 ? `<div class="${K.noteBlue}">Kamu bisa mengambil makanan di ${esc(siap.join(' & '))} terlebih dahulu, karena pesanan di sana sudah siap.</div>` : ''}
      <div class="mt-[18px] flex flex-wrap items-center justify-between gap-2.5"><a class="${K.btnLine}" href="#/">← Kembali ke Beranda</a>
        <span class="${K.sub}">🕒 Terakhir diperbarui: ${jam(d.diperbarui)} <button class="${K.btnLine} ml-2 !px-3 !py-1.5" id="refresh">↻ Refresh</button></span></div></div>`;
    $('#copy').onclick = () => navigator.clipboard?.writeText(p.kode_pesanan).then(() => toast('Nomor pesanan disalin'));
    $('#refresh').onclick = render;
  };
  await render();
  clearInterval(poll);
  poll = setInterval(() => (location.hash.startsWith('#/status/') ? render().catch(() => {}) : clearInterval(poll)), 15000);
}

// ---------- akun siswa ----------
const siswaToken = () => localStorage.getItem('bg_siswa') || '';
const authSiswa = () => (siswaToken() ? { Authorization: 'Bearer ' + siswaToken() } : {});

function mintaMasuk() {
  toast('Silakan masuk dulu untuk berbelanja');
  location.hash = '#/masuk';
}

function tombolAkun() {
  let a = document.getElementById('akunBtn');
  if (!a) {
    a = document.createElement('a');
    a.id = 'akunBtn';
    a.className = 'max-w-[130px] truncate rounded-xl bg-cream px-3 py-2 text-sm font-bold text-od';
    document.getElementById('badge').closest('a').after(a);
  }
  const me = JSON.parse(localStorage.getItem('bg_me') || '{}');
  a.href = siswaToken() ? '#/akun' : '#/masuk';
  a.textContent = siswaToken() ? '👤 ' + String(me.nama || 'Akun').split(' ')[0] : 'Masuk';
}

function keluarSiswa(tujuan = '#/') {
  ['bg_siswa', 'bg_me', 'bg_last'].forEach((k) => localStorage.removeItem(k));
  tombolAkun(); refreshBadge();
  location.hash = tujuan;
}

function formAkun(daftar) {
  setNav('');
  if (siswaToken()) { location.hash = '#/akun'; return; }
  const f = (id, label, type = 'text', extra = '') =>
    `<div class="mb-3.5"><label class="${K.label}" for="${id}">${label}</label><input class="${K.input}" id="${id}" type="${type}" ${extra}></div>`;
  app.innerHTML = `<div class="${K.wrap} my-8"><form id="fa" class="${K.box} mx-auto max-w-[420px] p-6">
    <h1 class="text-2xl font-extrabold">${daftar ? 'Daftar Akun Siswa' : 'Masuk Siswa'}</h1>
    <p class="${K.sub} mb-5">${daftar ? 'Buat akun untuk memesan makanan.' : 'Masuk untuk memesan dan melihat riwayat.'}</p>
    ${daftar ? f('nama', 'Nama Lengkap *', 'text', 'required autocomplete="name" maxlength="100"') + f('kelas', 'Kelas *', 'text', 'required placeholder="Contoh: XI RPL B" maxlength="50"') + f('hp', 'No. HP (opsional)', 'tel', 'maxlength="20"') : ''}
    ${f('em', 'Email *', 'email', 'required autocomplete="username"')}
    ${f('pw', 'Password *', 'password', `required minlength="6" autocomplete="${daftar ? 'new-password' : 'current-password'}"`)}
    <button class="${K.btn} w-full" id="go">${daftar ? 'Daftar' : 'Masuk'}</button>
    <p id="err" role="alert" class="mt-3 font-semibold text-red-600"></p>
    <p class="mt-3 text-center text-sm">${daftar ? 'Sudah punya akun? <a class="font-bold text-od" href="#/masuk">Masuk</a>' : 'Belum punya akun? <a class="font-bold text-od" href="#/daftar">Daftar</a>'}</p></form></div>`;
  $('#fa').onsubmit = async (e) => {
    e.preventDefault(); $('#go').disabled = true; $('#err').textContent = '';
    const body = { email: $('#em').value, password: $('#pw').value };
    if (daftar) Object.assign(body, { nama: $('#nama').value, kelas: $('#kelas').value, no_hp: $('#hp').value });
    try {
      const d = await api('/siswa/' + (daftar ? 'daftar' : 'login'), { method: 'POST', body });
      localStorage.setItem('bg_siswa', d.token);
      localStorage.setItem('bg_me', JSON.stringify({ nama: d.siswa.nama, kelas: d.siswa.kelas || '', hp: d.siswa.no_hp || '' }));
      localStorage.removeItem('bg_last');
      tombolAkun(); await refreshBadge();
      location.hash = $('#badge').textContent ? '#/keranjang' : '#/';
    } catch (err) { $('#err').textContent = err.message; $('#go').disabled = false; }
  };
}
const masukPage = () => formAkun(false);
const daftarPage = () => formAkun(true);

async function akunPage() {
  setNav('');
  if (!siswaToken()) { location.hash = '#/masuk'; return; }
  const [me, riwayat] = await Promise.all([api('/siswa/me'), api('/pesanan')]);
  app.innerHTML = `<div class="${K.wrap} my-8">
    <div class="${K.box} p-5"><h1 class="text-2xl font-extrabold">👤 ${esc(me.nama)}</h1><p class="${K.sub} mb-3">${esc(me.kelas || '')} · ${esc(me.email)}</p><button class="${K.btnDanger}" id="keluar">Keluar</button></div>
    <h2 class="${K.h2} mb-3">Riwayat Pesanan</h2>
    ${riwayat.length ? riwayat.map((p) => `<a href="#/status/${esc(p.kode_pesanan)}" class="${K.box} !flex-row items-center justify-between gap-3 p-4 flex"><span><b>${esc(p.kode_pesanan)}</b><br><span class="${K.sub}">${new Date(p.waktu_pesan).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span></span><b class="${K.price}">${rp(p.total_pembayaran)}</b></a>`).join('') : emptyBox('🧾', 'Belum ada pesanan', 'Pesananmu akan muncul di sini.')}</div>`;
  $('#keluar').onclick = () => keluarSiswa();
}

tombolAkun();

// ---------- router ----------
const routes = [
  [/^#?\/?$/, (m) => home(m, 'home')], [/^#\/jelajahi$/, (m) => home(m, 'jelajahi')],
  [/^#\/kantin\/(\d+)$/, kantinPage], [/^#\/keranjang$/, cartPage], [/^#\/checkout$/, checkoutPage],
  [/^#\/status\/([\w-]+)$/, statusPage],
  [/^#\/masuk$/, masukPage], [/^#\/daftar$/, daftarPage], [/^#\/akun$/, akunPage],
];
async function route() {
  clearInterval(poll);
  const h = location.hash || '#/';
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      try { await fn(m.slice(1)); }
      catch (e) { app.innerHTML = `<div class="wrap">${emptyBox('⚠️', 'Terjadi kendala', esc(e.message), `<br><button class="${K.btn} mt-3.5" onclick="route()">Coba lagi</button>`)}</div>`; }
      window.scrollTo(0, 0); return;
    }
  }
  location.hash = '#/';
}
window.route = route;
window.addEventListener('hashchange', route);

// tombol tambah ke keranjang & ubah jumlah (delegasi event)
document.addEventListener('click', async (e) => {
  const add = e.target.closest('[data-add]'), qty = e.target.closest('[data-qty]'), del = e.target.closest('[data-del]');
  if (add && !siswaToken()) return mintaMasuk();
  try {
    if (add) { const c = await api('/keranjang', { method: 'POST', body: { produk_id: add.dataset.add, jumlah: 1 } }); setBadge(c.total_item); toast('Ditambahkan ke keranjang'); }
    else if (qty) { await api('/keranjang/' + qty.dataset.qty, { method: 'PATCH', body: { jumlah: Number(qty.dataset.to) } }); route(); }
    else if (del) { await api('/keranjang/' + del.dataset.del, { method: 'DELETE' }); route(); }
  } catch (err) { toast(err.message); }
});

function cekStatus(e) {
  e?.preventDefault();
  const kode = prompt('Masukkan nomor pesanan (contoh: BG-20261123-001):', localStorage.getItem('bg_last') || '');
  if (kode?.trim()) location.hash = '#/status/' + kode.trim().toUpperCase();
}
$('#cekStatus').onclick = cekStatus;
$('#profil').onclick = cekStatus;
$('#loginPenjual').onclick = () => toast('Dashboard penjual akan segera hadir');

refreshBadge();
route();
