/**
 * Interactive Benchmark Matrix & SOTA Radar Chart
 */

class BenchmarkController {
  constructor() {
    this.currentCategory = 'all';
    this.container = document.getElementById('benchBarsContainer');
    this.canvas = document.getElementById('radarCanvas');

    this.benchmarks = [
      {
        id: 'swe-bench',
        category: 'coding',
        name: 'SWE-bench Verified',
        badge: 'Top Frontier Coding',
        desc: 'Resolves complex real-world GitHub issues end-to-end across large repos.',
        unit: '%',
        max: 100,
        scores: [
          { model: 'Gemini 3.7 Flash', val: 70.3, highlight: true, class: 'gemini' },
          { model: 'Claude 3.7 Sonnet', val: 70.3, highlight: false, class: 'claude' },
          { model: 'OpenAI o3-mini (High)', val: 65.4, highlight: false, class: 'openai' },
          { model: 'DeepSeek R1', val: 49.2, highlight: false, class: 'deepseek' }
        ]
      },
      {
        id: 'livecodebench',
        category: 'coding',
        name: 'LiveCodeBench (2024-2025)',
        badge: 'Zero Contamination',
        desc: 'Evaluates fresh algorithmic coding challenges published after training cutoff.',
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
        name: 'GPQA Diamond (Graduate Physics/Bio/Chem)',
        badge: 'Expert Scientific Reasoning',
        desc: 'Google-proof PhD level questions crafted by domain experts.',
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
        id: 'aime',
        category: 'math',
        name: 'AIME 2024 (Math Olympiad)',
        badge: 'High-School Math Olympiad',
        desc: 'American Invitational Mathematics Examination competition problems.',
        unit: '%',
        max: 100,
        scores: [
          { model: 'Gemini 3.7 Flash', val: 80.0, highlight: true, class: 'gemini' },
          { model: 'OpenAI o3-mini', val: 80.0, highlight: false, class: 'openai' },
          { model: 'Claude 3.7 Sonnet', val: 79.0, highlight: false, class: 'claude' },
          { model: 'DeepSeek R1', val: 79.8, highlight: false, class: 'deepseek' }
        ]
      },
      {
        id: 'mmmu',
        category: 'multimodal',
        name: 'MMMU (Multimodal College Exam)',
        badge: 'Vision & Diagram Understanding',
        desc: 'College-level multi-discipline visual understanding and diagram reasoning.',
        unit: '%',
        max: 100,
        scores: [
          { model: 'Gemini 3.7 Flash', val: 72.8, highlight: true, class: 'gemini' },
          { model: 'Claude 3.7 Sonnet', val: 70.4, highlight: false, class: 'claude' },
          { model: 'OpenAI o3-mini', val: 68.2, highlight: false, class: 'openai' },
          { model: 'DeepSeek R1', val: 60.1, highlight: false, class: 'deepseek' }
        ]
      },
      {
        id: 'speed-tps',
        category: 'speed',
        name: 'Output Speed Throughput',
        badge: '150+ tok/s Ultra Stream',
        desc: 'Streaming output generation speed in production deployment.',
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
      { name: 'Multimodal', key: 'mmmu' },
      { name: 'Throughput', key: 'speed' }
    ];

    this.radarData = {
      gemini: [0.94, 0.96, 0.95, 0.95, 0.96, 0.98],
      claude: [0.94, 0.92, 0.95, 0.93, 0.91, 0.65],
      openai: [0.88, 0.93, 0.89, 0.95, 0.85, 0.72],
      deepseek: [0.68, 0.84, 0.80, 0.94, 0.70, 0.45]
    };

    this.init();
  }

  init() {
    // Category tabs
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

    this.renderBars();
    this.initRadar();
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
              ${s.highlight ? '✨ ' : ''}${s.model}
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

    // Trigger smooth fill animation
    setTimeout(() => {
      const fills = document.querySelectorAll('.bar-fill');
      fills.forEach((fill) => {
        fill.style.width = fill.dataset.target;
      });
    }, 50);
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
    const size = Math.min(320, this.canvas.parentElement.clientWidth || 300);
    this.canvas.width = size * window.devicePixelRatio;
    this.canvas.height = size * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.size = size;
  }

  drawRadar() {
    if (!this.ctx || !this.size) return;
    const ctx = this.ctx;
    const center = this.size / 2;
    const radius = this.size * 0.38;
    const count = this.radarAxes.length;

    ctx.clearRect(0, 0, this.size, this.size);

    // Draw concentric polygon grid
    const levels = 4;
    for (let l = 1; l <= levels; l++) {
      const r = (radius / levels) * l;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
        const x = center + Math.cos(angle) * r;
        const y = center + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw radial axes & labels
    ctx.font = '10.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8FA2C8';

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();

      // Label text position
      const lx = center + Math.cos(angle) * (radius + 18);
      const ly = center + Math.sin(angle) * (radius + 18);
      ctx.fillText(this.radarAxes[i].name, lx, ly);
    }

    // Draw model polygons
    const models = [
      { key: 'deepseek', color: '#60A5FA', alpha: 0.15, border: '#3B82F6' },
      { key: 'claude', color: '#F59E0B', alpha: 0.18, border: '#D97706' },
      { key: 'openai', color: '#10B981', alpha: 0.18, border: '#059669' },
      { key: 'gemini', color: '#00F0FF', alpha: 0.4, border: '#00F0FF', glow: true }
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

      ctx.fillStyle = m.color;
      ctx.globalAlpha = m.alpha;
      ctx.fill();

      ctx.strokeStyle = m.border;
      ctx.lineWidth = m.glow ? 2.5 : 1.5;
      ctx.globalAlpha = 1;
      if (m.glow) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00F0FF';
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.benchmarkController = new BenchmarkController();
});
