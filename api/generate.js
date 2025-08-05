import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import PNGModule from 'png-js';
const { PNG } = PNGModule;
import { GifWriter } from 'omggif';

export const config = {
  api: {
    bodyParser: false,
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getOptions = async () => {
  // For development environment
  if (process.env.NODE_ENV !== 'production') {
    return {
      args: [],
      executablePath: process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome',
      headless: true,
      defaultViewport: { width: 1200, height: 1104 }
    };
  }
  
  // For Vercel production environment
  return {
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
    defaultViewport: { width: 1200, height: 1104 }
  };
};

export default async function handler(req, res) {
  console.info('[generate.js] API triggered');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const form = formidable({ multiples: true, maxFileSize: 20 * 1024 * 1024 });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('[generate.js] Form parse error:', err);
      return res.status(500).json({ error: 'Form parsing failed' });
    }

    let browser = null;
    try {
      const images = Array.isArray(files.images) ? files.images : [files.images];
      const imagePaths = images.map((file) => file.filepath);

      console.info('[generate.js] Received images:', imagePaths);

      const options = await getOptions();
      browser = await puppeteer.launch(options);
      
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

      const gifPath = path.join('/tmp', `output-${Date.now()}.gif`);
      const gifStream = fs.createWriteStream(gifPath);
      const gif = new GifWriter(gifStream, 600, 552, { loop: 0 });

      for (const frame of frames) {
        const decoded = await decodePNG(frame);
        gif.addFrame(0, 0, 600, 552, decoded.data, { delay: 100 });
      }

      gif.end();

      const buffer = fs.readFileSync(gifPath);
      res.setHeader('Content-Type', 'image/gif');
      res.status(200).end(buffer);
    } catch (error) {
      console.error('[generate.js] Internal error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  });
}

// PNG decoder helper
function decodePNG(buffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG(buffer);
    png.decode((pixels) => {
      resolve({ width: png.width, height: png.height, data: pixels });
    });
  });
}