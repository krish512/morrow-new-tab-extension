const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionByDialog = new WeakMap();
const registered = new WeakSet();

export function openDialog(dialog) {
  if (dialog.open) return;
  if (!registered.has(dialog)) {
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      void closeDialog(dialog);
    });
    registered.add(dialog);
  }
  dialog.classList.remove('is-closing');
  dialog.showModal();
  if (reducedMotion()) return;
  motionByDialog.get(dialog)?.cancel();
  motionByDialog.set(dialog, dialog.animate(
    [{ opacity: 0, transform: 'translateY(12px) scale(.985)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }],
    { duration: 290, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  ));
}

export async function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains('is-closing')) return;
  motionByDialog.get(dialog)?.cancel();
  if (reducedMotion()) { dialog.close(); return; }
  dialog.classList.add('is-closing');
  const motion = dialog.animate(
    [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }],
    { duration: 180, easing: 'ease-in', fill: 'forwards' }
  );
  motionByDialog.set(dialog, motion);
  try { await motion.finished; } catch { return; }
  if (motionByDialog.get(dialog) !== motion) return;
  dialog.close();
  dialog.classList.remove('is-closing');
  motion.cancel();
}
