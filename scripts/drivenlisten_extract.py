"""
提取 https://drivenlisten.com/city/# 上所有城市的 Drive 模式 YouTube 链接，输出 Excel（city, country, youtube_url）
依赖：Python 3.8+，playwright，pandas，openpyxl
说明：仅提取嵌入链接，不下载视频，以遵守平台政策
"""

import time
import re
import json
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional

import pandas as pd
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


TARGET_URL = "https://drivenlisten.com/city/#"
OUTPUT_JSON = r"d:\code\drivenbreathe\scripts\drivenlisten_drive_links.json"
OUTPUT_XLSX = r"d:\code\drivenbreathe\scripts\drivenlisten_drive_links.xlsx"

# 顶层常量与依赖
from html import unescape

CITY_LIST_CANDIDATE_SELECTORS = [
    "#cityList a.city_btn",
    "#cityList ul li a.city_btn",
]
DRIVE_MODE_CANDIDATE_TEXT = [
    "Drive", "DRIVE", "驾车", "开车", "Driving", "Car", "车辆", "城市驾车",
]

YOUTUBE_IFRAME_SELECTORS = [
    'iframe[src*="youtube.com/embed"]',
    'iframe[src*="youtube-nocookie.com/embed"]',
    'iframe[src*="youtu.be"]',
]

# 对单个页面的最大尝试次数/等待时间（秒）
WAIT_IFRAME_TIMEOUT_MS = 7000
CLICK_WAIT_SECONDS = 1.2
SCROLL_STEPS = 20
SCROLL_SLEEP = 0.3


@dataclass
class CityVideo:
    city: str
    country: str
    youtube_url: str


def parse_city_country(text: str) -> (str, str):
    """从诸如 'Paris, France' 文本中解析 city 和 country"""
    if not text:
        return "", ""
    parts = [p.strip() for p in text.split(",") if p.strip()]
    if len(parts) == 0:
        return text.strip(), ""
    if len(parts) == 1:
        return parts[0], ""
    # 默认第一个是城市，剩下的是国家（有些国家名里还包含逗号）
    city = parts[0]
    country = ", ".join(parts[1:])
    return city, country


def extract_youtube_id_from_url(url: str) -> Optional[str]:
    """从各种 YouTube 链接中提取视频 ID"""
    if not url:
        return None
    # embed/VIDEOID
    m = re.search(r"/embed/([a-zA-Z0-9_-]{6,})", url)
    if m:
        return m.group(1)
    # watch?v=VIDEOID
    m = re.search(r"[?&]v=([a-zA-Z0-9_-]{6,})", url)
    if m:
        return m.group(1)
    # youtu.be/VIDEOID
    m = re.search(r"youtu\.be/([a-zA-Z0-9_-]{6,})", url)
    if m:
        return m.group(1)
    return None


def standardize_youtube_url(url: str) -> str:
    """标准化为 https://www.youtube.com/watch?v=VIDEOID 格式"""
    vid = extract_youtube_id_from_url(url)
    if vid:
        return f"https://www.youtube.com/watch?v={vid}"
    return url


def parse_drive_video_ids_from_attr(attr_val: str) -> List[str]:
    """从 data-drive 的转义 HTML 中解析所有 data-videoid，返回标准 YouTube watch 链接列表"""
    if not attr_val:
        return []
    raw = unescape(attr_val)  # 解析 &lt; &gt; &quot; 等实体
    # 支持多个 <a ... data-videoid="..."> 片段
    ids = re.findall(r'data-videoid="([a-zA-Z0-9_-]{6,})"', raw)
    urls = [f"https://www.youtube.com/watch?v={vid}" for vid in ids]
    return urls

def collect_city_drive_entries(page) -> List[Dict]:
    """仅在 #cityList 内部收集每个城市的 city、country、data-drive 原始字符串"""
    items = page.evaluate("""
        () => {
          const list = [];
          const container = document.querySelector('#cityList');
          if (!container) return list;
          const nodes = container.querySelectorAll('a.city_btn');
          nodes.forEach(node => {
            const city = node.getAttribute('data-city') || '';
            const country = node.getAttribute('data-country') || '';
            const drive = node.getAttribute('data-drive') || '';
            list.push({ city, country, drive });
          });
          return list;
        }
    """)
    return items

def scroll_city_list(page):
    """在 #cityList 容器内滚动以加载更多（如需）"""
    container = page.locator("#cityList")
    if container.count() == 0:
        print("[WARN] 未找到 #cityList 容器，跳过容器滚动")
        return
    el = container.nth(0)
    for _ in range(SCROLL_STEPS):
        try:
            el.evaluate("e => e.scrollTop = e.scrollTop + e.clientHeight")
        except Exception:
            pass
        time.sleep(SCROLL_SLEEP)


def find_city_elements(page) -> List[Dict]:
    """尝试在 #cityList 容器中找到城市条目元素，返回包含 locator 和 text 的信息"""
    elements = []
    seen_texts = set()

    container = page.locator("#cityList")
    if container.count() == 0:
        print("[WARN] 页面不存在 #cityList 容器，返回空列表")
        return elements

    for sel in CITY_LIST_CANDIDATE_SELECTORS:
        loc = container.locator(sel)
        count = loc.count()
        if count == 0:
            continue
        for i in range(count):
            el = loc.nth(i)
            try:
                txt = el.inner_text().strip()
            except Exception:
                txt = ""
            if not txt:
                continue
            if len(txt) > 100 or len(txt) < 2:
                continue
            if txt in seen_texts:
                continue
            # 优先解析包含逗号形式的 "City, Country"
            if "," in txt or "·" in txt or " - " in txt:
                elements.append({"locator": el, "text": txt})
                seen_texts.add(txt)
            else:
                elements.append({"locator": el, "text": txt})
                seen_texts.add(txt)

    return elements


def try_select_drive_mode(page):
    """尝试点击 Drive 模式按钮或筛选项"""
    for label in DRIVE_MODE_CANDIDATE_TEXT:
        try:
            btn = page.get_by_text(label, exact=False)
            if btn and btn.count() > 0:
                btn.nth(0).click()
                time.sleep(0.6)
                return True
        except Exception:
            continue
    return False


def get_youtube_iframe_src(page) -> Optional[str]:
    """在当前页面查找 YouTube iframe 的 src"""
    for sel in YOUTUBE_IFRAME_SELECTORS:
        loc = page.locator(sel)
        if loc.count() > 0:
            try:
                src = loc.nth(0).get_attribute("src")
                if src:
                    return src
            except Exception:
                continue
    return None


def main():
    print("[INFO] 启动浏览器并打开页面:", TARGET_URL)
    results: List[CityVideo] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        page.goto(TARGET_URL, wait_until="networkidle")
        time.sleep(2.0)

        # 仅滚动 #cityList 容器以加载更多
        scroll_city_list(page)

        # 收集城市与 drive 属性
        city_entries = collect_city_drive_entries(page)
        print(f"[INFO] 发现城市条目: {len(city_entries)}")

        for idx, entry in enumerate(city_entries, 1):
            city = entry.get("city", "").strip()
            country = entry.get("country", "").strip()
            drive_attr = entry.get("drive", "")

            drive_urls = parse_drive_video_ids_from_attr(drive_attr)
            if not drive_urls:
                print(f"[WARN] [{idx}] {city} | {country} 未发现 drive 视频")
                continue

            for url in drive_urls:
                results.append(CityVideo(city=city, country=country, youtube_url=url))
                print(f"[OK] {city} | {country} -> {url}")

        browser.close()

    # 写 JSON 与 Excel
    data_dicts = [asdict(x) for x in results]
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data_dicts, f, ensure_ascii=False, indent=2)
    print("[INFO] 已写入 JSON:", OUTPUT_JSON)

    df = pd.DataFrame(data_dicts, columns=["city", "country", "youtube_url"])
    df.to_excel(OUTPUT_XLSX, index=False)
    print("[INFO] 已写入 Excel:", OUTPUT_XLSX)
    print(f"[SUMMARY] 共采集到 {len(results)} 条记录。")


if __name__ == "__main__":
    main()