# Readiness target year+session E2E driver (calendar v3).
# Boots nothing itself: expects the harness (:5010 real server, :5011 mock
# app-api) and vite (:5174 -> :5010) already running. All expectations are
# derived from the LIVE calendar API so the driver is date-robust.
import json
import re
import sys

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
EMAIL = "e2e-readiness@example.com"
PASSWORD = "correct-password"

passed = 0
failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"PASS  {name}")
    else:
        failed += 1
        print(f"FAIL  {name}  {detail}")


def login(page):
    page.goto(f"{BASE}/predictor")
    page.click("button:has-text('Sign in to predict')")
    modal = page.locator(".fixed.inset-0")  # the modal overlay, not the page behind it
    modal.locator("input[type=email]").wait_for(timeout=15000)
    modal.locator("input[type=email]").fill(EMAIL)
    modal.locator("input[type=password]").fill(PASSWORD)
    modal.locator("button[type=submit]").click()
    page.wait_for_selector("text=Grand Test", timeout=15000)


def calendar(page):
    return page.evaluate(
        "fetch('/api/predictor/readiness/calendar').then(r => r.json())"
    )


def pill_group(page, label):
    return page.locator(f"[aria-label='{label}'] button")


def selected_pill(group, nth=0):
    return group.nth(nth).get_attribute("aria-pressed")


def banner_text(page):
    el = page.locator("[data-anim='fade-up']").filter(has_text="Target")
    return el.first.inner_text() if el.count() else ""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        login(page)
        page.goto(f"{BASE}/readiness")
        page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
        cal = calendar(page)
        ini = cal["exams"]["INI_CET"]["targets"]
        neet = cal["exams"]["NEET_PG"]["targets"]
        ini_years = list(dict.fromkeys(t["targetYear"] for t in ini))

        # ---- menu shape -----------------------------------------------------
        check("INI menu has >=2 offered years", len(ini_years) >= 2, str(ini_years))
        for year in ini_years:
            sittings = [t for t in ini if t["targetYear"] == year]
            dates_ok = all(t["examDate"].startswith(str(year)) for t in sittings)
            check(f"INI {year}: every sitting's examDate is in {year}", dates_ok,
                  json.dumps([t["examDate"] for t in sittings]))
        # The earliest offered year always has at least one upcoming sitting
        # (passed sittings are pruned by the server before the menu is sent).
        sessions_of_first = [t for t in ini if t["targetYear"] == ini_years[0]]
        check("first offered INI year has >=1 upcoming sitting", len(sessions_of_first) >= 1)

        # ---- UI pills: INI year + session -----------------------------------
        page.locator("[aria-pressed]", has_text="INI-CET").first.click()  # ExamPicker card
        page.wait_for_timeout(400)
        years_ui = pill_group(page, "Target exam")
        check("year pills render the offered years",
              [y.strip() for y in years_ui.all_inner_texts()] == [f"INI-CET {y}" for y in ini_years],
              str(years_ui.all_inner_texts()))

        # Default selection = menu[0] (server default resolution).
        check("default year pill selected", selected_pill(years_ui) == "true")
        check("default = menu[0] year",
              years_ui.first.inner_text().strip() == f"INI-CET {ini[0]['targetYear']}")

        def pick_year(year):
            years_ui = pill_group(page, "Target exam")
            years_ui.filter(has_text=f"INI-CET {year}").click()
            page.wait_for_timeout(150)

        def pick_session(label):
            sessions = pill_group(page, "Target session")
            sessions.filter(has_text=label).click()
            page.wait_for_timeout(150)

        def read_banner():
            # The banner is the card carrying the calendar-clock icon.
            card = page.locator("div.rounded-2xl", has=page.locator("svg.lucide-calendar-clock")).first
            return card.inner_text()

        # Walk every offered (year, session): banner must show that sitting's
        # date + label; the session pills only render when the year has 2.
        for t in ini:
            pick_year(t["targetYear"])
            sessions_ui = pill_group(page, "Target session")
            sittings = [x for x in ini if x["targetYear"] == t["targetYear"]]
            if len(sittings) > 1:
                check(f"{t['targetYear']}: session pills render",
                      sessions_ui.count() == len(sittings),
                      f"{sessions_ui.count()} vs {len(sittings)}")
                labels = [x["targetLabel"] for x in sittings]
                check(f"{t['targetYear']}: session pill labels are May/November of that year",
                      [l.strip() for l in sessions_ui.all_inner_texts()] == labels,
                      str(sessions_ui.all_inner_texts()))
                pick_session(t["targetLabel"])
            else:
                check(f"{t['targetYear']}: single-sitting year hides session pills",
                      sessions_ui.count() == 0)
            # Wait for the banner to settle on this sitting (auto-retry), then read.
            page.locator("div.rounded-2xl", has=page.locator("svg.lucide-calendar-clock")).first \
                .filter(has_text=t["targetLabel"]).wait_for(timeout=5000)
            page.wait_for_timeout(100)
            banner = read_banner()
            check(f"{t['targetLabel']}: banner names the sitting", t["targetLabel"] in banner, banner[:160])
            check(f"{t['targetLabel']}: banner date is the sitting's examDate",
                  has_date(banner, t["examDate"]), banner[:160])
            check(f"{t['targetLabel']}: no other year's date leaks into the banner",
                  not any(has_date(banner, x["examDate"]) and x["examDate"] != t["examDate"] for x in ini),
                  banner[:160])
            check(f"{t['targetLabel']}: announced/expected badge matches",
                  ("announced" if t["status"] == "announced" else "expected date") in banner.lower(),
                  banner[:160])

        # The owner's exact complaint: selecting a LATER year must never show
        # this year's November date.
        later = [y for y in ini_years if y > ini_years[0]]
        if later:
            pick_year(later[0])
            banner = read_banner()
            this_year_dates = [t["examDate"] for t in ini if t["examDate"].startswith(str(ini_years[0]))]
            check(f"selecting {later[0]} never shows a {ini_years[0]} date",
                  not any(has_date(banner, d) for d in this_year_dates),
                  banner[:160])

        # ---- submit: corrects mode, November of a two-sitting year ----------
        two_sitting = next((y for y in ini_years if
                            len([t for t in ini if t["targetYear"] == y]) == 2), None)
        if two_sitting:
            pick_year(two_sitting)
            nov = next(t for t in ini if t["targetYear"] == two_sitting and t["targetSession"] == "NOVEMBER")
            may = next(t for t in ini if t["targetYear"] == two_sitting and t["targetSession"] == "MAY")
            pick_session(may["targetLabel"])
            page.fill("input[aria-label*='Grand Test 1']", "105")
            page.click("button:has-text('Check my readiness')")
            page.wait_for_selector("[data-testid='readiness-state']", timeout=20000)
            hero = page.locator("[data-testid='readiness-state']").inner_text()
            check("result hero names the May sitting", may["targetLabel"] in hero, hero[:200])
            check("result hero has no November label", nov["targetLabel"] not in hero, hero[:200])
            clock_card = page.locator("[data-anim='fade-up']").filter(has_text="The exam clock").first
            date_cell_text = clock_card.inner_text()
            check("exam clock shows the May date", has_date(date_cell_text, may["examDate"]), date_cell_text[:200])
            check("exam clock does NOT show the November date",
                  not has_date(date_cell_text, nov["examDate"]),
                  date_cell_text[:200])

            # Back to the form; switch to November; same GTs => different clock.
            page.click("button:has-text('Check another')")
            page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
            # restore persisted pick first (should be May after the check)
            check("form restored the last pick (May)",
                  pill_group(page, "Target session").filter(has_text=may["targetLabel"]).first.get_attribute("aria-pressed") == "true")
            pick_session(nov["targetLabel"])
            page.fill("input[aria-label*='Grand Test 1']", "105")
            page.click("button:has-text('Check my readiness')")
            page.wait_for_selector("[data-testid='readiness-state']", timeout=20000)
            hero2 = page.locator("[data-testid='readiness-state']").inner_text()
            check("switched sitting: hero names November", nov["targetLabel"] in hero2, hero2[:200])
            check("exam clock now shows the November date",
                  has_date(page.locator("[data-anim='fade-up']").filter(has_text="The exam clock").first.inner_text(),
                           nov["examDate"]))

        # ---- persistence across a hard reload --------------------------------
        if two_sitting:
            page.click("button:has-text('Check another')")
            page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
            pick_year(two_sitting)
            pick_session(f"November {two_sitting}")
            page.reload()
            page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
            check("reload restores the exam (INI-CET)",
                  pill_group(page, "Target exam").filter(has_text=f"INI-CET {two_sitting}").first.get_attribute("aria-pressed") == "true")
            check("reload restores the sitting (November)",
                  pill_group(page, "Target session").filter(has_text="November").first.get_attribute("aria-pressed") == "true")
            banner = read_banner()
            check("reload banner still shows the sitting's date",
                  any(has_date(banner, t["examDate"]) for t in ini
                      if t["targetYear"] == two_sitting and t["targetSession"] == "NOVEMBER"),
                  banner[:160])

        # ---- NEET PG: year pills only, no session pills, both modes ----------
        page.locator("[aria-pressed]", has_text="NEET PG").first.click()  # ExamPicker card button
        page.wait_for_timeout(300)
        check("NEET: no session pills", pill_group(page, "Target session").count() == 0)
        neet_years = list(dict.fromkeys(t["targetYear"] for t in neet))
        check("NEET year pills match menu",
              [y.strip() for y in pill_group(page, "Target exam").all_inner_texts()] == [f"NEET PG {y}" for y in neet_years],
              str(pill_group(page, "Target exam").all_inner_texts()))
        # score mode heading + submit
        page.click("[aria-label='Input mode'] button:has-text('GT score')")
        page.wait_for_timeout(150)
        check("score mode heading", page.locator("h3:has-text('Your Grand Test scores')").count() == 1)
        page.fill("input[aria-label*='total score']", "420")
        page.click("button:has-text('Check my readiness')")
        page.wait_for_selector("[data-testid='readiness-state']", timeout=20000)
        check("NEET score-mode result renders",
              page.locator("[data-testid='readiness-state']").count() == 1)
        check("NEET hero names the picked year",
              any(f"NEET PG {t['targetYear']}" in page.locator("[data-testid='readiness-state']").inner_text() for t in neet))

        # corrects mode heading (back to form, INI)
        page.click("button:has-text('Check another')")
        page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
        check("corrects mode heading", page.locator("h3:has-text('Your Grand Test corrects')").count() == 1)

        # ---- layout sanity: mobile viewport ----------------------------------
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE}/readiness")
        page.wait_for_selector("[aria-label='Target exam']", timeout=15000)
        overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1")
        check("mobile 390: no horizontal overflow", not overflow)
        page.screenshot(path="temp/readiness-e2e/mobile-form.png", full_page=True)
        browser.close()

    check("zero page errors", not errors, "; ".join(errors[:5]))
    print(f"\nE2E RESULT: {passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


def pretty(iso):
    y, m, d = iso.split("-")
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{int(d)} {months[int(m) - 1]} {y}"


def has_date(text, iso):
    """Locale-robust date presence: day, month abbrev, and year all appear."""
    y, m, d = iso.split("-")
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return all(part in text for part in (str(int(d)), months[int(m) - 1], y))


if __name__ == "__main__":
    main()
