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

import { describe, expect, test, vi } from 'vitest';
import * as sitePreferences from '../pages-server/site-preferences.mjs';

vi.mock('fs/promises');
vi.mock('dns');
vi.mock('os');
vi.mock('nodemailer');

describe('site-preferences.mjs', () => {
  describe('loadGeneralPreferences', () => {
    test('loads all 5 general preference names', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'INDEX_DIRECTORY', setting_value: '/data/' },
            { setting_name: 'ALLOW_CHANGE_GEDCOM', setting_value: '1' },
            { setting_name: 'LANGUAGE', setting_value: 'en-US' },
            { setting_name: 'THEME_DIR', setting_value: 'webtrees' },
            { setting_name: 'TIMEZONE', setting_value: 'UTC' },
          ],
        }),
      };
      const result = await sitePreferences.loadGeneralPreferences(pool);
      expect(result.INDEX_DIRECTORY).toBe('/data/');
      expect(result.ALLOW_CHANGE_GEDCOM).toBe('1');
      expect(result.LANGUAGE).toBe('en-US');
      expect(result.THEME_DIR).toBe('webtrees');
      expect(result.TIMEZONE).toBe('UTC');
    });

    test('returns empty strings for missing preferences', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const result = await sitePreferences.loadGeneralPreferences(pool);
      expect(result).toEqual({});
    });
  });

  describe('updateGeneralPreferences', () => {
    test('saves all general preferences when directory exists and is writable', async () => {
      const fspromises = await import('fs/promises');
      vi.mocked(fspromises.stat).mockResolvedValue({ isDirectory: () => true });
      vi.mocked(fspromises.access).mockResolvedValue(undefined);

      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('INDEX_DIRECTORY', '/data');
      formData.set('ALLOW_CHANGE_GEDCOM', '1');
      formData.set('LANGUAGE', 'en-US');
      formData.set('THEME_DIR', 'webtrees');
      formData.set('TIMEZONE', 'UTC');

      const result = await sitePreferences.updateGeneralPreferences(pool, formData);
      expect(result.error).toBeNull();
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('appends trailing slash to directory path before checking', async () => {
      const fspromises = await import('fs/promises');
      vi.mocked(fspromises.stat).mockResolvedValue({ isDirectory: () => true });
      vi.mocked(fspromises.access).mockResolvedValue(undefined);

      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('INDEX_DIRECTORY', '/data');
      formData.set('ALLOW_CHANGE_GEDCOM', '');
      formData.set('LANGUAGE', '');
      formData.set('THEME_DIR', '');
      formData.set('TIMEZONE', '');

      await sitePreferences.updateGeneralPreferences(pool, formData);
      expect(vi.mocked(fspromises.stat)).toHaveBeenCalledWith('/data/');
    });

    test('returns error when directory does not exist (stat rejects)', async () => {
      const fspromises = await import('fs/promises');
      vi.mocked(fspromises.stat).mockRejectedValue(new Error('not found'));

      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('INDEX_DIRECTORY', '/nonexistent');
      formData.set('ALLOW_CHANGE_GEDCOM', '');
      formData.set('LANGUAGE', '');
      formData.set('THEME_DIR', '');
      formData.set('TIMEZONE', '');

      const result = await sitePreferences.updateGeneralPreferences(pool, formData);
      expect(result.error).toMatch(/does not exist/);
      // Other preferences should still be saved
      expect(mockClient.query).toHaveBeenCalled();
    });

    test('returns error when directory is not writable', async () => {
      const fspromises = await import('fs/promises');
      vi.mocked(fspromises.stat).mockResolvedValue({ isDirectory: () => true });
      vi.mocked(fspromises.access).mockRejectedValue(new Error('permission denied'));

      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('INDEX_DIRECTORY', '/readonly');
      formData.set('ALLOW_CHANGE_GEDCOM', '');
      formData.set('LANGUAGE', '');
      formData.set('THEME_DIR', '');
      formData.set('TIMEZONE', '');

      const result = await sitePreferences.updateGeneralPreferences(pool, formData);
      expect(result.error).toMatch(/Cannot write/);
    });

    test('returns error when path is not a directory', async () => {
      const fspromises = await import('fs/promises');
      vi.mocked(fspromises.stat).mockResolvedValue({ isDirectory: () => false });

      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('INDEX_DIRECTORY', '/file.txt');
      formData.set('ALLOW_CHANGE_GEDCOM', '');
      formData.set('LANGUAGE', '');
      formData.set('THEME_DIR', '');
      formData.set('TIMEZONE', '');

      const result = await sitePreferences.updateGeneralPreferences(pool, formData);
      expect(result.error).toMatch(/does not exist/);
    });
  });

  describe('loadRegistrationPreferences', () => {
    test('loads all registration preference names', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'WELCOME_TEXT_AUTH_MODE', setting_value: '4' },
            { setting_name: 'WELCOME_TEXT_AUTH_MODE_en-US', setting_value: 'Welcome!' },
            { setting_name: 'USE_REGISTRATION_MODULE', setting_value: '1' },
            { setting_name: 'SHOW_REGISTER_CAUTION', setting_value: '' },
          ],
        }),
      };
      const result = await sitePreferences.loadRegistrationPreferences(pool);
      expect(result['WELCOME_TEXT_AUTH_MODE']).toBe('4');
      expect(result['WELCOME_TEXT_AUTH_MODE_en-US']).toBe('Welcome!');
      expect(result.USE_REGISTRATION_MODULE).toBe('1');
      expect(result.SHOW_REGISTER_CAUTION).toBe('');
    });
  });

  describe('updateRegistrationPreferences', () => {
    test('saves registration preferences with en-US key', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('WELCOME_TEXT_AUTH_MODE', '4');
      formData.set('WELCOME_TEXT_AUTH_MODE_4', 'Custom text');
      formData.set('USE_REGISTRATION_MODULE', '1');
      formData.set('SHOW_REGISTER_CAUTION', '1');

      await sitePreferences.updateRegistrationPreferences(pool, formData);

      const calls = mockClient.query.mock.calls;
      expect(calls.some((call) => call[1][0] === 'WELCOME_TEXT_AUTH_MODE' && call[1][1] === '4')).toBe(true);
      expect(calls.some((call) => call[1][0] === 'WELCOME_TEXT_AUTH_MODE_en-US' && call[1][1] === 'Custom text')).toBe(true);
      expect(calls.some((call) => call[1][0] === 'USE_REGISTRATION_MODULE' && call[1][1] === '1')).toBe(true);
      expect(calls.some((call) => call[1][0] === 'SHOW_REGISTER_CAUTION' && call[1][1] === '1')).toBe(true);
    });
  });

  describe('MAIL_SSL_OPTIONS', () => {
    test('has "none", "ssl", "tls" keys', () => {
      expect(sitePreferences.MAIL_SSL_OPTIONS).toHaveProperty('none');
      expect(sitePreferences.MAIL_SSL_OPTIONS).toHaveProperty('ssl');
      expect(sitePreferences.MAIL_SSL_OPTIONS).toHaveProperty('tls');
    });

    test('has expected label values', () => {
      expect(sitePreferences.MAIL_SSL_OPTIONS.none).toBe('none');
      expect(sitePreferences.MAIL_SSL_OPTIONS.ssl).toBe('SSL/TLS');
      expect(sitePreferences.MAIL_SSL_OPTIONS.tls).toBe('STARTTLS');
    });
  });

  describe('MAIL_TRANSPORT_OPTIONS', () => {
    test('has "sendmail" and "external" keys', () => {
      expect(sitePreferences.MAIL_TRANSPORT_OPTIONS).toHaveProperty('sendmail');
      expect(sitePreferences.MAIL_TRANSPORT_OPTIONS).toHaveProperty('external');
    });
  });

  describe('isValidDomainSyntax', () => {
    test('accepts valid FQDN domains', () => {
      expect(sitePreferences.isValidDomainSyntax('example.com')).toBe(true);
      expect(sitePreferences.isValidDomainSyntax('mail.example.com')).toBe(true);
      expect(sitePreferences.isValidDomainSyntax('mail.example.co.uk')).toBe(true);
      expect(sitePreferences.isValidDomainSyntax('a.b.c.d.e')).toBe(true);
    });

    test('rejects domains with no dots', () => {
      expect(sitePreferences.isValidDomainSyntax('localhost')).toBe(false);
      expect(sitePreferences.isValidDomainSyntax('example')).toBe(false);
    });

    test('rejects empty string', () => {
      expect(sitePreferences.isValidDomainSyntax('')).toBe(false);
    });

    test('rejects domains with leading hyphen in label', () => {
      expect(sitePreferences.isValidDomainSyntax('-example.com')).toBe(false);
      expect(sitePreferences.isValidDomainSyntax('example.-com')).toBe(false);
    });

    test('rejects domains with trailing hyphen in label', () => {
      expect(sitePreferences.isValidDomainSyntax('example-.com')).toBe(false);
      expect(sitePreferences.isValidDomainSyntax('example.com-')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    test('returns false for malformed email without DNS lookup', async () => {
      const result = await sitePreferences.isValidEmail('not-an-email');
      expect(result).toBe(false);
    });

    test('returns false for email with no @', async () => {
      const result = await sitePreferences.isValidEmail('nodomain');
      expect(result).toBe(false);
    });

    test('returns true when resolveMx returns records', async () => {
      const dns = await import('dns');
      vi.mocked(dns.promises.resolveMx).mockResolvedValue([
        { exchange: 'mail.example.com', priority: 10 },
      ]);

      const result = await sitePreferences.isValidEmail('user@example.com');
      expect(result).toBe(true);
    });

    test('falls back to resolve() when resolveMx rejects', async () => {
      const dns = await import('dns');
      vi.mocked(dns.promises.resolveMx).mockRejectedValue(new Error('no MX'));
      vi.mocked(dns.promises.resolve).mockResolvedValue(['192.0.2.1']);

      const result = await sitePreferences.isValidEmail('user@example.com');
      expect(result).toBe(true);
    });

    test('returns false when both DNS lookups fail', async () => {
      const dns = await import('dns');
      vi.mocked(dns.promises.resolveMx).mockRejectedValue(new Error('no MX'));
      vi.mocked(dns.promises.resolve).mockRejectedValue(new Error('no A record'));

      const result = await sitePreferences.isValidEmail('user@example.com');
      expect(result).toBe(false);
    });
  });

  describe('loadEmailPreferences', () => {
    test('applies default SMTP_PORT when missing', async () => {
      const os = await import('os');
      vi.mocked(os.hostname).mockReturnValue('server.local');

      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'SMTP_ACTIVE', setting_value: 'external' },
            { setting_name: 'SMTP_HOST', setting_value: 'mail.example.com' },
          ],
        }),
      };
      const result = await sitePreferences.loadEmailPreferences(pool);
      expect(result.SMTP_PORT).toBe('25');
    });

    test('does not apply default when SMTP_PORT is in DB', async () => {
      const os = await import('os');
      vi.mocked(os.hostname).mockReturnValue('server.local');

      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'SMTP_PORT', setting_value: '587' },
          ],
        }),
      };
      const result = await sitePreferences.loadEmailPreferences(pool);
      expect(result.SMTP_PORT).toBe('587');
    });

    test('applies default SMTP_HELO from hostname when missing', async () => {
      const os = await import('os');
      vi.mocked(os.hostname).mockReturnValue('server.local');

      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [],
        }),
      };
      const result = await sitePreferences.loadEmailPreferences(pool);
      expect(result.SMTP_HELO).toBe('server.local');
    });

    test('does not apply SMTP_HELO default when value is in DB', async () => {
      const os = await import('os');
      vi.mocked(os.hostname).mockReturnValue('server.local');

      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'SMTP_HELO', setting_value: 'custom.domain.com' },
          ],
        }),
      };
      const result = await sitePreferences.loadEmailPreferences(pool);
      expect(result.SMTP_HELO).toBe('custom.domain.com');
    });

    test('applies default SMTP_FROM_NAME combining no-reply@ with HELO', async () => {
      const os = await import('os');
      vi.mocked(os.hostname).mockReturnValue('server.local');

      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'SMTP_HELO', setting_value: 'mail.example.com' },
          ],
        }),
      };
      const result = await sitePreferences.loadEmailPreferences(pool);
      expect(result.SMTP_FROM_NAME).toBe('no-reply@mail.example.com');
    });

    test('applies default SMTP_DISP_NAME as webtrees', async () => {
      const os = await import('os');
      vi.mocked(os.hostname).mockReturnValue('server.local');

      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [],
        }),
      };
      const result = await sitePreferences.loadEmailPreferences(pool);
      expect(result.SMTP_DISP_NAME).toBe('webtrees');
    });
  });

  describe('updateEmailPreferences', () => {
    test('upserts all SMTP and DKIM fields', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('SMTP_ACTIVE', 'external');
      formData.set('SMTP_AUTH', '1');
      formData.set('SMTP_AUTH_USER', 'user@example.com');
      formData.set('SMTP_AUTH_PASS', 'password123');
      formData.set('SMTP_DISP_NAME', 'My Site');
      formData.set('SMTP_FROM_NAME', 'noreply@example.com');
      formData.set('SMTP_HOST', 'mail.example.com');
      formData.set('SMTP_PORT', '587');
      formData.set('SMTP_SSL', 'tls');
      formData.set('SMTP_HELO', 'mail.example.com');
      formData.set('DKIM_DOMAIN', 'example.com');
      formData.set('DKIM_SELECTOR', 'default');
      formData.set('DKIM_KEY', '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----');

      await sitePreferences.updateEmailPreferences(pool, formData);

      const calls = mockClient.query.mock.calls;
      expect(calls.some((call) => call[1].includes('SMTP_ACTIVE'))).toBe(true);
      expect(calls.some((call) => call[1].includes('SMTP_AUTH_PASS'))).toBe(true);
    });

    test('upserts SMTP_AUTH_PASS only when non-empty', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('SMTP_ACTIVE', 'external');
      formData.set('SMTP_AUTH_PASS', '');

      await sitePreferences.updateEmailPreferences(pool, formData);

      const calls = mockClient.query.mock.calls;
      expect(calls.some((call) => call[1].includes('SMTP_AUTH_PASS'))).toBe(false);
    });
  });

  describe('sendEmail', () => {
    test('returns true without creating transporter when SMTP_ACTIVE is empty (NullTransport)', async () => {
      const nodemailer = await import('nodemailer');
      const preferences = { SMTP_ACTIVE: '' };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      const result = await sitePreferences.sendEmail(preferences, message);
      expect(result).toBe(true);
      expect(vi.mocked(nodemailer.default.createTransport)).not.toHaveBeenCalled();
    });

    test('creates SMTP transport when SMTP_ACTIVE is "external"', async () => {
      const nodemailer = await import('nodemailer');
      const mockSendMail = vi.fn().mockResolvedValue({});
      vi.mocked(nodemailer.default.createTransport).mockReturnValue({
        sendMail: mockSendMail,
        options: {},
      });

      const preferences = {
        SMTP_ACTIVE: 'external',
        SMTP_HOST: 'mail.example.com',
        SMTP_PORT: '587',
        SMTP_SSL: 'tls',
        SMTP_AUTH: '1',
        SMTP_AUTH_USER: 'user',
        SMTP_AUTH_PASS: 'pass',
      };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      const result = await sitePreferences.sendEmail(preferences, message);
      expect(result).toBe(true);
      expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'mail.example.com',
          port: 587,
          secure: false,
          auth: expect.objectContaining({ user: 'user', pass: 'pass' }),
        })
      );
    });

    test('creates sendmail transport when SMTP_ACTIVE is "sendmail"', async () => {
      const nodemailer = await import('nodemailer');
      const mockSendMail = vi.fn().mockResolvedValue({});
      vi.mocked(nodemailer.default.createTransport).mockReturnValue({
        sendMail: mockSendMail,
        options: {},
      });

      const preferences = { SMTP_ACTIVE: 'sendmail' };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      const result = await sitePreferences.sendEmail(preferences, message);
      expect(result).toBe(true);
      expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalledWith(
        expect.objectContaining({ sendmail: true })
      );
    });

    test('sets DKIM when all three DKIM fields are non-empty', async () => {
      const nodemailer = await import('nodemailer');
      const mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({}),
        options: {},
      };
      vi.mocked(nodemailer.default.createTransport).mockReturnValue(mockTransporter);

      const preferences = {
        SMTP_ACTIVE: 'external',
        DKIM_DOMAIN: 'example.com',
        DKIM_SELECTOR: 'default',
        DKIM_KEY: 'key-content',
      };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      await sitePreferences.sendEmail(preferences, message);
      expect(mockTransporter.options.dkim).toEqual({
        domainName: 'example.com',
        keySelector: 'default',
        privateKey: 'key-content',
      });
    });

    test('does not set DKIM when any field is empty', async () => {
      const nodemailer = await import('nodemailer');
      const mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({}),
        options: {},
      };
      vi.mocked(nodemailer.default.createTransport).mockReturnValue(mockTransporter);

      const preferences = {
        SMTP_ACTIVE: 'external',
        DKIM_DOMAIN: 'example.com',
        DKIM_SELECTOR: '',
        DKIM_KEY: 'key-content',
      };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      await sitePreferences.sendEmail(preferences, message);
      expect(mockTransporter.options.dkim).toBeUndefined();
    });

    test('returns false when sendMail rejects', async () => {
      const nodemailer = await import('nodemailer');
      const mockTransporter = {
        sendMail: vi.fn().mockRejectedValue(new Error('SMTP error')),
        options: {},
      };
      vi.mocked(nodemailer.default.createTransport).mockReturnValue(mockTransporter);

      const preferences = { SMTP_ACTIVE: 'external' };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      const result = await sitePreferences.sendEmail(preferences, message);
      expect(result).toBe(false);
    });

    test('sets secure=true when SMTP_SSL is "ssl"', async () => {
      const nodemailer = await import('nodemailer');
      vi.mocked(nodemailer.default.createTransport).mockReturnValue({
        sendMail: vi.fn().mockResolvedValue({}),
        options: {},
      });

      const preferences = {
        SMTP_ACTIVE: 'external',
        SMTP_SSL: 'ssl',
        SMTP_PORT: '465',
      };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      await sitePreferences.sendEmail(preferences, message);
      expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true })
      );
    });

    test('sets secure=false when SMTP_SSL is not "ssl"', async () => {
      const nodemailer = await import('nodemailer');
      vi.mocked(nodemailer.default.createTransport).mockReturnValue({
        sendMail: vi.fn().mockResolvedValue({}),
        options: {},
      });

      const preferences = {
        SMTP_ACTIVE: 'external',
        SMTP_SSL: 'tls',
      };
      const message = {
        from: { email: 'noreply@example.com', name: 'webtrees' },
        to: { email: 'user@example.com', name: 'User' },
        replyTo: { email: 'user@example.com', name: 'User' },
        subject: 'test',
        text: 'test',
        html: 'test',
      };

      await sitePreferences.sendEmail(preferences, message);
      expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false })
      );
    });
  });

  describe('sendTestEmail', () => {
    test('calls sendEmail with correct test message fields', async () => {
      const nodemailer = await import('nodemailer');
      const mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({}),
        options: {},
      };
      vi.mocked(nodemailer.default.createTransport).mockReturnValue(mockTransporter);

      const preferences = { SMTP_ACTIVE: 'external' };
      const user = { email: 'admin@example.com', realName: 'Admin User' };

      await sitePreferences.sendTestEmail(preferences, user);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'test',
          text: 'test',
          html: 'test',
        })
      );
    });

    test('uses user email for both to and replyTo', async () => {
      const nodemailer = await import('nodemailer');
      const mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({}),
        options: {},
      };
      vi.mocked(nodemailer.default.createTransport).mockReturnValue(mockTransporter);

      const preferences = { SMTP_ACTIVE: 'external' };
      const user = { email: 'admin@example.com', realName: 'Admin User' };

      await sitePreferences.sendTestEmail(preferences, user);

      const mailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(mailCall.to).toContain('admin@example.com');
      expect(mailCall.replyTo).toContain('admin@example.com');
    });
  });

  describe('HIDDEN_TAG_KEYS', () => {
    test('has length 48', () => {
      expect(sitePreferences.HIDDEN_TAG_KEYS).toHaveLength(48);
    });

    test('has no duplicate entries', () => {
      const keys = sitePreferences.HIDDEN_TAG_KEYS;
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });

    test('contains expected entries', () => {
      expect(sitePreferences.HIDDEN_TAG_KEYS).toContain('NAME_NPFX');
      expect(sitePreferences.HIDDEN_TAG_KEYS).toContain('PLAC_MAP');
      expect(sitePreferences.HIDDEN_TAG_KEYS).toContain('ADDR_EMAIL');
    });
  });

  describe('CUSTOM_FAMILY_TAGS', () => {
    test('has length 6', () => {
      expect(sitePreferences.CUSTOM_FAMILY_TAGS).toHaveLength(6);
    });

    test('contains FACT and _SEPR', () => {
      expect(sitePreferences.CUSTOM_FAMILY_TAGS).toContain('FACT');
      expect(sitePreferences.CUSTOM_FAMILY_TAGS).toContain('_SEPR');
    });
  });

  describe('CUSTOM_INDIVIDUAL_TAGS', () => {
    test('has length 20', () => {
      expect(sitePreferences.CUSTOM_INDIVIDUAL_TAGS).toHaveLength(20);
    });

    test('contains _HEIG and _YART', () => {
      expect(sitePreferences.CUSTOM_INDIVIDUAL_TAGS).toContain('_HEIG');
      expect(sitePreferences.CUSTOM_INDIVIDUAL_TAGS).toContain('_YART');
    });
  });

  describe('loadSiteTagsPreferences', () => {
    test('loads hidden tags with boolean values', async () => {
      const pool = {
        query: vi.fn()
          .mockResolvedValueOnce({
            rows: [
              { setting_name: 'HIDE_NAME_NPFX', setting_value: '1' },
              { setting_name: 'HIDE_PLAC_MAP', setting_value: '' },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              { setting_name: 'CUSTOM_FAMILY_TAGS', setting_value: 'FACT,_SEPR' },
              { setting_name: 'CUSTOM_INDIVIDUAL_TAGS', setting_value: '_HEIG,_YART' },
            ],
          }),
      };
      const result = await sitePreferences.loadSiteTagsPreferences(pool);
      expect(result.hiddenTags.NAME_NPFX).toBe(true);
      expect(result.hiddenTags.PLAC_MAP).toBe(false);
    });

    test('splits comma-separated custom tags into arrays', async () => {
      const pool = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              { setting_name: 'CUSTOM_FAMILY_TAGS', setting_value: 'FACT,_COML,_MARI' },
              { setting_name: 'CUSTOM_INDIVIDUAL_TAGS', setting_value: '_HEIG,_YART,_HAIR' },
            ],
          }),
      };
      const result = await sitePreferences.loadSiteTagsPreferences(pool);
      expect(result.customFamilyTags).toEqual(['FACT', '_COML', '_MARI']);
      expect(result.customIndividualTags).toEqual(['_HEIG', '_YART', '_HAIR']);
    });

    test('filters empty strings from split results', async () => {
      const pool = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              { setting_name: 'CUSTOM_FAMILY_TAGS', setting_value: 'FACT,,_SEPR,' },
              { setting_name: 'CUSTOM_INDIVIDUAL_TAGS', setting_value: '' },
            ],
          }),
      };
      const result = await sitePreferences.loadSiteTagsPreferences(pool);
      expect(result.customFamilyTags).toEqual(['FACT', '_SEPR']);
      expect(result.customIndividualTags).toEqual([]);
    });
  });

  describe('updateSiteTagsPreferences', () => {
    test('upserts all 48 HIDE_* preferences', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      for (const key of sitePreferences.HIDDEN_TAG_KEYS) {
        formData.set(`HIDE_${key}`, '1');
      }

      await sitePreferences.updateSiteTagsPreferences(pool, formData);

      const calls = mockClient.query.mock.calls;
      for (const key of sitePreferences.HIDDEN_TAG_KEYS) {
        expect(calls.some((call) => call[1].includes(`HIDE_${key}`))).toBe(true);
      }
    });

    test('upserts HIDE_* as "1" or "" based on form data', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      formData.set('HIDE_NAME_NPFX', '1');
      formData.set('HIDE_PLAC_MAP', '');
      for (const key of sitePreferences.HIDDEN_TAG_KEYS) {
        if (key !== 'NAME_NPFX' && key !== 'PLAC_MAP') {
          formData.set(`HIDE_${key}`, '');
        }
      }

      await sitePreferences.updateSiteTagsPreferences(pool, formData);

      const calls = mockClient.query.mock.calls;
      expect(calls.some((call) => call[1][0] === 'HIDE_NAME_NPFX' && call[1][1] === '1')).toBe(
        true
      );
      expect(calls.some((call) => call[1][0] === 'HIDE_PLAC_MAP' && call[1][1] === '')).toBe(true);
    });

    test('upserts custom tag lists and extension settings', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({}),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const formData = new URLSearchParams();
      for (const key of sitePreferences.HIDDEN_TAG_KEYS) {
        formData.set(`HIDE_${key}`, '');
      }
      formData.append('custom_family_tags[]', 'FACT');
      formData.append('custom_family_tags[]', '_SEPR');
      formData.append('custom_individual_tags[]', '_HEIG');
      formData.set('custom_gedcom_l_tags', '1');
      formData.set('custom_fam_fact', '1');
      formData.set('custom_fam_nchi', '');
      formData.set('custom_resi_value', '1');
      formData.set('custom_time_tags', '');

      await sitePreferences.updateSiteTagsPreferences(pool, formData);

      const calls = mockClient.query.mock.calls;
      expect(calls.some((call) => call[1][0] === 'CUSTOM_FAMILY_TAGS')).toBe(true);
      expect(calls.some((call) => call[1][0] === 'CUSTOM_INDIVIDUAL_TAGS')).toBe(true);
      expect(calls.some((call) => call[1][0] === 'CUSTOM_GEDCOM_L_TAGS')).toBe(true);
    });
  });
});
