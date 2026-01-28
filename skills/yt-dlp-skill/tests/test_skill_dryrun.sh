#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_SCRIPT="$SCRIPT_DIR/yt_dlp_skill.py"

echo "Running yt-dlp Skill Tests"
echo "=========================="
echo ""

test_passed=0
test_failed=0

run_test() {
    local name="$1"
    shift
    
    echo -n "[TEST] $name... "
    if timeout 10 "$@" >/dev/null 2>&1; then
        echo "✓"
        ((test_passed++))
        return 0
    else
        echo "✗"
        ((test_failed++))
        return 1
    fi
}

run_test "yt-dlp version check" \
    yt-dlp --version

run_test "Dry run with single URL" \
    python3 "$SKILL_SCRIPT" --dry-run "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

run_test "Dry run with output-dir" \
    python3 "$SKILL_SCRIPT" --dry-run --output-dir /tmp "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

run_test "Multiple URLs dry-run" \
    python3 "$SKILL_SCRIPT" --dry-run \
    "https://www.youtube.com/watch?v=url1" \
    "https://www.youtube.com/watch?v=url2"

run_test "JSON dry-run output" \
    bash -c "python3 '$SKILL_SCRIPT' --dry-run --json 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' | grep -q 'dry_run'"

run_test "Help message" \
    bash -c "python3 '$SKILL_SCRIPT' --help | grep -q 'yt-dlp Skill'"

echo ""
echo "=========================="
echo "Test Results: $test_passed passed, $test_failed failed"

if [ $test_failed -eq 0 ]; then
    echo "✓ All tests passed!"
    exit 0
else
    echo "✗ Some tests failed"
    exit 1
fi
