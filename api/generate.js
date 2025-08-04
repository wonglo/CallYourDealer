import puppeteer from 'puppeteer';
import formidable from 'formidable';
import { PNG } from 'pngjs';
import { GifWriter } from 'omggif';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  console.log('[generate.js] API triggered');

  if (req.method !== 'POST') {
    console.warn('[generate.js] Invalid method');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = new formidable.IncomingForm({ keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[generate.js] Form parsing error:', err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    console.log('[generate.js] Parsed fields:', fields);
    console.log('[generate.js] Parsed files:', files);

    try {
      const images = Array.isArray(files.images) ? files.images : [files.images];
      if (!images || images.length !== 5) {
        console.warn('[generate.js] Invalid image count:', images.length);
        return res.status(400).json({ error: 'Exactly 5 images required' });
      }

      const imagePaths = images.map(img => img.filepath);
      console.log('[generate.js] Images array:', imagePaths);

      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      const frameBuffers = [];

      for (let i = 0; i < images.length; i++) {
        const activePath = `file://${images[i].filepath}`;
        const thumbnails = images.map(img => `file://${img.filepath}`);
        const html = createHTML(activePath, thumbnails, i);

        await page.setContent(html);
        const buffer = await page.screenshot({ type: 'png' });
        frameBuffers.push(buffer);
      }

      await browser.close();
      console.log('[generate.js] Screenshots captured');

      const gifBuffer = await createGifFromFrames(frameBuffers);
      res.setHeader('Content-Type', 'image/gif');
      return res.status(200).end(gifBuffer);
    } catch (error) {
      console.error('[generate.js] Internal error:', error);
      return res.status(500).json({ error: 'Failed to generate GIF', details: error.message });
    }
  });
}

function createHTML(activeImagePath, thumbnails, activeIndex) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          width: 1200px;
          height: 1104px;
          margin: 0;
          background: black;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .hero {
          width: 1072px;
          height: 848px;
          border-radius: 24px;
          background-image: url("${activeImagePath}");
          background-size: cover;
          background-position: center;
        }
        .thumbnails {
          margin-top: 48px;
          display: flex;
          gap: 40px;
        }
        .thumb {
          width: 128px;
          height: 128px;
          border-radius: 16px;
          background-size: cover;
          background-position: center;
          border: 4px solid transparent;
        }
        .thumb.active {
          border: 4px solid white;
        }
      </style>
    </head>
    <body>
      <div class="hero"></div>
      <div class="thumbnails">
        ${thumbnails.map((url, i) =>
          `<div class="thumb ${i === activeIndex ? 'active' : ''}" style="background-image: url('${url}')"></div>`
        ).join('')}
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