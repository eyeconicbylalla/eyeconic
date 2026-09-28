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
    page.goto("http://localhost:5174/readiness")
    page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
    page.evaluate("localStorage.setItem('eyeconic:readiness-target', JSON.stringify({exam:'INI_CET',targetYear:2026,targetSession:'NOVEMBER'}))")
    page.reload()
    page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
    page.wait_for_timeout(1500)
    # find all divs with the calendar-clock icon
    n = page.locator("div.rounded-2xl", has=page.locator("svg.lucide-calendar-clock"))
    print("matches:", n.count())
    for i in range(n.count()):
        print(f"--- card {i} ---")
        print(repr(n.nth(i).inner_text()[:300]))
    card = page.locator("[data-anim='fade-up']").filter(has_text="Target INI-CET")
    print("target card count:", card.count())
    for i in range(card.count()):
        print(f"--- tcard {i} ---", repr(card.nth(i).inner_text()[:300]))
    b.close()
