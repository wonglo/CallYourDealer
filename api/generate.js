// /pages/api/generate.js

import formidable from 'formidable';
const { IncomingForm } = formidable;

import fs from 'fs';
import { PNG } from 'pngjs';
import { GifWriter } from 'omggif';
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

  const form = new IncomingForm({
    multiples: true,
    maxFiles: 5,
    maxFileSize: 20 * 1024 * 1024, // 20MB
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

      if (!images || images.length !== 5) {
        console.warn('[generate.js] Invalid image count:', images?.length);
        return res.status(400).json({ error: 'Exactly 5 images required' });
      }

      const imagePaths = images.map(img => `file://${img.filepath}`);
      console.log('[generate.js] Images array:', imagePaths);

      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      const frameBuffers = [];

      for (let i = 0; i < images.length; i++) {
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

function createHTML(active, all, index) {
  return `
    <html>
      <head>
        <style>
          body {
            margin: 0;
            background: #000;
            width: 1200px;
            height: 1104px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: sans-serif;
          }
          .hero {
            width: 536px;
            height: 424px;
            border-radius: 12px;
            overflow: hidden;
          }
          .hero img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .thumbs {
            margin-top: 24px;
            display: flex;
            gap: 24px;
          }
          .thumb {
            width: 64px;
            height: 64px;
            border-radius: 8px;
            overflow: hidden;
            border: 3px solid transparent;
          }
          .thumb.active {
            border-color: white;
          }
          .thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
        </style>
      </head>
      <body>
        <div class="hero"><img src="${active}"></div>
        <div class="thumbs">
          ${all
            .map(
              (src, i) => `
            <div class="thumb ${i === index ? 'active' : ''}">
              <img src="${src}">
            </div>`
            )
            .join('')}
        </div>
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
        const frame = PNG.sync.read(buffer);
        gif.addFrame(0, 0, frame.width, frame.height, frame.data, { delay: 100 });
      }

      resolve(gifData.subarray(0, gif.end()));
    } catch (e) {
      console.error('[generate.js] GIF encoding failed:', e);
      reject(e);
    }
  });
}