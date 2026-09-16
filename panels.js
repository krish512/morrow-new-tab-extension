// Shared behaviour for the two small, non-modal utility panels.
class MorrowPanel extends HTMLElement {
  connectedCallback() {
    this.trigger = document.getElementById(this.dataset.trigger);
    this.trigger?.addEventListener('click', () => this.hidden || this.closing ? this.open() : this.close());
    this.querySelector('[data-panel-close]')?.addEventListener('click', () => this.close());
    this.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        this.close();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.hidden && !this.contains(event.target) && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        this.close();
      }
    });
  }
  open() {
    document.querySelectorAll('morrow-panel:not([hidden])').forEach(panel => {
      if (panel !== this) panel.close(false);
    });
    this.motion?.cancel();
    this.closing = false;
    this.hidden = false;
    this.inert = false;
    this.trigger?.setAttribute('aria-expanded', 'true');
    this.dispatchEvent(new Event('panelopen'));
    this.querySelector('[data-initial-focus]')?.focus();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.motion = this.animate(
        [{ opacity: 0, transform: 'translateY(12px) scale(.985)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
  }
  close(restoreFocus = true) {
    if (this.hidden || this.closing) return;
    this.motion?.cancel();
    this.closing = true;
    this.inert = true;
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.dispatchEvent(new Event('panelclose'));
    if (restoreFocus) this.trigger?.focus();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.hidden = true;
      this.closing = false;
      return;
    }
    const motion = this.animate(
      [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }],
      { duration: 190, easing: 'ease-in', fill: 'forwards' }
    );
    this.motion = motion;
    void motion.finished.then(() => {
      if (this.motion !== motion) return;
      this.hidden = true;
      this.closing = false;
      motion.cancel();
    }).catch(() => {});
  }
}
customElements.define('morrow-panel', MorrowPanel);
