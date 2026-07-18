"""Build one continuous teaching MP3 for every course item."""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIO_ROOT = ROOT / "public" / "audio"
SCRIPT_PATH = ROOT / "scripts" / "audio-script.json"
REPORT_PATH = ROOT / "scripts" / "teaching-audio-report.json"
INTRO_GAIN_DB = 3.0
PREROLL_SECONDS = 0.150
TRUE_PEAK_TARGET_DBTP = -1.5
TRUE_PEAK_SAFETY_DBTP = -1.8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="生成连续教学 MP3")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def resolve_tool(command: str) -> str | None:
    candidate = Path(command)
    return str(candidate) if candidate.is_file() else shutil.which(command)


def public_path(audio_path: str) -> Path:
    output = (ROOT / "public" / audio_path.removeprefix("/")).resolve()
    if AUDIO_ROOT.resolve() not in output.parents:
        raise ValueError(f"非法音频路径：{audio_path}")
    return output


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


def measure_loudnorm(ffmpeg: str, path: Path) -> dict:
    result = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            "loudnorm=I=-18:TP=-1.5:LRA=7:print_format=json",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr, re.DOTALL)
    if not matches:
        raise RuntimeError(f"无法测量响度：{path.name}")
    return json.loads(matches[-1])


def measure_lufs(ffmpeg: str, path: Path) -> float:
    return float(measure_loudnorm(ffmpeg, path)["input_i"])


def duration_seconds(ffprobe: str, path: Path) -> float:
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    return round(float(result.stdout.strip()), 3)


def build_one(
    ffmpeg: str,
    ffprobe: str,
    teaching: dict,
    character: dict,
    loudness_cache: dict[Path, float],
    force: bool,
) -> tuple[str, dict]:
    output = public_path(teaching["audioPath"])
    prefix = teaching["audioPath"].removesuffix("-teaching.mp3")
    sources = {
        "intro": AUDIO_ROOT / "lessons" / "intro.mp3",
        "character": public_path(character["audioPath"]),
        "explanation": public_path(f"{prefix}-explanation.mp3"),
        "example": public_path(f"{prefix}-example.mp3"),
    }
    missing = [str(path) for path in sources.values() if not valid_audio(ffmpeg, path)]
    if missing:
        return "failed", {"audioPath": teaching["audioPath"], "missing": missing}
    if not force and valid_audio(ffmpeg, output):
        return "skipped", {
            "audioPath": teaching["audioPath"],
            "durationSeconds": duration_seconds(ffprobe, output),
        }

    measured = {}
    for name, path in sources.items():
        if path not in loudness_cache:
            loudness_cache[path] = measure_lufs(ffmpeg, path)
        measured[name] = loudness_cache[path]
    other_average = sum(measured[name] for name in ("character", "explanation", "example")) / 3
    source_difference = measured["intro"] - other_average

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f"{output.stem}.teaching.tmp.wav")
    normalized = output.with_name(f"{output.stem}.teaching-final.tmp.mp3")
    temporary.unlink(missing_ok=True)
    normalized.unlink(missing_ok=True)
    filter_graph = (
        f"anullsrc=r=44100:cl=mono:d={PREROLL_SECONDS:.3f}[pre];"
        f"[0:a]aformat=sample_rates=44100:channel_layouts=mono,volume={INTRO_GAIN_DB}dB[a0];"
        "[1:a]aformat=sample_rates=44100:channel_layouts=mono[a1];"
        "[2:a]aformat=sample_rates=44100:channel_layouts=mono[a2];"
        "[3:a]aformat=sample_rates=44100:channel_layouts=mono[a3];"
        "anullsrc=r=44100:cl=mono:d=0.150[s1];"
        "anullsrc=r=44100:cl=mono:d=0.200[s2];"
        "anullsrc=r=44100:cl=mono:d=0.150[s3];"
        "[pre][a0][s1][a1][s2][a2][s3][a3]concat=n=8:v=0:a=1[out]"
    )
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    for path in sources.values():
        command.extend(["-i", str(path)])
    command.extend(
        [
            "-filter_complex",
            filter_graph,
            "-map",
            "[out]",
            "-codec:a",
            "pcm_s24le",
            str(temporary),
        ]
    )
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0 or not valid_audio(ffmpeg, temporary):
        temporary.unlink(missing_ok=True)
        return "failed", {
            "audioPath": teaching["audioPath"],
            "error": result.stderr.strip() or "输出音频无效",
        }
    combined_stats = measure_loudnorm(ffmpeg, temporary)
    combined_true_peak = float(combined_stats["input_tp"])
    whole_file_gain_db = min(0.0, TRUE_PEAK_SAFETY_DBTP - combined_true_peak)

    def encode_with_gain(gain_db: float) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(temporary),
                "-af",
                f"volume={gain_db:.3f}dB",
                "-ar",
                "44100",
                "-codec:a",
                "libmp3lame",
                "-q:a",
                "3",
                str(normalized),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    final_result = encode_with_gain(whole_file_gain_db)
    if final_result.returncode == 0 and valid_audio(ffmpeg, normalized):
        encoded_true_peak = float(measure_loudnorm(ffmpeg, normalized)["input_tp"])
        if encoded_true_peak > TRUE_PEAK_TARGET_DBTP:
            whole_file_gain_db -= encoded_true_peak - TRUE_PEAK_SAFETY_DBTP
            final_result = encode_with_gain(whole_file_gain_db)
    temporary.unlink(missing_ok=True)
    if final_result.returncode != 0 or not valid_audio(ffmpeg, normalized):
        normalized.unlink(missing_ok=True)
        return "failed", {
            "audioPath": teaching["audioPath"],
            "error": final_result.stderr.strip() or "最终响度统一失败",
        }
    final_stats = measure_loudnorm(ffmpeg, normalized)
    if float(final_stats["input_tp"]) > TRUE_PEAK_TARGET_DBTP:
        normalized.unlink(missing_ok=True)
        return "failed", {
            "audioPath": teaching["audioPath"],
            "error": f"true peak exceeds target: {final_stats['input_tp']} dBTP",
        }
    os.replace(normalized, output)
    return "generated", {
        "audioPath": teaching["audioPath"],
        "durationSeconds": duration_seconds(ffprobe, output),
        "sourceLufs": measured,
        "prerollMs": round(PREROLL_SECONDS * 1000),
        "finalTruePeakDbTp": float(final_stats["input_tp"]),
        "wholeFileGainDb": round(whole_file_gain_db, 3),
        "introSourceDifferenceLu": round(source_difference, 2),
        "introGainDb": INTRO_GAIN_DB,
        "effectiveIntroDifferenceDb": round(source_difference + INTRO_GAIN_DB, 2),
    }


def main() -> int:
    args = parse_args()
    ffmpeg = resolve_tool(args.ffmpeg)
    if not ffmpeg:
        print("找不到 ffmpeg。", file=sys.stderr)
        return 2
    ffprobe = str(Path(ffmpeg).with_name("ffprobe.exe"))
    if not Path(ffprobe).is_file():
        ffprobe = resolve_tool("ffprobe") or ""
    if not ffprobe:
        print("找不到 ffprobe。", file=sys.stderr)
        return 2

    rows = json.loads(SCRIPT_PATH.read_text(encoding="utf-8"))
    teaching_rows = [row for row in rows if row["category"] == "teaching"]
    character_by_key = {
        row["targetCharacter"]: row for row in rows if row["category"] == "character"
    }
    cache: dict[Path, float] = {}
    entries = []
    counts = {"generated": 0, "skipped": 0, "failed": 0}
    for index, teaching in enumerate(teaching_rows, start=1):
        status, entry = build_one(
            ffmpeg,
            ffprobe,
            teaching,
            character_by_key[teaching["targetCharacter"]],
            cache,
            args.force,
        )
        counts[status] += 1
        entries.append({"status": status, **entry})
        if index % 15 == 0 or index == len(teaching_rows):
            print(f"已处理 {index}/{len(teaching_rows)}")

    report = {
        "prerollMs": round(PREROLL_SECONDS * 1000),
        "targetPausesMs": [150, 200, 150],
        "targetLufs": -18,
        "truePeakDb": -1.5,
        "lra": 7,
        "counts": counts,
        "entries": entries,
    }
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"连续教学音频：生成 {counts['generated']}，"
        f"跳过 {counts['skipped']}，失败 {counts['failed']}。"
    )
    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
