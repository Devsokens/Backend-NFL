const Tesseract = require('tesseract.js');
const path = require('path');

const imgPath = path.join(__dirname, 'src/assets/template-certificate.png');

Tesseract.recognize(
  imgPath,
  'fra'
).then(({ data }) => {
  console.log("Keys:", Object.keys(data));
  if (data.words) {
     data.words.forEach(w => console.log(w.text, w.bbox));
  } else {
     console.log(data);
  }
}).catch(err => {
  console.error("ocr error:", err);
});
