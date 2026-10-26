// Rules for Athens Rec field bookings on Rec1 (secure.rec1.com/AL/athens-al). No browser here, so it can be tested.
// See docs/field-booking.md for the recorded steps these rules come from.

export const TZ = "America/Chicago"; // Athens, AL
export const BOOKING_DAYS_AHEAD = 7; // rolling window: today + 7
export const MAX_HOURS = 2;
export const FIELDS = ["Soccer Field #1 (practice field)", "Wavaho Field"];
export const DEFAULT_TEAM = "Cottontown Girls 2014/2015";

// "5pm", "5:00 PM", "17:00" -> minutes after midnight; null if not a time.
export function parseTime(s) {
  const m = String(s).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Minutes -> "05:00 PM", the form Rec1's From/To dropdowns accept when typed.
export function rec1Time(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Today's date in Athens as YYYY-MM-DD.
export function todayInAthens(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(ymd, n) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Rec1 lists a rate per season. Picks the option whose date range covers the booking date, by its month names.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function pickRate(options, ymd) {
  const month = +ymd.slice(5, 7), day = +ymd.slice(8, 10);
  const at = month * 100 + day;
  for (const opt of options) {
    const r = opt.toLowerCase().match(/\(([a-z]+)\.?\s*(\d{1,2})\s*-\s*([a-z]+)\.?\s*(\d{1,2})\)/);
    if (!r) continue;
    const from = (MONTHS.indexOf(r[1].slice(0, 3)) + 1) * 100 + +r[2];
    const to = (MONTHS.indexOf(r[3].slice(0, 3)) + 1) * 100 + +r[4];
    if (from < 100 || to < 100) continue;
    if (from <= to ? at >= from && at <= to : at >= from || at <= to) return opt;
  }
  return null;
}

// "Total Charges $0.00" anywhere in the text -> 0. Returns null when no total is shown.
export function totalCharges(text) {
  const m = String(text).match(/Total\s*Charges[^$]*\$\s*([\d,]+\.\d{2})/i);
  return m ? +m[1].replace(/,/g, "") : null;
}

// Anything on a checkout page that asks for a card or personal details. The account holder only approved a free
// checkout with the terms, team name and waiver signature, so any of these means stop and ask.
export function personalDetailsAsked(text, fieldNames = []) {
  const found = [];
  if (/card\s*number|credit\s*card|expiration|\bcvv\b|\bcvc\b|security code|billing address/i.test(text)) found.push("card details");
  if (/phone number|date of birth|emergency contact|street address|mailing address/i.test(text)) found.push("contact details");
  for (const n of fieldNames) {
    if (/gift/i.test(n)) continue; // the payment page always has an optional gift card box
    if (/^cc-|card|cvv|cvc|phone|tel|address|birth|zip|postal/i.test(n)) found.push(`a "${n}" box`);
  }
  return [...new Set(found)];
}

// Checks a booking request against the site's rules. Returns { ok, problems, booking }.
export function checkRequest(req, now = new Date()) {
  const problems = [];
  const date = String(req.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + "T12:00:00Z"))) problems.push(`date "${date}" should look like 2026-11-03`);
  const from = parseTime(req.from), to = parseTime(req.to);
  if (from == null) problems.push(`start time "${req.from}" isn't a time`);
  if (to == null) problems.push(`end time "${req.to}" isn't a time`);
  if (from != null && to != null) {
    if (from % 60 || to % 60) problems.push("times must be on the hour (Rec1 only offers 1-hour steps)");
    if (to <= from) problems.push("end time must be after start time");
    else if (to - from > MAX_HOURS * 60) problems.push(`${(to - from) / 60} hours is over the ${MAX_HOURS}-hour limit`);
  }
  const field = req.field || FIELDS[0];
  if (!FIELDS.includes(field)) problems.push(`field "${field}" isn't one of: ${FIELDS.join(", ")}`);
  const team = String(req.team ?? DEFAULT_TEAM).trim();
  if (!team) problems.push("team name is required (Civic Organization / Group)");
  if (!problems.length) {
    const today = todayInAthens(now), last = addDays(today, BOOKING_DAYS_AHEAD);
    if (date < today) problems.push(`${date} is in the past`);
    else if (date > last) problems.push(`${date} isn't open yet; the latest bookable date today is ${last}`);
  }
  return {
    ok: !problems.length,
    problems,
    booking: { date, field, from: from != null ? rec1Time(from) : null, to: to != null ? rec1Time(to) : null, team },
  };
}

// "Nov 1, 2026 2:00 PM-4:00 PM @ Soccer Field #1 (practice field) ... #100000001" lines from the Account page.
export function findBookingOnDashboard(text, { date, field, from }) {
  const d = new Date(date + "T12:00:00Z");
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const start = new RegExp(`(^|[^\\d])${from.replace(/^0/, "")}`); // "2:00 PM" but not "12:00 PM"
  // One entry per booking: each starts at a "Nov 1, 2026" date, so details never run into the next booking.
  const entries = String(text).replace(/\s+/g, " ").split(/(?=\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b)/);
  for (const chunk of entries) {
    if (chunk.startsWith(label) && start.test(chunk) && chunk.includes(field)) {
      const n = chunk.match(/#(\d{6,})/);
      return { found: true, receipt: n ? n[1] : null, line: chunk.trim() };
    }
  }
  return { found: false, receipt: null, line: null };
}
