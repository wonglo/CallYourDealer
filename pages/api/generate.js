import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import GIFEncoder from 'gif-encoder-2';
import puppeteer from 'puppeteer';

export const config = {
  api: {
    bodyParser: false,
  },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default async function handler(req, res) {
  const form = formidable({ multiples: true, uploadDir: '/tmp', keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parse error:', err);
      return res.status(500).send('Error parsing the files.');
    }

    const images = Array.isArray(files.images) ? files.images : [files.images];
    if (images.length !== 5) return res.status(400).send('Please upload exactly 5 images.');

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const encoder = new GIFEncoder(1200, 1104);
    const gifPath = path.join(__dirname, '../../public/output.gif');
    const stream = encoder.createWriteStream();
    const buffers = [];

    stream.on('data', chunk => buffers.push(chunk));
    stream.on('end', async () => {
      await browser.close();
      await fs.writeFile(gifPath, Buffer.concat(buffers));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ url: '/output.gif' }));
    });

    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(1000);
    encoder.setQuality(10);

    for (let i = 0; i < 5; i++) {
      const html = `
        <html>
        <body style="margin:0;padding:0;width:1200px;height:1104px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;">
          <img src="file://${images[i].filepath}" width="536" height="424" style="border-radius:12px;" />
          <div style="margin-top:30px;display:flex;gap:24px;">
            ${images.map((img, j) => `
              <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;border:${i === j ? '3px solid white' : 'none'}">
                <img src="file://${img.filepath}" width="64" height="64" />
              </div>
            `).join('')}
          </div>
        </body>
        </html>`;
      await page.setContent(html);
      const buffer = await page.screenshot({ type: 'png' });
      const png = PNG.sync.read(buffer);
      encoder.addFrame(png.data);
    }

    encoder.finish();
  });
}
