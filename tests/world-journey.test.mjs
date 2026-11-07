import test from 'node:test';
import {selfCheck} from '../scripts/self-check.mjs';
test('real SDK OAuth world journey survives disconnect/restart and revocation',selfCheck);
