# yt-dlp Skill

A safe, local Python wrapper around yt-dlp that validates arguments, manages cookies, and streams output safely.

## Features

- ✓ Safe subprocess execution (no shell injection)
- ✓ Path validation for cookies and output directories
- ✓ Proper error handling and timeouts (1 hour max)
- ✓ JSON output mode for programmatic use
- ✓ Dry-run mode for testing
- ✓ Support for authentication via cookies
- ✓ Detailed error reporting

## Prerequisites

- Python 3.10+
- yt-dlp (system-installed or via pip)
- Cookie.txt file (optional, for authentication)

## Installation

### System-wide yt-dlp

```bash
# Using pip
pip install yt-dlp

# Or on Linux (Arch)
sudo pacman -S yt-dlp

# Or on macOS
brew install yt-dlp
```

### Verify Installation

```bash
yt-dlp --version
```

## Usage

### Basic Download

```bash
python yt_dlp_skill.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### With Authentication (Cookies)

```bash
python yt_dlp_skill.py \
  --cookies /home/han/cookie.txt \
  --output-dir /home/han/Videos \
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### Dry Run (Preview Command)

```bash
python yt_dlp_skill.py --dry-run \
  --cookies /home/han/cookie.txt \
  --output-dir /home/han/Videos \
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### JSON Output

```bash
python yt_dlp_skill.py --json \
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### Multiple URLs

```bash
python yt_dlp_skill.py \
  "https://www.youtube.com/watch?v=url1" \
  "https://www.youtube.com/watch?v=url2" \
  "https://www.youtube.com/watch?v=url3"
```

## CLI Reference

```
usage: yt_dlp_skill.py [-h] [--cookies COOKIES] [--output-dir OUTPUT_DIR] 
                        [--dry-run] [--json] 
                        urls [urls ...]

yt-dlp Skill - Safe wrapper for video downloads

positional arguments:
  urls                  Video URL(s) to download

optional arguments:
  -h, --help            show this help message and exit
  --cookies COOKIES     Path to cookies.txt file for authentication
  --output-dir OUTPUT_DIR
                        Output directory for downloads (default: current 
                        directory)
  --dry-run             Print command without executing
  --json                Output result as JSON
```

## Return Values

### Exit Codes

- `0` - Success
- `1` - Validation or execution error
- `124` - Timeout (>1 hour)
- Other - yt-dlp exit code

### JSON Response Format

```json
{
  "success": true,
  "exit_code": 0,
  "stdout": "...",
  "stderr": "",
  "errors": [],
  "output_files": [],
  "command": "yt-dlp --quiet -f best --no-warnings ..."
}
```

## Testing

### Run Dry Run Test

```bash
cd /home/han/personal-website/skills/yt-dlp-skill
bash tests/test_skill_dryrun.sh
```

Expected output:
```
[TEST] yt-dlp version check... ✓
[TEST] Dry run with single URL... ✓
[TEST] Dry run with cookies path... ✓
[TEST] All tests passed!
```

## Validation & Safety

The skill performs the following validations before execution:

1. **yt-dlp availability**: Checks if `yt-dlp --version` works
2. **Cookies file**: Verifies file exists and is readable if provided
3. **Output directory**: Creates if needed, validates write permissions
4. **No shell injection**: Uses subprocess array args (never shell=True)
5. **Timeout protection**: 1-hour maximum for any download

## Error Handling

The script returns detailed errors on failure:

```bash
$ python yt_dlp_skill.py --cookies /nonexistent/cookie.txt "http://example.com"

✗ Download failed with exit code 1
Errors:
  - Cookies file not found: /nonexistent/cookie.txt
```

## Architecture

```
YtDlpSkill (class)
├── __init__(cookies_path, output_dir)
├── validate() -> bool
│   ├── Check yt-dlp availability
│   ├── Validate cookies file
│   └── Validate output directory
├── build_command(urls) -> List[str]
│   └── Construct safe subprocess args
└── download(urls) -> (exit_code, result_dict)
    ├── Call validate()
    ├── Build command
    ├── Execute subprocess
    └── Return structured result
```

## Building as a Skill

For integration with OpenCode/Sisyphus agents:

```bash
# From skill directory
ls -la
# skill.json      - Manifest
# yt_dlp_skill.py - Entry point
# README.md       - Documentation
# tests/          - Test suite
```

The skill descriptor in `skill.json` declares:
- Capability: `download_video`
- Parameters: `urls`, `cookies_path`, `output_dir`
- Dependencies: system `yt-dlp`
- Safe flags and timeout configuration

## Future Enhancements

- [ ] Output file tracking and listing
- [ ] Progress callback support
- [ ] Subtitle downloading
- [ ] Playlist handling with progress
- [ ] Format selection UI
- [ ] Parallel downloads with rate limiting
- [ ] Integration with credential managers

## License

MIT
