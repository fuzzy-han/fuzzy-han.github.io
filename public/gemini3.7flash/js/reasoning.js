/**
 * Synapse Neural Flow & Dynamic Reasoning Controller
 */

class ReasoningSimulator {
  constructor() {
    this.slider = document.getElementById('budgetSlider');
    this.modeBadge = document.getElementById('modeBadge');
    this.canvas = document.getElementById('thoughtCanvas');
    this.thoughtList = document.getElementById('thoughtList');
    this.codeOutput = document.getElementById('codeOutput');
    this.tokenRateEl = document.getElementById('liveTokenRate');
    this.latencyEl = document.getElementById('liveLatency');
    this.tokenBudgetEl = document.getElementById('liveTokenBudget');

    this.currentChallenge = 'swe-bench';
    this.budget = 4096;
    this.isStreaming = false;
    this.streamTimer = null;
    this.treeNodes = [];
    this.photons = []; // Travelling pulse particles

    this.challenges = {
      'swe-bench': {
        title: 'SWE-bench: Async Concurrency Race Fix',
        lang: 'python',
        difficulty: 'SOTA 70.3%',
        flash: {
          thoughts: [
            'Analyzing event loop dispatch mutex state.',
            'Generating atomic task lock handler.'
          ],
          code: `import asyncio

class SafeAsyncDispatcher:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._registry = {}

    async def dispatch(self, event_id: str, payload: dict):
        async with self._lock:
            handler = self._registry.get(event_id)
            if handler:
                return await handler(payload)
            return None`
        },
        deep: {
          thoughts: [
            'Deconstructing repository state: Analyzing concurrency model across modules.',
            'Hypothesis 1: Weakref memory leak -> Disproved by GC trace.',
            'Hypothesis 2: Task cancellation half-open socket in uvloop -> Confirmed.',
            'Formulating patch: Integrating asyncio.shield + graceful teardown + atomic lock.',
            'Self-verifying patch against 42 automated regression unit tests: PASS (100%).'
          ],
          code: `import asyncio
import logging
from typing import Dict, Callable, Any, Optional

logger = logging.getLogger("gemini.runtime")

class UltraRobustDispatcher:
    """
    Patched via Gemini 3.7 Flash Extended Reasoning (SWE-bench verified)
    Resolves uvloop race condition + task cancellation half-open socket leaks.
    """
    def __init__(self, loop: Optional[asyncio.AbstractEventLoop] = None):
        self._loop = loop or asyncio.get_event_loop()
        self._lock = asyncio.Lock()
        self._handlers: Dict[str, Callable] = {}
        self._in_flight: set[asyncio.Task] = set()

    async def register(self, topic: str, callback: Callable) -> None:
        async with self._lock:
            self._handlers[topic] = callback

    async def dispatch_safe(self, topic: str, data: Any) -> Any:
        async with self._lock:
            target = self._handlers.get(topic)
            if not target:
                return None

        # Shield task execution from outer cancellation cascades
        task = self._loop.create_task(target(data))
        self._in_flight.add(task)
        task.add_done_callback(self._in_flight.discard)

        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            logger.warning(f"Consumer cancelled topic {topic}, cleaning...")
            await asyncio.gather(task, return_exceptions=True)
            raise`
        }
      },
      'quantum': {
        title: 'Quantum State Decoherence Solver',
        lang: 'typescript',
        difficulty: 'Olympiad Math 84.8%',
        flash: {
          thoughts: [
            'Lindblad master equation for 2-qubit open system.',
            'Runge-Kutta numerical density matrix integration.'
          ],
          code: `export interface DensityMatrix {
  rho: number[][];
  dim: number;
}

export function computeDecoherence(rho0: DensityMatrix, gamma: number, dt: number): DensityMatrix {
  const rhoNext = rho0.rho.map((row, i) =>
    row.map((val, j) => (i === j ? val : val * Math.exp(-gamma * dt)))
  );
  return { rho: rhoNext, dim: rho0.dim };
}`
        },
        deep: {
          thoughts: [
            'Setting up Liouville-von Neumann space density matrix.',
            'Branch 1: Verifying non-Markovian memory bounds.',
            'Branch 2: Solving Kraus matrices for generalized phase-damping channel.',
            'Self-correcting trace preservation constraint Tr(ρ) = 1 to 1e-12 precision.',
            'Synthesizing fully vectorized WebGL matrix kernel.'
          ],
          code: `export class QuantumLindbladEngine {
  private dim: number;
  private state: Float64Array;

  constructor(qubits: number) {
    this.dim = 1 << qubits;
    this.state = new Float64Array(this.dim * this.dim * 2);
    this.state[0] = 1.0;
  }

  public stepDissipation(gamma: number, dt: number): { purity: number } {
    const d = this.dim;
    let trace = 0.0;
    let purity = 0.0;

    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        const idx = (i * d + j) * 2;
        if (i !== j) {
          const decay = Math.exp(-gamma * dt);
          this.state[idx] *= decay;
          this.state[idx + 1] *= decay;
        }
        const re = this.state[idx];
        const im = this.state[idx + 1];
        purity += re * re + im * im;
        if (i === j) trace += re;
      }
    }

    return { purity };
  }
}`
        }
      },
      '3d-nebula': {
        title: '3D WebGL Fluid Vortex Shader',
        lang: 'javascript',
        difficulty: 'Multimodal Agentic',
        flash: {
          thoughts: [
            'Fragment shader synthesis for volumetric swirl field.',
            'Compiling GLSL shader program.'
          ],
          code: `const fragmentShader = \`
  precision highp float;
  uniform float u_time;
  uniform vec2 u_res;
  void main() {
    vec2 p = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
    float d = length(p);
    float angle = atan(p.y, p.x) + u_time * 0.8;
    vec3 col = 0.5 + 0.5 * cos(angle * 3.0 + vec3(0.0, 2.0, 4.0) + d * 4.0);
    gl_FragColor = vec4(col / (d * 1.5 + 0.1), 1.0);
  }
\`;`
        },
        deep: {
          thoughts: [
            'Architecting real-time Navier-Stokes 2D vorticity grid with Raymarching.',
            'Analyzing Beer-Lambert law transmittance attenuation.',
            'Optimizing branchless ray step loop for 120Hz mobile GPUs.',
            'Verification check: zero NaN artifacts during singularity division.'
          ],
          code: `export function createVolumetricNebula(gl, canvas) {
  const fs = \`
    precision highp float;
    varying vec2 v_uv;
    uniform float u_time;
    uniform vec2 u_res;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 st = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
      float t = u_time * 0.4;
      float rot = length(st) * 3.0 - t;
      mat2 m = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
      vec2 q = m * st * 4.0;
      gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * (0.5 + 0.5 * sin(rot)), 1.0);
    }
  \`;
  return { fs };
}`
        }
      }
    };

    this.init();
  }

  init() {
    if (!this.slider) return;

    this.slider.addEventListener('input', (e) => {
      this.budget = parseInt(e.target.value, 10);
      this.updateBudgetUI();
      if (window.soundEngine) window.soundEngine.playClick();
    });

    const btns = document.querySelectorAll('.challenge-btn');
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        btns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentChallenge = btn.dataset.challenge;
        if (window.soundEngine) window.soundEngine.playClick();
        this.triggerSimulation();
      });
    });

    const triggerBtn = document.getElementById('runReasoningBtn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => this.triggerSimulation());
    }

    this.updateBudgetUI();
    this.initCanvas();
    this.triggerSimulation();
  }

  initCanvas() {
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Continuous render loop for photons & breathing nodes
    const renderLoop = () => {
      this.drawTree();
      requestAnimationFrame(renderLoop);
    };
    renderLoop();
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = 180;
  }

  updateBudgetUI() {
    if (this.tokenBudgetEl) {
      this.tokenBudgetEl.textContent = this.budget === 0 ? '0 (Instant)' : `${this.budget} tokens`;
    }

    if (this.modeBadge) {
      if (this.budget === 0) {
        this.modeBadge.textContent = '⚡ Flash Reflex (0s)';
      } else if (this.budget <= 2048) {
        this.modeBadge.textContent = '🚀 Fast Reasoning';
      } else if (this.budget >= 8192) {
        this.modeBadge.textContent = '🧠 Deep Extended CoT';
      } else {
        this.modeBadge.textContent = '⚖️ Dynamic Hybrid';
      }
    }
  }

  generateTreeNodes() {
    this.treeNodes = [];
    this.photons = [];
    const w = this.canvas ? this.canvas.width : 400;
    const h = 180;
    const isDeep = this.budget >= 2048;

    this.treeNodes.push({ x: 35, y: h / 2, type: 'root', alpha: 1, baseOffsetY: 0 });

    const numBranches = isDeep ? Math.min(6, Math.floor(this.budget / 2048) + 2) : 2;
    for (let i = 0; i < numBranches; i++) {
      const bx = 100 + i * (w - 150) / (numBranches || 1);
      const by = 35 + (Math.sin(i * 1.5) * 0.5 + 0.5) * (h - 70);
      const isVerify = i === numBranches - 1;
      this.treeNodes.push({
        x: bx,
        y: by,
        type: isVerify ? 'verify' : (i % 2 === 0 ? 'branch' : 'prune'),
        alpha: 0,
        baseOffsetY: Math.random() * Math.PI * 2
      });
    }
  }

  drawTree() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const time = performance.now() * 0.002;

    // Draw connecting paths with subtle curves
    for (let i = 1; i < this.treeNodes.length; i++) {
      const prev = this.treeNodes[i - 1];
      const cur = this.treeNodes[i];
      const prevY = prev.y + Math.sin(time + prev.baseOffsetY) * 2;
      const curY = cur.y + Math.sin(time + cur.baseOffsetY) * 2;

      this.ctx.beginPath();
      this.ctx.moveTo(prev.x, prevY);
      this.ctx.bezierCurveTo((prev.x + cur.x) / 2, prevY, (prev.x + cur.x) / 2, curY, cur.x, curY);
      this.ctx.strokeStyle = cur.type === 'verify' ? '#38bdf8' : (cur.type === 'prune' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)');
      this.ctx.globalAlpha = Math.min(prev.alpha, cur.alpha) * 0.7;
      this.ctx.lineWidth = cur.type === 'verify' ? 1.5 : 1;
      this.ctx.stroke();
    }

    // Draw photons
    for (let pIdx = this.photons.length - 1; pIdx >= 0; pIdx--) {
      const p = this.photons[pIdx];
      p.progress += 0.04;
      if (p.progress >= 1) {
        this.photons.splice(pIdx, 1);
        continue;
      }

      const p1 = this.treeNodes[p.fromIdx];
      const p2 = this.treeNodes[p.toIdx];
      if (p1 && p2) {
        const x = p1.x + (p2.x - p1.x) * p.progress;
        const y = p1.y + (p2.y - p1.y) * p.progress;
        this.ctx.beginPath();
        this.ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.globalAlpha = 0.9;
        this.ctx.fill();
      }
    }

    // Draw nodes
    this.treeNodes.forEach((node) => {
      const nodeY = node.y + Math.sin(time + node.baseOffsetY) * 2;
      this.ctx.beginPath();
      this.ctx.arc(node.x, nodeY, node.type === 'root' ? 6 : (node.type === 'verify' ? 5 : 4), 0, Math.PI * 2);
      this.ctx.fillStyle = node.type === 'root' ? '#ffffff' : (node.type === 'verify' ? '#38bdf8' : '#94a3b8');
      this.ctx.globalAlpha = node.alpha;
      this.ctx.fill();
    });

    this.ctx.globalAlpha = 1;
  }

  triggerSimulation() {
    if (this.isStreaming) clearInterval(this.streamTimer);
    this.isStreaming = true;

    if (window.soundEngine) window.soundEngine.playPowerup();

    const data = this.challenges[this.currentChallenge] || this.challenges['swe-bench'];
    const isDeep = this.budget >= 2048;
    const content = isDeep ? data.deep : data.flash;

    if (this.thoughtList) this.thoughtList.innerHTML = '';
    if (this.codeOutput) this.codeOutput.innerHTML = '<span class="cursor-blink"></span>';

    this.generateTreeNodes();
    let nodeIndex = 0;

    let stepIndex = 0;
    const stepInterval = setInterval(() => {
      if (stepIndex < content.thoughts.length) {
        const step = document.createElement('div');
        step.className = 'thought-step';
        step.innerHTML = `<strong>[CoT #${stepIndex + 1}]</strong> ${content.thoughts[stepIndex]}`;
        if (this.thoughtList) {
          this.thoughtList.appendChild(step);
          this.thoughtList.scrollTop = this.thoughtList.scrollHeight;
        }

        if (this.treeNodes[nodeIndex]) {
          this.treeNodes[nodeIndex].alpha = 1;
          if (nodeIndex > 0) {
            this.photons.push({ fromIdx: nodeIndex - 1, toIdx: nodeIndex, progress: 0 });
          }
          nodeIndex++;
        }

        if (window.soundEngine) window.soundEngine.playTypingTick();
        stepIndex++;
      } else {
        clearInterval(stepInterval);
        this.treeNodes.forEach((n) => (n.alpha = 1));
        this.streamCode(content.code);
      }
    }, isDeep ? 160 : 70);
  }

  streamCode(codeText) {
    let charIndex = 0;
    const speed = this.budget === 0 ? 14 : 7;
    const startTime = performance.now();

    this.streamTimer = setInterval(() => {
      charIndex += speed;
      const currentSnippet = codeText.slice(0, charIndex);
      if (this.codeOutput) {
        this.codeOutput.innerHTML = this.escapeHtml(currentSnippet) + '<span class="cursor-blink"></span>';
        this.codeOutput.scrollTop = this.codeOutput.scrollHeight;
      }

      if (charIndex % 35 === 0 && window.soundEngine) {
        window.soundEngine.playTypingTick();
      }

      const elapsedSec = (performance.now() - startTime) / 1000;
      const tokenCount = Math.floor(charIndex / 3.5);
      const tps = elapsedSec > 0 ? Math.min(240, Math.floor(tokenCount / elapsedSec)) : 160;

      if (this.tokenRateEl) this.tokenRateEl.textContent = `${Math.max(145, tps)} tok/s`;
      if (this.latencyEl) this.latencyEl.textContent = `${Math.max(16, Math.floor(elapsedSec * 100))} ms`;

      if (charIndex >= codeText.length) {
        clearInterval(this.streamTimer);
        this.isStreaming = false;
        if (this.codeOutput) {
          this.codeOutput.innerHTML = this.escapeHtml(codeText);
        }
        if (window.soundEngine) window.soundEngine.playVictory();
      }
    }, 20);
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.reasoningSimulator = new ReasoningSimulator();
});
