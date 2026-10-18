/** Ionic elements the workout logger renders, including those inside its date modal and buttons */
export const LOGGER_IONIC_TAGS = [
  'ion-back-button',
  'ion-backdrop',
  'ion-button',
  'ion-buttons',
  'ion-card',
  'ion-content',
  'ion-datetime',
  'ion-datetime-button',
  'ion-footer',
  'ion-header',
  'ion-icon',
  'ion-input',
  'ion-item',
  'ion-item-option',
  'ion-item-options',
  'ion-item-sliding',
  'ion-modal',
  'ion-ripple-effect',
  'ion-spinner',
  'ion-toolbar',
];

/**
 * Loads the code of the given Ionic elements, if an earlier spec has defined
 * them. Ionic loads an element's code the first time one is connected, with
 * a script tag and a timer; inside fakeAsync that load fails ("Constructor
 * for ion-… was not found"), so specs that render these under fakeAsync call
 * this first, outside it. Undefined elements stay plain tags and load nothing.
 */
export async function loadIonicElements(tags: string[]): Promise<void> {
  const defined = tags.filter((tag) => customElements.get(tag));
  if (!defined.length) return;
  const holder = document.createElement('div');
  holder.hidden = true;
  document.body.appendChild(holder);
  try {
    await Promise.all(
      defined.map((tag) => {
        const el = document.createElement(tag) as HTMLElement & { componentOnReady?: () => Promise<unknown> };
        // A datetime button looks up its datetime by id
        if (tag === 'ion-datetime') el.id = 'ionic-testing-datetime';
        if (tag === 'ion-datetime-button') el.setAttribute('datetime', 'ionic-testing-datetime');
        holder.appendChild(el);
        return el.componentOnReady?.();
      }),
    );
  } finally {
    holder.remove();
  }
}
