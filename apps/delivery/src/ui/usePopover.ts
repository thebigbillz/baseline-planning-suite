import { useEffect, useRef, type RefObject } from 'react';

/** Closes a popover on Escape or a click outside it. */
export function usePopover<T extends HTMLElement>(onClose: () => void): RefObject<T> {
  const element = useRef<T>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!element.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return element;
}
