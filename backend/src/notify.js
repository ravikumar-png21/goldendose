// Telling caregivers about a missed dose, by the channels each one chose.
//
// IMPORTANT: for now, messages are SIMULATED. They're printed in the terminal and saved in
// the notifications table, but nothing reaches a real phone yet. Sending real SMS and
// WhatsApp messages needs an account with a messaging provider (it costs a little per message),
// and real app notifications need the phone app. Those come in Step 9. Only the deliver()
// function below will need to change.

import { clock } from "./clock.js";
import { friendlyTime } from "./time.js";

const CHANNELS = [
  { name: "sms", column: "notify_sms" },
  { name: "whatsapp", column: "notify_whatsapp" },
  { name: "app", column: "notify_app" },
];

function deliver(channel, caregiver, message) {
  if (process.env.QUIET !== "1") {
    console.log(`  [${channel.toUpperCase()} → ${caregiver.name}${caregiver.phone ? ` ${caregiver.phone}` : ""}] ${message}`);
  }
  return "simulated";
}

// Messages that aren't about one dose: an emergency, a medicine running low, a pattern worth knowing,
// or a helper's change waiting for approval.
// An emergency goes on EVERY channel to every caregiver, whatever they chose: it must not be missed.
// Other messages follow each caregiver's own choices.
// ownersOnly: only the main caregivers (for "a change is waiting for your OK").
export function messageCaregivers(db, { elder, kind, message, everyChannel = false, ownersOnly = false }) {
  const links = db
    .prepare(`SELECT c.id, c.name, c.phone, l.notify_sms, l.notify_whatsapp, l.notify_app
              FROM care_links l JOIN caregivers c ON c.id = l.caregiver_id
              WHERE l.elder_id = ? ${ownersOnly ? "AND l.role = 'owner'" : ""}`)
    .all(elder.id);
  const save = db.prepare(
    "INSERT INTO other_notifications (elder_id, caregiver_id, kind, channel, status, message, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  let sent = 0;
  for (const caregiver of links) {
    for (const channel of CHANNELS) {
      if (!everyChannel && caregiver[channel.column] !== 1) continue;
      const status = deliver(channel.name, caregiver, message);
      save.run(elder.id, caregiver.id, kind, channel.name, status, message, clock.now().toISOString());
      sent++;
    }
  }
  return sent;
}

// day: "" for today's dose, or " yesterday" / " on Mon 12 Oct" when the check found it on a later day.
export function alertCaregiversAboutMissedDose(db, { doseLogId, elder, medicineName, timeOfDay, day = "" }) {
  const links = db
    .prepare(`SELECT c.id, c.name, c.phone, l.notify_sms, l.notify_whatsapp, l.notify_app
              FROM care_links l JOIN caregivers c ON c.id = l.caregiver_id WHERE l.elder_id = ?`)
    .all(elder.id);

  const message = `${elder.name} hasn't taken ${medicineName} (due ${friendlyTime(timeOfDay)}${day}).`;
  const save = db.prepare(
    "INSERT INTO notifications (dose_log_id, caregiver_id, channel, status, message, sent_at) VALUES (?, ?, ?, ?, ?, ?)"
  );

  let sent = 0;
  for (const caregiver of links) {
    for (const channel of CHANNELS) {
      if (caregiver[channel.column] !== 1) continue;
      const status = deliver(channel.name, caregiver, message);
      save.run(doseLogId, caregiver.id, channel.name, status, message, clock.now().toISOString());
      sent++;
    }
  }
  return sent;
}
