export type ToastType = 'info' | 'error';

export interface ToastOptions {
    title?: string;
    message: string;
    type?: ToastType;
    durationMs?: number;
}

export class Toast {

    private static readonly DEFAULT_DURATION_MS = 4000;
    private static readonly ICON_MAP: Record<ToastType, string> = {
        info: 'i',
        error: '!'
    };

    public static show(opts: ToastOptions): void {
        const container = document.getElementById('toast-container');

        if (!container) {
            console.warn('Toast: container #toast-container not present');
            return;
        }

        const type: ToastType = opts.type ?? 'info';

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = Toast.ICON_MAP[type];
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'toast-body';

        if (opts.title) {
            const title = document.createElement('span');
            title.className = 'toast-title';
            title.textContent = opts.title;
            body.appendChild(title);
        }

        const message = document.createElement('span');
        message.className = 'toast-message';
        message.textContent = opts.message;
        body.appendChild(message);

        el.appendChild(icon);
        el.appendChild(body);

        container.appendChild(el);

        const duration = opts.durationMs ?? Toast.DEFAULT_DURATION_MS;

        window.setTimeout(() => {
            el.classList.add('is-leaving');
            window.setTimeout(() => el.remove(), 200);
        }, duration);
    }

}