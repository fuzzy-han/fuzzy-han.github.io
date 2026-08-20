/**
 * UI Manager & Mobile Touch Controls & Radar Minimap
 */

const ACHIEVEMENTS_DEF = [
  { id: 'first_eat', title: '初次蒸馏', desc: '吃掉第一个 AI 鱼类', icon: '🍼' },
  { id: 'reach_7b', title: '7B 筑基', desc: '参数量达到 7B', icon: '⚡' },
  { id: 'reach_70b', title: '开源巨鲲', desc: '参数量达到 70B', icon: '🐋' },
  { id: 'reach_671b', title: '满血 R1 领主', desc: '参数量达到 671B 满血状态', icon: '👑' },
  { id: 'eat_chatgpt', title: '闭源突围', desc: '成功吞噬一只 ChatGPT 鱼', icon: '🟢' },
  { id: 'eat_claude', title: '超越 Sonnet', desc: '成功吞噬一只 Claude 鱼', icon: '🟠' },
  { id: 'eat_grok', title: '极速猎杀', desc: '成功吞噬一只 Grok 鲨鱼', icon: '⚡' },
  { id: 'combo_5', title: '五连超频', desc: '达成 5 连击 Combo', icon: '🔥' },
  { id: 'use_moe', title: '专家集群', desc: '成功释放 MoE 专家分发助手', icon: '✨' },
  { id: 'use_shield', title: '绝对防御', desc: '激活开源无敌护盾并弹开敌对巨头', icon: '🛡️' }
];

class UIManager {
  constructor() {
    // DOM elements
    this.hud = document.getElementById('hud');
    this.startScreen = document.getElementById('startScreen');
    this.pauseScreen = document.getElementById('pauseScreen');
    this.gameOverScreen = document.getElementById('gameOverScreen');
    this.evolutionNotice = document.getElementById('evolutionNotice');
    this.floatingBannerContainer = document.getElementById('floatingBannerContainer');

    // HUD Elements
    this.playerStageTag = document.getElementById('playerStageTag');
    this.paramCount = document.getElementById('paramCount');
    this.expFill = document.getElementById('expFill');
    this.expText = document.getElementById('expText');
    this.scoreDisplay = document.getElementById('scoreDisplay');
    this.comboDisplay = document.getElementById('comboDisplay');
    this.timerDisplay = document.getElementById('timerDisplay');
    this.staminaFill = document.getElementById('staminaFill');
    this.staminaText = document.getElementById('staminaText');

    // Desktop Skill Overlays
    this.cdDash = document.getElementById('cdDash');
    this.cdMoe = document.getElementById('cdMoe');
    this.cdShield = document.getElementById('cdShield');

    // Mobile Skill Overlays & Meters
    this.mStaminaFill = document.getElementById('mStaminaFill');
    this.mCdMoe = document.getElementById('mCdMoe');
    this.mCdShield = document.getElementById('mCdShield');

    // Minimap
    this.minimapCanvas = document.getElementById('minimapCanvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.radarAngle = 0;

    // Buttons
    this.btnSound = document.getElementById('btnSound');
    this.btnPause = document.getElementById('btnPause');
    this.btnStartGame = document.getElementById('btnStartGame');
    this.btnResume = document.getElementById('btnResume');
    this.btnRestart = document.getElementById('btnRestart');
    this.btnRestartFromPause = document.getElementById('btnRestartFromPause');

    // Mobile Touch Elements
    this.touchMoveZone = document.getElementById('touchMoveZone');
    this.floatingJoystick = document.getElementById('floatingJoystick');
    this.joystickKnob = document.getElementById('joystickKnob');
    this.btnTouchDash = document.getElementById('btnTouchDash');
    this.btnTouchMoe = document.getElementById('btnTouchMoe');
    this.btnTouchShield = document.getElementById('btnTouchShield');

    // Achievements state
    this.unlockedAchievements = new Set(JSON.parse(localStorage.getItem('ai_fish_achievements') || '[]'));
    this.highScore = parseInt(localStorage.getItem('ai_fish_highscore') || '0', 10);

    this.initEvents();
  }

  initEvents() {
    // Unlock Audio Context on any user interaction (essential for mobile safari / chrome)
    const unlockAudio = () => {
      window.soundManager.init();
      window.soundManager.resume();
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('mousedown', unlockAudio);
    };
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('mousedown', unlockAudio);

    // Sound toggle
    this.btnSound.addEventListener('click', () => {
      const enabled = window.soundManager.toggle();
      this.btnSound.textContent = enabled ? '🔊' : '🔇';
    });

    // Pause toggle
    this.btnPause.addEventListener('click', () => {
      if (window.game) window.game.togglePause();
    });

    this.btnResume.addEventListener('click', () => {
      if (window.game) window.game.togglePause();
    });

    // Restart
    this.btnRestart.addEventListener('click', () => {
      if (window.game) window.game.restart();
    });

    this.btnRestartFromPause.addEventListener('click', () => {
      if (window.game) window.game.restart();
    });

    // Start Game
    this.btnStartGame.addEventListener('click', () => {
      window.soundManager.init();
      window.soundManager.resume();
      window.soundManager.startBGM();
      if (window.game) window.game.start();
    });

    // Setup desktop skill click listeners
    const skillDash = document.getElementById('skillDash');
    if (skillDash) {
      skillDash.addEventListener('mousedown', () => {
        if (window.game && window.game.player) window.game.player.triggerDash(true);
      });
    }
    window.addEventListener('mouseup', () => {
      if (window.game && window.game.player) window.game.player.triggerDash(false);
    });

    const skillMoe = document.getElementById('skillMoe');
    if (skillMoe) {
      skillMoe.addEventListener('click', () => {
        if (window.game && window.game.player) {
          window.game.player.triggerMoE();
          this.unlockAchievement('use_moe');
        }
      });
    }

    const skillShield = document.getElementById('skillShield');
    if (skillShield) {
      skillShield.addEventListener('click', () => {
        if (window.game && window.game.player) {
          window.game.player.triggerShieldSkill();
          this.unlockAchievement('use_shield');
        }
      });
    }

    // Setup Dynamic Floating Touch Joystick
    this.initTouchControls();
  }

  initTouchControls() {
    if (!this.touchMoveZone) return;

    let touchId = null;
    let originX = 0, originY = 0;
    const maxRadius = 45;

    const handleStart = (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      touchId = touch.identifier;
      originX = touch.clientX;
      originY = touch.clientY;

      // Position floating joystick directly under finger
      this.floatingJoystick.style.left = `${originX}px`;
      this.floatingJoystick.style.top = `${originY}px`;
      this.floatingJoystick.classList.remove('hidden');
      this.joystickKnob.style.transform = `translate(0px, 0px)`;

      // Hide hint text after first touch
      const hint = document.querySelector('.touch-tip-hint');
      if (hint) hint.style.opacity = '0';
    };

    const handleMove = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === touchId) {
          const dx = touch.clientX - originX;
          const dy = touch.clientY - originY;
          const dist = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);

          const clampedDist = Math.min(dist, maxRadius);
          const knobX = Math.cos(angle) * clampedDist;
          const knobY = Math.sin(angle) * clampedDist;

          this.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

          if (window.game && window.game.player) {
            window.game.player.isMouseControl = true;
            window.game.player.targetAngle = angle;
            window.game.player.inputTarget.x = window.game.player.x + Math.cos(angle) * 180;
            window.game.player.inputTarget.y = window.game.player.y + Math.sin(angle) * 180;
          }
          break;
        }
      }
    };

    const handleEnd = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) {
          touchId = null;
          this.floatingJoystick.classList.add('hidden');
          this.joystickKnob.style.transform = `translate(0px, 0px)`;
          break;
        }
      }
    };

    this.touchMoveZone.addEventListener('touchstart', handleStart, { passive: false });
    this.touchMoveZone.addEventListener('touchmove', handleMove, { passive: false });
    this.touchMoveZone.addEventListener('touchend', handleEnd, { passive: false });
    this.touchMoveZone.addEventListener('touchcancel', handleEnd, { passive: false });

    // Touch skills (Dash, MoE, Shield)
    if (this.btnTouchDash) {
      this.btnTouchDash.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.game && window.game.player) window.game.player.triggerDash(true);
      }, { passive: false });

      this.btnTouchDash.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.game && window.game.player) window.game.player.triggerDash(false);
      }, { passive: false });
    }

    if (this.btnTouchMoe) {
      this.btnTouchMoe.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.game && window.game.player) {
          window.game.player.triggerMoE();
          this.unlockAchievement('use_moe');
        }
      }, { passive: false });
    }

    if (this.btnTouchShield) {
      this.btnTouchShield.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.game && window.game.player) {
          window.game.player.triggerShieldSkill();
          this.unlockAchievement('use_shield');
        }
      }, { passive: false });
    }
  }

  showEvolutionNotice(stage) {
    document.getElementById('evoStageName').textContent = stage.name;
    document.getElementById('evoBuffText').textContent = stage.buff;
    this.evolutionNotice.classList.remove('hidden');

    setTimeout(() => {
      this.evolutionNotice.classList.add('hidden');
    }, 3200);
  }

  unlockAchievement(id) {
    if (this.unlockedAchievements.has(id)) return;
    const ach = ACHIEVEMENTS_DEF.find(a => a.id === id);
    if (!ach) return;

    this.unlockedAchievements.add(id);
    localStorage.setItem('ai_fish_achievements', JSON.stringify([...this.unlockedAchievements]));

    this.showBanner(`${ach.icon} 成就解锁：${ach.title} - ${ach.desc}`);
    window.soundManager.playEvolution();
  }

  showBanner(msg) {
    const el = document.createElement('div');
    el.className = 'banner-item';
    el.textContent = msg;
    this.floatingBannerContainer.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2200);
  }

  updateHUD(player, survivalSeconds) {
    // 1. Parameter display
    this.paramCount.textContent = `${player.params.toFixed(2)} B`;

    // 2. Stage & Level progress
    const stage = player.getCurrentStage();
    this.playerStageTag.textContent = stage.name.split(' ')[1] || stage.name;

    const nextMin = stage.minParams;
    const nextMax = stage.maxParams === 99999 ? stage.minParams * 1.5 : stage.maxParams;
    const progress = Math.min(100, Math.max(0, ((player.params - nextMin) / (nextMax - nextMin)) * 100));
    this.expFill.style.width = `${progress}%`;
    this.expText.textContent = `${player.params.toFixed(1)}B / ${nextMax.toFixed(0)}B`;

    // 3. Metrics
    this.scoreDisplay.textContent = player.score.toLocaleString();
    this.comboDisplay.textContent = `x${player.combo}`;
    if (player.combo >= 5) {
      this.unlockAchievement('combo_5');
    }

    const mins = Math.floor(survivalSeconds / 60).toString().padStart(2, '0');
    const secs = (survivalSeconds % 60).toString().padStart(2, '0');
    if (this.timerDisplay) this.timerDisplay.textContent = `${mins}:${secs}`;

    // 4. Stamina
    const stamPercent = Math.round((player.stamina / player.maxStamina) * 100);
    if (this.staminaFill) this.staminaFill.style.width = `${stamPercent}%`;
    if (this.staminaText) this.staminaText.textContent = `${stamPercent}%`;
    if (this.mStaminaFill) this.mStaminaFill.style.width = `${stamPercent}%`;

    // 5. Skill Cooldown Overlays (Desktop & Mobile)
    const moeCdRatio = (player.moeCooldown / player.moeCooldownMax) * 100;
    const shieldCdRatio = (player.shieldCooldown / player.shieldCooldownMax) * 100;

    if (this.cdMoe) this.cdMoe.style.height = `${moeCdRatio}%`;
    if (this.cdShield) this.cdShield.style.height = `${shieldCdRatio}%`;
    if (this.mCdMoe) this.mCdMoe.style.height = `${moeCdRatio}%`;
    if (this.mCdShield) this.mCdShield.style.height = `${shieldCdRatio}%`;

    // Check parameter milestones for achievements
    if (player.params >= 7) this.unlockAchievement('reach_7b');
    if (player.params >= 70) this.unlockAchievement('reach_70b');
    if (player.params >= 671) this.unlockAchievement('reach_671b');
  }

  renderMinimap(player, spawner) {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const worldW = spawner.worldWidth;
    const worldH = spawner.worldHeight;

    ctx.clearRect(0, 0, w, h);

    // 1. Radar Background Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 216, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 4, 0, Math.PI * 2);
    ctx.stroke();

    // Radar Sweep Line
    this.radarAngle += 0.04;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(this.radarAngle) * (w / 2), h / 2 + Math.sin(this.radarAngle) * (h / 2));
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.stroke();
    ctx.restore();

    // 2. Draw Fish Dots
    for (let f of spawner.fishList) {
      const mx = (f.x / worldW) * w;
      const my = (f.y / worldH) * h;

      ctx.beginPath();
      ctx.arc(mx, my, f.params > player.params * 1.05 ? 2.8 : 1.8, 0, Math.PI * 2);
      ctx.fillStyle = f.params > player.params * 1.05 ? '#ef4444' : '#10b981';
      ctx.fill();
    }

    // 3. Draw Player Dot
    const px = (player.x / worldW) * w;
    const py = (player.y / worldH) * h;
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;
    ctx.fill();
  }

  showGameOver(player, killerName = 'Closed Source 巨兽') {
    if (player.score > this.highScore) {
      this.highScore = player.score;
      localStorage.setItem('ai_fish_highscore', this.highScore.toString());
    }

    document.getElementById('resultReason').textContent = `被强大的 ${killerName} 吃掉了！不断进化重返深海吧！`;
    document.getElementById('finalParams').textContent = `${player.params.toFixed(2)} B`;
    document.getElementById('finalScore').textContent = player.score.toLocaleString();
    document.getElementById('bestScore').textContent = this.highScore.toLocaleString();
    document.getElementById('finalEatenCount').textContent = `${player.eatenCount} 只`;

    const list = document.getElementById('endAchievementsList');
    list.innerHTML = '';
    ACHIEVEMENTS_DEF.forEach(a => {
      if (this.unlockedAchievements.has(a.id)) {
        const tag = document.createElement('span');
        tag.className = 'achieve-badge';
        tag.textContent = `${a.icon} ${a.title}`;
        list.appendChild(tag);
      }
    });

    this.gameOverScreen.classList.remove('hidden');
    window.soundManager.playGameOver();
  }
}

window.UIManager = UIManager;
