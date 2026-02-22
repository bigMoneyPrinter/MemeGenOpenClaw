#!/usr/bin/env python3
"""
TikTok Image Extractor

Multiple strategies:
1. TikTok oEmbed API (no login required)
2. TikTok direct video URLs
3. Google Image search fallback
4. Screenshot capture as last resort
"""

import asyncio
import sys
import json
import re
import urllib.request
import urllib.parse
from pathlib import Path

# Add the venv to path
venv_path = Path(__file__).parent.parent / ".venv" / "lib" / "python3.14" / "site-packages"
if venv_path.exists():
    sys.path.insert(0, str(venv_path))

OUTPUT_DIR = Path(__file__).parent.parent / "trendtoken-output" / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}


def download_image(url: str, filepath: Path) -> bool:
    """Download an image from URL."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status == 200:
                filepath.write_bytes(response.read())
                print(f"Downloaded: {filepath}")
                return True
    except Exception as e:
        print(f"Download failed: {e}")
    return False


def get_oembed_thumbnail(video_url: str) -> str:
    """Get thumbnail URL from TikTok oEmbed API."""
    try:
        oembed_url = f"https://www.tiktok.com/oembed?url={urllib.parse.quote(video_url)}"
        req = urllib.request.Request(oembed_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read())
            if 'thumbnail_url' in data:
                return data['thumbnail_url']
    except Exception as e:
        print(f"oEmbed failed: {e}")
    return None


def search_google_images(query: str) -> list:
    """Search Google Images and return image URLs."""
    images = []
    try:
        search_url = f"https://www.google.com/search?q={urllib.parse.quote(query)}&tbm=isch"
        req = urllib.request.Request(search_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode('utf-8', errors='ignore')

            # Find image URLs in the response
            # Google encodes image URLs in various ways
            patterns = [
                r'"ou":"(https://[^"]+)"',  # Original URL
                r'imgurl=(https://[^&"]+)',  # URL parameter
                r'"(https://[^"]*\.(jpg|jpeg|png|webp)[^"]*)"',  # Direct image links
            ]

            # Domains to exclude (Google's own assets)
            excluded_domains = [
                'gstatic.com', 'google.com', 'googleapis.com',
                'googleusercontent.com', 'ggpht.com', 'ytimg.com',
                'favicon', 'icon', 'logo', 'badge', 'button'
            ]

            for pattern in patterns:
                matches = re.findall(pattern, html)
                for match in matches:
                    url = match[0] if isinstance(match, tuple) else match
                    # Clean and validate URL
                    url = urllib.parse.unquote(url)
                    url_lower = url.lower()

                    # Skip if URL contains excluded domains/terms
                    if any(excl in url_lower for excl in excluded_domains):
                        continue

                    if url.startswith('http') and len(url) < 500:
                        images.append(url)

    except Exception as e:
        print(f"Google search failed: {e}")

    return images[:10]  # Return top 10


async def fetch_with_playwright(search_term: str, symbol: str) -> str:
    """Use Playwright to capture images from search results."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright not available")
        return None

    filepath = OUTPUT_DIR / f"{symbol.lower()}.png"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=HEADERS['User-Agent'],
            viewport={'width': 1280, 'height': 900}
        )
        page = await context.new_page()

        # Try Google Images search
        search_url = f"https://www.google.com/search?q={urllib.parse.quote(search_term + ' tiktok meme')}&tbm=isch"
        print(f"Searching Google Images: {search_url}")

        try:
            await page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
            await page.wait_for_timeout(3000)

            # Click on first image to open preview
            images = await page.query_selector_all('img[class*="rg_i"]')
            if not images:
                images = await page.query_selector_all('div[data-id] img')
            if not images:
                images = await page.query_selector_all('img')

            clicked = False
            for img in images[:10]:
                try:
                    box = await img.bounding_box()
                    src = await img.get_attribute('src')
                    # Skip tiny images and data URLs
                    if box and box['width'] > 80 and box['height'] > 80:
                        if src and not src.startswith('data:'):
                            await img.click()
                            clicked = True
                            print("Clicked on image to open preview")
                            await page.wait_for_timeout(2000)
                            break
                except:
                    continue

            # If clicked, try to capture the larger preview image
            if clicked:
                # Look for the larger preview image
                preview_selectors = [
                    'img[class*="sFlh5c"]',  # Google's preview image class
                    'img[class*="n3VNCb"]',
                    'img[jsname="HiaYvf"]',
                    'c-wiz img[src*="http"]',
                    'img[style*="max-width"]',
                ]

                for selector in preview_selectors:
                    preview_img = await page.query_selector(selector)
                    if preview_img:
                        try:
                            box = await preview_img.bounding_box()
                            if box and box['width'] > 200 and box['height'] > 200:
                                await preview_img.screenshot(path=str(filepath))
                                print(f"Captured preview image: {filepath}")
                                await browser.close()
                                return str(filepath)
                        except:
                            continue

            # Fallback: capture the first result image directly
            for img in images[:5]:
                try:
                    box = await img.bounding_box()
                    if box and box['width'] > 100 and box['height'] > 100:
                        await img.screenshot(path=str(filepath))
                        print(f"Captured thumbnail: {filepath}")
                        await browser.close()
                        return str(filepath)
                except:
                    continue

            # Last fallback: area screenshot of first image
            await page.screenshot(path=str(filepath), clip={
                'x': 170, 'y': 180, 'width': 200, 'height': 250
            })
            print(f"Captured area: {filepath}")

        except Exception as e:
            print(f"Playwright error: {e}")
            import traceback
            traceback.print_exc()

        await browser.close()

    if filepath.exists():
        return str(filepath)
    return None


def fetch_trend_image_sync(trend_name: str, symbol: str) -> str:
    """
    Main function to fetch an image for a trend.
    Tries multiple strategies in order.
    """
    print(f"\n=== Fetching image for: {trend_name} ({symbol}) ===\n")

    filepath_jpg = OUTPUT_DIR / f"{symbol.lower()}.jpg"
    filepath_png = OUTPUT_DIR / f"{symbol.lower()}.png"

    # Strategy 1: Google Images search
    print("Strategy 1: Google Images search...")
    search_query = f"{trend_name} tiktok meme"
    image_urls = search_google_images(search_query)

    if image_urls:
        print(f"Found {len(image_urls)} image URLs")
        for url in image_urls[:5]:
            print(f"Trying: {url[:80]}...")
            if download_image(url, filepath_jpg):
                return str(filepath_jpg)

    # Strategy 2: DuckDuckGo (often has different results)
    print("\nStrategy 2: DuckDuckGo search...")
    try:
        ddg_url = f"https://duckduckgo.com/?q={urllib.parse.quote(search_query)}&iax=images&ia=images"
        req = urllib.request.Request(ddg_url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as response:
            html = response.read().decode('utf-8', errors='ignore')
            # DDG often includes direct image links
            urls = re.findall(r'"(https://[^"]*\.(jpg|jpeg|png)[^"]*)"', html)
            for url, _ in urls[:5]:
                if 'duckduckgo' not in url.lower():
                    print(f"Trying DDG result: {url[:80]}...")
                    if download_image(url, filepath_jpg):
                        return str(filepath_jpg)
    except Exception as e:
        print(f"DuckDuckGo failed: {e}")

    # Strategy 3: Try Playwright for screenshot capture
    print("\nStrategy 3: Playwright screenshot...")
    try:
        result = asyncio.run(fetch_with_playwright(trend_name, symbol))
        if result:
            return result
    except Exception as e:
        print(f"Playwright failed: {e}")

    # Strategy 4: Create a placeholder with trend name
    print("\nStrategy 4: Creating placeholder image...")
    try:
        from PIL import Image, ImageDraw, ImageFont
        # Create a simple placeholder
        img = Image.new('RGB', (400, 400), color='#1a1a2e')
        draw = ImageDraw.Draw(img)
        # Add text
        text = symbol.upper()
        # Use default font
        draw.text((200, 200), text, fill='#e94560', anchor='mm')
        draw.text((200, 250), trend_name[:20], fill='#ffffff', anchor='mm')
        img.save(str(filepath_png))
        print(f"Created placeholder: {filepath_png}")
        return str(filepath_png)
    except ImportError:
        print("PIL not available for placeholder")

    print("\nCould not fetch image for this trend")
    return None


# CLI
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python tiktok_image.py <trend_name> <symbol>")
        print("Example: python tiktok_image.py 'thermostat game' THERMO")
        sys.exit(1)

    trend_name = sys.argv[1]
    symbol = sys.argv[2]

    result = fetch_trend_image_sync(trend_name, symbol)

    if result:
        print(f"\nImage saved to: {result}")
    else:
        print("\nFailed to fetch image")
        sys.exit(1)
