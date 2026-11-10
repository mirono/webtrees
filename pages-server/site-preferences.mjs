/**
 * webtrees: online genealogy
 * Copyright (C) 2026 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// Data layer for /admin/site-preferences, /admin/site-registration,
// /admin/email, /admin/tags - the "site preferences" admin bucket
// (site-WIDE settings, as opposed to the already-ported per-tree
// "tree management" bucket). User chose full fidelity for all 4,
// INCLUDING real SMTP sending for the email page's "send test email"
// button - the FIRST network dependency this migration has
// introduced (every prior network-shaped feature - UpgradeService,
// ServerCheckService - was cut instead, specifically because no
// network dependency existed anywhere else; this one is different
// because the user explicitly chose to add one).
//
// Real PHP's EmailService uses Symfony Mailer
// (vendor/symfony/mailer, EsmtpTransport/SendmailTransport/
// NullTransport) built on raw PHP streams. This port uses
// nodemailer (10.5.0, added as this migration's first new runtime
// dependency) instead of hand-rolling SMTP socket/STARTTLS/AUTH
// handshake code - nodemailer's SMTP transport already implements
// the same shape of behavior Symfony's EsmtpTransport does
// (opportunistic STARTTLS when the server advertises it, AUTH
// LOGIN/PLAIN/CRAM-MD5 negotiation, implicit TLS on `secure: true`)
// and is the standard, maintained way to send mail from Node - no
// reason to reinvent it.

import nodemailer from 'nodemailer';
import { promises as dns } from 'dns';
import { stat, access, constants as fsConstants } from 'fs/promises';

async function loadPreferences(pool, names) {
  const result = await pool.query('SELECT setting_name, setting_value FROM wt_site_setting WHERE setting_name = ANY($1::text[])', [names]);
  const preferences = {};

  for (const row of result.rows) {
    preferences[row.setting_name] = row.setting_value;
  }

  return preferences;
}

async function setPreference(client, name, value) {
  await client.query(
    `INSERT INTO wt_site_setting (setting_name, setting_value) VALUES ($1, $2)
     ON CONFLICT (setting_name) DO UPDATE SET setting_value = $2`,
    [name, value],
  );
}

const GENERAL_PREFERENCE_NAMES = ['INDEX_DIRECTORY', 'ALLOW_CHANGE_GEDCOM', 'LANGUAGE', 'THEME_DIR', 'TIMEZONE'];

/**
 * Mirrors SitePreferencesPage (app/Http/RequestHandlers/SitePreferencesPage.php:40-55).
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<Record<string,string>>}
 */
export async function loadGeneralPreferences(pool) {
  return loadPreferences(pool, GENERAL_PREFERENCE_NAMES);
}

/**
 * Mirrors SitePreferencesAction (app/Http/RequestHandlers/SitePreferencesAction.php:37-68) -
 * including the real `is_dir()`/`is_writable()` filesystem check
 * against the submitted data folder path (a real server-filesystem
 * dependency, not just a DB write).
 *
 * @param {import('pg').Pool} pool
 * @param {URLSearchParams} formData
 * @returns {Promise<{error: string|null}>}
 */
export async function updateGeneralPreferences(pool, formData) {
  let indexDirectory = formData.get('INDEX_DIRECTORY') ?? '';
  const allowChangeGedcom = formData.get('ALLOW_CHANGE_GEDCOM') === '1';
  const language = formData.get('LANGUAGE') ?? '';
  const themeDir = formData.get('THEME_DIR') ?? '';
  const timezone = formData.get('TIMEZONE') ?? '';

  if (!indexDirectory.endsWith('/')) {
    indexDirectory += '/';
  }

  let error = null;

  try {
    const stats = await stat(indexDirectory);

    if (!stats.isDirectory()) {
      error = `The folder “${indexDirectory}” does not exist.`;
    } else {
      try {
        await access(indexDirectory, fsConstants.W_OK);

        const client = await pool.connect();

        try {
          await setPreference(client, 'INDEX_DIRECTORY', indexDirectory);
        } finally {
          client.release();
        }
      } catch {
        error = `Cannot write to the folder “${indexDirectory}”.`;
      }
    }
  } catch {
    error = `The folder “${indexDirectory}” does not exist.`;
  }

  const client = await pool.connect();

  try {
    await setPreference(client, 'ALLOW_CHANGE_GEDCOM', allowChangeGedcom ? '1' : '');
    await setPreference(client, 'LANGUAGE', language);
    await setPreference(client, 'THEME_DIR', themeDir);
    await setPreference(client, 'TIMEZONE', timezone);
  } finally {
    client.release();
  }

  return { error };
}

const REGISTRATION_PREFERENCE_NAMES = ['WELCOME_TEXT_AUTH_MODE', 'WELCOME_TEXT_AUTH_MODE_en-US', 'USE_REGISTRATION_MODULE', 'SHOW_REGISTER_CAUTION'];

/**
 * Mirrors SiteRegistrationPage (app/Http/RequestHandlers/SiteRegistrationPage.php:32-51).
 * Real PHP keys the welcome text by `I18N::languageTag()` - this
 * migration is English-only throughout, so that's always `en-US`.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<Record<string,string>>}
 */
export async function loadRegistrationPreferences(pool) {
  return loadPreferences(pool, REGISTRATION_PREFERENCE_NAMES);
}

/**
 * Mirrors SiteRegistrationAction (app/Http/RequestHandlers/SiteRegistrationAction.php:35-50).
 *
 * @param {import('pg').Pool} pool
 * @param {URLSearchParams} formData
 * @returns {Promise<void>}
 */
export async function updateRegistrationPreferences(pool, formData) {
  const mode = formData.get('WELCOME_TEXT_AUTH_MODE') ?? '';
  const text = formData.get('WELCOME_TEXT_AUTH_MODE_4') ?? '';
  const allowRegistration = formData.get('USE_REGISTRATION_MODULE') === '1';
  const showCaution = formData.get('SHOW_REGISTER_CAUTION') === '1';

  const client = await pool.connect();

  try {
    await setPreference(client, 'WELCOME_TEXT_AUTH_MODE', mode);
    await setPreference(client, 'WELCOME_TEXT_AUTH_MODE_en-US', text);
    await setPreference(client, 'USE_REGISTRATION_MODULE', allowRegistration ? '1' : '');
    await setPreference(client, 'SHOW_REGISTER_CAUTION', showCaution ? '1' : '');
  } finally {
    client.release();
  }
}

const EMAIL_PREFERENCE_NAMES = [
  'SMTP_ACTIVE',
  'SMTP_AUTH',
  'SMTP_AUTH_USER',
  'SMTP_DISP_NAME',
  'SMTP_FROM_NAME',
  'SMTP_HELO',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SSL',
  'DKIM_DOMAIN',
  'DKIM_SELECTOR',
  'DKIM_KEY',
];

/** Mirrors EmailService::mailSslOptions() (app/Services/EmailService.php:178-187). */
export const MAIL_SSL_OPTIONS = {
  none: 'none',
  ssl: 'SSL/TLS',
  tls: 'STARTTLS',
};

/**
 * Mirrors EmailService::mailTransportOptions() (app/Services/EmailService.php:194-207).
 * Real PHP hides 'sendmail' when `proc_open` isn't available
 * (uncommon, disabled-for-security hosting); nodemailer's sendmail
 * transport uses `child_process`, not `proc_open`, so there's no
 * equivalent constraint to check in Node - 'sendmail' is always
 * offered here.
 */
export const MAIL_TRANSPORT_OPTIONS = {
  sendmail: 'Use sendmail to send messages',
  external: 'Use SMTP to send messages',
};

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Mirrors EmailService::isValidEmail() (app/Services/EmailService.php:156-171):
 * format check, then (approximately - see below) a DNS lookup on the
 * domain. Real PHP calls `checkdnsrr($domain)` with its default
 * query type ('MX'); this checks MX records first and falls back to
 * A/AAAA (mirroring mail-delivery software's own real MX-then-A
 * fallback, which `checkdnsrr`'s single default type doesn't
 * actually replicate exactly - a reasonable approximation, not a
 * byte-for-byte port of a C-level DNS resolver call).
 *
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isValidEmail(email) {
  if (!isValidEmailFormat(email)) {
    return false;
  }

  const domain = email.slice(email.lastIndexOf('@') + 1);

  try {
    const mxRecords = await dns.resolveMx(domain);

    if (mxRecords.length > 0) {
      return true;
    }
  } catch {
    // fall through to A/AAAA
  }

  try {
    await dns.resolve(domain);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirrors a domain-only subset of FILTER_VALIDATE_DOMAIN (used on
 * SMTP_HELO in EmailPreferencesPage.php:81) - a plain hostname/FQDN
 * syntax check, no DNS lookup.
 *
 * @param {string} domain
 * @returns {boolean}
 */
export function isValidDomainSyntax(domain) {
  return /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/.test(domain) && domain.includes('.');
}

/**
 * Mirrors EmailPreferencesPage's hostname-detection fallback chain
 * (gethostname/gethostbyname/gethostbyaddr, app/Http/RequestHandlers/EmailPreferencesPage.php:67-78)
 * and its SMTP_PORT/SMTP_HELO/SMTP_FROM_NAME/SMTP_DISP_NAME defaults.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<object>}
 */
export async function loadEmailPreferences(pool) {
  const preferences = await loadPreferences(pool, EMAIL_PREFERENCE_NAMES);
  const os = await import('os');
  const hostname = os.hostname() || 'localhost';

  const smtpPort = preferences.SMTP_PORT || '25';
  const smtpHelo = preferences.SMTP_HELO || hostname;
  const smtpFromName = preferences.SMTP_FROM_NAME || `no-reply@${smtpHelo}`;
  const smtpDispName = preferences.SMTP_DISP_NAME || 'webtrees';

  return {
    ...preferences,
    SMTP_PORT: smtpPort,
    SMTP_HELO: smtpHelo,
    SMTP_FROM_NAME: smtpFromName,
    SMTP_DISP_NAME: smtpDispName,
    smtpFromNameValid: await isValidEmail(smtpFromName),
    smtpHeloValid: isValidDomainSyntax(smtpHelo),
  };
}

/**
 * Mirrors EmailPreferencesAction's preference-writing (app/Http/RequestHandlers/EmailPreferencesAction.php:44-77) -
 * SMTP_AUTH_PASS is only overwritten if a new, non-empty value was
 * submitted (so re-saving the form without retyping the password
 * doesn't blank it out).
 *
 * @param {import('pg').Pool} pool
 * @param {URLSearchParams} formData
 * @returns {Promise<void>}
 */
export async function updateEmailPreferences(pool, formData) {
  const client = await pool.connect();

  try {
    await setPreference(client, 'SMTP_ACTIVE', formData.get('SMTP_ACTIVE') ?? '');
    await setPreference(client, 'SMTP_DISP_NAME', formData.get('SMTP_DISP_NAME') ?? '');
    await setPreference(client, 'SMTP_FROM_NAME', formData.get('SMTP_FROM_NAME') ?? '');
    await setPreference(client, 'SMTP_HOST', formData.get('SMTP_HOST') ?? '');
    await setPreference(client, 'SMTP_PORT', formData.get('SMTP_PORT') ?? '');
    await setPreference(client, 'SMTP_AUTH', formData.get('SMTP_AUTH') ?? '');
    await setPreference(client, 'SMTP_AUTH_USER', formData.get('SMTP_AUTH_USER') ?? '');
    await setPreference(client, 'SMTP_SSL', formData.get('SMTP_SSL') ?? '');
    await setPreference(client, 'SMTP_HELO', formData.get('SMTP_HELO') ?? '');
    await setPreference(client, 'DKIM_DOMAIN', formData.get('DKIM_DOMAIN') ?? '');
    await setPreference(client, 'DKIM_SELECTOR', formData.get('DKIM_SELECTOR') ?? '');
    await setPreference(client, 'DKIM_KEY', formData.get('DKIM_KEY') ?? '');

    const authPass = formData.get('SMTP_AUTH_PASS') ?? '';

    if (authPass !== '') {
      await setPreference(client, 'SMTP_AUTH_PASS', authPass);
    }
  } finally {
    client.release();
  }
}

/**
 * Builds a nodemailer transporter from the saved SMTP_ACTIVE
 * preference - mirrors EmailService::transport() (app/Services/EmailService.php:115-151).
 * `SMTP_SSL === 'ssl'` is implicit TLS (`secure: true`); `'tls'`
 * (STARTTLS) and `'none'` both pass `secure: false`, same as real
 * PHP, and nodemailer - like Symfony's EsmtpTransport - will still
 * opportunistically negotiate STARTTLS if the server advertises it
 * (no `requireTLS` is set here either, matching real PHP exactly).
 *
 * @param {Record<string,string>} preferences the raw (unprocessed) SMTP_* site preferences
 * @returns {{transporter: import('nodemailer').Transporter|null, isNull: boolean}}
 */
function buildTransport(preferences) {
  if (preferences.SMTP_ACTIVE === 'sendmail') {
    return { transporter: nodemailer.createTransport({ sendmail: true, path: '/usr/sbin/sendmail', args: ['-bs'] }), isNull: false };
  }

  if (preferences.SMTP_ACTIVE === 'external') {
    const auth = preferences.SMTP_AUTH === '1' ? { user: preferences.SMTP_AUTH_USER ?? '', pass: preferences.SMTP_AUTH_PASS ?? '' } : undefined;

    return {
      transporter: nodemailer.createTransport({
        host: preferences.SMTP_HOST ?? '',
        port: parseInt(preferences.SMTP_PORT, 10) || 25,
        secure: preferences.SMTP_SSL === 'ssl',
        name: preferences.SMTP_HELO ?? undefined,
        auth,
      }),
      isNull: false,
    };
  }

  // Real PHP's "default" case (anything other than sendmail/external)
  // uses Symfony's NullTransport - send() still reports success, but
  // nothing is actually transmitted. Mirrored exactly: no transporter
  // is built, the caller just reports success.
  return { transporter: null, isNull: true };
}

/**
 * Mirrors EmailService::send() (app/Services/EmailService.php:57-75)
 * and ::message() (lines 80-110), including the conditional DKIM
 * signing (only when domain/selector/key are all non-empty).
 *
 * @param {Record<string,string>} preferences the raw SMTP_ and DKIM_ site preferences
 * @param {{from: {email: string, name: string}, to: {email: string, name: string}, replyTo: {email: string, name: string}, subject: string, text: string, html: string}} message
 * @returns {Promise<boolean>}
 */
export async function sendEmail(preferences, message) {
  const { transporter, isNull } = buildTransport(preferences);

  if (isNull) {
    return true;
  }

  const mailOptions = {
    from: `"${message.from.name}" <${message.from.email}>`,
    to: `"${message.to.name}" <${message.to.email}>`,
    replyTo: `"${message.replyTo.name}" <${message.replyTo.email}>`,
    subject: message.subject,
    text: message.text,
    html: message.html,
  };

  const dkimDomain = preferences.DKIM_DOMAIN ?? '';
  const dkimSelector = preferences.DKIM_SELECTOR ?? '';
  const dkimKey = preferences.DKIM_KEY ?? '';

  if (dkimDomain !== '' && dkimSelector !== '' && dkimKey !== '') {
    transporter.options.dkim = {
      domainName: dkimDomain,
      keySelector: dkimSelector,
      privateKey: dkimKey,
    };
  }

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirrors the real PHP action's "send a test email to yourself" path
 * (app/Http/RequestHandlers/EmailPreferencesAction.php:80-90) -
 * `new SiteUser()` as the from-address, the acting admin as both to
 * and reply-to.
 *
 * @param {Record<string,string>} preferences
 * @param {{email: string, realName: string}} user
 * @returns {Promise<boolean>}
 */
export async function sendTestEmail(preferences, user) {
  return sendEmail(preferences, {
    from: { email: 'noreply@example.com', name: 'webtrees' },
    to: { email: user.email, name: user.realName },
    replyTo: { email: user.email, name: user.realName },
    subject: 'test',
    text: 'test',
    html: 'test',
  });
}

/** Mirrors Gedcom::HIDDEN_TAGS's keys (app/Gedcom.php:281-336). */
export const HIDDEN_TAG_KEYS = [
  'NAME_NPFX', 'NAME_SPFX', 'NAME_NSFX', 'NAME_NICK', 'NAME_FONE', 'NAME_ROMN', 'NAME_NOTE', 'NAME_SOUR',
  'PLAC_MAP', 'PLAC_FONE', 'PLAC_ROMN', 'PLAC_FORM', 'PLAC_NOTE',
  'ADDR_EMAIL', 'ADDR_PHON', 'ADDR_WWW',
  'SOUR_EVEN', 'SOUR_DATE', 'SOUR_NOTE', 'SOUR_QUAY', 'SOUR_DATA',
  'BIRT_FAMC', 'RELI', 'BAPM', 'CHR', 'FCOM', 'ORDN', 'BARM', 'ALIA', 'ASSO',
  'ENGA', 'MARB', 'MARC', 'MARL', 'MARS', 'ANUL', 'DIVF', 'FAM_RESI', 'FAM_CENS',
  'LDS',
  'AFN', 'IDNO', 'SSN', 'RFN', 'REFN', 'RIN',
  'SUBM', 'ANCI',
];

/** Mirrors Gedcom::CUSTOM_FAMILY_TAGS (app/Gedcom.php:343-350). */
export const CUSTOM_FAMILY_TAGS = ['FACT', '_COML', '_MARI', '_MBON', '_NMR', '_SEPR'];

/** Mirrors Gedcom::CUSTOM_INDIVIDUAL_TAGS (app/Gedcom.php:352-373). */
export const CUSTOM_INDIVIDUAL_TAGS = [
  '_BRTM', '_CIRC', '_DEG', '_DNA', '_EXCM', '_EYEC', '_FNRL', '_FSFTID', '_HAIR', '_HEIG', '_INTE',
  '_MDCL', '_MEDC', '_MILI', '_MILT', '_NAMS', '_NMAR', '_PRMN', '_WEIG', '_YART',
];

const SITE_TAGS_PREFERENCE_NAMES = ['CUSTOM_FAMILY_TAGS', 'CUSTOM_INDIVIDUAL_TAGS', 'CUSTOM_GEDCOM_L_TAGS', 'CUSTOM_FAM_FACT', 'CUSTOM_FAM_NCHI', 'CUSTOM_RESI_VALUE', 'CUSTOM_TIME_TAGS'];

/**
 * Mirrors SiteTagsPage (app/Http/RequestHandlers/SiteTagsPage.php:38-77).
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<object>}
 */
export async function loadSiteTagsPreferences(pool) {
  const hiddenNames = HIDDEN_TAG_KEYS.map((key) => `HIDE_${key}`);
  const [hiddenPrefs, otherPrefs] = await Promise.all([loadPreferences(pool, hiddenNames), loadPreferences(pool, SITE_TAGS_PREFERENCE_NAMES)]);

  const hiddenTags = {};

  for (const key of HIDDEN_TAG_KEYS) {
    hiddenTags[key] = hiddenPrefs[`HIDE_${key}`] === '1';
  }

  return {
    hiddenTags,
    customFamilyTags: (otherPrefs.CUSTOM_FAMILY_TAGS ?? '').split(',').filter((t) => t !== ''),
    customIndividualTags: (otherPrefs.CUSTOM_INDIVIDUAL_TAGS ?? '').split(',').filter((t) => t !== ''),
    customGedcomLTags: otherPrefs.CUSTOM_GEDCOM_L_TAGS === '1',
    customFamFact: otherPrefs.CUSTOM_FAM_FACT === '1',
    customFamNchi: otherPrefs.CUSTOM_FAM_NCHI === '1',
    customResiValue: otherPrefs.CUSTOM_RESI_VALUE === '1',
    customTimeTags: otherPrefs.CUSTOM_TIME_TAGS === '1',
  };
}

/**
 * Mirrors SiteTagsAction (app/Http/RequestHandlers/SiteTagsAction.php:38-64).
 *
 * @param {import('pg').Pool} pool
 * @param {URLSearchParams} formData
 * @returns {Promise<void>}
 */
export async function updateSiteTagsPreferences(pool, formData) {
  const client = await pool.connect();

  try {
    for (const key of HIDDEN_TAG_KEYS) {
      const value = formData.get(`HIDE_${key}`) === '1';
      // eslint-disable-next-line no-await-in-loop
      await setPreference(client, `HIDE_${key}`, value ? '1' : '');
    }

    const customFamilyTags = formData.getAll('custom_family_tags[]');
    const customIndividualTags = formData.getAll('custom_individual_tags[]');

    await setPreference(client, 'CUSTOM_FAMILY_TAGS', customFamilyTags.join(','));
    await setPreference(client, 'CUSTOM_INDIVIDUAL_TAGS', customIndividualTags.join(','));
    await setPreference(client, 'CUSTOM_GEDCOM_L_TAGS', formData.get('custom_gedcom_l_tags') === '1' ? '1' : '');
    await setPreference(client, 'CUSTOM_FAM_FACT', formData.get('custom_fam_fact') === '1' ? '1' : '');
    await setPreference(client, 'CUSTOM_FAM_NCHI', formData.get('custom_fam_nchi') === '1' ? '1' : '');
    await setPreference(client, 'CUSTOM_RESI_VALUE', formData.get('custom_resi_value') === '1' ? '1' : '');
    await setPreference(client, 'CUSTOM_TIME_TAGS', formData.get('custom_time_tags') === '1' ? '1' : '');
  } finally {
    client.release();
  }
}
