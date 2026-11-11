import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const configs = ['baize', 'fish-bowl'].map(id => JSON.parse(fs.readFileSync(path.join(root, 'src/pets/definitions', `${id}.json`), 'utf8')));

test('每个宠物模型都有独立的配置文件', () => {
  assert.equal(configs.length, 2);
  assert.equal(new Set(configs.map(config => config.modelId)).size, 2);
  for (const config of configs) {
    assert.equal(typeof config.id, 'string');
    assert.equal(typeof config.name, 'string');
    assert.equal(typeof config.url, 'string');
    assert.ok(config.url.startsWith('/'));
    assert.equal(typeof config.scale, 'number');
    assert.ok(config.scale > 0);
  }
});

test('模型配置包含固定动作槽：攻击/快跑/慢跑/被攻击/死亡/院子待机动作链', () => {
  const required = ['idle', 'walk', 'runSlow', 'runFast', 'attack', 'hit', 'death', 'pet', 'yardIdle'];
  for (const config of configs) {
    for (const slot of required) assert.ok(slot in config.animations, `${config.id} missing ${slot}`);
    assert.equal(typeof config.animations.idle, 'string');
    assert.equal(typeof config.animations.runFast, 'string');
    assert.equal(typeof config.animations.runSlow, 'string');
    assert.equal(typeof config.animations.attack, 'string');
    assert.equal(typeof config.animations.hit, 'string');
    assert.equal(typeof config.animations.death, 'string');
    assert.ok(typeof config.animations.pet === 'string' || Array.isArray(config.animations.pet), `${config.id} pet should be an action`);
    assert.ok(Array.isArray(config.animations.yardIdle), `${config.id} yardIdle should be an action chain`);
    assert.ok(config.animations.yardIdle.length >= 2);
    for (const step of config.animations.yardIdle) {
      assert.equal(typeof step.clip, 'string');
      assert.ok(step.duration > 0);
    }
  }
});

test('缸盆小鱼是独立模型，并复用原动画文件补齐动作', () => {
  const fish = configs.find(config => config.modelId === 'fish-bowl');
  assert.equal(fish.name, '缸盆小鱼');
  assert.ok(Array.isArray(fish.animationUrls));
  assert.ok(fish.animationUrls.length >= 1);
  for (const file of [fish.url, ...fish.animationUrls]) {
    assert.ok(fs.existsSync(path.join(root, file.replace(/^\//, ''))), `${file} should exist`);
  }
});
