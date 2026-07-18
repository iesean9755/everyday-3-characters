"""Generate development-time local Chinese MP3 files with edge-tts."""

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "audio-script.json"
MISSING_PATH = ROOT / "scripts" / "audio-missing.json"
DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"


def valid_mp3(path: Path) -> bool:
    if not path.exists() or path.stat().st_size <= 1000:
        return False
    with path.open("rb") as audio_file:
        header = audio_file.read(3)
    return header == b"ID3" or (
        len(header) >= 2 and header[0] == 0xFF and header[1] & 0xE0 == 0xE0
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成本地开发样音")
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--category", help="只生成指定分类，例如 character")
    return parser.parse_args()


async def generate_one(edge_tts, row: dict, args: argparse.Namespace, semaphore):
    relative = row["audioPath"].removeprefix("/")
    output = (ROOT / "public" / relative).resolve()
    audio_root = (ROOT / "public" / "audio").resolve()
    if audio_root not in output.parents:
        raise ValueError(f"非法音频路径：{row['audioPath']}")
    if not args.force and valid_mp3(output):
        return "skipped", row

    output.parent.mkdir(parents=True, exist_ok=True)
    rate = "-15%"
    async with semaphore:
        for attempt in range(1, 4):
            try:
                communicate = edge_tts.Communicate(
                    text=row["fullText"], voice=args.voice, rate=rate
                )
                await communicate.save(str(output))
                if not valid_mp3(output):
                    raise RuntimeError("生成文件不是有效的非空MP3")
                return "generated", row
            except Exception as error:  # edge-tts exposes several transport errors
                if output.exists() and output.stat().st_size == 0:
                    output.unlink()
                if attempt == 3:
                    return "failed", {**row, "error": str(error)}
                await asyncio.sleep(2 * attempt)
    return "failed", row


def refresh_scripts() -> None:
    subprocess.run(
        ["node", "scripts/generate-audio-script.mjs"],
        cwd=ROOT,
        check=True,
    )


async def main() -> int:
    args = parse_args()
    if args.days < 1 or args.concurrency < 1:
        raise SystemExit("--days 和 --concurrency 必须大于0")
    try:
        import edge_tts
    except ImportError:
        print("缺少 edge-tts。请先安装 scripts/requirements-audio.txt。", file=sys.stderr)
        return 2

    refresh_scripts()
    rows = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
    selected = [
        row
        for row in rows
        if (args.all or row["courseDay"] == 0 or row["courseDay"] <= args.days)
        and (not args.category or row["category"] == args.category)
    ]
    semaphore = asyncio.Semaphore(args.concurrency)
    results = await asyncio.gather(
        *(generate_one(edge_tts, row, args, semaphore) for row in selected)
    )
    failed = [row for status, row in results if status == "failed"]
    counts = {
        name: sum(status == name for status, _ in results)
        for name in ("generated", "skipped", "failed")
    }
    refresh_scripts()
    remaining = json.loads(MISSING_PATH.read_text(encoding="utf-8"))
    print(
        f"生成 {counts['generated']}，跳过 {counts['skipped']}，失败 {counts['failed']}，"
        f"全课程尚缺 {len(remaining)}。"
    )
    if failed or remaining:
        print(json.dumps(failed, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
