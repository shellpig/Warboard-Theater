# 臨時驗證:右上模擬時刻面板(時辰 + HH:MM)
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://localhost:8124"
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/theater.html?battle=chibi&lang=zh-TW")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    page.click("#title-screen .start-btn")
    page.wait_for_timeout(300)

    box = page.locator("#tl-track").bounding_box()

    def seek(f):
        page.mouse.click(box["x"] + box["width"] * f, box["y"] + box["height"] / 2)
        page.wait_for_timeout(400)
        return page.locator("#time-panel").inner_text().replace("\n", " | ")

    # 全軸 300s:ch1 = 0–90(無 clock_start)、ch2 = 90–240(20:00 起)、ch3 = 240–300(05:00 起)
    print("ch1 10%:", seek(0.10))   # 預期 time_display 粗刻度(數日後 等)
    r = seek(0.31)
    print("ch2  3%:", r)            # 預期 約 20:18 戌時
    assert "戌時 20:" in r, r
    r = seek(0.55)
    print("ch2 50%:", r)            # 約 165s → 午夜前後(子/丑時)
    assert ("子時 0" in r or "丑時 0" in r), r
    r = seek(0.78)
    print("ch2 96%:", r)            # 約 234s → 拂曉(寅/卯時 04~05 點)
    assert ("寅時 0" in r or "卯時 0" in r), r
    r = seek(0.90)
    print("ch3 50%:", r)            # 約 270s → 翌日上午(巳/午時)
    assert ("巳時 0" in r or "巳時 1" in r or "午時 1" in r) and "翌日" in r, r
    seek(0.55)
    page.screenshot(path=".verify_shots/clock_ch2.png")
    r = seek(0.02)
    print("rewind :", r)            # 倒帶回 ch1 → 退回粗刻度,無殘留時鐘
    assert ":" not in r.split("|")[-1] or "時" not in r, r
    browser.close()

assert not errors, errors
print("CLOCK VERIFY OK")
