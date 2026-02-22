#!/usr/bin/env python3
"""
TikTok Trend Discovery and Image Extraction Script

This script uses TikTokApi to discover trending videos, extract metadata,
and download cover/thumbnail images for meme generation purposes.

SETUP INSTRUCTIONS:
==================

1. Install dependencies:
   pip install TikTokApi playwright aiohttp

2. Install Playwright browsers:
   playwright install chromium

3. Get your ms_token from TikTok:

   OPTION A - Browser DevTools (Recommended):
   a) Open TikTok.com in your browser and log in
   b) Open Developer Tools (F12 or Cmd+Option+I on Mac)
   c) Go to Application tab -> Cookies -> https://www.tiktok.com
   d) Find the cookie named "msToken"
   e) Copy the entire value (it's a long string)
   f) Set it as environment variable: export MS_TOKEN="your_token_here"

   OPTION B - Browser Extension:
   a) Install a cookie viewer extension
   b) Visit TikTok.com while logged in
   c) Find and copy the msToken cookie value

   Note: The ms_token expires periodically, so you may need to refresh it.

4. Run the script:
   python tiktok_scraper.py --count 10

   Or with a custom token:
   python tiktok_scraper.py --count 10 --ms-token "your_token_here"

USAGE AS MODULE:
===============

    from tiktok_scraper import TikTokTrendScraper

    async def main():
        scraper = TikTokTrendScraper(ms_token="your_token")
        trends = await scraper.get_trending_videos(count=10)
        await scraper.download_cover_images(trends)
        scraper.save_trends_to_json(trends)

    import asyncio
    asyncio.run(main())

"""

import asyncio
import json
import os
import sys
import time
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
import hashlib

try:
    from TikTokApi import TikTokApi
    TIKTOK_API_AVAILABLE = True
except ImportError:
    TIKTOK_API_AVAILABLE = False
    print("Warning: TikTokApi not installed. Run: pip install TikTokApi")

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    print("Warning: aiohttp not installed. Run: pip install aiohttp")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Default paths
DEFAULT_OUTPUT_DIR = Path(__file__).parent.parent / "trendtoken-output"
DEFAULT_IMAGES_DIR = DEFAULT_OUTPUT_DIR / "images"
DEFAULT_JSON_PATH = DEFAULT_OUTPUT_DIR / "trends.json"


@dataclass
class TrendVideo:
    """Data class for storing trending video information."""
    video_id: str
    description: str
    author_username: str
    author_nickname: str
    views: int
    likes: int
    comments: int
    shares: int
    hashtags: List[str]
    cover_url: str
    video_url: str
    music_title: str
    music_author: str
    created_time: str
    scraped_at: str
    local_cover_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


class TikTokTrendScraper:
    """
    TikTok trend discovery and image extraction class.

    This class provides methods to:
    - Discover trending videos on TikTok
    - Extract video metadata (views, likes, description, hashtags)
    - Download video cover/thumbnail images
    - Save results as JSON
    """

    def __init__(
        self,
        ms_token: Optional[str] = None,
        output_dir: Optional[Path] = None,
        images_dir: Optional[Path] = None,
        max_retries: int = 3,
        retry_delay: float = 2.0
    ):
        """
        Initialize the TikTok scraper.

        Args:
            ms_token: TikTok ms_token for authentication. If None, will try
                     to read from MS_TOKEN environment variable.
            output_dir: Directory for output files. Defaults to ./trendtoken-output/
            images_dir: Directory for downloaded images. Defaults to ./trendtoken-output/images/
            max_retries: Maximum number of retries for failed requests.
            retry_delay: Delay between retries in seconds.
        """
        self.ms_token = ms_token or os.environ.get("MS_TOKEN", "")
        self.output_dir = output_dir or DEFAULT_OUTPUT_DIR
        self.images_dir = images_dir or DEFAULT_IMAGES_DIR
        self.max_retries = max_retries
        self.retry_delay = retry_delay

        # Ensure directories exist
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(parents=True, exist_ok=True)

        if not self.ms_token:
            logger.warning(
                "No ms_token provided. Set MS_TOKEN environment variable or pass ms_token parameter. "
                "See script documentation for instructions on obtaining the token."
            )

    async def get_trending_videos(
        self,
        count: int = 30,
        category: Optional[str] = None
    ) -> List[TrendVideo]:
        """
        Fetch trending videos from TikTok.

        Args:
            count: Number of trending videos to fetch (default 30).
            category: Optional category/region filter.

        Returns:
            List of TrendVideo objects containing video metadata.

        Raises:
            RuntimeError: If TikTokApi is not installed or authentication fails.
        """
        if not TIKTOK_API_AVAILABLE:
            raise RuntimeError(
                "TikTokApi is not installed. Run: pip install TikTokApi playwright && playwright install chromium"
            )

        trends: List[TrendVideo] = []
        scraped_at = datetime.utcnow().isoformat() + "Z"

        for attempt in range(self.max_retries):
            try:
                logger.info(f"Fetching trending videos (attempt {attempt + 1}/{self.max_retries})")

                async with TikTokApi() as api:
                    # Create sessions with ms_token if available
                    if self.ms_token:
                        await api.create_sessions(
                            ms_tokens=[self.ms_token],
                            num_sessions=1,
                            sleep_after=3,
                            headless=True
                        )
                    else:
                        await api.create_sessions(
                            num_sessions=1,
                            sleep_after=3,
                            headless=True
                        )

                    # Fetch trending videos
                    async for video in api.trending.videos(count=count):
                        try:
                            video_data = video.as_dict

                            # Extract hashtags from description and challenges
                            hashtags = self._extract_hashtags(video_data)

                            # Get statistics
                            stats = video_data.get("stats", {})

                            # Get author info
                            author = video_data.get("author", {})

                            # Get music info
                            music = video_data.get("music", {})

                            # Get cover URL (video thumbnail)
                            cover_url = (
                                video_data.get("video", {}).get("cover", "") or
                                video_data.get("video", {}).get("originCover", "") or
                                video_data.get("video", {}).get("dynamicCover", "")
                            )

                            # Get video URL
                            video_url = (
                                video_data.get("video", {}).get("playAddr", "") or
                                video_data.get("video", {}).get("downloadAddr", "")
                            )

                            # Create timestamp from createTime
                            create_time = video_data.get("createTime", 0)
                            if create_time:
                                created_str = datetime.fromtimestamp(create_time).isoformat()
                            else:
                                created_str = ""

                            trend_video = TrendVideo(
                                video_id=str(video_data.get("id", "")),
                                description=video_data.get("desc", ""),
                                author_username=author.get("uniqueId", ""),
                                author_nickname=author.get("nickname", ""),
                                views=stats.get("playCount", 0),
                                likes=stats.get("diggCount", 0),
                                comments=stats.get("commentCount", 0),
                                shares=stats.get("shareCount", 0),
                                hashtags=hashtags,
                                cover_url=cover_url,
                                video_url=video_url,
                                music_title=music.get("title", ""),
                                music_author=music.get("authorName", ""),
                                created_time=created_str,
                                scraped_at=scraped_at
                            )

                            trends.append(trend_video)
                            logger.debug(f"Processed video {trend_video.video_id}")

                        except Exception as e:
                            logger.warning(f"Error processing video: {e}")
                            continue

                logger.info(f"Successfully fetched {len(trends)} trending videos")
                return trends

            except Exception as e:
                logger.error(f"Attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    logger.info(f"Retrying in {self.retry_delay} seconds...")
                    await asyncio.sleep(self.retry_delay)
                else:
                    logger.error("All retry attempts exhausted")
                    raise

        return trends

    def _extract_hashtags(self, video_data: Dict[str, Any]) -> List[str]:
        """
        Extract hashtags from video data.

        Args:
            video_data: Raw video data dictionary.

        Returns:
            List of hashtag strings (without # prefix).
        """
        hashtags = set()

        # Extract from challenges/textExtra
        text_extra = video_data.get("textExtra", []) or []
        for item in text_extra:
            if item.get("hashtagName"):
                hashtags.add(item["hashtagName"])

        # Extract from challenges array
        challenges = video_data.get("challenges", []) or []
        for challenge in challenges:
            if challenge.get("title"):
                hashtags.add(challenge["title"])

        # Extract from description using regex
        import re
        description = video_data.get("desc", "")
        desc_hashtags = re.findall(r'#(\w+)', description)
        hashtags.update(desc_hashtags)

        return list(hashtags)

    async def download_cover_images(
        self,
        trends: List[TrendVideo],
        concurrent_downloads: int = 5
    ) -> List[TrendVideo]:
        """
        Download cover images for trending videos.

        Args:
            trends: List of TrendVideo objects to download covers for.
            concurrent_downloads: Maximum number of concurrent downloads.

        Returns:
            Updated list of TrendVideo objects with local_cover_path filled in.
        """
        if not AIOHTTP_AVAILABLE:
            logger.error("aiohttp not installed. Run: pip install aiohttp")
            return trends

        semaphore = asyncio.Semaphore(concurrent_downloads)

        async def download_single(trend: TrendVideo) -> TrendVideo:
            """Download a single cover image."""
            async with semaphore:
                if not trend.cover_url:
                    logger.warning(f"No cover URL for video {trend.video_id}")
                    return trend

                for attempt in range(self.max_retries):
                    try:
                        # Generate filename from video ID
                        ext = self._get_image_extension(trend.cover_url)
                        filename = f"{trend.video_id}{ext}"
                        filepath = self.images_dir / filename

                        # Skip if already downloaded
                        if filepath.exists():
                            logger.debug(f"Cover already exists: {filename}")
                            trend.local_cover_path = str(filepath)
                            return trend

                        async with aiohttp.ClientSession() as session:
                            async with session.get(
                                trend.cover_url,
                                timeout=aiohttp.ClientTimeout(total=30),
                                headers={
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                                }
                            ) as response:
                                if response.status == 200:
                                    content = await response.read()

                                    # Save image
                                    with open(filepath, "wb") as f:
                                        f.write(content)

                                    trend.local_cover_path = str(filepath)
                                    logger.info(f"Downloaded cover: {filename}")
                                    return trend
                                else:
                                    logger.warning(
                                        f"Failed to download {trend.video_id}: HTTP {response.status}"
                                    )

                    except asyncio.TimeoutError:
                        logger.warning(f"Timeout downloading {trend.video_id}")
                    except Exception as e:
                        logger.warning(f"Error downloading {trend.video_id}: {e}")

                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(self.retry_delay)

                return trend

        # Download all covers concurrently
        logger.info(f"Downloading {len(trends)} cover images...")
        tasks = [download_single(trend) for trend in trends]
        updated_trends = await asyncio.gather(*tasks)

        successful = sum(1 for t in updated_trends if t.local_cover_path)
        logger.info(f"Successfully downloaded {successful}/{len(trends)} cover images")

        return list(updated_trends)

    def _get_image_extension(self, url: str) -> str:
        """
        Determine image extension from URL.

        Args:
            url: Image URL.

        Returns:
            File extension including dot (e.g., ".jpeg").
        """
        url_lower = url.lower()
        if ".png" in url_lower:
            return ".png"
        elif ".gif" in url_lower:
            return ".gif"
        elif ".webp" in url_lower:
            return ".webp"
        else:
            return ".jpeg"

    def save_trends_to_json(
        self,
        trends: List[TrendVideo],
        output_path: Optional[Path] = None
    ) -> Path:
        """
        Save trend data to JSON file.

        Args:
            trends: List of TrendVideo objects to save.
            output_path: Path for output JSON file. Defaults to ./trendtoken-output/trends.json

        Returns:
            Path to the saved JSON file.
        """
        output_path = output_path or DEFAULT_JSON_PATH
        output_path = Path(output_path)

        # Ensure parent directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Convert to serializable format
        data = {
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "total_count": len(trends),
            "trends": [trend.to_dict() for trend in trends]
        }

        # Save with pretty printing
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved {len(trends)} trends to {output_path}")
        return output_path

    def load_trends_from_json(
        self,
        input_path: Optional[Path] = None
    ) -> List[TrendVideo]:
        """
        Load previously saved trend data from JSON.

        Args:
            input_path: Path to JSON file. Defaults to ./trendtoken-output/trends.json

        Returns:
            List of TrendVideo objects.
        """
        input_path = input_path or DEFAULT_JSON_PATH
        input_path = Path(input_path)

        if not input_path.exists():
            logger.warning(f"JSON file not found: {input_path}")
            return []

        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        trends = []
        for item in data.get("trends", []):
            trends.append(TrendVideo(**item))

        logger.info(f"Loaded {len(trends)} trends from {input_path}")
        return trends

    def get_trend_summary(self, trends: List[TrendVideo]) -> Dict[str, Any]:
        """
        Generate a summary of trend data.

        Args:
            trends: List of TrendVideo objects.

        Returns:
            Dictionary containing trend statistics and popular hashtags.
        """
        if not trends:
            return {"error": "No trends available"}

        # Collect all hashtags with counts
        hashtag_counts: Dict[str, int] = {}
        for trend in trends:
            for hashtag in trend.hashtags:
                hashtag_counts[hashtag] = hashtag_counts.get(hashtag, 0) + 1

        # Sort by frequency
        top_hashtags = sorted(
            hashtag_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:20]

        # Calculate statistics
        total_views = sum(t.views for t in trends)
        total_likes = sum(t.likes for t in trends)
        avg_views = total_views // len(trends) if trends else 0
        avg_likes = total_likes // len(trends) if trends else 0

        # Find top performing videos
        top_by_views = sorted(trends, key=lambda x: x.views, reverse=True)[:5]
        top_by_likes = sorted(trends, key=lambda x: x.likes, reverse=True)[:5]

        return {
            "total_videos": len(trends),
            "total_views": total_views,
            "total_likes": total_likes,
            "avg_views": avg_views,
            "avg_likes": avg_likes,
            "top_hashtags": [{"tag": tag, "count": count} for tag, count in top_hashtags],
            "top_by_views": [
                {"id": t.video_id, "views": t.views, "description": t.description[:100]}
                for t in top_by_views
            ],
            "top_by_likes": [
                {"id": t.video_id, "likes": t.likes, "description": t.description[:100]}
                for t in top_by_likes
            ]
        }


async def main():
    """Main entry point for CLI usage."""
    parser = argparse.ArgumentParser(
        description="TikTok Trend Discovery and Image Extraction",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --count 20
  %(prog)s --count 10 --ms-token "your_token_here"
  %(prog)s --count 30 --no-download
  %(prog)s --summary-only

Environment Variables:
  MS_TOKEN    TikTok authentication token (required for full functionality)

For detailed setup instructions, run with --help-setup
        """
    )

    parser.add_argument(
        "--count", "-c",
        type=int,
        default=30,
        help="Number of trending videos to fetch (default: 30)"
    )

    parser.add_argument(
        "--ms-token", "-t",
        type=str,
        default=None,
        help="TikTok ms_token for authentication (or set MS_TOKEN env var)"
    )

    parser.add_argument(
        "--output-dir", "-o",
        type=str,
        default=None,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})"
    )

    parser.add_argument(
        "--no-download",
        action="store_true",
        help="Skip downloading cover images"
    )

    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Only show summary of existing data (don't fetch new trends)"
    )

    parser.add_argument(
        "--json-output", "-j",
        type=str,
        default=None,
        help=f"JSON output file path (default: {DEFAULT_JSON_PATH})"
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging"
    )

    parser.add_argument(
        "--help-setup",
        action="store_true",
        help="Show detailed setup instructions"
    )

    args = parser.parse_args()

    if args.help_setup:
        print(__doc__)
        return 0

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Initialize scraper
    output_dir = Path(args.output_dir) if args.output_dir else None
    scraper = TikTokTrendScraper(
        ms_token=args.ms_token,
        output_dir=output_dir
    )

    # Summary only mode
    if args.summary_only:
        trends = scraper.load_trends_from_json()
        if trends:
            summary = scraper.get_trend_summary(trends)
            print("\n" + "=" * 60)
            print("TREND SUMMARY")
            print("=" * 60)
            print(json.dumps(summary, indent=2))
        else:
            print("No existing trend data found. Run without --summary-only first.")
        return 0

    try:
        # Fetch trending videos
        print(f"\nFetching {args.count} trending videos from TikTok...")
        trends = await scraper.get_trending_videos(count=args.count)

        if not trends:
            print("No trends fetched. Check your ms_token and try again.")
            return 1

        # Download cover images
        if not args.no_download:
            print(f"\nDownloading cover images...")
            trends = await scraper.download_cover_images(trends)

        # Save to JSON
        json_path = Path(args.json_output) if args.json_output else None
        saved_path = scraper.save_trends_to_json(trends, json_path)

        # Print summary
        summary = scraper.get_trend_summary(trends)
        print("\n" + "=" * 60)
        print("TREND SUMMARY")
        print("=" * 60)
        print(f"Total videos: {summary['total_videos']}")
        print(f"Total views: {summary['total_views']:,}")
        print(f"Average views: {summary['avg_views']:,}")
        print(f"\nTop Hashtags:")
        for item in summary['top_hashtags'][:10]:
            print(f"  #{item['tag']}: {item['count']} occurrences")

        print(f"\nResults saved to: {saved_path}")
        print(f"Images saved to: {scraper.images_dir}")

        return 0

    except Exception as e:
        logger.error(f"Error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
