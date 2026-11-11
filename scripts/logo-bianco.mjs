// Ricava dal logo (public/logo anda.png) la versione per gli sfondi scuri:
// il nero diventa bianco, il rosa resta, il fondo è trasparente.
// Uso: node scripts/logo-bianco.mjs
import sharp from "sharp";
const src = "public/logo anda.png";
const out = "public/logo-anda-pdf-bianco.png";
const meta = await sharp(src).metadata();
console.log("sorgente:", meta.width, "x", meta.height, "canali", meta.channels, "alpha", meta.hasAlpha);
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const px = new Uint8Array(data);
let bianchi = 0, rosa = 0;
for (let i = 0; i < px.length; i += 4) {
  const r = px[i], g = px[i + 1], b = px[i + 2];
  let a = px[i + 3];
  // Senza trasparenza il fondo è bianco: l'opacità viene da quanto è scuro
  if (!meta.hasAlpha) a = 255 - Math.min(r, g, b);
  if (a === 0) { px[i + 3] = 0; continue; }
  const pinkish = r > g + 50 && r > b + 20; // rosa Anda
  if (pinkish) { px[i] = 0xe8; px[i + 1] = 0x30; px[i + 2] = 0x8a; rosa++; }
  else { px[i] = px[i + 1] = px[i + 2] = 255; bianchi++; }
  px[i + 3] = a;
}
await sharp(Buffer.from(px), { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim({ threshold: 1 })
  .png()
  .toFile(out);
const m2 = await sharp(out).metadata();
console.log("scritto", out, m2.width, "x", m2.height, "| pixel bianchi", bianchi, "rosa", rosa);
