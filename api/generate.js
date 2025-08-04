import { IncomingForm } from 'formidable';
import fs from 'fs';
import { PNG } from 'pngjs';
import { GifWriter } from 'omggif';
import puppeteer from 'puppeteer';
import chromium from 'chrome-aws-lambda';

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

  const form = new IncomingForm({
    multiples: true,
    maxFiles: 5,
    maxFileSize: 20 * 1024 * 1024, // 20MB per file
    uploadDir: '/tmp',
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[generate.js] Form parsing error:', err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    try {
      const images = Array.isArray(files.images) ? files.images : [files.images];
      console.log('[generate.js] Images array:', images.map(i => i.filepath));

      if (!images || images.length !== 5) {
        return res.status(400).json({ error: 'Exactly 5 images required' });
      }

      const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
      });

      const page = await browser.newPage();
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

      const gifBuffer = await createGifFromFrames(frameBuffers);
      res.setHeader('Content-Type', 'image/gif');
      return res.status(200).end(gifBuffer);
    } catch (error) {
      console.error('[generate.js] Internal error:', error);
      return res.status(500).json({ error: 'Failed to generate GIF' });
    }
  });
}

function createHTML(activePath, thumbnailPaths, activeIndex) {
  const thumbnailsHTML = thumbnailPaths.map((src, i) => {
    const border = i === activeIndex ? '2px solid white' : 'none';
    return `<img src="${src}" style="width:64px;height:64px;border-radius:8px;margin:0 4px;border:${border}"/>`;
  }).join('');

  return `
    <html>
      <body style="margin:0;padding:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:black;width:600px;height:552px;">
        <img src="${activePath}" style="width:536px;height:424px;border-radius:12px;"/>
        <div style="margin-top:16px;display:flex;justify-content:center;">${thumbnailsHTML}</div>
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
        gif.addFrame(0, 0, png.width, png.height, png.data, { delay: 100 });
      }

      resolve(gifData.subarray(0, gif.end()));
    } catch (err) {
      console.error('[generate.js] GIF encoding failed:', err);
      reject(err);
    }
  });
}