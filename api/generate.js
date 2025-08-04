import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import { GifWriter } from 'omggif';

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

      const executablePath = await chromium.executablePath;
      if (!executablePath) {
        throw new Error('Chromium executablePath not found.');
      }

      const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath,
        headless: chromium.headless,
        defaultViewport: { width: 1200, height: 1104 },
      });

      const page = await browser.newPage();
      const screenshots = [];

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
        screenshots.push(screenshot);
      }

      await browser.close();

      const gifPath = path.join('/tmp', `output-${Date.now()}.gif`);
      const gifStream = fs.createWriteStream(gifPath);
      const gif = new GifWriter(gifStream, 600, 552, { loop: 0 });

      // ✅ Fix png-js import and use
      const PNG = (await import('png-js')).default;

      for (const screenshot of screenshots) {
        await new Promise((resolve) => {
          new PNG(screenshot).decode((pixels) => {
            gif.addFrame(0, 0, 600, 552, pixels, { delay: 100 });
            resolve();
          });
        });
      }

      gif.end();

      gifStream.on('finish', () => {
        const buffer = fs.readFileSync(gifPath);
        res.setHeader('Content-Type', 'image/gif');
        res.status(200).end(buffer);
      });
    });
  } catch (error) {
    console.error('[generate.js] Internal error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}