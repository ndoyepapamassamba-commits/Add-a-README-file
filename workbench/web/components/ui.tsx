import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import { cx } from '../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-45 select-none whitespace-nowrap',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-accent-fg hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-panel text-fg hover:bg-hover',
        variant === 'ghost' && 'text-muted hover:bg-hover hover:text-fg',
        variant === 'subtle' && 'bg-hover text-fg hover:bg-line',
        variant === 'danger' && 'border border-err/40 text-err hover:bg-err/10',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40',
        active && 'bg-hover text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info';
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-medium leading-4',
        tone === 'neutral' && 'bg-hover text-muted',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'ok' && 'bg-ok/15 text-ok',
        tone === 'warn' && 'bg-warn/15 text-warn',
        tone === 'err' && 'bg-err/15 text-err',
        tone === 'info' && 'bg-info/15 text-info',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block h-3.5 w-3.5 rounded-full border-2 border-line-strong border-t-accent wb-spin',
        className,
      )}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-hover px-1 font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        'h-8 w-full rounded-lg border border-line bg-input px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-accent',
        className,
      )}
    />
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cx(
        'w-full rounded-lg border border-line bg-input px-2.5 py-2 text-[13px] outline-none placeholder:text-faint focus:border-accent',
        className,
      )}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  title?: string;
}) {
  return (
    <select
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx(
        'h-8 rounded-lg border border-line bg-input px-2 text-[13px] outline-none focus:border-accent',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx('inline-flex cursor-pointer items-center gap-2 select-none', disabled && 'opacity-50')}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-[18px] w-8 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all',
            checked ? 'left-[16px]' : 'left-[2px]',
          )}
        />
      </button>
      {label && <span className="text-[13px]">{label}</span>}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 640,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="wb-in flex max-h-[84vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-elev shadow-pop"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="font-semibold">{title}</div>
          <IconButton label="Fermer" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  right,
}: {
  tabs: { id: T; label: ReactNode; badge?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <div
      className={cx('flex h-9 shrink-0 items-center gap-0.5 border-b border-line px-1.5', className)}
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
            value === t.id ? 'bg-hover text-fg' : 'text-muted hover:text-fg',
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1">{right}</div>
    </div>
  );
}

export interface MenuItem<T extends string = string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

/** Lightweight dropdown menu anchored to its trigger (portal, keyboard-closable). */
export function Dropdown<T extends string>({
  trigger,
  items,
  value,
  onSelect,
  header,
  width = 260,
  align = 'left',
  placement = 'bottom',
  search,
  className,
}: {
  trigger: ReactNode;
  items: MenuItem<T>[];
  value?: T;
  onSelect: (v: T) => void;
  header?: ReactNode;
  width?: number;
  align?: 'left' | 'right';
  placement?: 'top' | 'bottom';
  search?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(window.innerWidth - width - 8, align === 'right' ? r.right - width : r.left),
    );
    setPos(
      placement === 'top' ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 },
    );
  }, [open, width, align, placement]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-dropdown]') && !ref.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const filtered = q
    ? items.filter((i) =>
        `${i.value} ${typeof i.label === 'string' ? i.label : ''}`.toLowerCase().includes(q.toLowerCase()),
      )
    : items;
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx('inline-flex items-center gap-1', className)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            data-dropdown
            className="wb-in fixed z-50 overflow-hidden rounded-xl border border-line bg-elev shadow-pop"
            style={{ ...pos, width }}
            role="menu"
          >
            {header && (
              <div className="border-b border-line px-3 py-2 text-[11.5px] text-muted">{header}</div>
            )}
            {search && (
              <div className="border-b border-line p-1.5">
                <Input
                  autoFocus
                  placeholder="Rechercher…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="h-7"
                />
              </div>
            )}
            <div className="max-h-[360px] overflow-auto p-1">
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-[12.5px] text-faint">Aucun résultat</div>
              )}
              {filtered.slice(0, 300).map((i) => (
                <button
                  key={i.value}
                  disabled={i.disabled}
                  role="menuitem"
                  onClick={() => {
                    onSelect(i.value);
                    setOpen(false);
                    setQ('');
                  }}
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-40"
                >
                  <span className="mt-0.5 w-4 shrink-0 text-accent">
                    {value === i.value ? <Check size={14} /> : i.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{i.label}</span>
                    {i.hint && <span className="block text-[11.5px] leading-snug text-faint">{i.hint}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function Chip({
  children,
  onClick,
  active,
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-fg',
        active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Caret() {
  return <ChevronDown size={13} className="opacity-60" />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="font-medium text-fg">{title}</div>
      {children && <div className="max-w-md text-[13px]">{children}</div>}
    </div>
  );
}

/** Horizontal gauge (credits, budgets, context window). */
export function Gauge({
  value,
  max,
  tone,
  className,
}: {
  value: number;
  max: number;
  tone?: 'auto' | 'accent';
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === 'accent' ? 'bg-accent' : pct >= 90 ? 'bg-err' : pct >= 75 ? 'bg-warn' : 'bg-ok';
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-hover', className)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Section({
  title,
  children,
  right,
}: {
  title: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-faint">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <div className="mb-1 text-[12.5px] font-medium">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11.5px] text-faint">{hint}</div>}
    </label>
  );
}
