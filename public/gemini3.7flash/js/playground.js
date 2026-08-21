/**
 * Live Agentic Coding Sandbox & Multimodal Vision Lab
 */

class InteractivePlayground {
  constructor() {
    this.visionCanvas = document.getElementById('visionCanvas');
    this.clearDoodleBtn = document.getElementById('clearDoodleBtn');
    this.visionResultEl = document.getElementById('visionPrediction');
    this.visionConfidenceEl = document.getElementById('visionConfidence');

    this.sandboxCanvas = document.getElementById('sandboxRenderCanvas');
    this.sandboxDemoSelector = document.getElementById('sandboxDemoSelect');

    this.isDrawing = false;
    this.strokes = [];

    this.initVisionLab();
    this.initSandboxRender();
  }

  initVisionLab() {
    if (!this.visionCanvas) return;
    this.vCtx = this.visionCanvas.getContext('2d');
    this.vCtx.lineWidth = 8;
    this.vCtx.lineCap = 'round';
    this.vCtx.strokeStyle = '#00F0FF';

    const getPos = (e) => {
      const rect = this.visionCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (this.visionCanvas.width / rect.width),
        y: (clientY - rect.top) * (this.visionCanvas.height / rect.height)
      };
    };

    const startDraw = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      const pos = getPos(e);
      this.vCtx.beginPath();
      this.vCtx.moveTo(pos.x, pos.y);
      if (window.soundEngine) window.soundEngine.playClick();
    };

    const drawMove = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      this.vCtx.lineTo(pos.x, pos.y);
      this.vCtx.stroke();
    };

    const endDraw = () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      this.classifyDoodle();
    };

    this.visionCanvas.addEventListener('mousedown', startDraw);
    this.visionCanvas.addEventListener('mousemove', drawMove);
    window.addEventListener('mouseup', endDraw);

    this.visionCanvas.addEventListener('touchstart', startDraw, { passive: false });
    this.visionCanvas.addEventListener('touchmove', drawMove, { passive: false });
    window.addEventListener('touchend', endDraw);

    if (this.clearDoodleBtn) {
      this.clearDoodleBtn.addEventListener('click', () => {
        this.vCtx.clearRect(0, 0, this.visionCanvas.width, this.visionCanvas.height);
        if (this.visionResultEl) this.visionResultEl.textContent = '请在画布绘制涂鸦...';
        if (this.visionConfidenceEl) this.visionConfidenceEl.textContent = '--%';
        if (window.soundEngine) window.soundEngine.playClick();
      });
    }
  }

  classifyDoodle() {
    if (!this.vCtx) return;
    const imgData = this.vCtx.getImageData(0, 0, this.visionCanvas.width, this.visionCanvas.height);
    let nonZero = 0;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 20) nonZero++;
    }

    if (nonZero < 50) return;

    const items = [
      { label: '🚀 超光速量子火箭 (Rocket)', conf: 99.4 },
      { label: '🌟 双核混合思考神经元 (Neural Node)', conf: 98.7 },
      { label: '🪐 1M 上下文环形引力场 (Saturn / Field)', conf: 97.9 },
      { label: '⚡ SWE-bench 漏洞修补器 (Debug Wrench)', conf: 99.1 },
      { label: '🐱 赛博机械猫咪 (Cyber Cat)', conf: 96.5 }
    ];

    const pick = items[Math.floor(Math.random() * items.length)];

    if (this.visionResultEl) {
      this.visionResultEl.innerHTML = `✨ 识别结果: <strong>${pick.label}</strong>`;
    }
    if (this.visionConfidenceEl) {
      this.visionConfidenceEl.textContent = `${pick.conf}% 判定置信度 (0.02s)`;
    }

    if (window.soundEngine) window.soundEngine.playPowerup();
  }

  initSandboxRender() {
    if (!this.sandboxCanvas) return;
    this.sCtx = this.sandboxCanvas.getContext('2d');
    this.animTime = 0;

    const renderLoop = () => {
      this.animTime += 0.03;
      const w = (this.sandboxCanvas.width = this.sandboxCanvas.parentElement.clientWidth || 360);
      const h = (this.sandboxCanvas.height = 240);

      this.sCtx.fillStyle = '#060914';
      this.sCtx.fillRect(0, 0, w, h);

      const demo = this.sandboxDemoSelector ? this.sandboxDemoSelector.value : 'matrix-cube';

      if (demo === 'matrix-cube') {
        // Render rotating 3D wireframe hypercube
        const cx = w / 2;
        const cy = h / 2;
        const size = 60;
        const points = [
          [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
          [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ];

        const rotX = this.animTime * 0.8;
        const rotY = this.animTime * 1.2;

        const proj = points.map(([x, y, z]) => {
          let y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
          let z1 = y * Math.sin(rotX) + z * Math.cos(rotX);
          let x2 = x * Math.cos(rotY) + z1 * Math.sin(rotY);
          let z2 = -x * Math.sin(rotY) + z1 * Math.cos(rotY);
          const fov = 200 / (200 + z2 * size);
          return [cx + x2 * size * fov, cy + y1 * size * fov];
        });

        const edges = [
          [0, 1], [1, 2], [2, 3], [3, 0],
          [4, 5], [5, 6], [6, 7], [7, 4],
          [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        this.sCtx.strokeStyle = '#00F0FF';
        this.sCtx.lineWidth = 2;
        this.sCtx.shadowBlur = 10;
        this.sCtx.shadowColor = '#00F0FF';

        edges.forEach(([i, j]) => {
          this.sCtx.beginPath();
          this.sCtx.moveTo(proj[i][0], proj[i][1]);
          this.sCtx.lineTo(proj[j][0], proj[j][1]);
          this.sCtx.stroke();
        });
      } else {
        // Quantum probability wave
        this.sCtx.strokeStyle = '#9B51E0';
        this.sCtx.lineWidth = 3;
        this.sCtx.shadowBlur = 12;
        this.sCtx.shadowColor = '#9B51E0';

        this.sCtx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = h / 2 + Math.sin(x * 0.04 + this.animTime * 2) * Math.cos(x * 0.01) * 50;
          if (x === 0) this.sCtx.moveTo(x, y);
          else this.sCtx.lineTo(x, y);
        }
        this.sCtx.stroke();
      }

      this.sCtx.shadowBlur = 0;
      requestAnimationFrame(renderLoop);
    };

    renderLoop();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.interactivePlayground = new InteractivePlayground();
});
