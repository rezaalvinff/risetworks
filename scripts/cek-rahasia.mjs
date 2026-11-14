// Pastikan tidak ada secret yang bocor ke folder public/.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const POLA = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /sb_publishable_[A-Za-z0-9_-]{10,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, // JWT (service_role lama)
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /SUPABASE_SECRET_KEY|GEMINI_API_KEY|ADMIN_PASSWORD|CRON_SECRET/,
];
const nilaiEnv = ['SUPABASE_SECRET_KEY', 'GEMINI_API_KEY', 'ADMIN_PASSWORD', 'CRON_SECRET']
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 8);

function jalan(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) jalan(p, out);
    else out.push(p);
  }
  return out;
}

let bocor = 0;
for (const f of jalan('public')) {
  if (f.startsWith(join('public', 'vendor'))) continue;
  const isi = readFileSync(f, 'utf8');
  for (const re of POLA) if (re.test(isi)) { console.error(`BOCOR? ${f} cocok dengan ${re}`); bocor++; }
  for (const v of nilaiEnv) if (isi.includes(v)) { console.error(`BOCOR! ${f} berisi nilai env rahasia`); bocor++; }
}
if (bocor) process.exit(1);
console.log('Aman: tidak ada secret di folder public/.');
