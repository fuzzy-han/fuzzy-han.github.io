/**
 * Gemini 3.7 Flash Interactive Showcase · Main Coordinator
 */

document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching
  const navTabs = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.tab-section');

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;

      navTabs.forEach((t) => t.classList.remove('active'));
      sections.forEach((s) => s.classList.remove('active'));

      tab.classList.add('active');
      const targetSec = document.getElementById(targetId);
      if (targetSec) targetSec.classList.add('active');

      if (window.soundEngine) window.soundEngine.playClick();
    });
  });

  // Sound Mute Toggle Button
  const soundBtn = document.getElementById('soundToggleBtn');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      if (!window.soundEngine) return;
      const isMuted = window.soundEngine.toggleMute();
      soundBtn.innerHTML = isMuted ? '🔇' : '🔊';
      soundBtn.classList.toggle('active', !isMuted);
      showToast(isMuted ? '音效已静音' : '音效已开启 🔊');
    });
  }

  // Copy Code Button
  const copyBtn = document.getElementById('copyCodeBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const codeEl = document.getElementById('codeOutput');
      if (codeEl) {
        const text = codeEl.innerText;
        navigator.clipboard.writeText(text).then(() => {
          showToast('📋 代码已成功复制到剪贴板！');
          if (window.soundEngine) window.soundEngine.playClick();
        });
      }
    });
  }

  // Overclock Mode Easter Egg (Hyper Speed)
  const overclockBtn = document.getElementById('overclockBtn');
  let isOverclocked = false;

  if (overclockBtn) {
    overclockBtn.addEventListener('click', () => {
      isOverclocked = !isOverclocked;
      if (window.particleNebula) {
        window.particleNebula.setWarp(isOverclocked ? 4 : 1);
      }
      overclockBtn.classList.toggle('active', isOverclocked);
      if (window.soundEngine) window.soundEngine.playPowerup();
      showToast(isOverclocked ? '⚡ 超频模式已激活！150+ Tokens/s 峰值全开！' : '常规模式');
    });
  }
});

// Global Toast System
window.showToast = function(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✨</span> ${msg}`;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 3000);
};
