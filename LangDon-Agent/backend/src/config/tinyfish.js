import 'dotenv/config';
import { TinyFish } from '@tiny-fish/sdk';

const apiKey = process.env.TINYFISH_API_KEY?.trim();

if (!apiKey) {
  throw new Error('TINYFISH_API_KEY is missing');
}

const tinyfish = new TinyFish({
  apiKey,
  timeout: 60000,
  maxRetries: 2
});

export default tinyfish;