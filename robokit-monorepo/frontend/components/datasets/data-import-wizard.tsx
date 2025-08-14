'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DatasetSourceSelector } from './dataset-source-selector';
import HuggingFaceConnector from './huggingface-connector';
import { UploadDashboard } from '../upload/upload-dashboard';
import { DatasetErrorHandler } from './dataset-error-handler';
import { DatasetError } from '@/hooks/api/use-backend-datasets';
import type { UppyFile } from '@uppy/core';
import type { HuggingFaceDataset } from '@/types/dataset/huggingface';
import { useHuggingFaceConnect } from '@/hooks/api/use-huggingface';

type DatasetSource = 'upload' | 'huggingface';
type ImportStep = 'source-selection' | 'data-import' | 'complete';

  interface ImportedDataset {
  id: string;
  name: string;
  source: DatasetSource;
  status: 'processing' | 'complete' | 'error';
  size?: string;
  files?: string[];
  hfDatasetId?: string;
  commitHash?: string; // Git commit hash for HuggingFace datasets
    error?: string | DatasetError;
  backendId?: number; // Backend dataset ID for job monitoring
  createdAt?: string;
}

export function DataImportWizard({ initialPopularDatasets }: { initialPopularDatasets?: HuggingFaceDataset[] }) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<ImportStep>('source-selection');
  const [selectedSource, setSelectedSource] = useState<DatasetSource>();
  const [importedDatasets, setImportedDatasets] = useState<ImportedDataset[]>([]);
  
  const { connectDataset, error: connectError } = useHuggingFaceConnect();

  const handleSourceSelect = (source: DatasetSource) => {
    setSelectedSource(source);
    setCurrentStep('data-import');
  };

  const handleUploadSuccess = (files: UppyFile<Record<string, unknown>, Record<string, unknown>>[]) => {
    const completed: ImportedDataset[] = files.map(file => ({
      id: `upload-${file.id}`,
      name: file.name || 'Unknown file',
      source: 'upload',
      status: 'complete',
      size: formatFileSize(file.size || 0),
      files: [file.name || 'Unknown file'],
      createdAt: new Date().toISOString()
    }));
    setImportedDatasets(prev => [...prev, ...completed]);
    setCurrentStep('complete');
  };

  const handleHuggingFaceConnect = async (dataset: HuggingFaceDataset, token?: string) => {
    try {
      const result = await connectDataset(dataset.id, dataset.sha || 'main', token);
      if (!result) {
        const reason = connectError || 'The backend did not return a dataset. Please check logs.';
        throw new Error(reason);
      }
      const completedDataset: ImportedDataset = {
        id: result.id,
        name: dataset.name,
        source: 'huggingface',
        status: 'complete',
        size: dataset.size,
        hfDatasetId: dataset.id,
        commitHash: dataset.sha,
        backendId: parseInt(result.id),
        createdAt: result.dataset?.createdAt
      };
      setImportedDatasets(prev => [...prev, completedDataset]);
      setCurrentStep('complete');
    } catch (error) {
      const message = (error instanceof Error ? error.message : undefined) || connectError || 'Dataset connection failed';
      const errorDataset: ImportedDataset = {
        id: `error-${Date.now()}`,
        name: dataset.name,
        source: 'huggingface',
        status: 'error',
        size: dataset.size,
        hfDatasetId: dataset.id,
        commitHash: dataset.sha,
        error: error instanceof DatasetError ? error : message
      };
      setImportedDatasets(prev => [...prev, errorDataset]);
      setCurrentStep('complete');
    }
  };

  const handleUploadError = (error: Error) => {
    console.error('Upload error:', error);
  };

  const resetWizard = () => {
    setCurrentStep('source-selection');
    setSelectedSource(undefined);
    setImportedDatasets([]);
  };
  
  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  };
  
  const renderStepContent = () => {
    switch (currentStep) {
      case 'source-selection':
        return (
          <DatasetSourceSelector
            onSourceSelect={handleSourceSelect}
            selectedSource={selectedSource}
          />
        );
      
      case 'data-import':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep('source-selection')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Source Selection
              </Button>
            </div>
            
            {selectedSource === 'upload' ? (
              <UploadDashboard
                onUploadSuccess={handleUploadSuccess}
                onUploadError={handleUploadError}
              />
            ) : (
              <HuggingFaceConnector
                onDatasetConnect={handleHuggingFaceConnect}
                initialPopularDatasets={initialPopularDatasets}
              />
            )}
          </div>
        );
      
      case 'complete':
        const hasErrors = importedDatasets.some(d => d.status === 'error');
        const hasSuccesses = importedDatasets.some(d => d.status === 'complete');
        const onlyErrors = hasErrors && !hasSuccesses;
        const headerTitle = onlyErrors
          ? 'Import Failed'
          : hasErrors
            ? 'Import Complete (with errors)'
            : 'Import Complete';
        const headerDescription = onlyErrors
          ? 'We were unable to import your dataset(s). See details below.'
          : hasErrors
            ? 'Some datasets were imported successfully, but others failed. See details below.'
            : 'Your datasets have been successfully imported and are ready for analysis';
        return (
          <div className="space-y-6">
            <div className="text-center">
              {hasErrors ? (
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              ) : (
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              )}
              <h2 className="text-2xl font-semibold">{headerTitle}</h2>
              <p className="text-muted-foreground">
                {headerDescription}
              </p>
            </div>
            
            <div className="space-y-4">
              {importedDatasets.map(dataset => (
                <Card key={dataset.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{dataset.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        {dataset.status === 'complete' ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : dataset.status === 'error' ? (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        ) : null}
                       <Badge variant={
                          dataset.status === 'complete' ? 'default' : 
                          dataset.status === 'error' ? 'destructive' : 'secondary'
                        }>
                          {dataset.status}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription>
                      {dataset.source === 'upload' 
                        ? 'Uploaded from local files' 
                        : `Connected from Hugging Face: ${dataset.hfDatasetId}`
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {dataset.status === 'error' && (
                      <div className="mb-3">
                        <DatasetErrorHandler 
                          error={dataset.error ?? 'Unknown error occurred'}
                          title="Dataset Import Error"
                          showDetails
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {dataset.size && <span>Size: {dataset.size}</span>}
                      <span>Source: {dataset.source === 'upload' ? 'File Upload' : 'Hugging Face'}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={resetWizard}>
                Import More Datasets
              </Button>
              <Button onClick={() => {
                const recentDataset = importedDatasets
                  .filter(d => d.status === 'complete' && d.backendId)
                  .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                  [0];
                
                const url = recentDataset 
                  ? `/datasets?newDataset=${recentDataset.backendId}`
                  : '/datasets';
                router.push(url);
              }}>
                View Datasets
              </Button>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {renderStepContent()}
    </div>
  );
}