/**
 * Floating Token Crystals & Ocean Power-Up Items
 */

class TokenCrystal {
  constructor(x, y, params = 0.5) {
    this.x = x;
    this.y = y;
    this.params = params; // 0.5B, 1.5B, 7B
    this.radius = Math.max(6, Math.pow(params, 0.45) * 7);
    this.angle = Math.random() * Math.PI * 2;
    this.rotSpeed = 0.02 + Math.random() * 0.03;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.isDead = false;
    
    // Slight drift
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = (Math.random() - 0.5) * 0.4;
    
    // Magnet pull velocity
    this.magnetVx = 0;
    this.magnetVy = 0;

    // Color based on size
    if (params >= 7) {
      this.color = '#a855f7'; // Purple 7B
      this.label = '7B';
    } else if (params >= 1.5) {
      this.color = '#00f0ff'; // Cyan 1.5B
      this.label = '1.5B';
    } else {
      this.color = '#38bdf8'; // Blue 0.5B
      this.label = 'Token';
    }
  }

  update(worldWidth, worldHeight) {
    this.angle += this.rotSpeed;
    this.pulsePhase += 0.05;

    this.x += this.vx + this.magnetVx;
    this.y += this.vy + this.magnetVy;

    // Friction for magnet velocity
    this.magnetVx *= 0.92;
    this.magnetVy *= 0.92;

    // Boundary wrapping
    if (this.x < 0) this.x = worldWidth;
    if (this.x > worldWidth) this.x = 0;
    if (this.y < 0) this.y = worldHeight;
    if (this.y > worldHeight) this.y = 0;
  }

  pullTowards(targetX, targetY, force = 0.8) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      this.magnetVx += (dx / dist) * force;
      this.magnetVy += (dy / dist) * force;
    }
  }

  render(ctx, camera) {
    // Frustum cull
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

    const pulse = 1 + Math.sin(this.pulsePhase) * 0.15;
    const r = this.radius * pulse;

    // Outer glow diamond
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.75, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.75, 0);
    ctx.closePath();

    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.85;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Inner bright core
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }
}

class PowerUp {
  constructor(x, y, type = 'battery') {
    this.x = x;
    this.y = y;
    this.type = type; // 'battery', 'shield', 'magnet', 'speed'
    this.radius = 22;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.isDead = false;
    this.duration = 1800; // ~30 seconds lifetime before despawning
    
    this.vx = (Math.random() - 0.5) * 0.6;
    this.vy = -0.3 - Math.random() * 0.3; // floats gently upward
    
    // Configurations
    const configs = {
      battery: { icon: '⚡', name: '算力超频', color: '#facc15', border: '#eab308' },
      shield: { icon: '🛡️', name: '开源护盾', color: '#38bdf8', border: '#0284c7' },
      magnet: { icon: '🧲', name: '百万上下文', color: '#ec4899', border: '#db2777' },
      speed: { icon: '🚀', name: 'KV-Cache 加速', color: '#a855f7', border: '#9333ea' }
    };
    this.config = configs[type] || configs.battery;
  }

  update(worldWidth, worldHeight) {
    this.pulsePhase += 0.06;
    this.x += this.vx;
    this.y += this.vy;
    this.duration--;

    if (this.duration <= 0) {
      this.isDead = true;
    }

    // Boundary wrapping
    if (this.x < 0) this.x = worldWidth;
    if (this.x > worldWidth) this.x = 0;
    if (this.y < 0) this.y = worldHeight;
    if (this.y > worldHeight) this.y = 0;
  }

  render(ctx, camera) {
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

    const pulse = 1 + Math.sin(this.pulsePhase) * 0.12;
    const r = this.radius * pulse;

    // Glowing protective orb
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();

    ctx.strokeStyle = this.config.border;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = this.config.color;
    ctx.shadowBlur = 16;
    ctx.stroke();

    // Emoji Icon inside
    ctx.font = '18px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.config.icon, 0, 1);

    // Label tag
    ctx.font = 'bold 9px "Orbitron", "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.fillText(this.config.name, 0, r + 10);

    ctx.restore();
  }
}

window.TokenCrystal = TokenCrystal;
window.PowerUp = PowerUp;
