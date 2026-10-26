# Field booking (Athens Rec, Rec1)

Books a practice field at Athens Parks & Rec all the way through checkout, then checks the booking two ways: on the
Rec1 Account page and by the confirmation email. Recorded from a real booking on Oct 26, 2026.

- Script: `scripts/field-booking/book-field.mjs` (Playwright). Rules it checks first: `scripts/field-booking/lib.mjs`.
- Tests: `tests/field-booking.test.mjs`.

## Approved by the account holder (Oct 26, 2026)

- **Complete the checkout.** It's free, so the script clicks **Complete Transaction**. If checkout ever shows a charge or asks for card, contact or other personal details, it stops and asks.
- **Agree to the terms.** It checks both "I Agree" boxes on Prompts: the terms and conditions, and the Alabama Act 2018-496 coach-requirements statement.
- **Sign the waiver** (standing rule). The account holder has read the field-reservation waiver and agrees to it each week. The script types the approved name, checks "I agree on behalf of …" and confirms.
- **Team name:** Cottontown Girls 2014/2015, unless told otherwise.
- **Password:** never written or stored. The account holder signs in themselves (`--login`), and the script reuses that signed-in session.
- **Cancelling** is a phone call (see below). Permission to cancel one booking doesn't carry over to others.

## Run it

```sh
# Once, and again whenever the saved sign-in expires: a window opens and you sign in yourself.
node scripts/field-booking/book-field.mjs --login

# Book (team defaults to Cottontown Girls 2014/2015):
node scripts/field-booking/book-field.mjs --date 2026-11-03 --from 4pm --to 5pm \
  [--field "Wavaho Field"] [--wait 15] [--dry-run]
```

- The signed-in session is saved to `~/.field-booking/rec1-session.json`, outside the repo. The password isn't saved.
- `--wait 15` starts a few minutes before the date opens and keeps checking for 15 minutes, every 20 seconds. As soon as the date turns bookable, it books.

- `--dry-run` goes through Review & Confirm, then empties the cart without booking.
- Without it, it clicks **Complete Transaction**.
- It never books if the total isn't **$0.00** or the Payment Summary doesn't say **No Payment**.
- It never books a slot that's already on the Account page, so a retry can't double-book.
- Screenshots of every step go to `field-booking-runs/<time>/` (ignored by git). When a step fails, that page's HTML is saved too.
- The last line printed is a JSON result:
  - `booked`: booked, and the booking shows on the Account page with its receipt number
  - `booked-unverified`: the receipt page loaded, but the booking isn't on the Account page yet
  - `already-booked`: the slot was already booked, so nothing was done
  - `dry-run-ok`: the dry run reached Review & Confirm
  - `invalid-request`: the request breaks a booking rule
  - `signed-out`: there's no saved sign-in, or it has expired. Run `--login` again.
  - `needs-attention`: checkout asked for a card or personal details. Nothing was booked.
  - `not-configured`: the waiver signature isn't set
  - `failed`: a step failed; the result names the step

Set `FIELD_BOOKING_SIGNATURE` (or pass `--signature`) to the name typed on the waiver.

Wherever the script runs needs network access to `secure.rec1.com`. A Claude cloud environment blocks it unless the host is added under Allowed domains.

## The steps (what the script does)

1. **Sign in:** `https://secure.rec1.com/AL/athens-al/account/publicLogin`, with Email/Username and Password. It's done when **Log Out** shows. There's no CAPTCHA and no emailed or texted code. You do this yourself with `--login`; runs check for **Log Out** on `/dashboard`.
2. **Check existing bookings:** on `/dashboard`, "My Upcoming Events" lists each booking like `Nov 1, 2026 2:00 PM-4:00 PM @ Soccer Field #1 (practice field) … #100000001`.
3. **Catalog:** open `/catalog` and click the **Facility Rentals** tab. Then click **Soccer Field #1 (practice field)** or **Wavaho Field**, and the "Make a Reservation" form opens.
4. **1. Select Date:** a calendar (green = open, orange = partly booked, gray = not open yet or past). "AVAILABLE TIMES:" lists the open blocks.
5. **2. Select Rate:** only shown when a date has more than one rate. It's a custom dropdown: click it, then click the option. The script picks the rate whose season covers the date:
   - Soccer Field 1 (Sept. 1 - Oct. 31) ($0/Hour)
   - Soccer Field 1 (Nov. 1-Dec. 31) ($0/Hour)
6. **3. Select Time:** From and To, in 1-hour steps. Click the dropdown, type `04:00 PM`, then press Enter.
7. **Add To Cart** (the cart shows Total $0.00), then **Checkout**.
8. **Prompts** (`/checkout/prompts/…`):
   - Check "I Agree" on the terms.
   - Type the team in **Civic Organization / Group**.
   - Check "I Agree" on the Alabama Act 2018-496 coach-requirements statement.
   - Click **Submit Responses**.
9. **Waivers** (`/checkout/waivers/…`), the "Wavaho/5th Ave. Field Reservation" waiver:
   - Check "I agree on behalf of …".
   - Type the signature, then click **Add Signature** and **Save**.
   - Click **Confirm Waiver Agreement**.
10. **Payment** (`/checkout/payment/…`): Total Charges $0.00, and no card is asked for. Click **Review Transaction**.
11. **Review & Confirm** (`/checkout/confirm/…`): Total Charges $0.00, Payment Summary "No Payment". Click **Complete Transaction**.
12. **Receipt** (`/checkout/receipt/…`): "Transaction Receipt". The receipt itself loads in a viewer that doesn't come through as text, so the receipt number is read from the Account page.

## Confirmation email

- Goes to the Rec1 account's email: the work Outlook inbox, not Gmail.
- From: "Athens, AL" `noreply@civicplus.com`
- Subject: `Athens, AL Transaction Receipt MM/DD/YYYY`. The date is the day the booking was made, not the day of the reservation.
- Attachment: `Receipt-<receipt number>.pdf`. It should match the receipt number from the Account page.

## Rules from the city

- Open up to **7 days ahead** (rolling). On Mon Oct 26, the last bookable date was Mon Nov 2.
- **2 hours max** per reservation, and **2 reservations per person or group per week**. First come, first served.
- No standing or recurring reservations, so each week is booked separately.
- No charge, but the form must be completed.
- **No online cancelling or changes.** To cancel or change, call 256-233-8740 or email parksfrontdesk@athensal.us.

## Still to find out

- **What time of day the next date opens:** midnight is likely but not confirmed. To check, look at the date 7 days out just before midnight, then at 12:05 AM, 6 AM and 8 AM, and note when it turns from gray to green. Schedule the booking for just after that time.
- **Nov–Dec field hours:** the Nov 1 calendar listed blocks of 8:00 AM–2:00 PM and 4:00–5:00 PM, which suggests a 5 PM close. If so, the usual 5–7 PM weekday slot won't be bookable after Oct 31.
