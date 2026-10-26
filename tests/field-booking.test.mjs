import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTime, rec1Time, todayInAthens, checkRequest, pickRate, totalCharges, findBookingOnDashboard, personalDetailsAsked } from "../scripts/field-booking/lib.mjs";

const MON_OCT_26_NOON_CT = new Date("2026-10-26T17:00:00Z");
const ok = { date: "2026-11-02", from: "4pm", to: "5pm", team: "Cottontown Girls 2014/2015" };

test("times parse and format the way Rec1's dropdowns show them", () => {
  assert.equal(parseTime("5pm"), 17 * 60);
  assert.equal(parseTime("5:00 PM"), 17 * 60);
  assert.equal(parseTime("17:00"), 17 * 60);
  assert.equal(parseTime("12am"), 0);
  assert.equal(parseTime("half past"), null);
  assert.equal(rec1Time(16 * 60), "04:00 PM");
  assert.equal(rec1Time(8 * 60), "08:00 AM");
  assert.equal(rec1Time(12 * 60), "12:00 PM");
});

test("today is Athens time, not UTC", () => {
  assert.equal(todayInAthens(new Date("2026-10-27T03:00:00Z")), "2026-10-26"); // 10pm Central
});

test("a normal request passes and comes out in Rec1's format", () => {
  const r = checkRequest(ok, MON_OCT_26_NOON_CT);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.booking, { date: "2026-11-02", field: "Soccer Field #1 (practice field)", from: "04:00 PM", to: "05:00 PM", team: "Cottontown Girls 2014/2015" });
});

test("the site's rules are enforced before opening a browser", () => {
  const problems = (over) => checkRequest({ ...ok, ...over }, MON_OCT_26_NOON_CT).problems.join(" | ");
  assert.match(problems({ to: "7pm" }), /over the 2-hour limit/);
  assert.match(problems({ from: "4:30pm" }), /on the hour/);
  assert.match(problems({ to: "3pm" }), /after start/);
  assert.match(problems({ date: "2026-11-03" }), /isn't open yet; the latest bookable date today is 2026-11-02/);
  assert.match(problems({ date: "2026-10-25" }), /in the past/);
  assert.match(problems({ team: " " }), /team name/);
  assert.match(problems({ field: "Field 9" }), /isn't one of/);
  assert.match(problems({ date: "Nov 3" }), /should look like/);
});

test("the rate is picked by season", () => {
  const options = ["Soccer Field 1 (Sept. 1 - Oct. 31) ($0/Hour)", "Soccer Field 1 (Nov. 1-Dec. 31) ($0/Hour)"];
  assert.equal(pickRate(options, "2026-10-31"), options[0]);
  assert.equal(pickRate(options, "2026-11-01"), options[1]);
  assert.equal(pickRate(options, "2027-01-05"), null);
});

test("Total Charges is read from the page text", () => {
  assert.equal(totalCharges("Item  $0.00\nTotal Charges\n$0.00\nPayment Summary: No Payment"), 0);
  assert.equal(totalCharges("Total Charges: $25.00"), 25);
  assert.equal(totalCharges("nothing here"), null);
});

test("the booking is found on the Account page, with its receipt number", () => {
  const page = "My Upcoming Events\nNov 1, 2026 2:00 PM-4:00 PM @ Soccer Field #1 (practice field) Rental #100000001\nNov 12, 2026 12:00 PM-1:00 PM @ Wavaho Field #100000002";
  const found = findBookingOnDashboard(page, { date: "2026-11-01", field: "Soccer Field #1 (practice field)", from: "02:00 PM" });
  assert.equal(found.found, true);
  assert.equal(found.receipt, "100000001");
  assert.equal(findBookingOnDashboard(page, { date: "2026-11-01", field: "Wavaho Field", from: "02:00 PM" }).found, false);
  assert.equal(findBookingOnDashboard(page, { date: "2026-11-12", field: "Wavaho Field", from: "02:00 PM" }).found, false); // 12:00 isn't 2:00
});

test("the team defaults to the approved name", () => {
  const { team, ...rest } = ok;
  assert.equal(checkRequest(rest, MON_OCT_26_NOON_CT).booking.team, "Cottontown Girls 2014/2015");
});

test("checkout stops if it asks for a card or personal details", () => {
  const paymentPage = "Rental of Soccer Field #1 $0.00 Pay Later Total Charges $0.00 Gift Card Code Amount Apply Review Transaction";
  assert.deepEqual(personalDetailsAsked(paymentPage, ["giftCardCode", "giftCardAmount"]), []);
  assert.deepEqual(personalDetailsAsked("Enter your Card Number and CVV"), ["card details"]);
  assert.deepEqual(personalDetailsAsked("Prompts", ["phone"]), ['a "phone" box']);
  assert.deepEqual(personalDetailsAsked("Emergency Contact name"), ["contact details"]);
});
