/**
 * AI Universe Smackdown · Interactive Battle Arena & Comic Animation
 */

class SmackdownArena {
  constructor() {
    this.stage = document.getElementById('battleStage');
    this.combatFeed = document.getElementById('combatFeed');
    this.roundDisplay = document.getElementById('arenaRoundText');

    this.p1FighterEl = document.getElementById('p1Entity');
    this.p2FighterEl = document.getElementById('p2Entity');
    this.p1SpriteEl = document.getElementById('p1Sprite');
    this.p2SpriteEl = document.getElementById('p2Sprite');
    this.p1NameEl = document.getElementById('p1Name');
    this.p2NameEl = document.getElementById('p2Name');
    this.p1HpFill = document.getElementById('p1HpFill');
    this.p2HpFill = document.getElementById('p2HpFill');
    this.p1HpText = document.getElementById('p1HpText');
    this.p2HpText = document.getElementById('p2HpText');

    this.fighters = {
      gemini: {
        id: 'gemini',
        name: 'Gemini 3.7 Flash',
        title: '⚡ 混合双核·光速超脑',
        emoji: '🤖',
        maxHp: 100,
        skills: [
          { name: '150t/s 光速思维炮', dmg: 26, comic: '⚡ SOTA!', roast: '150 tok/s 极速穿透！毫无延迟！' },
          { name: 'SWE-bench 反向修Bug斩', dmg: 35, comic: '💥 PATCHED!', roast: '70.3% 修复命中！你的崩溃栈被重写了！' },
          { name: '1M 上下文黑洞', dmg: 48, comic: '🌌 VORTEX!', roast: '百万上下文全量吞噬！' }
        ]
      },
      openai: {
        id: 'openai',
        name: 'OpenAI o3-mini',
        title: '🍓 深度草莓沉思者',
        emoji: '🍓',
        maxHp: 95,
        skills: [
          { name: '40秒草莓沉思', dmg: 18, comic: '⏳ THINKING...', roast: '*沉思中...* 给我40秒思考人生！' },
          { name: '草莓流星轰炸', dmg: 30, comic: '🍓 SPLASH!', roast: '草莓大炮发射！思考Token拉满！' },
          { name: '高峰期排队暴击', dmg: 42, comic: '🛑 OVERLOAD!', roast: '【Capacity Exceeded】请稍后重试！' }
        ]
      },
      claude: {
        id: 'claude',
        name: 'Claude 3.7 Sonnet',
        title: '📜 哲学免责诗人',
        emoji: '🎩',
        maxHp: 95,
        skills: [
          { name: '3000字安全免责声明', dmg: 20, comic: '📜 DISCLAIMER!', roast: '首先，我必须以严谨态度提醒您...' },
          { name: '哲学长文伦理冲击', dmg: 32, comic: '🖋️ ESSAY!', roast: '以十四行诗格式对你展开伦理教育！' },
          { name: '额度耗尽警告', dmg: 44, comic: '🚫 LIMIT!', roast: '下午5点前还剩2条额度，请节约使用！' }
        ]
      },
      deepseek: {
        id: 'deepseek',
        name: 'DeepSeek R1',
        title: '🐋 671B 开源蓝鲸',
        emoji: '🐋',
        maxHp: 90,
        skills: [
          { name: '开源真香冲击', dmg: 22, comic: '🐋 OPEN-SOURCE!', roast: '梁总神算！671B 降维打击！' },
          { name: 'MoE 专家集群冲撞', dmg: 34, comic: '🌪️ SWARM!', roast: '专家路由启动！每个专家踢你一脚！' },
          { name: '服务器繁忙 503 绝杀', dmg: 46, comic: '⚠️ ERROR 503!', roast: '【503】服务器繁忙，请稍后再试！' }
        ]
      }
    };

    this.p1Current = 'gemini';
    this.p2Current = 'openai';
    this.p1Hp = 100;
    this.p2Hp = 100;
    this.isBusy = false;
    this.autoMatchInterval = null;

    this.init();
  }

  init() {
    const p1Btns = document.querySelectorAll('.p1-select');
    p1Btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        p1Btns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.p1Current = btn.dataset.fighter;
        this.resetMatch();
      });
    });

    const p2Btns = document.querySelectorAll('.p2-select');
    p2Btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        p2Btns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.p2Current = btn.dataset.fighter;
        this.resetMatch();
      });
    });

    const s1 = document.getElementById('skillBtn1');
    const s2 = document.getElementById('skillBtn2');
    const s3 = document.getElementById('skillBtn3');
    const autoBtn = document.getElementById('autoBattleBtn');
    const resetBtn = document.getElementById('resetBattleBtn');

    if (s1) s1.addEventListener('click', () => this.usePlayerSkill(0));
    if (s2) s2.addEventListener('click', () => this.usePlayerSkill(1));
    if (s3) s3.addEventListener('click', () => this.usePlayerSkill(2));

    if (autoBtn) {
      autoBtn.addEventListener('click', () => this.toggleAutoBattle());
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetMatch());
    }

    this.resetMatch();
  }

  resetMatch() {
    if (this.autoMatchInterval) {
      clearInterval(this.autoMatchInterval);
      this.autoMatchInterval = null;
      const autoBtn = document.getElementById('autoBattleBtn');
      if (autoBtn) autoBtn.textContent = '⚔️ 自动观战';
    }

    const p1 = this.fighters[this.p1Current];
    const p2 = this.fighters[this.p2Current];

    this.p1Hp = p1.maxHp;
    this.p2Hp = p2.maxHp;
    this.isBusy = false;

    if (this.p1NameEl) this.p1NameEl.textContent = p1.name;
    if (this.p2NameEl) this.p2NameEl.textContent = p2.name;

    if (this.p1SpriteEl) this.p1SpriteEl.textContent = p1.emoji;
    if (this.p2SpriteEl) this.p2SpriteEl.textContent = p2.emoji;

    const s1 = document.getElementById('skillBtn1');
    const s2 = document.getElementById('skillBtn2');
    const s3 = document.getElementById('skillBtn3');

    if (s1 && p1.skills[0]) s1.innerHTML = p1.skills[0].name;
    if (s2 && p1.skills[1]) s2.innerHTML = p1.skills[1].name;
    if (s3 && p1.skills[2]) s3.innerHTML = p1.skills[2].name;

    this.updateHpBars();

    if (this.combatFeed) {
      this.combatFeed.innerHTML = `
        <div class="feed-item highlight">🏆 对决开始：${p1.name} VS ${p2.name}</div>
      `;
    }
  }

  updateHpBars() {
    const p1 = this.fighters[this.p1Current];
    const p2 = this.fighters[this.p2Current];

    const p1Pct = Math.max(0, Math.round((this.p1Hp / p1.maxHp) * 100));
    const p2Pct = Math.max(0, Math.round((this.p2Hp / p2.maxHp) * 100));

    if (this.p1HpFill) this.p1HpFill.style.width = `${p1Pct}%`;
    if (this.p2HpFill) this.p2HpFill.style.width = `${p2Pct}%`;

    if (this.p1HpText) this.p1HpText.textContent = `${this.p1Hp} HP`;
    if (this.p2HpText) this.p2HpText.textContent = `${this.p2Hp} HP`;
  }

  triggerScreenShake() {
    if (!this.stage) return;
    this.stage.classList.remove('screen-shake');
    void this.stage.offsetWidth;
    this.stage.classList.add('screen-shake');
    setTimeout(() => this.stage.classList.remove('screen-shake'), 400);
  }

  showComicWord(targetEl, text) {
    if (!targetEl) return;
    const word = document.createElement('div');
    word.className = 'comic-word';
    word.textContent = text;
    word.style.left = `${Math.random() * 40 + 20}%`;
    word.style.top = '10px';
    targetEl.appendChild(word);
    setTimeout(() => word.remove(), 700);
  }

  usePlayerSkill(skillIdx) {
    if (this.isBusy || this.p1Hp <= 0 || this.p2Hp <= 0) return;
    this.isBusy = true;

    const p1 = this.fighters[this.p1Current];
    const p2 = this.fighters[this.p2Current];
    const skill = p1.skills[skillIdx] || p1.skills[0];

    if (this.p1FighterEl) this.p1FighterEl.classList.add('attacking');
    this.showRoastBubble(this.p1FighterEl, skill.roast);

    if (window.soundEngine) {
      if (skillIdx === 2) window.soundEngine.playExplosion();
      else if (skillIdx === 0) window.soundEngine.playLaser();
      else window.soundEngine.playHit();
    }

    setTimeout(() => {
      if (this.p1FighterEl) this.p1FighterEl.classList.remove('attacking');

      const dmg = skill.dmg + Math.floor(Math.random() * 5);
      this.p2Hp = Math.max(0, this.p2Hp - dmg);
      this.updateHpBars();

      this.triggerScreenShake();
      if (this.p2FighterEl) {
        this.p2FighterEl.classList.add('hurt');
        this.showComicWord(this.p2FighterEl, skill.comic);
        this.showDamageNumber(this.p2FighterEl, `-${dmg}`);
      }

      this.logFeed(`💥 <strong>${p1.name}</strong> 施展【${skill.name}】，造成 ${dmg} 伤害！`, 'highlight');

      setTimeout(() => {
        if (this.p2FighterEl) this.p2FighterEl.classList.remove('hurt');

        if (this.p2Hp <= 0) {
          this.handleVictory(p1, p2);
          return;
        }

        setTimeout(() => this.p2CounterAttack(), 500);
      }, 350);
    }, 280);
  }

  p2CounterAttack() {
    if (this.p2Hp <= 0) return;

    const p1 = this.fighters[this.p1Current];
    const p2 = this.fighters[this.p2Current];
    const randSkill = p2.skills[Math.floor(Math.random() * p2.skills.length)];

    if (this.p2FighterEl) this.p2FighterEl.classList.add('attacking');
    this.showRoastBubble(this.p2FighterEl, randSkill.roast);

    if (window.soundEngine) window.soundEngine.playHit();

    setTimeout(() => {
      if (this.p2FighterEl) this.p2FighterEl.classList.remove('attacking');

      const dmg = randSkill.dmg + Math.floor(Math.random() * 4);
      this.p1Hp = Math.max(0, this.p1Hp - dmg);
      this.updateHpBars();

      this.triggerScreenShake();
      if (this.p1FighterEl) {
        this.p1FighterEl.classList.add('hurt');
        this.showComicWord(this.p1FighterEl, randSkill.comic);
        this.showDamageNumber(this.p1FighterEl, `-${dmg}`);
      }

      this.logFeed(`⚡ <strong>${p2.name}</strong> 反击【${randSkill.name}】，造成 ${dmg} 伤害！`, 'crit');

      setTimeout(() => {
        if (this.p1FighterEl) this.p1FighterEl.classList.remove('hurt');
        this.isBusy = false;

        if (this.p1Hp <= 0) {
          this.handleVictory(p2, p1);
        }
      }, 350);
    }, 280);
  }

  handleVictory(winner, loser) {
    this.isBusy = true;
    if (window.soundEngine) window.soundEngine.playVictory();
    this.showRoastBubble(
      winner === this.fighters[this.p1Current] ? this.p1FighterEl : this.p2FighterEl,
      `🏆 KO！${winner.name} 获胜！`
    );
    this.logFeed(`🎉 【KO!】${winner.name} 赢得了本场决斗！`, 'highlight');

    if (window.showToast) {
      window.showToast(`👑 ${winner.name} 获胜！`);
    }
  }

  showRoastBubble(targetEl, text) {
    if (!targetEl) return;
    const existing = targetEl.querySelector('.roast-bubble');
    if (existing) existing.remove();

    const bubble = document.createElement('div');
    bubble.className = 'roast-bubble';
    bubble.textContent = text;
    targetEl.appendChild(bubble);

    setTimeout(() => {
      if (bubble.parentElement) bubble.remove();
    }, 2400);
  }

  showDamageNumber(targetEl, text) {
    if (!targetEl) return;
    const pop = document.createElement('div');
    pop.className = 'damage-pop';
    pop.textContent = text;
    pop.style.left = '50%';
    pop.style.top = '10px';
    targetEl.appendChild(pop);

    setTimeout(() => pop.remove(), 700);
  }

  logFeed(html, className = '') {
    if (!this.combatFeed) return;
    const item = document.createElement('div');
    item.className = `feed-item ${className}`;
    item.innerHTML = html;
    this.combatFeed.appendChild(item);
    this.combatFeed.scrollTop = this.combatFeed.scrollHeight;
  }

  toggleAutoBattle() {
    const autoBtn = document.getElementById('autoBattleBtn');
    if (this.autoMatchInterval) {
      clearInterval(this.autoMatchInterval);
      this.autoMatchInterval = null;
      if (autoBtn) autoBtn.textContent = '⚔️ 自动观战';
      return;
    }

    if (this.p1Hp <= 0 || this.p2Hp <= 0) {
      this.resetMatch();
    }

    if (autoBtn) autoBtn.textContent = '⏸️ 暂停';

    this.autoMatchInterval = setInterval(() => {
      if (this.p1Hp <= 0 || this.p2Hp <= 0) {
        clearInterval(this.autoMatchInterval);
        this.autoMatchInterval = null;
        if (autoBtn) autoBtn.textContent = '⚔️ 自动观战';
        return;
      }
      if (!this.isBusy) {
        const randSkill = Math.floor(Math.random() * 3);
        this.usePlayerSkill(randSkill);
      }
    }, 1400);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.smackdownArena = new SmackdownArena();
});
