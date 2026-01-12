import { useState, useCallback } from 'react';

interface UseQRScannerOptions {
  onScan?: (data: string) => void;
  autoClose?: boolean;
}

interface UseQRScannerReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  handleScan: (data: string) => void;
}

export function useQRScanner(options: UseQRScannerOptions = {}): UseQRScannerReturn {
  const { onScan, autoClose = true } = options;
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleScan = useCallback((data: string) => {
    if (onScan) {
      onScan(data);
    }
    if (autoClose) {
      setIsOpen(false);
    }
  }, [onScan, autoClose]);

  return {
    isOpen,
    open,
    close,
    toggle,
    handleScan,
  };
}
