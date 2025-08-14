'use client';

import { useEffect, useRef } from 'react';
import { Uppy, UppyFile } from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import Tus from '@uppy/tus';
import { useUIStore } from '@/lib/stores/ui-store';
import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';

interface UploadDashboardProps {
  onUploadSuccess?: (files: UppyFile<Record<string, unknown>, Record<string, unknown>>[]) => void;
  onUploadError?: (error: Error) => void;
}

export function UploadDashboard({ 
  onUploadSuccess, 
  onUploadError 
}: UploadDashboardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uppyRef = useRef<Uppy | null>(null);
  const { updateUploadProgress } = useUIStore();

  useEffect(() => {
    if (!containerRef.current) return;

    const uppy = new Uppy({
      restrictions: {
        maxFileSize: 1024 * 1024 * 1024 * 100, // 100GB
        allowedFileTypes: ['.rosbag', '.bag', '.hdf5', '.h5', '.parquet'],
      },
      autoProceed: false,
    })
      .use(Dashboard, {
        target: containerRef.current,
        inline: true,
        height: 400,
        showProgressDetails: true,
        proudlyDisplayPoweredByUppy: false,
        note: 'Upload robot sensor datasets up to 100GB each',
      })
      .use(Tus, {
        endpoint: '/api/upload/tus',
        chunkSize: 1024 * 1024 * 10, // 10MB chunks
        retryDelays: [0, 1000, 3000, 5000],
      });

    uppy.on('upload-progress', (file, progress) => {
      if (file?.id) {
        updateUploadProgress(file.id, progress.percentage || 0);
      }
    });

    uppy.on('complete', (result) => {
      if (result.successful?.length && onUploadSuccess) {
        onUploadSuccess(result.successful);
      }
      if (result.failed?.length && onUploadError) {
        onUploadError(new Error(`${result.failed.length} files failed to upload`));
      }
    });

    uppyRef.current = uppy;

    return () => {
      uppy.destroy();
    };
  }, [updateUploadProgress, onUploadSuccess, onUploadError]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Upload Datasets</h2>
        <p className="text-muted-foreground">
          Upload multi-terabyte robot sensor datasets for processing and analysis
        </p>
      </div>
      <div ref={containerRef} className="border rounded-lg" />
    </div>
  );
}