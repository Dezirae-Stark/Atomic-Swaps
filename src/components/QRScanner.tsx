'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
  description?: string;
  validate?: (data: string) => { valid: boolean; error?: string };
}

export function QRScanner({
  isOpen,
  onClose,
  onScan,
  title = 'Scan QR Code',
  description = 'Point your camera at a QR code',
  validate,
}: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [scanMode, setScanMode] = useState<'camera' | 'file'>('camera');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING state
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
  }, []);

  const handleScanSuccess = useCallback((decodedText: string) => {
    if (validate) {
      const result = validate(decodedText);
      if (!result.valid) {
        setError(result.error || 'Invalid QR code content');
        return;
      }
    }

    // Successful scan
    stopScanner();
    onScan(decodedText);
    onClose();
  }, [validate, onScan, onClose, stopScanner]);

  const handleClose = useCallback(() => {
    stopScanner();
    onClose();
  }, [stopScanner, onClose]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setError(null);

    try {
      // Stop camera scanner if running
      await stopScanner();

      // Create a new scanner instance for file scanning
      const html5QrCode = new Html5Qrcode('qr-file-reader');

      const result = await html5QrCode.scanFile(file, true);

      // Clean up the scanner
      html5QrCode.clear();

      // Process the result
      handleScanSuccess(result);
    } catch (err) {
      console.error('File scan error:', err);
      if (err instanceof Error) {
        if (err.message.includes('No QR code found')) {
          setError('No QR code found in this image. Please try another image.');
        } else {
          setError('Failed to read QR code from image. Please try another image.');
        }
      } else {
        setError('Failed to process image. Please try again.');
      }
    } finally {
      setIsProcessingFile(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [stopScanner, handleScanSuccess]);

  useEffect(() => {
    if (!isOpen || scanMode !== 'camera') return;

    const initScanner = async () => {
      setIsInitializing(true);
      setError(null);

      try {
        // Wait for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!containerRef.current) return;

        scannerRef.current = new Html5Qrcode('qr-reader');

        await scannerRef.current.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          handleScanSuccess,
          () => {} // Ignore scan failures (keep scanning)
        );

        setIsInitializing(false);
      } catch (err) {
        console.error('Camera error:', err);
        setIsInitializing(false);

        if (err instanceof Error) {
          if (err.message.includes('NotAllowedError') || err.message.includes('Permission')) {
            setError('Camera access denied. Use the "Select Image" button below to scan from a file.');
          } else if (err.message.includes('NotFoundError')) {
            setError('No camera found. Use the "Select Image" button below to scan from a file.');
          } else if (err.message.includes('NotReadableError') || err.message.includes('in use')) {
            setError('Camera is in use. Use the "Select Image" button below to scan from a file.');
          } else {
            setError('Camera unavailable. Use the "Select Image" button below to scan from a file.');
          }
        } else {
          setError('Camera unavailable. Use the "Select Image" button below to scan from a file.');
        }
      }
    };

    initScanner();

    return () => {
      stopScanner();
    };
  }, [isOpen, scanMode, handleScanSuccess, stopScanner]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={handleClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />

          {/* Scanner Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white mb-2 text-readable">
                {title}
              </h2>
              <p className="text-gray-400 text-readable">
                {description}
              </p>
            </div>

            {/* Camera Viewfinder */}
            <div className="relative rounded-2xl overflow-hidden bg-dark-900 border-2 border-samourai-red shadow-2xl">
              {/* Camera Feed Container */}
              <div
                id="qr-reader"
                ref={containerRef}
                className="w-full aspect-square"
                style={{ minHeight: '300px' }}
              />

              {/* Hidden container for file scanning */}
              <div id="qr-file-reader" className="hidden" />

              {/* Scanning Animation Overlay */}
              {!error && !isInitializing && !isProcessingFile && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Corner Brackets */}
                  <div className="absolute top-4 left-4 w-12 h-12 border-t-3 border-l-3 border-samourai-red rounded-tl-lg" />
                  <div className="absolute top-4 right-4 w-12 h-12 border-t-3 border-r-3 border-samourai-red rounded-tr-lg" />
                  <div className="absolute bottom-4 left-4 w-12 h-12 border-b-3 border-l-3 border-samourai-red rounded-bl-lg" />
                  <div className="absolute bottom-4 right-4 w-12 h-12 border-b-3 border-r-3 border-samourai-red rounded-br-lg" />

                  {/* Animated Scan Line */}
                  <motion.div
                    className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-samourai-red to-transparent"
                    animate={{ top: ['15%', '85%', '15%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
              )}

              {/* Loading State */}
              {(isInitializing || isProcessingFile) && (
                <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
                  <div className="text-center">
                    <div className="w-12 h-12 border-3 border-samourai-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">
                      {isProcessingFile ? 'Processing image...' : 'Starting camera...'}
                    </p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && !isProcessingFile && (
                <div className="absolute inset-0 flex items-center justify-center bg-dark-900 p-6">
                  <div className="text-center">
                    <svg className="w-16 h-16 text-samourai-red mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-white font-medium mb-2">
                      {error.includes('QR code') ? 'Scan Error' : 'Camera Error'}
                    </p>
                    <p className="text-gray-400 text-sm">{error}</p>
                  </div>
                </div>
              )}
            </div>

            {/* File Input (hidden) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="qr-file-input"
            />

            {/* Actions */}
            <div className="mt-6 space-y-3">
              {/* Select Image Button */}
              <label
                htmlFor="qr-file-input"
                className="flex items-center justify-center gap-2 w-full btn-primary py-4 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Select Image from Device
              </label>

              {/* Cancel / Retry Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={handleClose}
                  className="flex-1 btn-secondary py-4"
                >
                  Cancel
                </button>
                {error && error.includes('Camera') && (
                  <button
                    onClick={() => {
                      setError(null);
                      setIsInitializing(true);
                      stopScanner().then(() => {
                        setTimeout(() => {
                          if (containerRef.current) {
                            scannerRef.current = new Html5Qrcode('qr-reader');
                            scannerRef.current.start(
                              { facingMode: 'environment' },
                              { fps: 10, qrbox: { width: 250, height: 250 } },
                              handleScanSuccess,
                              () => {}
                            ).then(() => setIsInitializing(false))
                              .catch(() => setError('Camera unavailable. Use the "Select Image" button above.'));
                          }
                        }, 100);
                      });
                    }}
                    className="flex-1 btn-secondary py-4"
                  >
                    Retry Camera
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
