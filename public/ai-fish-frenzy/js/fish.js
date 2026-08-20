/**
 * AI Fish & Whale Entities
 * Procedurally rendered AI avatars with smooth swimming physics and bone animations.
 */

// Model definitions and visual themes
const AI_SPECIES = {
  deepseek: {
    name: 'DeepSeek',
    modelTag: 'R1 / V3',
    primaryColor: '#1c64f2',
    secondaryColor: '#00d8ff',
    accentColor: '#ffffff',
    bellyColor: '#e0f2fe',
    eyeColor: '#0284c7',
    type: 'whale',
    speedMult: 1.05
  },
  chatgpt: {
    name: 'ChatGPT',
    modelTag: 'GPT-4o',
    primaryColor: '#10a37f',
    secondaryColor: '#059669',
    accentColor: '#34d399',
    bellyColor: '#d1fae5',
    eyeColor: '#064e3b',
    type: 'swirl',
    speedMult: 1.0
  },
  claude: {
    name: 'Claude',
    modelTag: '3.5 Sonnet',
    primaryColor: '#d97706',
    secondaryColor: '#b45309',
    accentColor: '#fbbf24',
    bellyColor: '#fef3c7',
    eyeColor: '#78350f',
    type: 'manta',
    speedMult: 0.95
  },
  kimi: {
    name: 'Kimi',
    modelTag: 'Moonshot',
    primaryColor: '#8b5cf6',
    secondaryColor: '#6d28d9',
    accentColor: '#c084fc',
    bellyColor: '#ede9fe',
    eyeColor: '#4c1d95',
    type: 'moon',
    speedMult: 1.02
  },
  gemini: {
    name: 'Gemini',
    modelTag: '1.5 Pro',
    primaryColor: '#2563eb',
    secondaryColor: '#7c3aed',
    accentColor: '#38bdf8',
    bellyColor: '#eff6ff',
    eyeColor: '#1e3a8a',
    type: 'sparkle',
    speedMult: 1.08
  },
  qwen: {
    name: 'Qwen',
    modelTag: '2.5 Max',
    primaryColor: '#ea580c',
    secondaryColor: '#c2410c',
    accentColor: '#fdba74',
    bellyColor: '#ffedd5',
    eyeColor: '#7c2d12',
    type: 'dragon',
    speedMult: 1.03
  },
  grok: {
    name: 'Grok',
    modelTag: 'Grok-2',
    primaryColor: '#1e293b',
    secondaryColor: '#0f172a',
    accentColor: '#f8fafc',
    bellyColor: '#94a3b8',
    eyeColor: '#ffffff',
    type: 'shark',
    speedMult: 1.15
  },
  llama: {
    name: 'Llama',
    modelTag: 'Llama-3.1',
    primaryColor: '#9333ea',
    secondaryColor: '#4f46e5',
    accentColor: '#e9d5ff',
    bellyColor: '#fae8ff',
    eyeColor: '#581c87',
    type: 'llama',
    speedMult: 0.98
  }
};

class Fish {
  constructor(x, y, speciesKey = 'chatgpt', params = 7) {
    this.x = x;
    this.y = y;
    this.speciesKey = speciesKey;
    this.species = AI_SPECIES[speciesKey] || AI_SPECIES.chatgpt;
    this.params = params; // in Billions (e.g. 1.5, 7, 32, 70, 671)
    
    // Physics & movement
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.vx = 0;
    this.vy = 0;
    this.baseSpeed = 2.4 * this.species.speedMult;
    this.currentSpeed = this.baseSpeed;
    
    // Animation properties
    this.tailPhase = Math.random() * Math.PI * 2;
    this.tailSpeed = 0.12;
    this.finWiggle = 0;
    this.eyeBlink = 0;
    this.isDead = false;
    
    // AI Decision variables
    this.aiState = 'wander'; // 'wander', 'hunt', 'flee'
    this.targetEntity = null;
    this.changeDirTimer = Math.random() * 100;
    
    this.updateRadius();
  }

  updateRadius() {
    // Radius logarithmically scaled based on parameter count
    // 0.5B -> ~14px, 7B -> ~24px, 70B -> ~48px, 671B -> ~95px
    this.radius = Math.max(13, Math.pow(this.params, 0.42) * 11);
  }

  setParams(newParams) {
    this.params = Math.max(0.5, newParams);
    this.updateRadius();
  }

  addParams(delta) {
    this.setParams(this.params + delta);
  }

  update(worldWidth, worldHeight) {
    // Animation phases
    this.tailPhase += this.tailSpeed * (this.currentSpeed / this.baseSpeed);
    this.finWiggle = Math.sin(this.tailPhase * 0.8) * 0.18;

    // Turn smoothly towards target angle
    let diff = this.targetAngle - this.angle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.angle += diff * 0.08;

    // Movement velocity
    this.vx = Math.cos(this.angle) * this.currentSpeed;
    this.vy = Math.sin(this.angle) * this.currentSpeed;

    this.x += this.vx;
    this.y += this.vy;

    // World boundary bounce / wrap
    const padding = this.radius * 1.5;
    if (this.x < padding) {
      this.x = padding;
      this.targetAngle = 0;
    } else if (this.x > worldWidth - padding) {
      this.x = worldWidth - padding;
      this.targetAngle = Math.PI;
    }

    if (this.y < padding) {
      this.y = padding;
      this.targetAngle = Math.PI / 2;
    } else if (this.y > worldHeight - padding) {
      this.y = worldHeight - padding;
      this.targetAngle = -Math.PI / 2;
    }
  }

  // Common fish rendering pipeline
  render(ctx, camera) {
    // Frustum culling
    if (
      this.x + this.radius * 2 < camera.x ||
      this.x - this.radius * 2 > camera.x + camera.width ||
      this.y + this.radius * 2 < camera.y ||
      this.y - this.radius * 2 > camera.y + camera.height
    ) {
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Render shadow under fish
    ctx.save();
    ctx.translate(5, 8);
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius * 1.1, this.radius * 0.65, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2, 6, 18, 0.4)';
    ctx.filter = 'blur(4px)';
    ctx.fill();
    ctx.restore();

    // Delegate to specific AI fish renderer
    switch (this.species.type) {
      case 'whale':
        this.renderWhale(ctx);
        break;
      case 'swirl':
        this.renderChatGPT(ctx);
        break;
      case 'manta':
        this.renderClaude(ctx);
        break;
      case 'moon':
        this.renderKimi(ctx);
        break;
      case 'sparkle':
        this.renderGemini(ctx);
        break;
      case 'dragon':
        this.renderQwen(ctx);
        break;
      case 'shark':
        this.renderGrok(ctx);
        break;
      case 'llama':
        this.renderLlama(ctx);
        break;
      default:
        this.renderStandardFish(ctx);
        break;
    }

    ctx.restore();

    // Render Name & Param badge above fish
    this.renderInfoBadge(ctx);
  }

  // --- 1. DeepSeek Whale Procedural Renderer ---
  renderWhale(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.22);
    const finAngle = Math.sin(this.tailPhase * 0.7) * 0.15;

    // Glowing Aura for larger models
    if (this.params >= 70) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 216, 255, 0.15)';
      ctx.shadowColor = '#00d8ff';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.restore();
    }

    // Pectoral Fin (Bottom/Side)
    ctx.save();
    ctx.translate(r * 0.1, r * 0.4);
    ctx.rotate(finAngle + 0.2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(r * 0.2, r * 0.5, -r * 0.3, r * 0.45);
    ctx.quadraticCurveTo(-r * 0.1, r * 0.1, 0, 0);
    ctx.fillStyle = this.species.primaryColor;
    ctx.fill();
    ctx.strokeStyle = this.species.secondaryColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Whale Tail Flukes
    ctx.save();
    ctx.translate(-r * 1.1, tailWag);
    ctx.beginPath();
    // Top fluke
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.4, -r * 0.6, -r * 0.65, -r * 0.7);
    ctx.quadraticCurveTo(-r * 0.45, -r * 0.2, -r * 0.15, 0);
    // Bottom fluke
    ctx.quadraticCurveTo(-r * 0.45, r * 0.2, -r * 0.65, r * 0.7);
    ctx.quadraticCurveTo(-r * 0.4, r * 0.6, 0, 0);
    ctx.fillStyle = this.species.primaryColor;
    ctx.fill();
    ctx.strokeStyle = this.species.secondaryColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Whale Main Body
    ctx.beginPath();
    // Head / Snout (curved friendly whale head)
    ctx.moveTo(r * 1.15, -r * 0.1);
    ctx.bezierCurveTo(r * 1.2, -r * 0.55, r * 0.4, -r * 0.75, -r * 0.3, -r * 0.6);
    // Back to Tail
    ctx.quadraticCurveTo(-r * 0.8, -r * 0.4, -r * 1.1, tailWag * 0.6);
    // Tail to Belly
    ctx.quadraticCurveTo(-r * 0.8, r * 0.3, -r * 0.3, r * 0.55);
    // Belly to Snout
    ctx.bezierCurveTo(r * 0.4, r * 0.7, r * 1.15, r * 0.4, r * 1.15, -r * 0.1);
    ctx.closePath();

    // Gradient filling for DeepSeek Whale Body
    const grad = ctx.createLinearGradient(-r, -r * 0.6, r, r * 0.6);
    grad.addColorStop(0, '#1045b5');
    grad.addColorStop(0.5, this.species.primaryColor);
    grad.addColorStop(1, '#2563eb');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = this.species.secondaryColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // White / Cyan Underbelly
    ctx.beginPath();
    ctx.moveTo(r * 0.9, r * 0.2);
    ctx.quadraticCurveTo(r * 0.2, r * 0.6, -r * 0.4, r * 0.45);
    ctx.quadraticCurveTo(r * 0.3, r * 0.25, r * 0.9, r * 0.2);
    ctx.fillStyle = this.species.bellyColor;
    ctx.fill();

    // Cyber Lines on Belly (DeepSeek Tech aesthetic)
    ctx.beginPath();
    ctx.moveTo(r * 0.6, r * 0.3);
    ctx.lineTo(r * 0.6, r * 0.48);
    ctx.moveTo(r * 0.35, r * 0.32);
    ctx.lineTo(r * 0.35, r * 0.52);
    ctx.moveTo(r * 0.1, r * 0.34);
    ctx.lineTo(r * 0.1, r * 0.5);
    ctx.strokeStyle = 'rgba(0, 216, 255, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Cute Whale Eye
    const eyeX = r * 0.72;
    const eyeY = -r * 0.18;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + r * 0.03, eyeY, r * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    // Catchlight in eye
    ctx.beginPath();
    ctx.arc(eyeX + r * 0.04, eyeY - r * 0.03, r * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // DeepSeek Blowhole & Spout (occasional cute bubble)
    ctx.beginPath();
    ctx.arc(r * 0.1, -r * 0.68, r * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = '#00d8ff';
    ctx.fill();
  }

  // --- 2. ChatGPT Swirl Fish Procedural Renderer ---
  renderChatGPT(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.28);

    // Tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.3, -r * 0.4 + tailWag);
    ctx.lineTo(-r * 1.1, tailWag * 0.5);
    ctx.lineTo(-r * 1.3, r * 0.4 + tailWag);
    ctx.closePath();
    ctx.fillStyle = this.species.primaryColor;
    ctx.fill();
    ctx.strokeStyle = this.species.accentColor;
    ctx.stroke();

    // Main Body (Sleek aerodynamic oval)
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.62, 0, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, '#064e3b');
    grad.addColorStop(0.6, this.species.primaryColor);
    grad.addColorStop(1, '#34d399');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = this.species.accentColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Signature OpenAI Swirl Logo pattern on body
    ctx.save();
    ctx.translate(-r * 0.05, 0);
    ctx.scale(r * 0.016, r * 0.016);
    ctx.rotate(this.tailPhase * 0.2);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      ctx.rotate((Math.PI * 2) / 6);
      ctx.moveTo(0, -6);
      ctx.lineTo(8, -12);
      ctx.lineTo(14, -8);
      ctx.lineTo(8, 0);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Eye
    ctx.beginPath();
    ctx.arc(r * 0.6, -r * 0.16, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.63, -r * 0.16, r * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#064e3b';
    ctx.fill();
  }

  // --- 3. Claude Golden Manta Ray / Starfish Procedural Renderer ---
  renderClaude(ctx) {
    const r = this.radius;
    const wingFlap = Math.sin(this.tailPhase * 0.8) * 0.15;

    // Wing Fins (Manta style wings)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r * 0.8, 0);
    ctx.quadraticCurveTo(r * 0.1, -r * (1.1 + wingFlap), -r * 0.6, -r * 0.4);
    ctx.quadraticCurveTo(-r * 0.3, 0, -r * 0.6, r * 0.4);
    ctx.quadraticCurveTo(r * 0.1, r * (1.1 + wingFlap), r * 0.8, 0);
    const grad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.2);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(0.7, '#d97706');
    grad.addColorStop(1, '#78350f');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Long Ribbon Tail
    const tailWag = Math.sin(this.tailPhase) * (r * 0.35);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.quadraticCurveTo(-r * 1.2, tailWag * 0.8, -r * 1.6, tailWag);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Eye
    ctx.beginPath();
    ctx.arc(r * 0.48, -r * 0.18, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.51, -r * 0.18, r * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#78350f';
    ctx.fill();
  }

  // --- 4. Kimi Moon Crescent Fish Procedural Renderer ---
  renderKimi(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.25);

    // Tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.quadraticCurveTo(-r * 1.2, -r * 0.4 + tailWag, -r * 1.3, tailWag);
    ctx.quadraticCurveTo(-r * 1.2, r * 0.4 + tailWag, -r * 0.7, 0);
    ctx.fillStyle = '#7c3aed';
    ctx.fill();
    ctx.strokeStyle = '#c084fc';
    ctx.stroke();

    // Crescent Moon Body
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, -Math.PI * 0.6, Math.PI * 0.6);
    ctx.quadraticCurveTo(-r * 0.2, 0, 0, -r * 0.85);
    const grad = ctx.createLinearGradient(-r, -r, r, r);
    grad.addColorStop(0, '#a855f7');
    grad.addColorStop(0.5, '#6b21a8');
    grad.addColorStop(1, '#3b0764');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Glowing Moon Crest on Side
    ctx.beginPath();
    ctx.arc(r * 0.1, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(233, 213, 255, 0.4)';
    ctx.fill();

    // Eye
    ctx.beginPath();
    ctx.arc(r * 0.5, -r * 0.15, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.53, -r * 0.15, r * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#4c1d95';
    ctx.fill();
  }

  // --- 5. Gemini 4-Point Star Sparkle Fish ---
  renderGemini(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.26);

    // Twin Tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.25, -r * 0.35 + tailWag);
    ctx.lineTo(-r * 0.9, tailWag * 0.5);
    ctx.lineTo(-r * 1.25, r * 0.35 + tailWag);
    ctx.closePath();
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#93c5fd';
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.58, 0, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, '#1e3a8a');
    grad.addColorStop(0.4, '#3b82f6');
    grad.addColorStop(0.8, '#8b5cf6');
    grad.addColorStop(1, '#ec4899');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4-Point Google Sparkle Star on side
    ctx.save();
    ctx.translate(-r * 0.05, 0);
    ctx.beginPath();
    const starR = r * 0.35;
    ctx.moveTo(0, -starR);
    ctx.quadraticCurveTo(0, 0, starR, 0);
    ctx.quadraticCurveTo(0, 0, 0, starR);
    ctx.quadraticCurveTo(0, 0, -starR, 0);
    ctx.quadraticCurveTo(0, 0, 0, -starR);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();

    // Eye
    ctx.beginPath();
    ctx.arc(r * 0.55, -r * 0.14, r * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.58, -r * 0.14, r * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#1e3a8a';
    ctx.fill();
  }

  // --- 6. Qwen Dragon Fish ---
  renderQwen(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.3);

    // Flowing Dragon Barbels (Whiskers)
    ctx.beginPath();
    ctx.moveTo(r * 0.9, -r * 0.1);
    ctx.quadraticCurveTo(r * 1.3, -r * 0.3, r * 1.4, -r * 0.15 + tailWag * 0.4);
    ctx.moveTo(r * 0.9, r * 0.1);
    ctx.quadraticCurveTo(r * 1.3, r * 0.3, r * 1.4, r * 0.15 + tailWag * 0.4);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.bezierCurveTo(-r * 1.0, -r * 0.6 + tailWag, -r * 1.3, -r * 0.4 + tailWag, -r * 1.4, tailWag);
    ctx.bezierCurveTo(-r * 1.3, r * 0.4 + tailWag, -r * 1.0, r * 0.6 + tailWag, -r * 0.6, 0);
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.strokeStyle = '#fed7aa';
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, '#9a3412');
    grad.addColorStop(0.5, '#ea580c');
    grad.addColorStop(1, '#f97316');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#fed7aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eye
    ctx.beginPath();
    ctx.arc(r * 0.6, -r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.63, -r * 0.15, r * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#7c2d12';
    ctx.fill();
  }

  // --- 7. Grok Cyber Shark ---
  renderGrok(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.3);

    // Shark Dorsal Fin
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.5);
    ctx.lineTo(-r * 0.2, -r * 0.95);
    ctx.lineTo(-r * 0.4, -r * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Shark Tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, 0);
    ctx.lineTo(-r * 1.35, -r * 0.6 + tailWag);
    ctx.lineTo(-r * 1.05, tailWag * 0.5);
    ctx.lineTo(-r * 1.25, r * 0.4 + tailWag);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Angular Cyber Body
    ctx.beginPath();
    ctx.moveTo(r * 1.15, 0); // Sharp nose
    ctx.lineTo(r * 0.4, -r * 0.55);
    ctx.lineTo(-r * 0.8, -r * 0.35);
    ctx.lineTo(-r * 0.8, r * 0.35);
    ctx.lineTo(r * 0.4, r * 0.55);
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 'X' Cyber mark on body
    ctx.save();
    ctx.translate(-r * 0.1, 0);
    ctx.beginPath();
    const xSize = r * 0.22;
    ctx.moveTo(-xSize, -xSize);
    ctx.lineTo(xSize, xSize);
    ctx.moveTo(xSize, -xSize);
    ctx.lineTo(-xSize, xSize);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Glowing White Eye
    ctx.beginPath();
    ctx.arc(r * 0.7, -r * 0.16, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fill();
  }

  // --- 8. Llama Tropical Fish ---
  renderLlama(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.24);

    // Tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.2, -r * 0.45 + tailWag);
    ctx.lineTo(-r * 1.2, r * 0.45 + tailWag);
    ctx.closePath();
    ctx.fillStyle = '#7c3aed';
    ctx.fill();
    ctx.strokeStyle = '#e9d5ff';
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.9, r * 0.65, 0, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(-r, 0, r, 0);
    grad.addColorStop(0, '#581c87');
    grad.addColorStop(0.5, '#7e22ce');
    grad.addColorStop(1, '#a855f7');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#f3e8ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cute Llama ear fin
    ctx.beginPath();
    ctx.ellipse(r * 0.2, -r * 0.65, r * 0.12, r * 0.25, 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Eye
    ctx.beginPath();
    ctx.arc(r * 0.5, -r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.53, -r * 0.15, r * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#3b0764';
    ctx.fill();
  }

  // --- Fallback Standard Fish ---
  renderStandardFish(ctx) {
    const r = this.radius;
    const tailWag = Math.sin(this.tailPhase) * (r * 0.25);

    // Tail
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.2, -r * 0.4 + tailWag);
    ctx.lineTo(-r * 1.2, r * 0.4 + tailWag);
    ctx.closePath();
    ctx.fillStyle = this.species.primaryColor;
    ctx.fill();

    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = this.species.primaryColor;
    ctx.fill();
    ctx.strokeStyle = this.species.secondaryColor;
    ctx.stroke();

    // Eye
    ctx.beginPath();
    ctx.arc(r * 0.55, -r * 0.15, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // Render floating name & parameter tag above fish
  renderInfoBadge(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y - this.radius - 14);

    const nameText = `${this.species.name}`;
    const paramText = `${this.params.toFixed(1)}B`;

    ctx.font = 'bold 10px "Orbitron", "Noto Sans SC", sans-serif';
    const nameWidth = ctx.measureText(nameText).width;
    const badgeWidth = Math.max(50, nameWidth + 14);

    // Background pill
    ctx.beginPath();
    ctx.roundRect(-badgeWidth / 2, -10, badgeWidth, 18, 9);
    ctx.fillStyle = 'rgba(6, 16, 33, 0.75)';
    ctx.fill();
    ctx.strokeStyle = this.species.accentColor || '#38bdf8';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Name text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameText, 0, -2);

    // Param sub-label
    ctx.font = '800 8px "Orbitron", sans-serif';
    ctx.fillStyle = this.species.accentColor || '#38bdf8';
    ctx.fillText(paramText, 0, 6);

    ctx.restore();
  }
}

window.Fish = Fish;
window.AI_SPECIES = AI_SPECIES;
