import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Toast.module.css';

interface ToastMessage {
  id: number;
  text: string;
  undo?: () => void;
}

type ShowToast = (text: string, options?: { undo?: () => void }) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** Shows one toast at a time: 2.8 s, or 5 s when it offers Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const next = useRef(0);

  const show = useCallback<ShowToast>((text, options) => {
    next.current += 1;
    setToast({ id: next.current, text, undo: options?.undo });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.undo ? 5000 : 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* The live region stays mounted so screen readers announce each new message. */}
      <div role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={styles.toast}>
            <Icon name="check" />
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                className={styles.undo}
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
