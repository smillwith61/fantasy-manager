import Phaser from 'phaser';
import { MenuScene }         from './scenes/MenuScene.js';
import { LobbyScene }        from './scenes/LobbyScene.js';
import { AuctionScene }      from './scenes/AuctionScene.js';
import { TeamScene }         from './scenes/TeamScene.js';
import { MatchdayPrepScene } from './scenes/MatchdayPrepScene.js';
import { MatchScene }        from './scenes/MatchScene.js';
import { TableScene }        from './scenes/TableScene.js';
import { TransferScene }     from './scenes/TransferScene.js';
import { WinnerScene }       from './scenes/WinnerScene.js';
import { DebugScene }        from './scenes/DebugScene.js';

const config = {
  type: Phaser.AUTO,
  backgroundColor: '#0d0d1a',
  parent: document.body,
  scene: [
    MenuScene, LobbyScene, AuctionScene, TeamScene,
    MatchdayPrepScene, MatchScene, TableScene, TransferScene, WinnerScene,
    DebugScene,
  ],
  scale: {
    mode: Phaser.Scale.RESIZE,   // Canvas fills window exactly — no scaling, no blur
    autoCenter: Phaser.Scale.NONE,
  },
  dom: {
    createContainer: true,       // Enables scene.add.dom() for HTML inputs
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: true,           // Snaps text/graphics to whole pixels → crispness
  },
};

export const game = new Phaser.Game(config);
