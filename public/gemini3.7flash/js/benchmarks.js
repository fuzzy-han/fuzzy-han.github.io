/**
 * Benchmark Matrix & Live SOTA Sprint Race
 */

class BenchmarkController {
  constructor() {
    this.currentCategory = 'all';
    this.container = document.getElementById('benchBarsContainer');
    this.canvas = document.getElementById('radarCanvas');
    this.raceBtn = document.getElementById('startRaceBtn');

    this.racers = [
      { id: 'gemini', name: 'Gemini 3.7 Flash', score: 70.3, speed: 1.0, color: '#ffffff' },
      { id: 'claude', name: 'Claude 3.7 Sonnet', score: 70.3, speed: 0.96, color: '#d4a359' },
      { id: 'openai', name: 'OpenAI o3-mini', score: 65.4, speed: 0.88, color: '#10b981' },
      { id: 'deepseek', name: 'DeepSeek R1', score: 49.2, speed: 0.65, color: '#60a5fa' }
    ];

    this.benchmarks = [
      {
        id: 'swe-bench',
        category: 'coding',
        name: 'SWE-bench Verified',
        badge: 'Top Coding Benchmark',
        desc: 'Resolves complex real-world GitHub issues end-to-end.',
        unit: '%',
        max: 100,
        scores: [
          { model: 'Gemini 3.7 Flash', val: 70.3, highlight: true, class: 'gemini' },
          { model: 'Claude 3.7 Sonnet', val: 70.3, highlight: false, class: 'claude' },
          { model: 'OpenAI o3-mini', val: 65.4, highlight: false, class: 'openai' },
          { model: 'DeepSeek R1', val: 49.2, highlight: false, class: 'deepseek' }
        ]
      },
      {
        id: 'livecodebench',
        category: 'coding',
        name: 'LiveCodeBench (2024-2025)',
        badge: 'Zero Contamination',
        desc: 'Fresh algorithmic coding problems post-cutoff.',
        unit: '%',
        max: 100,
        scores: [
          { model: 'Gemini 3.7 Flash', val: 73.5, highlight: true, class: 'gemini' },
          { model: 'OpenAI o3-mini', val: 71.0, highlight: false, class: 'openai' },
          { model: 'Claude 3.7 Sonnet', val: 70.8, highlight: false, class: 'claude' },
          { model: 'DeepSeek R1', val: 65.9, highlight: false, class: 'deepseek' }
        ]
      },
      {
        id: 'gpqa',
        category: 'math',
        name: 'GPQA Diamond (PhD Science)',
        badge: 'Expert Science & Logic',
        desc: 'Google-proof PhD level questions by domain experts.',
        unit: '%',
        max: 100,
        scores: [
          { model: 'Gemini 3.7 Flash', val: 84.8, highlight: true, class: 'gemini' },
          { model: 'Claude 3.7 Sonnet', val: 84.8, highlight: false, class: 'claude' },
          { model: 'OpenAI o3-mini', val: 79.7, highlight: false, class: 'openai' },
          { model: 'DeepSeek R1', val: 71.5, highlight: false, class: 'deepseek' }
        ]
      },
      {
        id: 'speed-tps',
        category: 'speed',
        name: 'Output Speed Throughput',
        badge: '150+ tok/s Ultra Stream',
        desc: 'Streaming output generation speed in production.',
        unit: 'tok/s',
        max: 200,
        scores: [
          { model: 'Gemini 3.7 Flash', val: 165, highlight: true, class: 'gemini' },
          { model: 'OpenAI o3-mini', val: 95, highlight: false, class: 'openai' },
          { model: 'Claude 3.7 Sonnet', val: 75, highlight: false, class: 'claude' },
          { model: 'DeepSeek R1', val: 40, highlight: false, class: 'deepseek' }
        ]
      }
    ];

    this.radarAxes = [
      { name: 'SWE-bench', key: 'swe' },
      { name: 'LiveCode', key: 'code' },
      { name: 'GPQA PhD', key: 'gpqa' },
      { name: 'AIME Math', key: 'aime' },
      { name: 'Throughput', key: 'speed' }
    ];

    this.radarData = {
      gemini: [0.95, 0.96, 0.95, 0.95, 0.98],
      claude: [0.95, 0.92, 0.95, 0.93, 0.65],
      openai: [0.88, 0.93, 0.89, 0.95, 0.72],
      deepseek: [0.68, 0.84, 0.80, 0.94, 0.45]
    };

    this.init();
  }

  init() {
    const catBtns = document.querySelectorAll('.cat-btn');
    catBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        catBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = btn.dataset.category;
        if (window.soundEngine) window.soundEngine.playClick();
        this.renderBars();
      });
    });

    if (this.raceBtn) {
      this.raceBtn.addEventListener('click', () => this.triggerSprintRace());
    }

    this.renderBars();
    this.initRadar();
  }

  triggerSprintRace() {
    if (window.soundEngine) window.soundEngine.playLaser();
    const tracks = document.querySelectorAll('.racer-runner');
    tracks.forEach((t) => (t.style.width = '0%'));

    if (window.showToast) window.showToast('🏎️ 旗舰 AI 基准冲刺赛启动！');

    setTimeout(() => {
      tracks.forEach((track) => {
        const racerId = track.dataset.racer;
        const racer = this.racers.find((r) => r.id === racerId);
        if (racer) {
          const targetWidth = `${racer.score}%`;
          track.style.width = targetWidth;
        }
      });

      setTimeout(() => {
        if (window.soundEngine) window.soundEngine.playVictory();
        if (window.showToast) window.showToast('🏆 Gemini 3.7 Flash 率先冲线夺冠！');
      }, 1900);
    }, 100);
  }

  renderBars() {
    if (!this.container) return;
    this.container.innerHTML = '';

    const filtered = this.currentCategory === 'all'
      ? this.benchmarks
      : this.benchmarks.filter((b) => b.category === this.currentCategory);

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'benchmark-card';

      let rowsHtml = '';
      item.scores.forEach((s) => {
        const percent = Math.min(100, Math.round((s.val / item.max) * 100));
        rowsHtml += `
          <div class="model-bar-row">
            <div class="model-label ${s.highlight ? 'highlight' : ''}">
              ${s.highlight ? '● ' : ''}${s.model}
            </div>
            <div class="bar-track">
              <div class="bar-fill ${s.class}" style="width: 0%;" data-target="${percent}%"></div>
            </div>
            <div class="model-score ${s.highlight ? 'highlight' : ''}">
              ${s.val}${item.unit}
            </div>
          </div>
        `;
      });

      card.innerHTML = `
        <div class="bench-header">
          <div class="bench-name">
            ${item.name}
            <span class="bench-badge">${item.badge}</span>
          </div>
        </div>
        <div class="bench-desc">${item.desc}</div>
        <div class="model-bars">
          ${rowsHtml}
        </div>
      `;

      this.container.appendChild(card);
    });

    setTimeout(() => {
      const fills = document.querySelectorAll('.bar-fill');
      fills.forEach((fill) => {
        fill.style.width = fill.dataset.target;
      });
    }, 40);
  }

  initRadar() {
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resizeRadar();
    window.addEventListener('resize', () => {
      this.resizeRadar();
      this.drawRadar();
    });
    this.drawRadar();
  }

  resizeRadar() {
    if (!this.canvas) return;
    const size = Math.min(280, this.canvas.parentElement.clientWidth || 260);
    this.canvas.width = size * window.devicePixelRatio;
    this.canvas.height = size * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.size = size;
  }

  drawRadar() {
    if (!this.ctx || !this.size) return;
    const ctx = this.ctx;
    const center = this.size / 2;
    const radius = this.size * 0.36;
    const count = this.radarAxes.length;

    ctx.clearRect(0, 0, this.size, this.size);

    // Subtle concentric polygon rings
    for (let l = 1; l <= 3; l++) {
      const r = (radius / 3) * l;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
        const x = center + Math.cos(angle) * r;
        const y = center + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Axes & text
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#94a3b8';

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      const lx = center + Math.cos(angle) * (radius + 16);
      const ly = center + Math.sin(angle) * (radius + 16);
      ctx.fillText(this.radarAxes[i].name, lx, ly);
    }

    // Draw model polygons
    const models = [
      { key: 'deepseek', color: '#60a5fa', border: '#60a5fa' },
      { key: 'claude', color: '#d4a359', border: '#d4a359' },
      { key: 'openai', color: '#10b981', border: '#10b981' },
      { key: 'gemini', color: '#ffffff', border: '#ffffff', glow: true }
    ];

    models.forEach((m) => {
      const values = this.radarData[m.key];
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
        const val = values[i];
        const x = center + Math.cos(angle) * (radius * val);
        const y = center + Math.sin(angle) * (radius * val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.strokeStyle = m.border;
      ctx.lineWidth = m.glow ? 2 : 1;
      ctx.stroke();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.benchmarkController = new BenchmarkController();
});
