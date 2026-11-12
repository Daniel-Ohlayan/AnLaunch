'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

test('Offline UUID generation conforms to Mojang offline player spec', () => {
  const name = 'Steve_Offline';
  const md5 = crypto.createHash('md5').update('OfflinePlayer:' + name).digest();
  // UUID v3 formatting (RFC 4122)
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString('hex');
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');

  assert.strictEqual(uuid.length, 36);
  assert.strictEqual(uuid[14], '3', 'Version must be 3 for offline MD5 UUID');
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('Authlib-injector yggdrasil.prefetched payload encoding', () => {
  const profile = {
    id: 'e6988898-348e-3242-b060-f6551b9e2646',
    name: 'ProGamer',
    properties: [
      {
        name: 'textures',
        value: Buffer.from(
          JSON.stringify({
            timestamp: Date.now(),
            profileId: 'e6988898348e3242b060f6551b9e2646',
            profileName: 'ProGamer',
            textures: {
              SKIN: { url: 'http://127.0.0.1:25585/texture/skin.png' },
              CAPE: { url: 'http://127.0.0.1:25585/texture/cape.png' },
            },
          })
        ).toString('base64'),
      },
    ],
  };

  const payload = Buffer.from(JSON.stringify(profile)).toString('base64');
  const arg = `-Dauthlibinjector.yggdrasil.prefetched=${payload}`;

  assert.ok(arg.startsWith('-Dauthlibinjector.yggdrasil.prefetched='));
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  assert.strictEqual(decoded.name, 'ProGamer');
  assert.ok(decoded.properties[0].value);
});
