'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface RerunViewerProps {
  url?: string | null;
  height?: string | number;
  width?: string | number;
  hideWelcomeScreen?: boolean;
  className?: string;
}

interface WebViewerInstance {
  stop: () => void;
}

const ERROR_MESSAGES = {
  webgpu: 'WebGPU not supported. Enable WebGPU in chrome://flags/#enable-unsafe-webgpu',
  compatibility: 'Browser compatibility issue. Try updating your browser or enabling WebGPU support.',
  network: 'Failed to load visualization data. Check that the server is running.',
  generic: 'Failed to load viewer'
} as const;

const isWebGPUError = (error: Error): boolean => 
  error.message.includes('externref') || 
  error.message.includes('WebGPU') || 
  error.message.includes('wasm');

const isNetworkError = (error: Error): boolean =>
  error.message.includes('fetch') || error.message.includes('CORS');

export function RerunViewer({ 
  url, 
  height = '600px', 
  width = '100%',
  hideWelcomeScreen = true,
  className = ''
}: RerunViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<WebViewerInstance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const dimensions = {
    height: typeof height === 'number' ? `${height}px` : height,
    width: typeof width === 'number' ? `${width}px` : width
  };

  const handleWebGPUError = useCallback((event: ErrorEvent): boolean => {
    if (event.error && (
      event.error.message?.includes('externref') || 
      event.error.message?.includes('WebGPU') ||
      event.message?.includes('wasm')
    )) {
      setError(ERROR_MESSAGES.webgpu);
      setLoading(false);
      event.preventDefault();
      return true;
    }
    return false;
  }, []);

  const startViewer = useCallback(async (
    viewer: WebViewerInstance, 
    url: string, 
    container: HTMLDivElement,
    options: Record<string, unknown>
  ) => {
    await import('@rerun-io/web-viewer');
    const webViewer = viewer as WebViewerInstance & { start: (url: string, container: HTMLDivElement, options: Record<string, unknown>) => Promise<void> };
    
    try {
      await webViewer.start(url, container, { ...options, renderer: 'webgl' });
    } catch (startError) {
      if (startError instanceof Error) {
        if (isWebGPUError(startError)) {
          await webViewer.start(url, container, { ...options, renderer: 'webgl' });
        } else if (isNetworkError(startError)) {
          throw new Error(ERROR_MESSAGES.network);
        } else {
          throw startError;
        }
      } else {
        throw new Error(ERROR_MESSAGES.compatibility);
      }
    }
  }, []);

  const initViewer = useCallback(async () => {
    if (!url || !containerRef.current) return;

    try {
      setLoading(true);
      setError(null);
      
      const { WebViewer } = await import('@rerun-io/web-viewer');
      
      if (viewerRef.current) {
        try {
          viewerRef.current.stop();
        } catch (error) {
          console.warn('Error cleaning up Rerun viewer:', error);
        }
        viewerRef.current = null;
      }
      
      const viewer = new WebViewer();
      viewerRef.current = viewer;
      
      const options = {
        hide_welcome_screen: hideWelcomeScreen,
        width: '100%',
        height: '100%'
      };

      await startViewer(viewer, url, containerRef.current, options);
      setLoading(false);
      
      setTimeout(() => {
        if (containerRef.current) {
          window.dispatchEvent(new Event('resize'));
        }
      }, 100);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.generic);
      setLoading(false);
    }
  }, [url, hideWelcomeScreen, startViewer]);

  useEffect(() => {
    let mounted = true;
    
    window.addEventListener('error', handleWebGPUError);
    
    if (mounted) {
      initViewer();
    }

    return () => {
      mounted = false;
      window.removeEventListener('error', handleWebGPUError);
      if (viewerRef.current) {
        try {
          viewerRef.current.stop();
        } catch (error) {
          console.warn('Error stopping Rerun viewer:', error);
        }
        viewerRef.current = null;
      }
    };
  }, [initViewer, handleWebGPUError]);

  if (!url) {
    return (
      <div 
        className={`flex items-center justify-center border rounded-lg bg-muted/10 ${className}`}
        style={dimensions}
      >
        <div className="text-center p-4">
          <p className="text-muted-foreground mb-2">No visualization available</p>
          <p className="text-sm text-muted-foreground">
            Run a visualization job to see data here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`rounded-lg overflow-hidden border ${className}`}
      style={{ 
        ...dimensions,
        position: 'relative',
        minWidth: '600px',
        minHeight: '400px'
      }}
    >
      {loading && (
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading Rerun viewer...</p>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-4">
            <p className="text-red-600 mb-2">Failed to load viewer</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}
      <div 
        ref={containerRef}
        className="absolute inset-0 w-full h-full bg-gray-100 dark:bg-gray-800"
        style={{ display: loading || error ? 'none' : 'block' }}
      />
    </div>
  );
}