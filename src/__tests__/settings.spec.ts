/**
 * The settings and the theming rule (ACC-CONFIG-26, ACC-THEME-29, ACC-VIEW-64).
 */
import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_SETTINGS, readSettings } from '../model';

const ROOT = path.resolve(__dirname, '..', '..');

describe('schema/plugin.json', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'schema', 'plugin.json'), 'utf-8')
  );

  it('declares the four settings with their defaults', () => {
    expect(Object.keys(schema.properties).sort()).toEqual([
      'notificationWindow',
      'openOnStart',
      'pollMinutes',
      'reopenOnBroadcast'
    ]);
    expect(schema.properties.openOnStart).toMatchObject({
      type: 'boolean',
      default: true
    });
    expect(schema.properties.reopenOnBroadcast).toMatchObject({
      type: 'boolean',
      default: false
    });
    expect(schema.properties.pollMinutes).toMatchObject({
      type: 'integer',
      minimum: 0,
      maximum: 35791,
      default: 0
    });
    expect(schema.properties.notificationWindow).toMatchObject({
      type: 'string',
      oneOf: [
        { const: '24h', title: 'Last 24 hours' },
        { const: '3d', title: 'Last 3 days' },
        { const: '7d', title: 'Last 7 days' }
      ],
      default: '24h'
    });
  });

  it('matches the defaults the code falls back to', () => {
    const fromSchema: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(schema.properties)) {
      fromSchema[key] = (property as { default: unknown }).default;
    }
    expect(fromSchema).toEqual(DEFAULT_SETTINGS);
  });
});

describe('readSettings', () => {
  it('fills the defaults for missing keys', () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('reads the given values', () => {
    expect(
      readSettings({
        openOnStart: false,
        reopenOnBroadcast: true,
        pollMinutes: 5,
        notificationWindow: '7d'
      })
    ).toEqual({
      openOnStart: false,
      reopenOnBroadcast: true,
      pollMinutes: 5,
      notificationWindow: '7d'
    });
  });

  it('lists the last 24 hours for a notificationWindow that is not a choice', () => {
    expect(readSettings({ notificationWindow: '2d' }).notificationWindow).toBe(
      '24h'
    );
    expect(readSettings({ notificationWindow: 7 }).notificationWindow).toBe(
      '24h'
    );
  });

  it('never polls on a negative, fractional-below-one or non-number interval', () => {
    expect(readSettings({ pollMinutes: -3 }).pollMinutes).toBe(0);
    expect(readSettings({ pollMinutes: 0.5 }).pollMinutes).toBe(0);
    expect(readSettings({ pollMinutes: '10' }).pollMinutes).toBe(0);
  });
});

describe('style/base.css', () => {
  it('style uses no literal colour', () => {
    const css = fs
      .readFileSync(path.join(ROOT, 'style', 'base.css'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/);
    expect(css).not.toMatch(
      /:\s*[^;]*\b(white|black|red|green|blue|gray|grey|orange|yellow|purple)\b/
    );
  });
});
