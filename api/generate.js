import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

export default async function handler(req, res) {
  console.info('[generate.js] API triggered');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const form = formidable({ multiples: true, maxFileSize: 20 * 1024 * 1024 });

    form.parse(req, async (err, fields, files) => {
      if (err) throw err;

      // ... rest of your code