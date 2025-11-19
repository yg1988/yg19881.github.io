# -*- coding: utf-8 -*-
"""
批量下载（youtube-dl / yt-dlp） + 批量上传（biliup）到 B 站
数据来源：d:\code\drivenbreathe\scripts\drivenlisten_drive_links.json
输出下载目录：d:\code\drivenbreathe\downloads
使用方法：
1) 先运行 biliup login 生成 cookies.json
2) 安装 ffmpeg，并确保在 PATH 中或设置 FFMPEG_PATH
3) 安装 yt-dlp（推荐）或 youtube_dl
4) 运行本脚本开始批量下载与上传

可选环境变量：
- DRY_RUN=1           仅打印计划，不实际下载/上传
- DOWNLOAD_ONLY=1     只下载，不上传
- UPLOAD_ONLY=1       只上传（要求下载文件已存在）
- BILIUP_PATH         biliup 可执行文件路径，默认使用 PATH 中的 biliup
- COOKIES_PATH        biliup cookies.json 路径，默认 d:\\code\\drivenbreathe\\scripts\\cookies.json
- FFMPEG_PATH         ffmpeg 可执行文件路径，默认取 PATH 中的 ffmpeg
- TID                 B站分区ID，默认 171（生活分区）
- TAGS                逗号分隔标签，默认 "旅行,街景,城市,驾车"
"""

import json
import os
import re
import sys
import subprocess
from pathlib import Path
from typing import List, Dict, Optional

# 路径配置
JSON_PATH = Path(r"d:\code\drivenbreathe\scripts\drivenlisten_drive_links.json")
DOWNLOAD_DIR = Path(r"d:\code\drivenbreathe\downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 环境变量与默认配置
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
DOWNLOAD_ONLY = os.environ.get("DOWNLOAD_ONLY", "0") == "1"
UPLOAD_ONLY = os.environ.get("UPLOAD_ONLY", "0") == "1"
BILIUP_PATH = os.environ.get("BILIUP_PATH", "biliup")
COOKIES_PATH = Path(os.environ.get("COOKIES_PATH", r"d:\code\drivenbreathe\scripts\cookies.json"))
FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "ffmpeg")
# 171 为生活分区（biliup 的 upload 参数默认值示例为 171）
TID = int(os.environ.get("TID", "171"))
DEFAULT_TAGS = os.environ.get("TAGS", "旅行,街景,城市,驾车")
COPYRIGHT = int(os.environ.get("COPYRIGHT", "2"))  # 1=原创, 2=转载（默认）

# 下载器：优先使用 yt-dlp；如果不可用则退回 youtube_dl
YTDLP_AVAILABLE = False
try:
    import yt_dlp as yt_dlp
    YTDLP_AVAILABLE = True
except Exception:
    yt_dlp = None

def load_items(json_path: Path) -> List[Dict]:
    if not json_path.exists():
        print(f"[ERROR] 未找到 JSON: {json_path}")
        return []
    with json_path.open("r", encoding="utf-8") as f:
        try:
            data = json.load(f)
            if not isinstance(data, list):
                print("[ERROR] JSON 内容不是列表")
                return []
            return data
        except Exception as e:
            print(f"[ERROR] 解析 JSON 失败: {e}")
            return []

def sanitize_filename(name: str) -> str:
    # 去除 Windows 不允许的字符
    name = re.sub(r'[<>:"/\\|?*]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def build_title(city: str, country: str) -> str:
    if city and country:
        return f"{city} · {country} · Drive & Breathe"
    elif city:
        return f"{city} · Drive & Breathe"
    return "Drive & Breathe 城市驾车"

def build_desc(city: str, country: str, youtube_url: str) -> str:
    base = "城市驾车街景，旅行呼吸节奏，非原创转载测试。"
    parts = []
    if city: parts.append(f"城市：{city}")
    if country: parts.append(f"国家/地区：{country}")
    parts.append(f"来源：YouTube {youtube_url}")
    parts.append("项目：DrivenBreathe（测试用）")
    return base + "\n" + "\n".join(parts)

def ensure_ffmpeg_in_config(ydl_opts: Dict):
    # 在 yt-dlp 中设置 ffmpeg 路径（如果需要）
    if FFMPEG_PATH and FFMPEG_PATH != "ffmpeg":
        ydl_opts.setdefault("ffmpeg_location", FFMPEG_PATH)

# 放在 ensure_ffmpeg_in_config、find_downloaded_file 之后，download_one 之前
def find_downloaded_file(base_name: str) -> Optional[Path]:
    """
    根据实际扩展名查找已下载文件，例如 base_name.mp4 / base_name.webm / base_name.mkv 等。
    """
    candidates = ["mp4", "webm", "mkv", "mov"]
    for ext in candidates:
        p = DOWNLOAD_DIR / f"{base_name}.{ext}"
        if p.exists():
            return p
    # 兜底：任意扩展名匹配
    matches = list(DOWNLOAD_DIR.glob(f"{base_name}.*"))
    return matches[0] if matches else None

def delete_file_safely(path: Path) -> bool:
    """
    上传成功后安全删除本地文件。返回 True 表示删除成功或文件不存在，False 表示删除失败。
    """
    try:
        if path and path.exists():
            path.unlink()
            print(f"[CLEAN] 已删除：{path}")
        return True
    except Exception as e:
        print(f"[WARN] 删除失败：{path}，原因：{e}")
        return False

def download_one(youtube_url: str, out_path: Path) -> bool:
    """
    下载一个视频到指定 out_path（含文件名，不带扩展名），输出为纯视频文件（可能是 mp4 或 webm），不包含音频。
    返回 True 表示成功，False 表示失败。
    """
    print(f"[DL] {youtube_url} -> {out_path}.[视频扩展名]")
    if DRY_RUN or UPLOAD_ONLY:
        return True

    if YTDLP_AVAILABLE:
        # 使用 yt-dlp（仅下载视频轨，无音频），限定到 1080p 且优先 60fps+
        ydl_opts = {
            "outtmpl": str(out_path) + ".%(ext)s",
            "format": "bestvideo[height<=1080][fps>=60][ext=mp4]/bestvideo[height<=1080][fps>=60]/bestvideo",
            "noplaylist": True,
            "quiet": False,
            "restrictfilenames": False,
        }
        ensure_ffmpeg_in_config(ydl_opts)
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([youtube_url])
            return True
        except Exception as e:
            print(f"[ERROR] yt-dlp 下载失败: {e}")
            return False
    else:
        # 退回到命令行 youtube-dl（仅视频轨，限定到 1080p 且优先 60fps+）
        cmd = [
            "youtube-dl",
            "-o", str(out_path) + ".%(ext)s",
            "-f", "bestvideo[height<=1080][fps>=60][ext=mp4]/bestvideo[height<=1080][fps>=60]/bestvideo",
        ]
        try:
            subprocess.check_call(cmd + [youtube_url], shell=False)
            return True
        except Exception as e:
            print(f"[ERROR] youtube-dl 下载失败: {e}")
            return False

def biliup_upload_one(video_file: Path, title: str, desc: str, tags_csv: str, tid: int, cookies_path: Path, copyright_type: int, source: str) -> bool:
    """
    使用 biliup 命令上传一个视频文件。
    """
    print(f"[UP] {video_file} -> title={title}")
    if DRY_RUN or DOWNLOAD_ONLY:
        return True

    # 转载时必须提供来源
    if copyright_type == 2 and (not source or not source.strip()):
        print("[ERROR] 转载来源不能为空（--source）。请提供来源 URL 或文字。")
        return False

    cmd = [
        BILIUP_PATH,
        "-u", str(cookies_path),
        "upload",
        str(video_file),
        "--copyright", str(copyright_type),
        "--source", source,
        "--tid", str(tid),
        "--title", title,
        "--desc", desc,
        "--tag", tags_csv,
    ]
    try:
        subprocess.check_call(cmd, shell=False)
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] biliup 上传失败，退出码 {e.returncode}")
        return False
    except Exception as e:
        print(f"[ERROR] biliup 上传异常: {e}")
        return False

def main():
    items = load_items(JSON_PATH)
    if not items:
        print("[ERROR] 无可处理数据。请先运行 drivenlisten_extract.py 生成 JSON。")
        sys.exit(1)

    ok_dl = 0
    ok_up = 0

    for i, item in enumerate(items, 1):
        city = (item.get("city") or "").strip()
        country = (item.get("country") or "").strip()
        youtube_url = (item.get("youtube_url") or "").strip()
        if not youtube_url:
            print(f"[SKIP] 第{i}条缺少 youtube_url：{item}")
            continue

        title = build_title(city, country)
        desc = build_desc(city, country, youtube_url)
        base_name = sanitize_filename(f"{city} {country} DriveBreathe")
        out_path = DOWNLOAD_DIR / base_name

        # 下载前先检查是否已有任意扩展名的成品（仅视频）
        existing_file = find_downloaded_file(base_name)
        if not UPLOAD_ONLY:
            if existing_file:
                print(f"[DL] 已存在，跳过下载：{existing_file}")
                dl_ok = True
            else:
                dl_ok = download_one(youtube_url, out_path)
                # 下载后再查找实际扩展名
                existing_file = find_downloaded_file(base_name)
            ok_dl += int(dl_ok)
            if not dl_ok or not existing_file:
                print(f"[WARN] 下载失败，跳过上传：{youtube_url}")
                continue

        # 上传（注意：仅视频轨无音频，上传到 B 站会是无声视频）
        if not DOWNLOAD_ONLY:
            # 转载来源：优先使用 youtube_url；若缺失则用城市+国家兜底
            source_str = youtube_url if youtube_url else (f"{city} {country}".strip() or "Drive & Breathe")

            # 正确传参，不要在括号里写“COPYRIGHT = ...”这样的赋值与注释
            up_ok = biliup_upload_one(existing_file, title, desc, DEFAULT_TAGS, TID, COOKIES_PATH, COPYRIGHT, source_str)
            ok_up += int(up_ok)

            if up_ok and not DRY_RUN:
                delete_file_safely(existing_file)

        # 下一条会重新进入到“下载 -> 上传 -> 删除”的流水线
    print(f"[SUMMARY] 下载成功 {ok_dl} 个，上传成功 {ok_up} 个。")

if __name__ == "__main__":
    main()