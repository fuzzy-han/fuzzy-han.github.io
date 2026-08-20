/**
 * AI Fish Spawner & Ocean Ecosystem Engine
 * Manages dynamic population scaling, behavior trees (flee/hunt/wander), and boss encounters.
 */

class AISpawner {
  constructor(worldWidth = 4000, worldHeight = 4000) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;

    this.fishList = [];
    this.tokens = [];
    this.powerUps = [];

    this.maxFish = 38;
    this.maxTokens = 85;
    this.maxPowerUps = 5;

    this.speciesKeys = Object.keys(AI_SPECIES).filter(k => k !== 'deepseek'); // Player is DeepSeek

    this.bossTimer = 0;
    this.bossInterval = 2400; // Occasional Titan spawn
    this.hasActiveBoss = false;
  }

  init(player) {
    this.fishList = [];
    this.tokens = [];
    this.powerUps = [];

    // 1. Initial Tokens
    for (let i = 0; i < this.maxTokens; i++) {
      this.spawnToken();
    }

    // 2. Initial Fish
    for (let i = 0; i < this.maxFish; i++) {
      this.spawnFish(player);
    }

    // 3. Initial Power-ups
    for (let i = 0; i < 3; i++) {
      this.spawnPowerUp();
    }
  }

  spawnToken() {
    const x = Math.random() * this.worldWidth;
    const y = Math.random() * this.worldHeight;
    const rand = Math.random();
    let params = 0.5;
    if (rand > 0.85) params = 7;
    else if (rand > 0.5) params = 1.5;

    this.tokens.push(new TokenCrystal(x, y, params));
  }

  spawnPowerUp() {
    const x = Math.random() * this.worldWidth;
    const y = Math.random() * this.worldHeight;
    const types = ['battery', 'shield', 'magnet', 'speed'];
    const type = types[Math.floor(Math.random() * types.length)];
    this.powerUps.push(new PowerUp(x, y, type));
  }

  spawnFish(player, forceParams = null, forceSpecies = null) {
    // Spawn at distance from player so they don't immediately collide
    let x, y, dist;
    let attempts = 0;
    do {
      x = Math.random() * this.worldWidth;
      y = Math.random() * this.worldHeight;
      dist = Math.hypot(x - player.x, y - player.y);
      attempts++;
    } while (dist < 400 && attempts < 10);

    const speciesKey = forceSpecies || this.speciesKeys[Math.floor(Math.random() * this.speciesKeys.length)];

    let params = 1.5;
    if (forceParams !== null) {
      params = forceParams;
    } else {
      // Dynamic scaling according to player parameters
      const pParams = player.params;
      const roll = Math.random();
      if (roll < 0.55) {
        // 55% Smaller food (0.3x ~ 0.8x of player)
        params = Math.max(0.8, pParams * (0.25 + Math.random() * 0.55));
      } else if (roll < 0.80) {
        // 25% Equal competition (0.8x ~ 1.2x of player)
        params = pParams * (0.8 + Math.random() * 0.4);
      } else {
        // 20% Bigger predators (1.3x ~ 2.2x of player)
        params = pParams * (1.3 + Math.random() * 0.9);
      }
    }

    const fish = new Fish(x, y, speciesKey, params);
    this.fishList.push(fish);
    return fish;
  }

  spawnBoss(player) {
    // Spawns a Closed Source Titan Shark / Giant
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = player.x; y = 50; }
    else if (side === 1) { x = this.worldWidth - 50; y = player.y; }
    else if (side === 2) { x = player.x; y = this.worldHeight - 50; }
    else { x = 50; y = player.y; }

    const boss = new Fish(x, y, 'grok', Math.max(800, player.params * 2.5));
    boss.species.name = 'Closed-Source Titan 🤖';
    boss.baseSpeed = 3.5;
    this.fishList.push(boss);
    this.hasActiveBoss = true;

    if (window.particleSystem) {
      window.particleSystem.addFloatingText(player.x, player.y - 100, '⚠️ 警告：Closed Source 巨兽正在巡航！', '#ef4444', 22);
    }
  }

  update(player) {
    // 1. Maintain Population
    while (this.tokens.length < this.maxTokens) {
      this.spawnToken();
    }
    while (this.fishList.length < this.maxFish) {
      this.spawnFish(player);
    }
    if (this.powerUps.length < this.maxPowerUps && Math.random() < 0.008) {
      this.spawnPowerUp();
    }

    // 2. Boss Timer
    this.bossTimer++;
    if (this.bossTimer >= this.bossInterval && !this.hasActiveBoss) {
      this.bossTimer = 0;
      this.spawnBoss(player);
    }

    // 3. Update Tokens & Magnet Interaction
    const magnetRadius = player.getMagnetRadius();
    for (let t of this.tokens) {
      t.update(this.worldWidth, this.worldHeight);

      // Check distance to player for magnet suction
      const distToPlayer = Math.hypot(player.x - t.x, player.y - t.y);
      if (distToPlayer < magnetRadius) {
        const pullForce = 2.5 * (1 - distToPlayer / magnetRadius);
        t.pullTowards(player.x, player.y, pullForce);
      }

      // Check distance to MoE helper whales
      if (player.moeActive) {
        for (let h of player.moeHelpers) {
          const hx = player.x + Math.cos(h.angle) * h.distance;
          const hy = player.y + Math.sin(h.angle) * h.distance;
          const distToHelper = Math.hypot(hx - t.x, hy - t.y);
          if (distToHelper < 120) {
            t.pullTowards(hx, hy, 2.0);
          }
        }
      }
    }

    // 4. Update PowerUps
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.update(this.worldWidth, this.worldHeight);
      if (p.isDead) {
        this.powerUps.splice(i, 1);
      }
    }

    // 5. Update AI Fish Behavior
    for (let fish of this.fishList) {
      this.updateFishAI(fish, player);
      fish.update(this.worldWidth, this.worldHeight);
    }
  }

  // AI Decision Logic (Flee / Hunt / Wander)
  updateFishAI(fish, player) {
    fish.changeDirTimer--;

    const distToPlayer = Math.hypot(player.x - fish.x, player.y - fish.y);
    const isPlayerBigger = player.params > fish.params * 1.05;
    const isFishBigger = fish.params > player.params * 1.05;

    // 1. Reactive to Player
    if (distToPlayer < 240) {
      if (isPlayerBigger) {
        // Flee from player
        fish.aiState = 'flee';
        fish.targetAngle = Math.atan2(fish.y - player.y, fish.x - player.x);
        fish.currentSpeed = fish.baseSpeed * 1.4;
        return;
      } else if (isFishBigger && distToPlayer < 200 && !player.shieldActive) {
        // Hunt player!
        fish.aiState = 'hunt';
        fish.targetAngle = Math.atan2(player.y - fish.y, player.x - fish.x);
        fish.currentSpeed = fish.baseSpeed * 1.25;
        return;
      }
    }

    // 2. Natural Grazing & Hunting smaller AI/Tokens
    if (fish.changeDirTimer <= 0) {
      fish.changeDirTimer = 60 + Math.random() * 120;
      fish.currentSpeed = fish.baseSpeed;

      // Scan for nearest smaller target or token
      let nearestTarget = null;
      let minDist = 180;

      for (let other of this.fishList) {
        if (other !== fish && fish.params > other.params * 1.1) {
          const d = Math.hypot(other.x - fish.x, other.y - fish.y);
          if (d < minDist) {
            minDist = d;
            nearestTarget = other;
          }
        }
      }

      if (nearestTarget) {
        fish.targetAngle = Math.atan2(nearestTarget.y - fish.y, nearestTarget.x - fish.x);
      } else {
        // Random wandering curve
        fish.targetAngle += (Math.random() - 0.5) * 1.2;
      }
    }
  }

  render(ctx, camera) {
    // Render Tokens
    for (let t of this.tokens) {
      t.render(ctx, camera);
    }

    // Render Power-ups
    for (let p of this.powerUps) {
      p.render(ctx, camera);
    }

    // Render Fish
    for (let f of this.fishList) {
      f.render(ctx, camera);
    }
  }
}

window.AISpawner = AISpawner;
