// Books a field at Athens Rec on Rec1, all the way through Complete Transaction, then checks the Account page.
//
//   node scripts/field-booking/book-field.mjs --login          (once: opens a window, you sign in yourself)
//   node scripts/field-booking/book-field.mjs --date 2026-11-03 --from "4pm" --to "5pm" \
//     [--team "Cottontown Girls 2014/2015"] [--field "Wavaho Field"] [--wait 15] [--dry-run] [--out dir]
//   node scripts/field-booking/book-field.mjs --in-days 7 --from 5pm --to 7pm --wait 20   (for a schedule: a week out)
//   node scripts/field-booking/book-field.mjs --in-days 7 --check-only                     (is that date open yet?)
//
// The password is never stored: --login saves the signed-in session to --session (default ~/.field-booking/rec1-session.json),
// and later runs reuse it; when it has expired the run stops with "signed-out". FIELD_BOOKING_SIGNATURE (or --signature)
// is the waiver's typed signature. --wait N keeps checking for N minutes until the date opens, then books.
// --dry-run stops at Review & Confirm and empties the cart. It stops without booking if the total isn't $0.00 or
// checkout asks for a card or personal details.
// Saves a screenshot per step (plus the page HTML when a step fails) to --out, and prints one JSON result line last.
// The confirmation email (noreply@civicplus.com, "Athens, AL Transaction Receipt MM/DD/YYYY") is checked separately.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { addDays, todayInAthens, checkRequest, pickRate, totalCharges, findBookingOnDashboard, personalDetailsAsked } from "./lib.mjs";

const BASE = "https://secure.rec1.com/AL/athens-al";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
  else args[a.slice(2)] = next, i++;
}
const dryRun = !!args["dry-run"];
const checkOnly = !!args["check-only"];
const sessionFile = args.session || join(homedir(), ".field-booking", "rec1-session.json");
const waitMinutes = Math.max(0, +args.wait || 0);
const { chromium } = createRequire(import.meta.url)("playwright");

// --login: a visible window where you sign in yourself (copy the password from the LastPass app); the session is saved, never the password.
if (args.login) {
  const win = await chromium.launch({ headless: false });
  const ctx = await win.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/account/publicLogin`);
  console.log("Sign in in the browser window. This closes by itself once you're signed in (10 minutes max).");
  await p.getByText("Log Out", { exact: true }).first().waitFor({ timeout: 10 * 60000 });
  mkdirSync(dirname(sessionFile), { recursive: true });
  await ctx.storageState({ path: sessionFile });
  console.log(`Signed in. Session saved to ${sessionFile}`);
  await win.close();
  process.exit(0);
}
const out = args.out || `field-booking-runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(out, { recursive: true });

const result = { status: "failed", dryRun, checkOnly, booking: null, receipt: null, receiptUrl: null, step: null, problems: [], screenshots: out };
let browser;
const finish = async (status) => {
  result.status = status;
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await browser?.close().catch(() => {});
  process.exit(["booked", "already-booked", "dry-run-ok", "open", "not-open"].includes(status) ? 0 : 1);
};

// --in-days counts from the day the wait ends, so a job started at 11:55 PM Monday books the Tuesday a week out.
if (args["in-days"]) args.date = addDays(todayInAthens(new Date(Date.now() + waitMinutes * 60000)), +args["in-days"]);
if (checkOnly) { args.from ??= "8am"; args.to ??= "9am"; }
// With --wait, a date that opens during the wait (for example at midnight) counts as bookable.
const req = checkRequest({ date: args.date, from: args.from, to: args.to, field: args.field, team: args.team }, new Date(Date.now() + waitMinutes * 60000));
result.booking = req.booking;
if (!req.ok) { result.problems = req.problems; await finish("invalid-request"); }
const SIGNATURE = String(args.signature || process.env.FIELD_BOOKING_SIGNATURE || "").trim();
if (!SIGNATURE) { result.problems.push("set FIELD_BOOKING_SIGNATURE (or --signature) to the name typed on the waiver"); await finish("not-configured"); }
if (!existsSync(sessionFile)) { result.problems.push(`no saved sign-in at ${sessionFile}; run with --login first`); await finish("signed-out"); }
const b = req.booking;

browser = await chromium.launch();
const context = await browser.newContext({ storageState: sessionFile, viewport: { width: 1280, height: 1000 }, timezoneId: "America/Chicago" });
const page = await context.newPage();
page.setDefaultTimeout(20000);
let shot = 0;

async function step(name, fn) {
  result.step = name;
  try {
    const value = await fn();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: join(out, `${String(++shot).padStart(2, "0")}-${name}.png`), fullPage: true });
    return value;
  } catch (err) {
    result.problems.push(`${name}: ${err.message.split("\n")[0]}`);
    await page.screenshot({ path: join(out, `${String(++shot).padStart(2, "0")}-${name}-FAILED.png`), fullPage: true }).catch(() => {});
    writeFileSync(join(out, `${name}-FAILED.html`), await page.content().catch(() => ""));
    throw err;
  }
}
const bodyText = () => page.locator("body").innerText();
// Clicks the first visible match of any of the given locators.
async function clickFirst(...locators) {
  for (const l of locators) {
    const v = l.filter({ visible: true }).first();
    if (await v.count()) return v.click();
  }
  throw new Error("nothing to click");
}

// Stops the run if the page asks for a card or personal details that weren't approved.
async function noPersonalDetails() {
  const names = await page.locator("input:visible, select:visible, textarea:visible").evaluateAll((els) =>
    els.filter((e) => !["checkbox", "radio", "hidden", "submit", "button"].includes(e.type)).map((e) => e.autocomplete && e.autocomplete !== "off" ? e.autocomplete : e.name || e.id || e.placeholder || ""));
  const asked = personalDetailsAsked(await bodyText(), names.filter(Boolean));
  if (asked.length) { result.needsAttention = `checkout asked for ${asked.join(", ")}`; throw new Error(result.needsAttention); }
}

async function emptyCart() {
  await page.goto(`${BASE}/catalog`);
  for (let i = 0; i < 5; i++) {
    const cart = page.getByRole("link", { name: /cart/i }).or(page.getByRole("button", { name: /cart/i })).first();
    if (!(await cart.count())) return;
    await cart.click().catch(() => {});
    const remove = page.getByRole("button", { name: /remove|×/i }).or(page.locator("a, button").filter({ hasText: /^×$/ })).filter({ visible: true }).first();
    if (!(await remove.count())) return;
    await remove.click();
    await page.waitForLoadState("networkidle").catch(() => {});
  }
}

try {
  const signedIn = await step("signed-in", async () => {
    await page.goto(`${BASE}/dashboard`);
    return page.getByText("Log Out", { exact: true }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  });
  if (!signedIn) { result.problems.push("the saved sign-in has expired; run with --login and sign in again"); await finish("signed-out"); }
  await context.storageState({ path: sessionFile }); // keep the session fresh

  // Rec1 allows 2 bookings a week and no online cancelling, so never book the same slot twice (for example on a retry).
  const before = await step("check-existing", async () => {
    await page.goto(`${BASE}/dashboard`);
    return findBookingOnDashboard(await bodyText(), b);
  });
  if (before.found && !checkOnly) {
    result.receipt = before.receipt;
    result.problems.push(`already booked: ${before.line}`);
    await finish("already-booked");
  }

  // With --wait, keep reloading until the date turns bookable (other teams book the moment it opens).
  const deadline = Date.now() + waitMinutes * 60000;
  for (let attempt = 1; ; attempt++) {
    try {
      await pickFieldAndDate();
      result.problems = [];
      result.attempts = attempt;
      result.openedAt = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
      break;
    } catch (err) {
      if (Date.now() <= deadline) { await page.waitForTimeout(20000); continue; }
      if (checkOnly) await finish("not-open");
      throw err;
    }
  }
  if (checkOnly) {
    result.availableTimes = (await bodyText()).match(/AVAILABLE TIMES:?\s*([\s\S]{0,300})/i)?.[1].trim().split(/\n+/).slice(0, 8) ?? [];
    await finish("open");
  }
  async function pickFieldAndDate() {
  await step("pick-field", async () => {
    await page.goto(`${BASE}/catalog`);
    await clickFirst(page.getByRole("button", { name: "Facility Rentals" }), page.getByRole("link", { name: "Facility Rentals" }), page.getByText("Facility Rentals", { exact: true }));
    await page.getByText(b.field, { exact: true }).first().click();
    await page.getByText(/Make a Reservation/i).first().waitFor();
  });

  await step("pick-date", async () => {
    const [y, m, d] = b.date.split("-").map(Number);
    // Month/year dropdowns when they're plain selects (jQuery UI datepicker); otherwise step with the arrows.
    const monthSel = page.locator("select.ui-datepicker-month, select[class*=month i]").filter({ visible: true }).first();
    const yearSel = page.locator("select.ui-datepicker-year, select[class*=year i]").filter({ visible: true }).first();
    if (await yearSel.count()) await yearSel.selectOption(String(y));
    if (await monthSel.count()) await monthSel.selectOption(String(m - 1)).catch(() => monthSel.selectOption({ index: m - 1 }));
    else {
      const monthName = new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
      for (let i = 0; i < 3 && !(await page.getByText(new RegExp(`${monthName}\\s+${y}`)).filter({ visible: true }).count()); i++)
        await clickFirst(page.locator(".ui-datepicker-next, [title*=next i], [aria-label*=next i]"), page.getByText("▶"));
    }
    const day = page.locator(`td[data-month="${m - 1}"][data-year="${y}"] a, td[data-month="${m - 1}"][data-year="${y}"]`).filter({ hasText: new RegExp(`^${d}$`) });
    if (await day.count()) await day.first().click();
    else await page.locator("table td, table a").filter({ visible: true, hasText: new RegExp(`^${d}$`) }).first().click();
    await page.getByText(/AVAILABLE TIMES/i).first().waitFor();
  });
  }

  const rate = await step("pick-rate", async () => {
    const label = page.getByText(/Select Rate/i).filter({ visible: true });
    if (!(await label.count())) return null; // only shown on dates with more than one rate
    const box = label.first().locator("xpath=following::*[self::button or self::a or @role='combobox' or contains(@class,'select')][1]");
    await box.click();
    const options = await page.getByText(/\(\$[\d.]+\/Hour\)/).filter({ visible: true }).allInnerTexts();
    const pick = pickRate(options.map((s) => s.trim()), b.date);
    if (!pick) throw new Error(`no rate covers ${b.date}: ${options.join(" | ")}`);
    await page.getByText(pick, { exact: true }).filter({ visible: true }).last().click();
    return pick;
  });
  result.booking.rate = rate;

  await step("pick-time", async () => {
    for (const [label, value] of [["From", b.from], ["To", b.to]]) {
      const box = page.getByText(new RegExp(`^${label}:?$`)).filter({ visible: true }).first().locator("xpath=following::*[self::select or self::button or self::input or @role='combobox' or contains(@class,'select')][1]");
      if ((await box.evaluate((el) => el.tagName)) === "SELECT") await box.selectOption({ label: value });
      else { await box.click(); await page.keyboard.type(value); await page.keyboard.press("Enter"); }
    }
  });

  await step("add-to-cart", async () => {
    await page.getByRole("button", { name: /Add To Cart/i }).or(page.getByText("Add To Cart", { exact: true })).first().click();
    const t = await page.getByText(/Total/).filter({ visible: true }).first().locator("xpath=ancestor::*[contains(., '$')][1]").innerText();
    if (!/\$0\.00/.test(t)) throw new Error(`cart total isn't $0.00: ${t.replace(/\s+/g, " ").slice(0, 120)}`);
    await clickFirst(page.getByRole("button", { name: /^Checkout$/i }), page.getByRole("link", { name: /^Checkout$/i }));
    await page.waitForURL(/\/checkout\/prompts\//);
  });

  await step("prompts", async () => {
    await noPersonalDetails();
    const agrees = page.getByLabel(/I Agree/i).or(page.getByRole("checkbox", { name: /I Agree/i }));
    await agrees.first().waitFor();
    for (const box of await agrees.all()) await box.check();
    await page.getByText(/Civic Organization/i).first().locator("xpath=following::*[self::input[not(@type='checkbox')] or self::textarea][1]").fill(b.team);
    await page.getByRole("button", { name: /Submit Responses/i }).click();
    await page.waitForURL(/\/checkout\/waivers\//);
  });

  await step("waiver", async () => {
    await page.getByLabel(/I agree on behalf of/i).or(page.getByText(/I agree on behalf of/i)).first().click();
    const sig = page.getByPlaceholder(/Type your Signature/i).or(page.getByLabel(/Typed Signature/i)).first();
    await sig.fill(SIGNATURE);
    await page.getByRole("button", { name: /Add Signature/i }).click();
    await page.getByRole("button", { name: /^Save$/i }).click();
    await page.getByRole("button", { name: /Confirm Waiver Agreement/i }).click();
    await page.waitForURL(/\/checkout\/payment\//);
  });

  await step("payment", async () => {
    await noPersonalDetails();
    const total = totalCharges(await bodyText());
    if (total !== 0) throw new Error(`Total Charges is ${total == null ? "not shown" : "$" + total.toFixed(2)}, not $0.00`);
    await page.getByRole("button", { name: /Review Transaction/i }).or(page.getByRole("link", { name: /Review Transaction/i })).first().click();
    await page.waitForURL(/\/checkout\/confirm\//);
  });

  await step("review", async () => {
    await noPersonalDetails();
    const text = await bodyText();
    const total = totalCharges(text);
    if (total !== 0) throw new Error(`Total Charges is ${total == null ? "not shown" : "$" + total.toFixed(2)}, not $0.00`);
    if (!/No Payment/i.test(text)) throw new Error('Payment Summary doesn\'t say "No Payment"');
  });

  if (dryRun) {
    await step("empty-cart", emptyCart);
    await finish("dry-run-ok");
  }

  await step("complete", async () => {
    await page.getByRole("button", { name: /Complete Transaction/i }).or(page.getByRole("link", { name: /Complete Transaction/i })).first().click();
    await page.waitForURL(/\/checkout\/receipt\//, { timeout: 60000 });
    result.receiptUrl = page.url();
  });

  const after = await step("verify-dashboard", async () => {
    await page.goto(`${BASE}/dashboard`);
    return findBookingOnDashboard(await bodyText(), b);
  });
  result.receipt = after.receipt;
  if (!after.found) { result.problems.push("receipt page loaded, but the booking isn't on the Account page yet"); await finish("booked-unverified"); }
  await finish("booked");
} catch {
  await finish(result.needsAttention ? "needs-attention" : "failed");
}
