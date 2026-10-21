import { boot } from 'kit/phaser/boot.js';

import { Level } from './scenes/level.js';

boot({ scenes: [Level], width: 960, height: 540, gravity: 0, physics: false });
