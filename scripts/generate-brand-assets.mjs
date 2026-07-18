import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "D:/Github/wsportal";
const APP = join(ROOT, "app");
const PUBLIC = join(ROOT, "public");
mkdirSync(PUBLIC, { recursive: true });

const TEAL = "#0d9488";
const GOLD = "#f0a92b";

/* The VOE keyhole crest, at a 512 coordinate space (the app/icon.svg roundel scaled ×16):
   a round bore over a serifed V-keyway, with a lit gold lock-tumbler bar. */
function keyhole(fill = "#ffffff") {
  return `
    <circle cx="256" cy="198.4" r="44.8" fill="${fill}"/>
    <path fill="${fill}" d="M216 262.4 L180.8 360 L225.6 360 L256 313.6 L286.4 360 L331.2 360 L296 262.4 Z"/>
    <rect x="224" y="184.8" width="64" height="27.2" rx="8" fill="${GOLD}"/>`;
}

/* Rounded-square roundel (favicon parity with app/icon.svg). */
const ROUNDED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="115" fill="${TEAL}"/>
  ${keyhole()}
</svg>`;

/* Full-bleed teal field with the crest scaled into a maskable-safe zone (iOS / Android mask the corners). */
const FULLBLEED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${TEAL}"/>
  <g transform="translate(256 256) scale(0.82) translate(-256 -256)">
    ${keyhole()}
  </g>
</svg>`;

/* 1200×630 OpenGraph / social-share card: dark teal vault gradient + a CENTERED crest+wordmark lockup.
   The lockup is horizontally centered on purpose — WhatsApp (and other compact/desktop link previews)
   derive their small square thumbnail by center-cropping this image to its central 630×630, so the
   whole mark must live inside that centre square. A left-anchored crest (the old layout) got sliced
   off and the square showed only cropped wordmark text. The crest sits in a rounded teal tile — the
   same shape as the favicon / apple-icon — so the tiny square reads as a proper app icon.
   Text uses widely-available serif/sans so it rasterizes reliably on this machine. */
const OG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#08312c"/>
      <stop offset="0.55" stop-color="#0b4b44"/>
      <stop offset="1" stop-color="#0d746a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="20" y="20" width="1160" height="590" rx="24" fill="none" stroke="${GOLD}" stroke-opacity="0.35" stroke-width="2"/>
  <rect x="524" y="112" width="152" height="152" rx="34" fill="${TEAL}"/>
  <rect x="524" y="112" width="152" height="152" rx="34" fill="none" stroke="${GOLD}" stroke-opacity="0.45" stroke-width="2"/>
  <g transform="translate(600 188) scale(0.44) translate(-256 -262)">${keyhole()}</g>
  <text x="600" y="360" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="90" font-weight="700" fill="#ffffff" letter-spacing="2">VOETutor</text>
  <text x="600" y="408" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="29" font-weight="700" fill="${GOLD}" letter-spacing="7">VAULT OF EXCELLENCE</text>
  <line x1="430" y1="438" x2="770" y2="438" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/>
  <text x="600" y="482" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="27" fill="#d6efe9">Premium IB video tutoring · vetted educators</text>
</svg>`;

/* Minimal PNG-in-ICO container (16/32/48). PNG-encoded ICO entries are supported by every current browser. */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size, { fit: "contain" }).png().toBuffer();
}

const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map(async (size) => ({ size, data: await png(ROUNDED, size) })));
writeFileSync(join(APP, "favicon.ico"), buildIco(icoPngs));

writeFileSync(join(APP, "apple-icon.png"), await png(FULLBLEED, 180));
writeFileSync(join(PUBLIC, "icon-192.png"), await png(ROUNDED, 192));
writeFileSync(join(PUBLIC, "icon-512.png"), await png(ROUNDED, 512));
writeFileSync(join(PUBLIC, "icon-maskable-512.png"), await png(FULLBLEED, 512));

const ogBuf = await sharp(Buffer.from(OG)).resize(1200, 630).png().toBuffer();
writeFileSync(join(APP, "opengraph-image.png"), ogBuf);

const s = await sharp(ogBuf).stats();
console.log("Generated: favicon.ico (16/32/48), apple-icon.png (180), icon-192/512, icon-maskable-512, opengraph-image.png (1200x630)");
console.log("OG channel means (variance across channels indicates rendered ink):", s.channels.map((c) => Math.round(c.mean)));
