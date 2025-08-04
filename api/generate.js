import { IncomingForm } from 'formidable';
import fs from 'fs/promises';
import { GifWriter } from 'omggif';
<<<<<<< HEAD
import { PNG } from 'pngjs';
import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
=======
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
>>>>>>> 7691794 (Final stable generate.js with Puppeteer + omggif setup)

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
      console.error('Form parsing error:', err);
      return res.status(500).json({ error: 'Form parsing error' });
    }

    try {
      const images = Array.isArray(files.images) ? files.images : [files.images];
      const imagePaths = images.map(img => img.filepath);

      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

<<<<<<< HEAD
      const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
        defaultViewport: { width: 1200, height: 1104 },
      });
=======
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1104 });
>>>>>>> 7691794 (Final stable generate.js with Puppeteer + omggif setup)

      const page = await browser.newPage();
      const frameBuffers = [];

      for (let i = 0; i < imagePaths.length; i++) {
        const activeImage = `file://${imagePaths[i]}`;
        const thumbnails = imagePaths.map(p => `file://${p}`);
        const html = generateHTML(activeImage, thumbnails, i);
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const buffer = await page.screenshot({ type: 'png' });
        frameBuffers.push(buffer);
      }

      await browser.close();

      const gifBuffer = await createGifFromFrames(frameBuffers);
      res.setHeader('Content-Type', 'image/gif');
      res.status(200).end(gifBuffer);
<<<<<<< HEAD
    } catch (err) {
      console.error('Processing error:', err);
=======

    } catch (e) {
      console.error('GIF generation error:', e);
>>>>>>> 7691794 (Final stable generate.js with Puppeteer + omggif setup)
      res.status(500).json({ error: 'Failed to generate GIF' });
    }
  });
}

function generateHTML(active, thumbs, index) {
  const thumbHTML = thumbs
    .map((src, i) => `<img src="${src}" style="width:64px;height:64px;border-radius:8px;margin:0 8px;border:${i === index ? '2px solid white' : 'none'}"/>`)
    .join('');

  return `
    <html>
      <body style="margin:0;background:black;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <img src="${active}" style="width:536px;height:424px;border-radius:12px;object-fit:cover;margin-bottom:20px" />
        <div style="display:flex;justify-content:center;">${thumbHTML}</div>
      </body>
    </html>
  `;
}

function createGifFromFrames(buffers) {
<<<<<<< HEAD
  return new Promise((resolve, reject) => {
    const first = PNG.sync.read(buffers[0]);
    const gifData = Buffer.alloc(buffers.length * first.width * first.height * 4);
    const gifWriter = new GifWriter(gifData, first.width, first.height, { loop: 0 });
=======
  const first = PNG.sync.read(buffers[0]);
  const width = first.width;
  const height = first.height;
  const gifData = Buffer.alloc(width * height * 4 * buffers.length);
  const writer = new GifWriter(gifData, width, height, { loop: 0 });
>>>>>>> 7691794 (Final stable generate.js with Puppeteer + omggif setup)

  buffers.forEach((buf, i) => {
    const png = PNG.sync.read(buf);
    writer.addFrame(0, 0, width, height, png.data, { delay: 100 });
  });

  return Promise.resolve(gifData.slice(0, writer.end()));
}