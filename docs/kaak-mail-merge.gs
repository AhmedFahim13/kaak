/**
 * Kaak mail merge: free, runs inside Google Sheets, sends from your own Gmail.
 *
 * Sheet layout (row 1 = headers, exactly these names):
 *   FirstName | Email | Sent
 * Leave FirstName blank to have it filled in automatically from the name on
 * their emails to you, or your contacts. If no name can be found, the row is
 * skipped and marked "NEEDS NAME" so nobody gets "Dear ,".
 * Any other column (e.g. Phone, Note) can be used in the email as {{ColumnName}}.
 *
 * Template: write the email in Gmail as a DRAFT. Put {{FirstName}} where the
 * name goes (subject and body). Its subject must match TEMPLATE_SUBJECT below.
 */

const TEMPLATE_SUBJECT = '{{FirstName}}, could you help test an app that cuts scrolling time?';
const PER_RUN_MAX = 30;      // stay well under Gmail's daily limit (~100/day on a free account)
const PAUSE_MS = 4000;       // a few seconds between emails looks human, not like spam

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kaak mail merge')
    .addItem('1. Send a test to myself', 'sendTest')
    .addItem('2. Send to everyone not yet sent', 'sendAll')
    .addToUi();
}

function sendTest() {
  const t = template_();
  const me = Session.getActiveUser().getEmail();
  const row = { FirstName: 'Test' };
  GmailApp.sendEmail(me, fill_(t.subject, row), fill_(t.text, row), { htmlBody: fill_(t.html, row) });
  SpreadsheetApp.getUi().alert('Test sent to ' + me + '. Check it looks right before sending to everyone.');
}

function sendAll() {
  const ui = SpreadsheetApp.getUi();
  const t = template_();
  const sheet = SpreadsheetApp.getActiveSheet();
  const values = sheet.getDataRange().getValues();
  const head = values.shift().map(String);
  const col = name => head.indexOf(name);
  if (col('Email') < 0 || col('FirstName') < 0 || col('Sent') < 0) {
    ui.alert('Row 1 needs the headers FirstName, Email and Sent.');
    return;
  }

  const quota = Math.min(PER_RUN_MAX, MailApp.getRemainingDailyQuota());
  let sent = 0;
  for (let i = 0; i < values.length && sent < quota; i++) {
    const r = values[i];
    const email = String(r[col('Email')]).trim();
    if (!email || r[col('Sent')]) continue;           // skip blanks and anyone already emailed
    const row = Object.fromEntries(head.map((h, j) => [h, r[j]]));
    let first = String(row.FirstName || '').trim();
    if (!first) {
      first = lookupFirstName_(email);
      if (!first) { sheet.getRange(i + 2, col('Sent') + 1).setValue('NEEDS NAME'); continue; }
      sheet.getRange(i + 2, col('FirstName') + 1).setValue(first);
    }
    row.FirstName = first;
    try {
      GmailApp.sendEmail(email, fill_(t.subject, row), fill_(t.text, row), { htmlBody: fill_(t.html, row) });
      sheet.getRange(i + 2, col('Sent') + 1).setValue(new Date());
      sent++;
      Utilities.sleep(PAUSE_MS);
    } catch (e) {
      sheet.getRange(i + 2, col('Sent') + 1).setValue('ERROR: ' + e.message);
    }
  }
  ui.alert('Sent ' + sent + ' email(s). Run it again tomorrow for the rest.');
}

/**
 * Finds a first name for an address: from the "From" name on emails they sent you,
 * otherwise from your Google contacts. Returns '' if neither knows them.
 * (Google doesn't let scripts look up a stranger's account name.)
 */
function lookupFirstName_(email) {
  try {
    const threads = GmailApp.search('from:' + email, 0, 5);
    for (const t of threads) {
      for (const m of t.getMessages()) {
        const from = m.getFrom(); // e.g. "Rumaisa Younus Wahi <wahirumaisa@gmail.com>"
        if (from.toLowerCase().indexOf(email.toLowerCase()) < 0) continue;
        const name = from.replace(/<.*>/, '').replace(/"/g, '').trim();
        if (name && name.indexOf('@') < 0) return name.split(/\s+/)[0];
      }
    }
  } catch (e) { /* no Gmail history */ }
  try {
    const contacts = ContactsApp.getContactsByEmailAddress(email);
    if (contacts.length && contacts[0].getGivenName()) return contacts[0].getGivenName();
  } catch (e) { /* contacts unavailable */ }
  return '';
}

/** Finds the Gmail draft used as the template. */
function template_() {
  const draft = GmailApp.getDrafts().find(d => d.getMessage().getSubject() === TEMPLATE_SUBJECT);
  if (!draft) throw new Error('No Gmail draft with the subject: ' + TEMPLATE_SUBJECT);
  const m = draft.getMessage();
  return { subject: m.getSubject(), text: m.getPlainBody(), html: m.getBody() };
}

/** Replaces {{ColumnName}} with that row's value. */
function fill_(s, row) {
  return s.replace(/{{\s*([\w ]+?)\s*}}/g, (_, k) => (row[k] !== undefined ? String(row[k]) : ''));
}
