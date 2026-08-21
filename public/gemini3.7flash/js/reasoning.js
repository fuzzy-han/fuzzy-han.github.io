/**
 * Gemini 3.7 Flash Dynamic Reasoning & Chain-of-Thought Visualizer
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

    this.challenges = {
      'swe-bench': {
        title: 'SWE-bench: Real-world Async Race Fix',
        lang: 'python',
        difficulty: 'SOTA 70.3%',
        flash: {
          thoughts: [
            'Direct heuristic lookup: race condition identified in event loop dispatch.',
            'Generating minimal atomic mutex lock wrapper.'
          ],
          code: `import asyncio

class SafeAsyncDispatcher:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._registry = {}

    async def dispatch(self, event_id: str, payload: dict):
        async with self._lock:
            # Atomic state transition prevents coroutine race
            handler = self._registry.get(event_id)
            if handler:
                return await handler(payload)
            return None`
        },
        deep: {
          thoughts: [
            'Deconstructing repository state: Analyzing concurrency model across 14 modules.',
            'Hypothesis 1: Weakref memory leak during unregister -> Disproved by GC trace.',
            'Hypothesis 2: Task cancellation leaving half-open socket in uvloop dispatch -> Confirmed.',
            'Formulating patch: Integrating asyncio.shield + graceful teardown hook + re-entrant lock.',
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
            logger.info(f"Registered atomic hook: {topic}")

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
            logger.warning(f"Consumer cancelled topic {topic}, cleaning cleanly...")
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
            'Parsing Lindblad master equation for 2-qubit open system.',
            'Computing Runge-Kutta numerical density matrix integration.'
          ],
          code: `export interface DensityMatrix {
  rho: number[][];
  dim: number;
}

export function computeDecoherence(rho0: DensityMatrix, gamma: number, dt: number): DensityMatrix {
  // 1st order Lindbladian dissipative decay
  const rhoNext = rho0.rho.map((row, i) =>
    row.map((val, j) => (i === j ? val : val * Math.exp(-gamma * dt)))
  );
  return { rho: rhoNext, dim: rho0.dim };
}`
        },
        deep: {
          thoughts: [
            'Setting up full density operator matrix in Liouville-von Neumann space.',
            'Branch 1: Applying rotating wave approximation (RWA) -> Verifying non-Markovian memory bounds.',
            'Branch 2: Solving Kraus representation matrices for generalized phase-damping channel.',
            'Self-correcting trace-preservation constraint Tr(ρ) = 1 to 1e-12 precision.',
            'Synthesizing fully vectorized WebGL matrix kernel.'
          ],
          code: `/**
 * Solved via Gemini 3.7 Flash Deep Reasoning CoT
 * High-precision Kraus Decoherence & Purity Preserver
 */
export class QuantumLindbladEngine {
  private dim: number;
  private state: Float64Array; // Flattened density matrix (Real + Imag)

  constructor(qubits: number) {
    this.dim = 1 << qubits;
    this.state = new Float64Array(this.dim * this.dim * 2);
    this.state[0] = 1.0; // Pure state |0...0><0...0|
  }

  public stepDissipation(gamma: number, dt: number): { purity: number; entropy: number } {
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

    // Renormalize trace preservation
    if (Math.abs(trace - 1.0) > 1e-9) {
      for (let i = 0; i < d; i++) {
        this.state[(i * d + i) * 2] /= trace;
      }
    }

    return { purity, entropy: -Math.log2(Math.max(purity, 1e-15)) };
  }
}`
        }
      },
      '3d-nebula': {
        title: '3D WebGL Fluid Vortex Shader Engine',
        lang: 'javascript',
        difficulty: 'Multimodal Agentic',
        flash: {
          thoughts: [
            'Direct fragment shader synthesis for volumetric swirl field.',
            'Compiling GLSL shader program with highp float precision.'
          ],
          code: `const vertexShader = \`
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
\`;

const fragmentShader = \`
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
            'Architecting real-time Navier-Stokes 2D vorticity grid with Raymarching volumetric absorption.',
            'Analyzing Beer-Lambert law transmittance attenuation through dense nebulae clouds.',
            'Optimizing branchless ray step loop for 144Hz high-refresh mobile GPUs.',
            'Verification check: zero NaN artifacts during singularity division at core (0,0).'
          ],
          code: `// Gemini 3.7 Flash Hybrid Reasoning Shader
export function createVolumetricNebula(gl, canvas) {
  const vs = \`
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  \`;

  const fs = \`
    precision highp float;
    varying vec2 v_uv;
    uniform float u_time;
    uniform vec2 u_res;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    void main() {
      vec2 st = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
      float t = u_time * 0.4;
      float rot = length(st) * 3.0 - t;
      mat2 m = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
      vec2 q = m * st * 4.0;
      
      float f = noise(q + t) * 0.5 + noise(q * 2.0 - t * 0.5) * 0.25;
      vec3 colorA = vec3(0.0, 0.94, 1.0); // Gemini Cyan
      vec3 colorB = vec3(0.61, 0.32, 0.88); // Purple
      vec3 finalCol = mix(colorA, colorB, f + length(st)) * f * 2.0;

      gl_FragColor = vec4(finalCol, 1.0);
    }
  \`;
  return { vs, fs };
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

    // Challenge buttons
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
      triggerBtn.addEventListener('click', () => {
        this.triggerSimulation();
      });
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
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = 200;
  }

  updateBudgetUI() {
    const isFlash = this.budget <= 1024;
    const isDeep = this.budget >= 8192;

    if (this.tokenBudgetEl) {
      this.tokenBudgetEl.textContent = this.budget === 0 ? '0 (Instant)' : `${this.budget} tokens`;
    }

    if (this.modeBadge) {
      if (this.budget === 0) {
        this.modeBadge.textContent = '⚡ Flash Reflex Mode (0s)';
        this.modeBadge.style.color = '#00F0FF';
      } else if (isFlash) {
        this.modeBadge.textContent = '🚀 Fast Reasoning Mode';
        this.modeBadge.style.color = '#34A853';
      } else if (isDeep) {
        this.modeBadge.textContent = '🧠 Deep Extended CoT Mode';
        this.modeBadge.style.color = '#FF007A';
      } else {
        this.modeBadge.textContent = '⚖️ Dynamic Hybrid Mode';
        this.modeBadge.style.color = '#9B51E0';
      }
    }
  }

  generateTreeNodes() {
    this.treeNodes = [];
    const w = this.canvas ? this.canvas.width : 400;
    const h = 200;
    const isDeep = this.budget >= 2048;

    // Root
    this.treeNodes.push({ x: 40, y: h / 2, type: 'root', label: 'Prompt Input', alpha: 1 });

    const numBranches = isDeep ? Math.min(8, Math.floor(this.budget / 1024) + 2) : 2;
    for (let i = 0; i < numBranches; i++) {
      const bx = 120 + i * (w - 200) / (numBranches || 1);
      const by = 40 + (Math.sin(i * 1.5) * 0.5 + 0.5) * (h - 80);
      const isVerify = i === numBranches - 1;
      this.treeNodes.push({
        x: bx,
        y: by,
        type: isVerify ? 'verify' : (i % 2 === 0 ? 'branch' : 'prune'),
        label: isVerify ? 'Verified SOTA' : `Hypothesis ${i + 1}`,
        alpha: 0
      });
    }
  }

  drawTree() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw connecting paths
    this.ctx.lineWidth = 1.5;
    for (let i = 1; i < this.treeNodes.length; i++) {
      const prev = this.treeNodes[i - 1];
      const cur = this.treeNodes[i];
      this.ctx.beginPath();
      this.ctx.moveTo(prev.x, prev.y);
      this.ctx.bezierCurveTo((prev.x + cur.x) / 2, prev.y, (prev.x + cur.x) / 2, cur.y, cur.x, cur.y);
      this.ctx.strokeStyle = cur.type === 'verify' ? '#34A853' : (cur.type === 'prune' ? '#EA4335' : '#9B51E0');
      this.ctx.globalAlpha = Math.min(prev.alpha, cur.alpha) * 0.6;
      this.ctx.stroke();
    }

    // Draw nodes
    this.treeNodes.forEach((node) => {
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.type === 'root' ? 8 : (node.type === 'verify' ? 7 : 5), 0, Math.PI * 2);
      this.ctx.fillStyle = node.type === 'root' ? '#00F0FF' : (node.type === 'verify' ? '#34A853' : (node.type === 'prune' ? '#EA4335' : '#9B51E0'));
      this.ctx.globalAlpha = node.alpha;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = this.ctx.fillStyle;
      this.ctx.fill();
    });

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1;
  }

  triggerSimulation() {
    if (this.isStreaming) clearInterval(this.streamTimer);
    this.isStreaming = true;

    if (window.soundEngine) window.soundEngine.playPowerup();

    const data = this.challenges[this.currentChallenge] || this.challenges['swe-bench'];
    const isDeep = this.budget >= 2048;
    const content = isDeep ? data.deep : data.flash;

    // Reset log and code area
    if (this.thoughtList) this.thoughtList.innerHTML = '';
    if (this.codeOutput) this.codeOutput.innerHTML = '<span class="cursor-blink"></span>';

    this.generateTreeNodes();
    let nodeIndex = 0;

    // Display thoughts step by step
    let stepIndex = 0;
    const stepInterval = setInterval(() => {
      if (stepIndex < content.thoughts.length) {
        const step = document.createElement('div');
        step.className = 'thought-step';
        step.innerHTML = `<strong>[CoT Step ${stepIndex + 1}]</strong> ${content.thoughts[stepIndex]}`;
        if (this.thoughtList) {
          this.thoughtList.appendChild(step);
          this.thoughtList.scrollTop = this.thoughtList.scrollHeight;
        }

        if (this.treeNodes[nodeIndex]) {
          this.treeNodes[nodeIndex].alpha = 1;
          nodeIndex++;
          this.drawTree();
        }

        if (window.soundEngine) window.soundEngine.playTypingTick();
        stepIndex++;
      } else {
        clearInterval(stepInterval);
        // Reveal remaining nodes
        this.treeNodes.forEach((n) => (n.alpha = 1));
        this.drawTree();
        this.streamCode(content.code);
      }
    }, isDeep ? 180 : 80);
  }

  streamCode(codeText) {
    let charIndex = 0;
    const speed = this.budget === 0 ? 12 : 6; // Characters per tick

    const startTime = performance.now();

    this.streamTimer = setInterval(() => {
      charIndex += speed;
      const currentSnippet = codeText.slice(0, charIndex);
      if (this.codeOutput) {
        this.codeOutput.innerHTML = this.escapeHtml(currentSnippet) + '<span class="cursor-blink"></span>';
        this.codeOutput.scrollTop = this.codeOutput.scrollHeight;
      }

      if (charIndex % 30 === 0 && window.soundEngine) {
        window.soundEngine.playTypingTick();
      }

      // Calculate live throughput
      const elapsedSec = (performance.now() - startTime) / 1000;
      const tokenCount = Math.floor(charIndex / 3.5);
      const tps = elapsedSec > 0 ? Math.min(240, Math.floor(tokenCount / elapsedSec)) : 160;

      if (this.tokenRateEl) this.tokenRateEl.textContent = `${Math.max(145, tps)} tok/s`;
      if (this.latencyEl) this.latencyEl.textContent = `${Math.max(18, Math.floor(elapsedSec * 100))} ms`;

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
