/**
 * DeepSeek AI Whale Frenzy - Main Game Engine
 */

class GameEngine {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    // World Dimensions (Expanded deep ocean map)
    this.worldWidth = 4500;
    this.worldHeight = 4500;

    // Camera
    this.camera = {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      zoom: 1.0,
      targetZoom: 1.0
    };

    // State
    this.state = 'MENU'; // 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER'
    this.player = null;
    this.spawner = null;
    this.ui = null;

    // Timers
    this.survivalSeconds = 0;
    this.secondTimer = 0;
    this.dangerSoundCooldown = 0;

    this.init();
  }

  init() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.resizeCanvas(), 150);
    });

    this.spawner = new AISpawner(this.worldWidth, this.worldHeight);
    this.ui = new UIManager();
    window.uiManager = this.ui;

    this.bindInputs();

    // Start render loop
    requestAnimationFrame((t) => this.loop(t));
  }

  resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.camera.width = w;
    this.camera.height = h;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform matrix
    this.ctx.scale(dpr, dpr);
  }

  bindInputs() {
    // Mouse tracking
    window.addEventListener('mousemove', (e) => {
      if (this.state !== 'PLAYING' || !this.player) return;
      this.player.isMouseControl = true;
      const screenCenterX = this.camera.width / 2;
      const screenCenterY = this.camera.height / 2;
      const worldX = this.player.x + (e.clientX - screenCenterX) / this.camera.zoom;
      const worldY = this.player.y + (e.clientY - screenCenterY) / this.camera.zoom;
      this.player.inputTarget.x = worldX;
      this.player.inputTarget.y = worldY;
    });

    // Mouse Right Click for Dash
    window.addEventListener('mousedown', (e) => {
      if (this.state !== 'PLAYING' || !this.player) return;
      if (e.button === 2) {
        this.player.triggerDash(true);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.state !== 'PLAYING' || !this.player) return;
      if (e.button === 2) {
        this.player.triggerDash(false);
      }
    });

    // Disable context menu on game canvas for right-click dash
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard bindings
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.togglePause();
        return;
      }

      if (this.state !== 'PLAYING' || !this.player) return;

      if (e.code === 'Space') {
        this.player.triggerDash(true);
      }
      if (e.code === 'KeyE') {
        this.player.triggerMoE();
        this.ui.unlockAchievement('use_moe');
      }
      if (e.code === 'KeyQ') {
        this.player.triggerShieldSkill();
        this.ui.unlockAchievement('use_shield');
      }

      // WASD movement override
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        this.player.isMouseControl = false;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.player.keys.up = true;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') this.player.keys.down = true;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.player.keys.left = true;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') this.player.keys.right = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (!this.player) return;
      if (e.code === 'Space') {
        this.player.triggerDash(false);
      }
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.player.keys.up = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.player.keys.down = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.player.keys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.player.keys.right = false;
    });
  }

  start() {
    this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);
    this.spawner.init(this.player);
    this.survivalSeconds = 0;
    this.secondTimer = 0;
    this.state = 'PLAYING';

    this.ui.startScreen.classList.add('hidden');
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.gameOverScreen.classList.add('hidden');
    this.ui.hud.classList.remove('hidden');
  }

  restart() {
    this.start();
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.ui.pauseScreen.classList.remove('hidden');
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.ui.pauseScreen.classList.add('hidden');
    }
  }

  gameOver(killerFish) {
    this.state = 'GAMEOVER';
    this.ui.showGameOver(this.player, killerFish ? `${killerFish.species.name} (${killerFish.params.toFixed(1)}B)` : 'Closed Source 巨兽');
  }

  // --- Collision Detection and Resolution ---
  checkCollisions() {
    const p = this.player;

    // 1. Player vs Token Crystals
    for (let i = this.spawner.tokens.length - 1; i >= 0; i--) {
      const t = this.spawner.tokens[i];
      const dist = Math.hypot(p.x - t.x, p.y - t.y);
      if (dist < p.radius + t.radius + 8) {
        p.eat(t);
        this.spawner.tokens.splice(i, 1);
      }
    }

    // 2. Player vs Power-Ups
    for (let i = this.spawner.powerUps.length - 1; i >= 0; i--) {
      const pu = this.spawner.powerUps[i];
      const dist = Math.hypot(p.x - pu.x, p.y - pu.y);
      if (dist < p.radius + pu.radius) {
        p.applyPowerUp(pu);
        this.spawner.powerUps.splice(i, 1);
      }
    }

    // 3. Player vs AI Fish
    let nearDanger = false;
    for (let i = this.spawner.fishList.length - 1; i >= 0; i--) {
      const fish = this.spawner.fishList[i];
      const dist = Math.hypot(p.x - fish.x, p.y - fish.y);
      const hitDist = (p.radius + fish.radius) * 0.72;

      // Check proximity for heartbeat sound
      if (dist < 280 && fish.params > p.params * 1.15) {
        nearDanger = true;
      }

      if (dist < hitDist) {
        // A. Shield Active -> Deflect & Eat if smaller
        if (p.shieldActive) {
          if (p.params >= fish.params * 0.8) {
            this.handlePlayerEatFish(fish, i);
          } else {
            const pushAngle = Math.atan2(fish.y - p.y, fish.x - p.x);
            fish.x += Math.cos(pushAngle) * 80;
            fish.y += Math.sin(pushAngle) * 80;
            fish.targetAngle = pushAngle;
            fish.changeDirTimer = 60;
            window.particleSystem.createShockwave(fish.x, fish.y, 80, '#00f0ff');
            window.particleSystem.addFloatingText(fish.x, fish.y, '🛡️ 开源护盾弹开！', '#38bdf8', 16);
          }
          continue;
        }

        // B. R1 Dash bonus
        const sizeAdvantage = p.isDashing ? 1.15 : 1.03;

        if (p.params * sizeAdvantage >= fish.params) {
          this.handlePlayerEatFish(fish, i);
        } else {
          window.particleSystem.createEatBurst(p.x, p.y, '#00f0ff', 40, 2);
          this.gameOver(fish);
          return;
        }
      }
    }

    // Danger heartbeat sound
    this.dangerSoundCooldown--;
    if (nearDanger && this.dangerSoundCooldown <= 0) {
      window.soundManager.playHeartbeat();
      this.dangerSoundCooldown = 45;
    }

    // 4. NPC Fish vs NPC Fish & Tokens
    for (let i = 0; i < this.spawner.fishList.length; i++) {
      const f1 = this.spawner.fishList[i];

      // NPC eat Tokens
      for (let j = this.spawner.tokens.length - 1; j >= 0; j--) {
        const t = this.spawner.tokens[j];
        if (Math.hypot(f1.x - t.x, f1.y - t.y) < f1.radius + t.radius) {
          f1.addParams(t.params * 0.2);
          this.spawner.tokens.splice(j, 1);
        }
      }
    }
  }

  handlePlayerEatFish(fish, index) {
    this.player.eat(fish);
    this.spawner.fishList.splice(index, 1);
    this.ui.unlockAchievement('first_eat');

    // Specific model achievements
    if (fish.speciesKey === 'chatgpt') this.ui.unlockAchievement('eat_chatgpt');
    if (fish.speciesKey === 'claude') this.ui.unlockAchievement('eat_claude');
    if (fish.speciesKey === 'grok') this.ui.unlockAchievement('eat_grok');
  }

  // --- Main Game Loop ---
  loop(timestamp) {
    if (this.state === 'PLAYING') {
      // 1. Update Timer
      this.secondTimer++;
      if (this.secondTimer >= 60) {
        this.secondTimer = 0;
        this.survivalSeconds++;
      }

      // 2. Update Entities
      this.player.update(this.worldWidth, this.worldHeight);
      this.spawner.update(this.player);
      window.particleSystem.update(this.worldWidth, this.worldHeight);

      // 3. Collision Checks
      this.checkCollisions();

      // 4. Update HUD & Minimap
      this.ui.updateHUD(this.player, this.survivalSeconds);
      this.ui.renderMinimap(this.player, this.spawner);

      // 5. Dynamic Camera Tracking & Zoom
      const targetZoom = Math.max(0.48, 1.05 - Math.pow(this.player.params / 671, 0.45) * 0.52);
      this.camera.zoom += (targetZoom - this.camera.zoom) * 0.05;

      const halfW = (this.camera.width / 2) / this.camera.zoom;
      const halfH = (this.camera.height / 2) / this.camera.zoom;
      this.camera.x = this.player.x - halfW;
      this.camera.y = this.player.y - halfH;
    }

    // --- Render Pipeline ---
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Draw Deep Ocean Grid
    this.renderBackgroundGrid(ctx);

    // 2. Draw World Boundaries
    this.renderWorldBoundaries(ctx);

    // 3. Draw Ambient / Burst / Shockwave Particles
    window.particleSystem.render(ctx, this.camera);

    // 4. Draw AI Ecosystem
    if (this.spawner) {
      this.spawner.render(ctx, this.camera);
    }

    // 5. Draw Player Whale
    if (this.player && this.state !== 'GAMEOVER') {
      this.player.render(ctx, this.camera);
    }

    ctx.restore();
  }

  renderBackgroundGrid(ctx) {
    const gridSize = 120;
    const startX = Math.floor(this.camera.x / gridSize) * gridSize;
    const endX = this.camera.x + (this.camera.width / this.camera.zoom) + gridSize;
    const startY = Math.floor(this.camera.y / gridSize) * gridSize;
    const endY = this.camera.y + (this.camera.height / this.camera.zoom) + gridSize;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 216, 255, 0.04)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = startX; x < endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 216, 255, 0.12)';
    for (let x = startX; x < endX; x += gridSize) {
      for (let y = startY; y < endY; y += gridSize) {
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    ctx.restore();
  }

  renderWorldBoundaries(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 216, 255, 0.6)';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 20;
    ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);
    ctx.restore();
  }
}

// Instantiate engine when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.game = new GameEngine();
});
