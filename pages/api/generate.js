import { IncomingForm } from 'formidable';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { GifWriter } from 'omggif';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const form = new IncomingForm({ multiples: true, uploadDir: '/tmp', keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to parse form' });
    }

    const images = Array.isArray(files.images) ? files.images : [files.images];

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const frames = [];

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const filePath = file.filepath;

      const html = `
        <html>
          <body style="margin:0;display:flex;justify-content:center;align-items:center;width:600px;height:552px;background:#000;">
            <img src="file://${filePath}" style="max-width:100%;max-height:100%;border-radius:12px;" />
          </body>
        </html>
      `;

      await page.setContent(html);
      const screenshot = await page.screenshot({ type: 'png', fullPage: false });
      frames.push(screenshot);
    }

    await browser.close();

    const width = 600;
    const height = 552;
    const gifBuffer = Buffer.alloc(width * height * 256); // oversize buffer

    const gifWriter = new GifWriter(gifBuffer, width, height, { loop: 0 });

    for (const pngBuffer of frames) {
      const png = PNG.sync.read(pngBuffer);
      gifWriter.addFrame(0, 0, width, height, png.data, { delay: 100 });
    }

    const finalBuffer = gifBuffer.slice(0, gifWriter.end());

    const outputPath = join('/tmp', `output-${Date.now()}.gif`);
    await writeFile(outputPath, finalBuffer);
    const fileData = await readFile(outputPath);
    await unlink(outputPath);

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Content-Disposition', 'inline; filename="output.gif"');
    res.send(fileData);
  });
}
