/**
 * Player Entity (DeepSeek Whale)
 * Features parameter growth milestones, R1 dash, MoE assistants, and shield mechanics.
 */

const EVOLUTION_STAGES = [
  { minParams: 0, maxParams: 7, name: 'DeepSeek 7B 幼鲸', buff: '初始轻巧体态' },
  { minParams: 7, maxParams: 32, name: 'DeepSeek-Coder (14B)', buff: '游速提升，解锁代码尾焰' },
  { minParams: 32, maxParams: 70, name: 'DeepSeek-V2 (67B 群岛巨鲸)', buff: '体型与捕食磁力大幅提升' },
  { minParams: 70, maxParams: 236, name: 'DeepSeek-V3 (236B MoE巨鲲)', buff: '解锁 MoE 助手专家鱼群' },
  { minParams: 236, maxParams: 671, name: 'DeepSeek-R1 (671B 满血推理座头鲸)', buff: '深度思考冲刺威力爆发！' },
  { minParams: 671, maxParams: 99999, name: 'DeepSeek-AGI (终极蓝鲸领主)', buff: '深海完全统治者，巨量吸附' }
];

class Player extends Fish {
  constructor(x, y) {
    super(x, y, 'deepseek', 1.5);
    
    // Growth & Score
    this.score = 0;
    this.eatenCount = 0;
    this.stageIndex = 0;
    
    // Input state
    this.inputTarget = { x: this.x, y: this.y };
    this.isMouseControl = true;
    this.keys = { up: false, down: false, left: false, right: false, dash: false };
    
    // Skills & Energy
    this.maxStamina = 100;
    this.stamina = 100;
    this.staminaRegen = 0.35;
    
    this.isDashing = false;
    this.dashCostPerFrame = 0.9;
    
    // MoE Mini Helper Whales
    this.moeActive = false;
    this.moeDuration = 0;
    this.moeCooldown = 0;
    this.moeCooldownMax = 720; // 12s at 60fps
    this.moeHelpers = []; // Array of mini helper positions
    
    // Shield
    this.shieldActive = false;
    this.shieldDuration = 0;
    this.shieldCooldown = 0;
    this.shieldCooldownMax = 1080; // 18s at 60fps
    
    // Buffs
    this.magnetDuration = 0;
    this.speedBuffDuration = 0;
    
    // Combo system
    this.combo = 1;
    this.comboTimer = 0;

    // 深海图鉴：记录已吞噬的 AI 大鱼种类（吃完全部 7 只 → 海洋霸主）
    this.eatenSpecies = new Set();

    // 新技能：梯度爆炸狂暴（R）+ 蒸馏冲击波（F）
    this.frenzyActive = false;
    this.frenzyDuration = 0;
    this.frenzyCooldown = 0;
    this.frenzyCooldownMax = 1500; // 25s @60fps
    this.pulseCooldown = 0;
    this.pulseCooldownMax = 1200;  // 20s @60fps
    this.pulseFlash = 0;
    this.pulseRadius = 380;

    this.updateRadius();
  }

  getCurrentStage() {
    for (let i = EVOLUTION_STAGES.length - 1; i >= 0; i--) {
      if (this.params >= EVOLUTION_STAGES[i].minParams) {
        return { index: i, ...EVOLUTION_STAGES[i] };
      }
    }
    return { index: 0, ...EVOLUTION_STAGES[0] };
  }

  eat(entity) {
    let paramGain = 0;
    let scoreGain = 0;

    if (entity instanceof TokenCrystal) {
      paramGain = entity.params * 0.4;
      scoreGain = Math.round(entity.params * 20 * this.combo);
      window.soundManager.playEatToken();
      window.particleSystem.createEatBurst(entity.x, entity.y, entity.color, 10);
    } else if (entity instanceof Fish) {
      paramGain = entity.params * 0.55;
      if (this.frenzyActive) paramGain *= 1.3; // 梯度爆炸：蒸馏效率 +30%
      scoreGain = Math.round(entity.params * 150 * this.combo);
      window.soundManager.playEatFish();
      window.particleSystem.createEatBurst(entity.x, entity.y, entity.species.primaryColor, 24, 1.4);
      
      // 深海图鉴：记录吞噬的大鱼种类
      this.eatenSpecies.add(entity.speciesKey);

      // Floating combat text
      window.particleSystem.addFloatingText(
        entity.x,
        entity.y,
        `+${paramGain.toFixed(1)}B 蒸馏 ${entity.species.name}!`,
        '#00f0ff',
        16
      );
    }

    this.score += scoreGain;
    this.eatenCount++;
    this.addParams(paramGain);

    // Increase combo
    this.combo = Math.min(10, this.combo + 1);
    this.comboTimer = 180; // 3 seconds combo window

    // Check Evolution
    const currentStage = this.getCurrentStage();
    if (currentStage.index > this.stageIndex) {
      this.stageIndex = currentStage.index;
      this.onEvolve(currentStage);
    }
  }

  onEvolve(stage) {
    window.soundManager.playEvolution();
    window.particleSystem.createShockwave(this.x, this.y, this.radius * 2.5, '#00f0ff');
    window.particleSystem.createShockwave(this.x, this.y, this.radius * 3.5, '#a855f7');
    
    if (window.uiManager) {
      window.uiManager.showEvolutionNotice(stage);
    }
  }

  applyPowerUp(powerUp) {
    window.soundManager.playShield();
    window.particleSystem.createEatBurst(powerUp.x, powerUp.y, powerUp.config.color, 20);

    switch (powerUp.type) {
      case 'battery':
        this.stamina = this.maxStamina;
        window.particleSystem.addFloatingText(this.x, this.y, '⚡ 算力瞬间满血！', '#facc15', 18);
        break;
      case 'shield':
        this.activateShield(360); // 6s shield
        window.particleSystem.addFloatingText(this.x, this.y, '🛡️ 开源无敌护盾！', '#38bdf8', 18);
        break;
      case 'magnet':
        this.magnetDuration = 480; // 8s magnet
        window.particleSystem.addFloatingText(this.x, this.y, '🧲 1M 百万上下文广域吸附！', '#ec4899', 18);
        break;
      case 'speed':
        this.speedBuffDuration = 360; // 6s speed
        window.particleSystem.addFloatingText(this.x, this.y, '🚀 KV-Cache 极速超频！', '#a855f7', 18);
        break;
    }
  }

  // --- Skills ---

  triggerDash(active) {
    if (active && this.stamina > 15) {
      if (!this.isDashing) {
        window.soundManager.playDash();
        window.particleSystem.createShockwave(this.x, this.y, 60, '#00f0ff');
      }
      this.isDashing = true;
    } else {
      this.isDashing = false;
    }
  }

  triggerMoE() {
    if (this.moeCooldown > 0) return;
    this.moeCooldown = this.moeCooldownMax;
    this.moeActive = true;
    this.moeDuration = 420; // 7 seconds
    this.moeHelpers = [];

    // Initialize 8 mini MoE Whales
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i;
      this.moeHelpers.push({
        angle,
        distance: 20,
        targetDistance: 120 + Math.random() * 60,
        orbitSpeed: 0.05 + (Math.random() - 0.5) * 0.02
      });
    }

    window.soundManager.playMoE();
    window.particleSystem.createShockwave(this.x, this.y, 140, '#38bdf8');
    window.particleSystem.addFloatingText(this.x, this.y, '✨ 8路 MoE 专家助手全开！', '#38bdf8', 18);
  }

  activateShield(duration = 300) {
    this.shieldActive = true;
    this.shieldDuration = duration;
    this.shieldCooldown = this.shieldCooldownMax;
    window.soundManager.playShield();
    window.particleSystem.createShockwave(this.x, this.y, this.radius * 2, '#38bdf8');
  }

  triggerShieldSkill() {
    if (this.shieldCooldown > 0) return;
    this.activateShield(300); // 5s
  }

  // --- 新技能 ---

  // R 键：梯度爆炸狂暴（移速 +60%，蒸馏效率 +30%，8 秒）
  triggerFrenzy() {
    if (this.frenzyCooldown > 0) return;
    this.frenzyCooldown = this.frenzyCooldownMax;
    this.frenzyActive = true;
    this.frenzyDuration = 480; // 8s @60fps
    window.soundManager.playFrenzy();
    window.particleSystem.createShockwave(this.x, this.y, this.radius * 3, '#fb923c');
    window.particleSystem.createShockwave(this.x, this.y, this.radius * 4.2, '#f97316');
    window.particleSystem.addFloatingText(this.x, this.y, '🔥 梯度爆炸狂暴！移速+60% · 蒸馏+30%', '#fb923c', 18);
  }

  // F 键：蒸馏冲击波（瞬间吞噬范围内小鱼，弹开大鱼）
  triggerPulse() {
    if (this.pulseCooldown > 0) return;
    this.pulseCooldown = this.pulseCooldownMax;
    this.pulseFlash = 14;
    window.soundManager.playPulse();
    window.particleSystem.createShockwave(this.x, this.y, this.pulseRadius + 40, '#a855f7');
    window.particleSystem.addFloatingText(this.x, this.y, '💜 蒸馏冲击波扩散！', '#c084fc', 18);
    if (window.game) window.game.applyPulse(this);
  }

  update(worldWidth, worldHeight) {
    // 1. Cooldowns & Timers
    if (this.moeCooldown > 0) this.moeCooldown--;
    if (this.shieldCooldown > 0) this.shieldCooldown--;
    if (this.frenzyCooldown > 0) this.frenzyCooldown--;
    if (this.pulseCooldown > 0) this.pulseCooldown--;
    if (this.pulseFlash > 0) this.pulseFlash--;

    if (this.frenzyDuration > 0) {
      this.frenzyDuration--;
      if (this.frenzyDuration <= 0) this.frenzyActive = false;
    }

    if (this.moeDuration > 0) {
      this.moeDuration--;
      if (this.moeDuration <= 0) this.moeActive = false;
    }

    if (this.shieldDuration > 0) {
      this.shieldDuration--;
      if (this.shieldDuration <= 0) this.shieldActive = false;
    }

    if (this.magnetDuration > 0) this.magnetDuration--;
    if (this.speedBuffDuration > 0) this.speedBuffDuration--;

    if (this.comboTimer > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) this.combo = 1;
    }

    // 2. Dash & Stamina
    if (this.isDashing) {
      this.stamina -= this.dashCostPerFrame;
      window.particleSystem.createDashTrail(this.x, this.y, this.angle);
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.isDashing = false;
      }
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen);
    }

    // 3. Movement Direction from Input
    if (this.isMouseControl) {
      const dx = this.inputTarget.x - this.x;
      const dy = this.inputTarget.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 15) {
        this.targetAngle = Math.atan2(dy, dx);
      }
    } else {
      // Keyboard WASD
      let moveX = 0;
      let moveY = 0;
      if (this.keys.left) moveX -= 1;
      if (this.keys.right) moveX += 1;
      if (this.keys.up) moveY -= 1;
      if (this.keys.down) moveY += 1;

      if (moveX !== 0 || moveY !== 0) {
        this.targetAngle = Math.atan2(moveY, moveX);
      }
    }

    // 4. Calculate Speed（进化阶段越高游速越快，狂暴再提速）
    let speed = (3.2 - Math.min(1.2, (this.params / 671) * 0.8)) * (1 + this.stageIndex * 0.06);
    if (this.isDashing) speed *= 2.4;
    if (this.speedBuffDuration > 0) speed *= 1.4;
    if (this.frenzyActive) speed *= 1.6;
    this.currentSpeed = speed;

    // 5. Update Base Fish Physics
    super.update(worldWidth, worldHeight);

    // 6. Update MoE Helpers
    if (this.moeActive) {
      for (let h of this.moeHelpers) {
        h.angle += h.orbitSpeed;
        h.distance += (h.targetDistance - h.distance) * 0.05;
      }
    }
  }

  // Get effective magnet pull radius
  getMagnetRadius() {
    let r = this.radius * 2.5;
    if (this.magnetDuration > 0) r = 450;
    if (this.moeActive) r = Math.max(r, 280);
    return r;
  }

  render(ctx, camera) {
    // 1. Render Shield Bubble if active
    if (this.shieldActive) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 1.55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.restore();
    }

    // 2. Render 1M Magnet Aura
    if (this.magnetDuration > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.getMagnetRadius(), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.3)';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 2.5 Render 梯度爆炸狂暴光环
    if (this.frenzyActive) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 1.85, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251, 146, 60, 0.18)';
      ctx.fill();
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#fb923c';
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.restore();
    }

    // 2.6 Render 蒸馏冲击波扩散环
    if (this.pulseFlash > 0) {
      const k = 1 - this.pulseFlash / 14;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, 40 + k * (this.pulseRadius + 40), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(192, 132, 252, ${(1 - k).toFixed(2)})`;
      ctx.lineWidth = 4 + k * 3;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Render MoE Helpers
    if (this.moeActive) {
      for (let h of this.moeHelpers) {
        const hx = this.x + Math.cos(h.angle) * h.distance;
        const hy = this.y + Math.sin(h.angle) * h.distance;

        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(h.angle + Math.PI / 2);

        // Mini Whale Icon
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#00f0ff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;
        ctx.fill();

        ctx.restore();
      }
    }

    // 4. Render Main Whale
    super.render(ctx, camera);
  }
}

window.Player = Player;
window.EVOLUTION_STAGES = EVOLUTION_STAGES;
