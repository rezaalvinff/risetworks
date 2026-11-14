-- RISETWORKS v2: skema awal.
-- Semua tabel di schema public (project Supabase khusus RISETWORKS).
-- Kalau suatu saat numpang project lain: ganti "public." menjadi "risetworks.",
-- tambahkan "create schema if not exists risetworks;", expose schema itu di Data API,
-- dan isi env SUPABASE_SCHEMA=risetworks.

create table if not exists public.preset (
  id text primary key,                 -- sha256 PDF pedoman
  nama text not null,
  aturan jsonb not null,
  tampil boolean not null default true,
  jumlah_laporan int not null default 0,
  dibuat timestamptz not null default now()
);

create table if not exists public.cache_pedoman (
  id text primary key,
  aturan jsonb not null,
  kedaluwarsa timestamptz not null default now() + interval '90 days'
);

create table if not exists public.kode_premium (
  kode text primary key,
  sisa int not null check (sisa >= 0),
  kedaluwarsa timestamptz not null,
  catatan text default '',
  dibuat timestamptz not null default now(),
  terakhir_dipakai timestamptz
);

create table if not exists public.rate_limit (
  kunci text primary key,              -- contoh: 'pedoman:1.2.3.4:2026-11-14', 'admin:1.2.3.4:2026-11-14T19'
  jumlah int not null default 0,
  dibuat timestamptz not null default now()
);

create table if not exists public.laporan_preset (
  id bigint generated always as identity primary key,
  preset_id text not null references public.preset(id) on delete cascade,
  alasan text not null default '',
  dibuat timestamptz not null default now()
);

create index if not exists preset_tampil_nama on public.preset (tampil, nama);
create index if not exists kode_premium_dibuat on public.kode_premium (dibuat desc);
create index if not exists rate_limit_dibuat on public.rate_limit (dibuat);
create index if not exists laporan_preset_preset on public.laporan_preset (preset_id, dibuat desc);

-- Tebus kode secara atomik
create or replace function public.tebus_kode(p_kode text)
returns int language plpgsql set search_path = public as $$
declare v_sisa int;
begin
  update public.kode_premium
     set sisa = sisa - 1, terakhir_dipakai = now()
   where kode = p_kode and sisa > 0 and kedaluwarsa > now()
  returning sisa into v_sisa;
  return v_sisa;  -- null berarti tidak valid / habis / kedaluwarsa
end $$;

-- Tambah hitungan rate limit secara atomik, kembalikan jumlah terbaru
create or replace function public.tambah_hitungan(p_kunci text)
returns int language plpgsql set search_path = public as $$
declare v int;
begin
  insert into public.rate_limit (kunci, jumlah) values (p_kunci, 1)
  on conflict (kunci) do update set jumlah = public.rate_limit.jumlah + 1
  returning jumlah into v;
  return v;
end $$;

-- Laporan preset salah: tambah hitungan, sembunyikan otomatis di 2 laporan
create or replace function public.lapor_preset(p_id text, p_alasan text)
returns int language plpgsql set search_path = public as $$
declare v int;
begin
  update public.preset
     set jumlah_laporan = jumlah_laporan + 1,
         tampil = case when jumlah_laporan + 1 >= 2 then false else tampil end
   where id = p_id
  returning jumlah_laporan into v;
  if v is not null then
    insert into public.laporan_preset (preset_id, alasan) values (p_id, coalesce(left(p_alasan, 300), ''));
  end if;
  return v;  -- null berarti preset tidak ada
end $$;

-- Kunci semua tabel dari akses browser. Server memakai secret key (service_role) yang melewati RLS.
alter table public.preset enable row level security;
alter table public.cache_pedoman enable row level security;
alter table public.kode_premium enable row level security;
alter table public.rate_limit enable row level security;
alter table public.laporan_preset enable row level security;

revoke all on public.preset, public.cache_pedoman, public.kode_premium, public.rate_limit, public.laporan_preset from anon, authenticated;
grant select, insert, update, delete on public.preset, public.cache_pedoman, public.kode_premium, public.rate_limit, public.laporan_preset to service_role;

-- Fungsi otomatis bisa dipanggil PUBLIC, jadi cabut dari public juga.
revoke execute on function public.tebus_kode(text) from public, anon, authenticated;
revoke execute on function public.tambah_hitungan(text) from public, anon, authenticated;
revoke execute on function public.lapor_preset(text, text) from public, anon, authenticated;
grant execute on function public.tebus_kode(text) to service_role;
grant execute on function public.tambah_hitungan(text) to service_role;
grant execute on function public.lapor_preset(text, text) to service_role;
