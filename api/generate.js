import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import { GifWriter } from 'omggif';
import { PNG } from 'pngjs';
import puppeteer from 'puppeteer';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = new IncomingForm({ multiples: true, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('❌ Form parsing error:', err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    try {
      const images = Array.isArray(files.images) ? files.images : [files.images];

      const browser = await puppeteer.launch({ headless: 'new' });
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1104 });

      const frameBuffers = [];

      for (let i = 0; i < images.length; i++) {
        const activeImage = `file://${images[i].filepath}`;
        const thumbnailPaths = images.map(img => `file://${img.filepath}`);

        const htmlContent = createHTML(activeImage, thumbnailPaths, i);
        await page.setContent(htmlContent);
        const buffer = await page.screenshot({ type: 'png' });
        frameBuffers.push(buffer);
      }

      await browser.close();

      const gifBuffer = await createGifFromFrames(frameBuffers);

      res.setHeader('Content-Type', 'image/gif');
      res.status(200).end(gifBuffer);

    } catch (err) {
      console.error('🔥 Processing error:', err);
      res.status(500).json({ error: 'Failed to generate GIF' });
    }
  });
}

function createHTML(activeImage, thumbnails, activeIndex) {
  const thumbHTML = thumbnails
    .map((src, idx) => `
      <img
        src="${src}"
        style="
          width: 64px;
          height: 64px;
          border-radius: 8px;
          margin: 0 8px;
          border: ${idx === activeIndex ? '2px solid white' : 'none'};
        "
      />
    `)
    .join('');

  return `
    <html>
      <body style="margin:0; background:black; display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <img src="${activeImage}" style="width:536px;height:424px;border-radius:12px;object-fit:cover;margin-bottom:20px" />
        <div style="display:flex;justify-content:center;">${thumbHTML}</div>
      </body>
    </html>
  `;
}

function createGifFromFrames(buffers) {
  return new Promise((resolve, reject) => {
    const first = PNG.sync.read(buffers[0]);
    const gifData = Buffer.alloc(buffers.length * first.width * first.height * 4);
    const gifWriter = new GifWriter(gifData, first.width, first.height, { loop: 0 });

    buffers.forEach((buffer, i) => {
      const png = PNG.sync.read(buffer);
      gifWriter.addFrame(0, 0, first.width, first.height, png.data, { delay: 100 });
    });

    resolve(gifData.slice(0, gifWriter.end()));
  });
}
