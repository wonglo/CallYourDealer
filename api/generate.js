import formidable from 'formidable';
import fs from 'fs';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import { GifWriter } from 'omggif';

export const config = {
  api: {
    bodyParser: false,
  },
};

const form = formidable({
  multiples: true,
  maxFiles: 5,
  maxFileSize: 20 * 1024 * 1024, // 20MB per file
  uploadDir: '/tmp',
  keepExtensions: true,
});

function createHTML(activePath, thumbnailPaths, activeIndex) {
  const thumbnailsHTML = thumbnailPaths
    .map((src, i) => {
      const isActive = i === activeIndex;
      const border = isActive ? 'border: 2px solid white;' : '';
      return `<img src="${src}" style="width:64px;height:64px;border-radius:8px;${border}margin:0 4px;" />`;
    })
    .join('');

  return `
    <html>
      <body style="margin:0;padding:0;width:1200px;height:1104px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:black;">
        <img src="${activePath}" style="width:536px;height:424px;border-radius:12px;" />
        <div style="margin-top:40px;display:flex;justify-content:center;">${thumbnailsHTML}</div>
      </body>
    </html>
  `;
}

export default async function handler(req, res) {
  console.log('[generate.js] API triggered');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[generate.js] Form parsing error:', err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    try {
      const images = Array.isArray(files.images) ? files.images : [files.images];

      if (!images || images.length !== 5) {
        console.warn('[generate.js] Invalid image count:', images?.length);
        return res.status(400).json({ error: 'Exactly 5 images required' });
      }

      const imagePaths = images.map(file => `file://${file.filepath}`);
      console.log('[generate.js] Images array:', imagePaths);

      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      const frameBuffers = [];

      for (let i = 0; i < imagePaths.length; i++) {
        const html = createHTML(imagePaths[i], imagePaths, i);
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const buffer = await page.screenshot({ type: 'png' });
        frameBuffers.push(buffer);
      }

      await browser.close();

      const gifBuffer = await createGifFromFrames(frameBuffers);

      res.setHeader('Content-Type', 'image/gif');
      return res.status(200).end(gifBuffer);
    } catch (err) {
      console.error('[generate.js] Internal error:', err);
      return res.status(500).json({ error: 'Failed to generate GIF' });
    }
  });
}

function createGifFromFrames(buffers) {
  return new Promise((resolve, reject) => {
    try {
      const first = PNG.sync.read(buffers[0]);
      const gifData = Buffer.alloc(buffers.length * first.width * first.height * 5); // generous allocation
      const gif = new GifWriter(gifData, first.width, first.height, { loop: 0 });

      for (const buffer of buffers) {
        const png = PNG.sync.read(buffer);
        gif.addFrame(0, 0, png.width, png.height, png.data, { delay: 100 });
      }

      resolve(gifData.subarray(0, gif.end()));
    } catch (e) {
      console.error('[generate.js] GIF encoding failed:', e);
      reject(e);
    }
  });
}