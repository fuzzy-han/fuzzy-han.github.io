/**
 * Particle and Visual FX System
 */
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.ambientParticles = [];
    this.floatingTexts = [];
    this.shockwaves = [];
    this.initAmbient();
  }

  initAmbient() {
    // Generate background floating ocean particles
    for (let i = 0; i < 90; i++) {
      this.ambientParticles.push({
        x: Math.random() * 5000,
        y: Math.random() * 5000,
        size: 1 + Math.random() * 3.5,
        speedY: -0.3 - Math.random() * 0.7,
        speedX: (Math.random() - 0.5) * 0.4,
        alpha: 0.2 + Math.random() * 0.6,
        type: Math.random() > 0.4 ? 'bubble' : (Math.random() > 0.5 ? 'code' : 'sparkle'),
        char: Math.random() > 0.5 ? '1' : '0',
        color: Math.random() > 0.5 ? '#00f0ff' : '#38bdf8'
      });
    }
  }

  // Create explosion of particles when a fish/token is eaten
  createEatBurst(x, y, color = '#00f0ff', count = 18, speedMult = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (2 + Math.random() * 6) * speedMult;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 5,
        color,
        alpha: 1,
        decay: 0.02 + Math.random() * 0.03,
        shape: Math.random() > 0.5 ? 'circle' : 'star'
      });
    }
  }

  // DeepSeek R1 Dash trail sparks
  createDashTrail(x, y, angle) {
    const spread = (Math.random() - 0.5) * 0.6;
    const speed = -(2 + Math.random() * 3);
    const trailAngle = angle + spread;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 15,
      y: y + (Math.random() - 0.5) * 15,
      vx: Math.cos(trailAngle) * speed,
      vy: Math.sin(trailAngle) * speed,
      size: 2 + Math.random() * 4,
      color: '#00f0ff',
      alpha: 0.9,
      decay: 0.05 + Math.random() * 0.04,
      shape: 'code',
      char: Math.random() > 0.5 ? 'R1' : '🐳'
    });
  }

  // Create expanding shockwave ring
  createShockwave(x, y, maxRadius = 120, color = '#00f0ff') {
    this.shockwaves.push({
      x,
      y,
      radius: 5,
      maxRadius,
      color,
      alpha: 1,
      speed: 4.5
    });
  }

  // Floating text like "+7B Params", "Distilled!", "Combo x3"
  addFloatingText(x, y, text, color = '#38bdf8', fontSize = 16) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      fontSize,
      alpha: 1,
      vy: -1.2,
      scale: 1.3
    });
  }

  update(worldWidth, worldHeight) {
    // 1. Update Ambient Particles
    for (let p of this.ambientParticles) {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.y < 0) p.y = worldHeight;
      if (p.x < 0) p.x = worldWidth;
      if (p.x > worldWidth) p.x = 0;
    }

    // 2. Update Burst Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 3. Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed;
      sw.alpha = 1 - (sw.radius / sw.maxRadius);
      if (sw.radius >= sw.maxRadius || sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 4. Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.018;
      ft.scale = Math.max(1, ft.scale - 0.02);
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  render(ctx, camera) {
    // Render Ambient Particles
    ctx.save();
    for (let p of this.ambientParticles) {
      // Check if in camera view
      const screenX = p.x - camera.x;
      const screenY = p.y - camera.y;
      if (screenX < -50 || screenX > camera.width + 50 || screenY < -50 || screenY > camera.height + 50) {
        continue;
      }

      ctx.globalAlpha = p.alpha;
      if (p.type === 'bubble') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 216, 255, 0.4)';
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#00f0ff';
        ctx.stroke();
      } else if (p.type === 'code') {
        ctx.font = '10px "Orbitron", monospace';
        ctx.fillStyle = p.color;
        ctx.fillText(p.char, p.x, p.y);
      } else {
        // Sparkle
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Render Shockwaves
    for (let sw of this.shockwaves) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = sw.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = sw.color;
      ctx.stroke();
      ctx.restore();
    }

    // Render Burst Particles
    for (let p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;

      if (p.shape === 'code') {
        ctx.font = 'bold 11px "Orbitron", monospace';
        ctx.fillStyle = p.color;
        ctx.fillText(p.char, p.x, p.y);
      } else if (p.shape === 'star') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render Floating Texts
    for (let ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = `900 ${Math.floor(ft.fontSize * ft.scale)}px "Orbitron", "Noto Sans SC", sans-serif`;
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 8;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}

window.particleSystem = new ParticleSystem();
