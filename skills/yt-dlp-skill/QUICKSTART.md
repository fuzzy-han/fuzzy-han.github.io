# Quick Start Guide

## Basic Usage

```bash
cd /home/han/personal-website/skills/yt-dlp-skill

# Preview command without executing
python3 yt_dlp_skill.py --dry-run "https://www.youtube.com/watch?v=VIDEO_ID"

# Download to /home/han/Videos/youtube
python3 yt_dlp_skill.py \
  --cookies /home/han/cookie.txt \
  --output-dir /home/han/Videos/youtube \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

## Common Commands

| Task | Command |
|------|---------|
| Preview command | `python3 yt_dlp_skill.py --dry-run "URL"` |
| Dry-run with cookies | `python3 yt_dlp_skill.py --dry-run --cookies ~/cookie.txt "URL"` |
| Download (requires cookies) | `python3 yt_dlp_skill.py --cookies ~/cookie.txt --output-dir ~/Videos/youtube "URL"` |
| JSON output | `python3 yt_dlp_skill.py --json --dry-run "URL"` |
| Multiple URLs | `python3 yt_dlp_skill.py "URL1" "URL2" "URL3"` |
| Help | `python3 yt_dlp_skill.py --help` |
| Run tests | `bash tests/test_skill_dryrun.sh` |

## Exit Codes

- `0` - Success
- `1` - Validation or execution error
- `124` - Timeout (>1 hour)
- Other - yt-dlp error

## Troubleshooting

### Cookie file not found
```bash
# Ensure cookie.txt is at correct path
ls -la /home/han/cookie.txt
```

### Output directory doesn't exist
```bash
# Script will auto-create, or create manually:
mkdir -p /home/han/Videos/youtube
```

### yt-dlp not installed
```bash
# Install via pip
python3 -m pip install yt-dlp

# Or system package manager
sudo pacman -S yt-dlp  # Arch
brew install yt-dlp    # macOS
```

## File Locations

- Script: `/home/han/personal-website/skills/yt-dlp-skill/yt_dlp_skill.py`
- Tests: `/home/han/personal-website/skills/yt-dlp-skill/tests/test_skill_dryrun.sh`
- Cookies: `/home/han/cookie.txt` (if needed)
- Downloads: `/home/han/Videos/youtube` (default)
