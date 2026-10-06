import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const buildDir = path.resolve('build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// SVG icon representing a 3D printing filament spool in modern graphite + hot lime
const svgIcon = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e2024" />
      <stop offset="100%" stop-color="#0e0f12" />
    </radialGradient>
    <radialGradient id="spoolRim" cx="38%" cy="32%" r="80%">
      <stop offset="0%" stop-color="#3c3f47" />
      <stop offset="70%" stop-color="#1f2126" />
      <stop offset="100%" stop-color="#16171b" />
    </radialGradient>
    <radialGradient id="filament" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#84bd18" />
      <stop offset="65%" stop-color="#a6dc2c" />
      <stop offset="90%" stop-color="#c6f45e" />
      <stop offset="100%" stop-color="#73a713" />
    </radialGradient>
    <radialGradient id="core" cx="40%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#d9b483" />
      <stop offset="100%" stop-color="#966d3a" />
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background rounded plate -->
  <rect width="512" height="512" rx="112" fill="url(#bg)" />
  <rect width="510" height="510" x="1" y="1" rx="111" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2" />

  <!-- Outer spool flange -->
  <circle cx="256" cy="256" r="190" fill="url(#spoolRim)" />
  <circle cx="256" cy="256" r="189" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="2" />

  <!-- Cutout windows in flange -->
  <g fill="#0e0f12" opacity="0.45">
    <circle cx="256" cy="115" r="22" />
    <circle cx="378" cy="186" r="22" />
    <circle cx="378" cy="326" r="22" />
    <circle cx="256" cy="397" r="22" />
    <circle cx="134" cy="326" r="22" />
    <circle cx="134" cy="186" r="22" />
  </g>

  <!-- Filament wound ring -->
  <circle cx="256" cy="256" r="150" fill="url(#filament)" filter="url(#glow)" />

  <!-- Winding ridges -->
  <circle cx="256" cy="256" r="142" fill="none" stroke="#73a713" stroke-width="2" opacity="0.6" />
  <circle cx="256" cy="256" r="128" fill="none" stroke="#73a713" stroke-width="2" opacity="0.6" />
  <circle cx="256" cy="256" r="114" fill="none" stroke="#73a713" stroke-width="2" opacity="0.6" />
  <circle cx="256" cy="256" r="100" fill="none" stroke="#73a713" stroke-width="2" opacity="0.6" />

  <!-- Cardboard core -->
  <circle cx="256" cy="256" r="82" fill="url(#core)" />
  <circle cx="256" cy="256" r="80" fill="none" stroke="#5a3d1c" stroke-width="2" opacity="0.4" />

  <!-- Plastic center hub -->
  <circle cx="256" cy="256" r="48" fill="url(#spoolRim)" />
  <circle cx="256" cy="256" r="47" fill="none" stroke="#ffffff" stroke-opacity="0.15" stroke-width="1.5" />

  <!-- Spindle hole -->
  <circle cx="256" cy="256" r="26" fill="#000000" opacity="0.85" />
</svg>
`;

async function main() {
  const png512 = path.join(buildDir, 'icon.png');
  const png256 = path.join(buildDir, 'icon-256.png');
  const icoPath = path.join(buildDir, 'icon.ico');

  console.log('Generating app icons...');
  await sharp(Buffer.from(svgIcon))
    .resize(512, 512)
    .png()
    .toFile(png512);

  await sharp(Buffer.from(svgIcon))
    .resize(256, 256)
    .png()
    .toFile(png256);

  const icoBuf = await pngToIco([png256]);
  fs.writeFileSync(icoPath, icoBuf);

  console.log('Icons generated successfully:');
  console.log(' -', png512);
  console.log(' -', icoPath);
}

main().catch(console.error);
