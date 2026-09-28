from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    context = b.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.goto("http://localhost:5174/predictor")
    page.click("button:has-text('Sign in to predict')")
    modal = page.locator(".fixed.inset-0")
    modal.locator("input[type=email]").wait_for(timeout=15000)
    modal.locator("input[type=email]").fill("e2e-readiness@example.com")
    modal.locator("input[type=password]").fill("correct-password")
    modal.locator("button[type=submit]").click()
    page.wait_for_selector("text=Grand Test", timeout=15000)

    # Form: INI 2027 with session pills (desktop)
    page.goto("http://localhost:5174/readiness")
    page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
    page.evaluate("localStorage.setItem('eyeconic:readiness-target', JSON.stringify({exam:'INI_CET',targetYear:2027,targetSession:'NOVEMBER'}))")
    page.reload()
    page.wait_for_selector("[aria-label='Target session']", timeout=15000)
    page.wait_for_timeout(600)
    page.screenshot(path="temp/readiness-e2e/form-ini-2027-desktop.png", full_page=True)

    # Result for November 2027
    page.fill("input[aria-label*='Grand Test 1']", "105")
    page.click("button:has-text('Check my readiness')")
    page.wait_for_selector("[data-testid='readiness-state']", timeout=20000)
    page.wait_for_timeout(400)
    page.screenshot(path="temp/readiness-e2e/result-nov2027-desktop.png", full_page=True)

    # Tablet + mobile form
    for w, h, name in [(768, 1024, "tablet"), (390, 844, "mobile")]:
        page.set_viewport_size({"width": w, "height": h})
        page.goto("http://localhost:5174/readiness")
        page.wait_for_selector("[aria-label='Target session']", timeout=15000)
        page.wait_for_timeout(600)
        page.screenshot(path=f"temp/readiness-e2e/form-ini-2027-{name}.png", full_page=True)

    b.close()
    print("shots done")
