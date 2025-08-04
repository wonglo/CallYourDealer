import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import { GifWriter } from 'omggif';
import { PNG } from 'png-js';

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

  try {
    const form = formidable({
      multiples: true,
      maxFiles: 5,
      maxFileSize: 20 * 1024 * 1024,
      uploadDir: '/tmp',
      keepExtensions: true,
    });

    form.parse(req, async (err, fields, files) => {
      if (err) throw err;

      const images = Array.isArray(files.images) ? files.images : [files.images];
      const imagePaths = images.map((file) => file.filepath);

      console.info('[generate.js] Images array:', imagePaths);

      const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
        defaultViewport: { width: 1200, height: 1104 },
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

      const gifPath = path.join('/tmp', `output-${Date.now()}.gif`);
      const gifStream = fs.createWriteStream(gifPath);
      const width = 600;
      const height = 552;
      const gif = new GifWriter(gifStream, width, height, { loop: 0 });

      for (const frame of frames) {
        const png = new PNG(frame);
        await new Promise((resolve) => {
          png.decode((pixels) => {
            gif.addFrame(0, 0, width, height, pixels, { delay: 100 });
            resolve();
          });
        });
      }

      gif.end();

      res.setHeader('Content-Type', 'image/gif');
      const buffer = fs.readFileSync(gifPath);
      res.status(200).end(buffer);
    });
  } catch (error) {
    console.error('[generate.js] Internal error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}