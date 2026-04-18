const jimp = require('jimp');
const path = require('path');

const imgPath = path.join(__dirname, 'src/assets/template-certificate.png');

async function run() {
  let J = jimp.Jimp || jimp.default || jimp;
  if (!J.read && jimp.read) J = jimp;
  const image = await J.read(imgPath);
  
  const points = [
    { name: 'Center', x: image.bitmap.width * 0.5, y: image.bitmap.height * 0.5 },
    { name: 'Theme', x: image.bitmap.width * 0.5, y: image.bitmap.height * 0.45 },
    { name: 'Date', x: image.bitmap.width * 0.22, y: image.bitmap.height * 0.20 },
    { name: 'TopLeft', x: image.bitmap.width * 0.1, y: image.bitmap.height * 0.9 },
  ];

  points.forEach(p => {
    const hex = image.getPixelColor(p.x, p.y);
    const r = (hex >> 24) & 0xFF;
    const g = (hex >> 16) & 0xFF;
    const b = (hex >> 8) & 0xFF;
    console.log(`${p.name} - R=${r}, G=${g}, B=${b} | pdf-lib: rgb(${(r/255).toFixed(3)}, ${(g/255).toFixed(3)}, ${(b/255).toFixed(3)})`);
  });
}
run();
