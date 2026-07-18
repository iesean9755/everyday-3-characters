"""Normalize all local MP3 files with ffmpeg loudnorm, replacing safely."""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AUDIO_ROOT = ROOT / "public" / "audio"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="统一本地 MP3 响度")
    parser.add_argument("--audio-root", type=Path, default=DEFAULT_AUDIO_ROOT)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    return parser.parse_args()


def executable(command: str) -> str | None:
    candidate = Path(command)
    if candidate.is_file():
        return str(candidate)
    return shutil.which(command)


def valid_audio(ffmpeg: str, path: Path) -> bool:
    if not path.is_file() or path.stat().st_size <= 1000:
        return False
    result = subprocess.run(
        [ffmpeg, "-v", "error", "-i", str(path), "-f", "null", "-"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def normalize_one(ffmpeg: str, source: Path) -> tuple[str, str]:
    if not valid_audio(ffmpeg, source):
        return "skipped", "empty or invalid"
    temporary = source.with_name(f"{source.stem}.normalize.tmp.mp3")
    temporary.unlink(missing_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-af",
        "loudnorm=I=-18:TP=-1.5:LRA=7",
        "-ar",
        "44100",
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "3",
        str(temporary),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0 or not valid_audio(ffmpeg, temporary):
        temporary.unlink(missing_ok=True)
        return "failed", result.stderr.strip() or "normalized output is invalid"
    os.replace(temporary, source)
    return "success", ""


def main() -> int:
    args = parse_args()
    ffmpeg = executable(args.ffmpeg)
    if not ffmpeg:
        print("找不到 ffmpeg，请先安装或通过 --ffmpeg 指定路径。", file=sys.stderr)
        return 2
    audio_root = args.audio_root.resolve()
    files = sorted(audio_root.rglob("*.mp3"))
    counts = {"success": 0, "skipped": 0, "failed": 0}
    failures: list[tuple[Path, str]] = []
    for index, path in enumerate(files, start=1):
        status, detail = normalize_one(ffmpeg, path)
        counts[status] += 1
        if status == "failed":
            failures.append((path, detail))
        if index % 25 == 0 or index == len(files):
            print(f"已处理 {index}/{len(files)}")
    print(
        f"响度统一完成：成功 {counts['success']}，"
        f"跳过 {counts['skipped']}，失败 {counts['failed']}。"
    )
    for path, detail in failures:
        print(f"失败：{path.relative_to(audio_root)}：{detail}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
