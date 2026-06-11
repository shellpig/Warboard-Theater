# Phase 5 驗收:節目單卡片、片頭/結算、war-meter、電影感 overlay、四語、錄影模式
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8146"
errors = []


def cls(page, sel):
    return page.locator(sel).get_attribute("class") or ""


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.on(
        "console",
        lambda m: errors.append(f"{m.text} [{m.location.get('url', '')}]") if m.type == "error" else None,
    )
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- 節目單 ---
    page.goto(f"{BASE}/index.html")
    page.wait_for_load_state("networkidle")
    assert page.locator(".card").count() == 2
    summary = page.locator(".card.ready .summary").inner_text()
    assert "孫劉聯軍勝利" in summary, summary
    page.screenshot(path=".verify_shots/p5_index.png")
    print("index OK:", summary)

    # --- 推演頁 zh-TW ---
    page.goto(f"{BASE}/theater.html?battle=chibi&lang=zh-TW")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)

    assert page.locator("#title-screen h1").inner_text() == "赤壁之戰"
    assert "hidden" not in cls(page, "#title-screen")
    nums = page.locator("#war-meter .wm-num").all_inner_texts()
    assert nums == ["200,000", "50,000"], nums
    assert page.eval_on_selector("#grain", "el => el.style.backgroundImage.startsWith('url')")
    page.screenshot(path=".verify_shots/p5_title.png")
    print("title screen + war-meter OK:", nums)

    page.click("#title-screen .start-btn")
    page.wait_for_timeout(1200)
    assert "hidden" in cls(page, "#title-screen")

    # 電影模式 letterbox
    page.click("#extra-group .x-btn >> nth=1")
    assert page.eval_on_selector("body", "b => b.classList.contains('cinema')")
    print("cinema mode OK")

    # seek 至第二章火攻段
    box = page.locator("#tl-track").bounding_box()
    page.mouse.click(box["x"] + box["width"] * 0.56, box["y"] + box["height"] / 2)
    page.wait_for_timeout(1800)
    page.screenshot(path=".verify_shots/p5_fire.png")

    # 結算:seek 到接近終點再 ArrowRight 夾至 total
    page.mouse.click(box["x"] + box["width"] - 2, box["y"] + box["height"] / 2)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(1200)
    assert "show" in cls(page, "#end-screen")
    end_text = page.locator("#end-screen").inner_text()
    for s in ["孫劉聯軍勝利", "交戰時間", "雙方損失", "重新觀看", "−132,473"]:
        assert s in end_text, end_text
    page.screenshot(path=".verify_shots/p5_end.png")
    print("end card OK")

    # 重新觀看
    page.click("#end-screen .replay-btn")
    page.wait_for_timeout(600)
    assert "show" not in cls(page, "#end-screen")

    # 錄影模式:H 鍵切換、隱藏 HUD、鎖 16:9
    page.keyboard.press("h")
    page.wait_for_timeout(500)
    assert page.eval_on_selector("body", "b => b.classList.contains('record')")
    assert not page.locator("#hud").is_visible()
    w = page.eval_on_selector("#stage", "el => el.clientWidth")
    h = page.eval_on_selector("#stage", "el => el.clientHeight")
    assert abs(w / h - 16 / 9) < 0.02, (w, h)
    page.screenshot(path=".verify_shots/p5_record.png")
    page.keyboard.press("h")
    assert not page.eval_on_selector("body", "b => b.classList.contains('record')")
    print("record mode OK:", w, "x", h)

    # --- 推演頁 ja(四語抽查)---
    page.goto(f"{BASE}/theater.html?battle=chibi&lang=ja")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)
    assert page.locator("#title-screen h1").inner_text() == "赤壁の戦い"
    btns = page.locator(".chapter-btn").all_inner_texts()
    assert btns[1] == "第二章 赤壁炎上", btns
    print("ja OK:", btns)

    browser.close()

# 預期缺圖:assets 海報 / 主帥肖像由使用者後續提供,引擎已有缺圖退化
bad = [e for e in errors if "favicon" not in e and "/assets/" not in e]
expected_404 = [e for e in errors if "/assets/" in e]
print(f"expected asset 404s: {len(expected_404)}")
for e in expected_404:
    print(" -", e)
assert not bad, bad
print("PHASE5 VERIFY OK")

