// Turns an RSVPify event, handed over by Zapier, into a draft event file in
// src/events/. The draft has no page and stays out of the listings and the feed
// until someone opens it in the editor, fills in the rest, and turns the Draft
// switch off. Everything in the payload is treated as text: nothing here runs it.
import { existsSync, writeFileSync } from "node:fs";

const SERIES = ["Sangria y Salsa", "Country Nights", "Balls and galas", "Soirees and mixers", "Special events"];
const ZONE = "America/New_York";

const fail = (message) => {
  console.error("rsvpify-draft: " + message);
  process.exit(1);
};

let payload;
try {
  payload = JSON.parse(process.env.EVENT_PAYLOAD || "");
} catch {
  fail("EVENT_PAYLOAD is not JSON. Send a JSON object with at least title and date.");
}
if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("EVENT_PAYLOAD must be a JSON object.");

const text = (value) => (typeof value === "string" ? value : value == null ? "" : String(value)).trim();

const title = text(payload.title || payload.name || payload.event_name);
if (!title) fail("No title in the payload. Map RSVPify's event name to title.");

// RSVPify can send a plain date or a full timestamp. Keep the date, and use the
// clock time as the start time when the payload does not name one.
const rawDate = text(payload.date || payload.start_date || payload.starts_at || payload.start);
if (!rawDate) fail("No date in the payload. Map RSVPify's event date to date.");
let date = "";
let derivedTime = "";
if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
  date = rawDate;
} else {
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) fail(`Could not read "${rawDate}" as a date.`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
  date = parts.replaceAll("/", "-");
  if (/\d{2}:\d{2}/.test(rawDate)) {
    derivedTime = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", hour12: true })
      .format(parsed).replace(":00", "").toLowerCase();
  }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`Could not turn "${rawDate}" into a YYYY-MM-DD date.`);

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 50)
  .replace(/-+$/g, "");
if (!slug) fail(`The title "${title}" leaves nothing to name the file after.`);

const series = SERIES.includes(text(payload.series)) ? text(payload.series) : "Special events";
const q = (value) => JSON.stringify(text(value));

const file = `src/events/${date}-${slug}.md`;
if (existsSync(file)) {
  console.log(`rsvpify-draft: ${file} is already here, leaving it alone.`);
  process.exit(0);
}

const body = text(payload.description || payload.body) || "Write the description here, then turn off the Draft switch.";
const front = [
  "---",
  `title: ${q(title)}`,
  `date: ${date}`,
  `time: ${q(payload.time || derivedTime)}`,
  `end: ${q(payload.end || payload.end_time)}`,
  `venue: ${q(payload.venue || payload.location)}`,
  `address: ${q(payload.address)}`,
  `series: ${q(series)}`,
  'image: ""',
  `tickets: ${q(payload.tickets || payload.url || payload.event_url)}`,
  "draft: true",
  "tags: event",
  "---",
  ""
].join("\n");

writeFileSync(file, front + body + "\n", "utf8");
console.log(`rsvpify-draft: wrote ${file}`);
