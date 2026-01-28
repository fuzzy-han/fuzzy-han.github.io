#!/usr/bin/env python3
"""
yt-dlp Skill Wrapper

A safe wrapper around yt-dlp that validates arguments and executes downloads
with proper error handling and output tracking.
"""

import argparse
import json
import os
import sys
import subprocess
from pathlib import Path
from typing import List, Dict, Any


class YtDlpSkill:
    """Wrapper for yt-dlp downloads with validation and error handling."""

    def __init__(self, cookies_path: str | None = None, output_dir: str | None = None):
        """
        Initialize the skill.

        Args:
            cookies_path: Path to cookies.txt file for authentication
            output_dir: Output directory for downloads
        """
        self.cookies_path = cookies_path
        self.output_dir = output_dir or os.getcwd()
        self.errors = []
        self.output_files = []

    def validate(self) -> bool:
        """
        Validate configuration and environment.

        Returns:
            bool: True if valid, False otherwise
        """
        result = subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            self.errors.append("yt-dlp not found or not working")
            return False

        if self.cookies_path:
            cookies = Path(self.cookies_path)
            if not cookies.exists():
                self.errors.append(f"Cookies file not found: {self.cookies_path}")
                return False
            if not cookies.is_file():
                self.errors.append(f"Cookies path is not a file: {self.cookies_path}")
                return False

        output = Path(self.output_dir)
        if output.exists() and not output.is_dir():
            self.errors.append(
                f"Output path exists but is not a directory: {self.output_dir}"
            )
            return False

        if not output.exists():
            try:
                output.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                self.errors.append(f"Cannot create output directory: {e}")
                return False

        return True

    def build_command(self, urls: List[str]) -> List[str]:
        """
        Build yt-dlp command with safe flags.

        Args:
            urls: List of video URLs to download

        Returns:
            List: Command and arguments for subprocess
        """
        cmd = ["yt-dlp"]

        cmd.extend(
            [
                "--quiet",
                "-f",
                "best",
                "--no-warnings",
                "-o",
                os.path.join(self.output_dir, "%(title)s.%(ext)s"),
            ]
        )

        if self.cookies_path:
            cmd.extend(["--cookies", self.cookies_path])

        cmd.extend(urls)

        return cmd

    def download(self, urls: List[str]) -> tuple[int, Dict[str, Any]]:
        """
        Execute yt-dlp download.

        Args:
            urls: List of video URLs

        Returns:
            Tuple of (exit_code, result_dict)
        """
        if not self.validate():
            return 1, {
                "success": False,
                "exit_code": 1,
                "errors": self.errors,
                "output_files": [],
                "stdout": "",
                "stderr": "",
                "command": "",
            }

        cmd = self.build_command(urls)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=3600,
                check=False,
            )

            return result.returncode, {
                "success": result.returncode == 0,
                "exit_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "errors": self.errors,
                "output_files": self.output_files,
                "command": " ".join(cmd),
            }

        except subprocess.TimeoutExpired:
            error = "Download timed out after 1 hour"
            self.errors.append(error)
            return 124, {
                "success": False,
                "exit_code": 124,
                "stdout": "",
                "stderr": error,
                "errors": self.errors,
                "output_files": [],
                "command": " ".join(cmd),
            }

        except Exception as e:
            error = f"Failed to execute yt-dlp: {e}"
            self.errors.append(error)
            return 1, {
                "success": False,
                "exit_code": 1,
                "stdout": "",
                "stderr": error,
                "errors": self.errors,
                "output_files": [],
                "command": " ".join(cmd),
            }


def main():
    parser = argparse.ArgumentParser(
        description="yt-dlp Skill - Safe wrapper for video downloads",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic download
  python yt_dlp_skill.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

  # With cookies
  python yt_dlp_skill.py --cookies ~/cookie.txt --output-dir ~/Videos \\
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

  # Multiple URLs
  python yt_dlp_skill.py \\
    "https://www.youtube.com/watch?v=url1" \\
    "https://www.youtube.com/watch?v=url2"

  # Dry run (just print command)
  python yt_dlp_skill.py --dry-run "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        """,
    )

    parser.add_argument(
        "urls",
        nargs="+",
        help="Video URL(s) to download",
    )

    parser.add_argument(
        "--cookies",
        type=str,
        default=None,
        help="Path to cookies.txt file for authentication",
    )

    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for downloads (default: current directory)",
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print command without executing",
    )

    parser.add_argument(
        "--json",
        action="store_true",
        help="Output result as JSON",
    )

    args = parser.parse_args()

    skill = YtDlpSkill(cookies_path=args.cookies, output_dir=args.output_dir)

    if args.dry_run:
        cmd = skill.build_command(args.urls)
        if args.json:
            print(
                json.dumps(
                    {
                        "dry_run": True,
                        "command": " ".join(cmd),
                        "urls": args.urls,
                    },
                    indent=2,
                )
            )
        else:
            print("Dry run - command that would execute:")
            print(" ".join(cmd))
        return 0

    exit_code, result = skill.download(args.urls)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if result["success"]:
            print(f"✓ Download completed successfully")
            if result["stdout"]:
                print(f"Output:\n{result['stdout']}")
        else:
            print(f"✗ Download failed with exit code {result['exit_code']}")
            if result["errors"]:
                print("Errors:")
                for error in result["errors"]:
                    print(f"  - {error}")
            if result["stderr"]:
                print(f"Details:\n{result['stderr']}")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
