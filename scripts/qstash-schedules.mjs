// Register the daily morning brief as a QStash schedule. QStash evaluates the
// cron in the owner's time zone (CRON_TZ), so 08:00 stays 08:00 across DST.
//
//   node --env-file=.env.local scripts/qstash-schedules.mjs brief    # create or update
//   node --env-file=.env.local scripts/qstash-schedules.mjs list
//   node --env-file=.env.local scripts/qstash-schedules.mjs remove
//
// Needs QSTASH_TOKEN and CLAUDIO_PUBLIC_URL (the production origin, e.g.
// https://claudio-agent.vercel.app). Optional: CLAUDIO_BRIEF_TIME (HH:MM,
// default 08:00) and CLAUDIO_TIME_ZONE (default Europe/Madrid).

import { Client } from "@upstash/qstash";

const SCHEDULE_ID = "claudio-morning-brief";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

const client = new Client({ token: required("QSTASH_TOKEN"), baseUrl: process.env.QSTASH_URL });
const command = process.argv[2] ?? "list";

if (command === "brief") {
  const base = required("CLAUDIO_PUBLIC_URL").replace(/\/+$/, "");
  const timeZone = process.env.CLAUDIO_TIME_ZONE?.trim() || "Europe/Madrid";
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(process.env.CLAUDIO_BRIEF_TIME?.trim() || "08:00");
  if (!match) {
    console.error("CLAUDIO_BRIEF_TIME must be HH:MM.");
    process.exit(1);
  }
  const cron = `CRON_TZ=${timeZone} ${Number(match[2])} ${Number(match[1])} * * *`;
  const { scheduleId } = await client.schedules.create({
    scheduleId: SCHEDULE_ID,
    destination: `${base}/eve/v1/qstash/morning-brief`,
    cron,
    body: "{}",
    headers: { "content-type": "application/json" },
    retries: 1,
  });
  console.log(`Scheduled ${scheduleId}: ${cron} -> ${base}/eve/v1/qstash/morning-brief`);
} else if (command === "list") {
  for (const s of await client.schedules.list()) {
    console.log(`${s.scheduleId}  ${s.cron}  ${s.destination}${s.isPaused ? "  (paused)" : ""}`);
  }
} else if (command === "remove") {
  await client.schedules.delete(SCHEDULE_ID);
  console.log(`Removed ${SCHEDULE_ID}.`);
} else {
  console.error(`Unknown command "${command}". Use brief, list or remove.`);
  process.exit(1);
}
