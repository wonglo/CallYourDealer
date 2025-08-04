import { IncomingForm } from 'formidable';
import fs from 'fs/promises';
import { GifWriter } from 'omggif';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log('[generate.js] API triggered');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = new IncomingForm({ multiples: true, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[generate.js] Form parsing error:', err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    try {
      console.log('[generate.js] Files parsed:', files);

      const images = Array.isArray(files.images) ? files.images : [files.images];

      if (!images || images.length !== 5) {
        console.warn('[generate.js] Invalid image count:', images.length);
        return res.status(400).json({ error: 'Exactly 5 images required' });
      }

      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1104 });

      const frameBuffers = [];

      for (let i = 0; i < images.length; i++) {
        const activePath = `file://${images[i].filepath}`;
        const thumbnailPaths = images.map(img => `file://${img.filepath}`);
        const html = createHTML(activePath, thumbnailPaths, i);

        await page.setContent(html);
        const buffer = await page.screenshot({ type: 'png' });
        frameBuffers.push(buffer);
      }

      await browser.close();
      console.log('[generate.js] Screenshots captured');

      const gifBuffer = await createGifFromFrames(frameBuffers);

      res.setHeader('Content-Type', 'image/gif');
      return res.status(200).end(gifBuffer);
    } catch (err) {
      console.error('[generate.js] Internal error:', err);
      return res.status(500).json({ error: 'Failed to generate GIF' });
    }
  });
}

function createHTML(active, thumbs, activeIdx) {
  const thumbHTML = thumbs
    .map((src, i) => `<img src="${src}" style="width:64px;height:64px;margin:0 4px;border-radius:8px;border:${i === activeIdx ? '2px solid white' : 'none'};" />`)
    .join('');

  return `
    <html>
      <body style="margin:0;background:black;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <img src="${active}" style="width:536px;height:424px;border-radius:12px;object-fit:cover;margin-bottom:20px;" />
        <div style="display:flex;justify-content:center;">${thumbHTML}</div>
      </body>
    </html>
  `;
}

function createGifFromFrames(buffers) {
  return new Promise((resolve, reject) => {
    try {
      const first = PNG.sync.read(buffers[0]);
      const gifData = Buffer.alloc(buffers.length * first.width * first.height * 5);
      const gif = new GifWriter(gifData, first.width, first.height, { loop: 0 });

      for (const buffer of buffers) {
        const png = PNG.sync.read(buffer);
        gif.addFrame(0, 0, first.width, first.height, png.data, { delay: 100 });
      }

      resolve(gifData.subarray(0, gif.end()));
    } catch (e) {
      console.error('[generate.js] GIF encoding failed:', e);
      reject(e);
    }
  });
}