/**
 * Trend Image Fetcher
 *
 * Fetches images for trending topics using multiple strategies:
 * 1. Google Images search
 * 2. Direct TikTok video thumbnail extraction
 * 3. Fallback to web search results
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const OUTPUT_DIR = path.join(__dirname, '..', 'trendtoken-output', 'images');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Download an image from URL and save to file
 */
async function downloadImage(imageUrl, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(OUTPUT_DIR, filename);
    const file = fs.createWriteStream(filePath);

    const protocol = imageUrl.startsWith('https') ? https : http;

    const request = protocol.get(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.google.com/'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location, filename).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${filePath}`);
        resolve(filePath);
      });
    });

    request.on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Extract TikTok video thumbnail from a TikTok URL
 * TikTok thumbnails follow a predictable pattern
 */
async function getTikTokThumbnail(videoUrl) {
  return new Promise((resolve, reject) => {
    https.get(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        // Extract thumbnail from meta tags
        const ogImageMatch = data.match(/property="og:image"\s+content="([^"]+)"/);
        if (ogImageMatch) {
          resolve(ogImageMatch[1]);
        } else {
          // Try twitter:image
          const twitterMatch = data.match(/name="twitter:image"\s+content="([^"]+)"/);
          if (twitterMatch) {
            resolve(twitterMatch[1]);
          } else {
            reject(new Error('Could not find thumbnail'));
          }
        }
      });
    }).on('error', reject);
  });
}

/**
 * Search for trend-related images using DuckDuckGo
 */
async function searchTrendImage(trendName) {
  const searchQuery = encodeURIComponent(`${trendName} tiktok meme`);
  const url = `https://duckduckgo.com/?q=${searchQuery}&iax=images&ia=images`;

  console.log(`Searching for: ${trendName}`);

  // DuckDuckGo requires JavaScript, so we'll use a different approach
  // Try to find images from known meme sites
  const sources = [
    `https://knowyourmeme.com/search?q=${searchQuery}`,
    `https://www.google.com/search?q=${searchQuery}&tbm=isch`
  ];

  // For now, return null - we'll use direct URL input or fallback
  return null;
}

/**
 * Main function to fetch image for a trend
 * @param {string} trendName - Name of the trend
 * @param {string} tiktokUrl - Optional direct TikTok URL
 * @param {string} imageUrl - Optional direct image URL
 */
async function fetchTrendImage(trendName, options = {}) {
  const { tiktokUrl, imageUrl, symbol } = options;
  const filename = `${symbol || trendName.toLowerCase().replace(/\s+/g, '_')}.jpg`;

  try {
    // Strategy 1: Direct image URL provided
    if (imageUrl) {
      console.log('Using provided image URL...');
      return await downloadImage(imageUrl, filename);
    }

    // Strategy 2: TikTok URL provided - extract thumbnail
    if (tiktokUrl) {
      console.log('Extracting TikTok thumbnail...');
      const thumbnailUrl = await getTikTokThumbnail(tiktokUrl);
      return await downloadImage(thumbnailUrl, filename);
    }

    // Strategy 3: Search for trend image
    console.log('Searching for trend image...');
    const foundUrl = await searchTrendImage(trendName);
    if (foundUrl) {
      return await downloadImage(foundUrl, filename);
    }

    console.log('Could not find image automatically.');
    return null;

  } catch (error) {
    console.error('Error fetching image:', error.message);
    return null;
  }
}

/**
 * Fetch image from a specific TikTok video URL
 */
async function fetchFromTikTok(tiktokUrl, symbol) {
  try {
    console.log(`Fetching thumbnail from: ${tiktokUrl}`);
    const thumbnailUrl = await getTikTokThumbnail(tiktokUrl);
    console.log(`Found thumbnail: ${thumbnailUrl}`);

    const filename = `${symbol.toLowerCase()}.jpg`;
    return await downloadImage(thumbnailUrl, filename);
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage:');
    console.log('  node trend_image_fetcher.js <tiktok_url> <symbol>');
    console.log('');
    console.log('Example:');
    console.log('  node trend_image_fetcher.js "https://www.tiktok.com/@user/video/123" THERMO');
    process.exit(1);
  }

  const [tiktokUrl, symbol] = args;

  fetchFromTikTok(tiktokUrl, symbol)
    .then(result => {
      if (result) {
        console.log('Success:', result);
      } else {
        console.log('Failed to fetch image');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { fetchTrendImage, fetchFromTikTok, downloadImage, getTikTokThumbnail };
