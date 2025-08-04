import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import { GifWriter } from 'omggif';
import PNGModule from 'png-js';
const { PNG } = PNGModule;

export const config = {
  api: {
    bodyParser: false,
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  console.info('[generate.js] API triggered');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = formidable({
    multiples: true,
    maxFiles: 5,
    maxFileSize: 20 * 1024 * 1024, // 20MB
    uploadDir: '/tmp',
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[generate.js] Form parse error:', err);
      return res.status(500).json({ error: 'Form parsing failed' });
    }

    try {
      const images = Array.isArray(files.images) ? files.images : [files.images];
      const imagePaths = images.map((file) => file.filepath);
      console.info('[generate.js] Images array:', imagePaths);

      const executablePath = await chromium.executablePath;
      if (!executablePath) throw new Error('Chromium executablePath not found');

      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1200, height: 1104 },
        executablePath,
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      const frames = [];

      for (let i = 0; i < imagePaths.length; i++) {
        const content = `
          <html><body style="margin:0;background:#000;">
            <div style="width:1200px;height:1104px;display:flex;align-items:center;justify-content:center;">
              <img src="file://${imagePaths[i]}" style="max-width:100%;max-height:100%;" />
            </div>
          </body></html>
        `;

        await page.setContent(content);
        const screenshot = await page.screenshot({ type: 'png' });
        frames.push(screenshot);
      }

      await browser.close();

      const width = 1200;
      const height = 1104;
      const gifData = Buffer.alloc(width * height * 5 * frames.length);
      const gif = new GifWriter(gifData, width, height, { loop: 0 });

      for (const frame of frames) {
        const decoded = PNG.sync.read(frame);
        gif.addFrame(0, 0, width, height, decoded.data, { delay: 100 });
      }

      const gifBuffer = gifData.subarray(0, gif.end());

      res.setHeader('Content-Type', 'image/gif');
      res.status(200).end(gifBuffer);
    } catch (err) {
      console.error('[generate.js] Internal error:', err);
      res.status(500).json({ error: 'GIF generation failed' });
    }
  });
}