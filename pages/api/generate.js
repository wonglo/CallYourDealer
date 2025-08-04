// server.js
import { writeFile } from 'fs/promises';
import path from 'path';
import { IncomingForm } from 'formidable';
import { createCanvas, loadImage } from 'canvas';
import { GifWriter } from 'omggif';
import sharp from 'sharp';
import { readFileSync, createWriteStream } from 'fs';

export const config = {
  api: {
    bodyParser: false
  }
};

const FRAME_WIDTH = 1200;
const FRAME_HEIGHT = 1104;
const HERO_WIDTH = 536;
const HERO_HEIGHT = 424;
const HERO_RADIUS = 12;
const THUMB_SIZE = 64;
const THUMB_RADIUS = 8;
const THUMB_SPACING = 24;
const THUMB_TOP = 944;

function drawRoundedImage(ctx, img, x, y, width, height, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, width, height);
  ctx.restore();
}

export default async function handler(req, res) {
  const form = new IncomingForm({ multiples: true, uploadDir: '/tmp', keepExtensions: true });
  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).send('Error parsing the files.');
      return;
    }

    const images = files.images;
    if (!images || images.length !== 5) {
      res.status(400).send('Please upload exactly 5 images.');
      return;
    }

    const imagePaths = Array.isArray(images) ? images.map(img => img.filepath) : [images.filepath];
    const gifBuffers = [];

    for (let i = 0; i < 5; i++) {
      const canvas = createCanvas(FRAME_WIDTH, FRAME_HEIGHT);
      const ctx = canvas.getContext('2d');

      const loadedImages = await Promise.all(imagePaths.map(p => loadImage(p)));
      drawRoundedImage(ctx, loadedImages[i], 332, 80, HERO_WIDTH, HERO_HEIGHT, HERO_RADIUS);

      for (let j = 0; j < 5; j++) {
        const x = (FRAME_WIDTH - (5 * THUMB_SIZE + 4 * THUMB_SPACING)) / 2 + j * (THUMB_SIZE + THUMB_SPACING);
        drawRoundedImage(ctx, loadedImages[j], x, THUMB_TOP, THUMB_SIZE, THUMB_SIZE, THUMB_RADIUS);

        if (i === j) {
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 4;
          ctx.strokeRect(x, THUMB_TOP, THUMB_SIZE, THUMB_SIZE);
        }
      }

      const pngBuffer = canvas.toBuffer('image/png');
      gifBuffers.push(pngBuffer);
    }

    const gifStream = createWriteStream('/tmp/output.gif');
    const gifWriter = new GifWriter(gifStream, FRAME_WIDTH, FRAME_HEIGHT, { loop: 0 });

    for (let buffer of gifBuffers) {
      const raw = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
      gifWriter.addFrame(0, 0, FRAME_WIDTH, FRAME_HEIGHT, raw.data, { delay: 100 });
    }

    gifWriter.end();

    gifStream.on('finish', () => {
      const gif = readFileSync('/tmp/output.gif');
      res.setHeader('Content-Type', 'image/gif');
      res.send(gif);
    });
  });
}
