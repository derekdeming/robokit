'use client';

import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DatasetError } from '@/hooks/api/use-backend-datasets';

export interface DatasetErrorHandlerProps {
  error: DatasetError | string | null;
  title?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
  className?: string;
}

export function DatasetErrorHandler({
  error,
  title = 'Dataset Error',
  onRetry,
  onDismiss,
  showDetails = true,
  className = ''
}: DatasetErrorHandlerProps) {
  if (!error) return null;

  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorField = error instanceof DatasetError ? error.field : undefined;
  const errorStatus = error instanceof DatasetError ? error.status : undefined;
  const hasHttpStatus = typeof errorStatus === 'number' && errorStatus > 0;

  const getErrorType = (status?: number) => {
    if (!status) return 'error';
    if (status >= 400 && status < 500) return 'validation';
    if (status >= 500) return 'server';
    return 'error';
  };

  const getErrorColor = (status?: number): "default" | "secondary" | "destructive" | "outline" => {
    const type = getErrorType(status);
    switch (type) {
      case 'validation': return 'destructive';
      case 'server': return 'destructive';
      default: return 'destructive';
    }
  };

  const getErrorDescription = (status?: number) => {
    if (!status) return 'An unexpected error occurred';
    
    switch (status) {
      case 400: return 'Invalid request parameters';
      case 401: return 'Authentication required';
      case 403: return 'Access denied';
      case 404: return 'Resource not found';
      case 409: return 'Resource already exists or conflicts with existing data';
      case 422: return 'Validation failed - please check your input';
      case 429: return 'Too many requests - please try again later';
      case 500: return 'Internal server error - please try again';
      case 503: return 'Service temporarily unavailable';
      default: return `Server error (${status})`;
    }
  };

  return (
    <Card className={`border-red-200 dark:border-red-800 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-red-900 dark:text-red-100">{title}</CardTitle>
            {hasHttpStatus ? (
              <Badge variant={getErrorColor(errorStatus)}>
                HTTP {errorStatus}
              </Badge>
            ) : null}
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <CardDescription className="text-red-700 dark:text-red-300">
          {getErrorDescription(hasHttpStatus ? errorStatus : undefined)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <AlertDescription className="text-red-800 dark:text-red-200">
            <strong>Error:</strong> {errorMessage}
            {errorField && (
              <div className="mt-1">
                <strong>Field:</strong> <code className="bg-red-100 dark:bg-red-900/50 px-1 py-0.5 rounded text-sm">{errorField}</code>
              </div>
            )}
          </AlertDescription>
        </Alert>

        {showDetails && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Troubleshooting:</h4>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              {errorStatus === 400 && (
                <ul className="list-disc list-inside space-y-1">
                  <li>Check that the dataset ID is in the correct format (e.g., &quot;username/dataset-name&quot;)</li>
                  <li>Verify that the commit hash is valid</li>
                  <li>Ensure the dataset format is supported (LeRobot, ROS bag, etc.)</li>
                </ul>
              )}
              {errorStatus === 404 && (
                <ul className="list-disc list-inside space-y-1">
                  <li>Verify the dataset exists on Hugging Face</li>
                  <li>Check that the commit hash exists in the repository</li>
                  <li>Ensure you have access to the dataset if it&apos;s private</li>
                </ul>
              )}
              {errorStatus === 422 && (
                <ul className="list-disc list-inside space-y-1">
                  <li>Check the dataset format is supported</li>
                  <li>Verify required metadata files exist (meta/info.json, meta/episodes.jsonl)</li>
                  <li>Ensure the dataset follows the expected structure</li>
                </ul>
              )}
              {typeof errorStatus === 'number' && errorStatus >= 500 && (
                <ul className="list-disc list-inside space-y-1">
                  <li>The server is experiencing issues</li>
                  <li>Try again in a few moments</li>
                  <li>Check if the backend API is running</li>
                </ul>
              )}
              {!(typeof errorStatus === 'number' && errorStatus >= 100) && (
                <ul className="list-disc list-inside space-y-1">
                  <li>Check your internet connection</li>
                  <li>Verify the backend API is accessible</li>
                  <li>Try refreshing the page</li>
                </ul>
              )}
            </div>
          </div>
        )}

        {onRetry && (
          <div className="mt-4 flex gap-2">
            <Button 
              onClick={onRetry}
              variant="outline"
              size="sm"
              className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-300 dark:border-red-700 dark:hover:bg-red-950/20"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface JobErrorDisplayProps {
  jobs: Array<{
    id: number;
    job_type: string;
    status: string;
    error_message?: string;
  }>;
  onRetryJob?: (jobId: number) => void;
}

export function JobErrorDisplay({ jobs, onRetryJob }: JobErrorDisplayProps) {
  const failedJobs = jobs.filter(job => job.status === 'failed');
  
  if (failedJobs.length === 0) return null;

  return (
    <div className="space-y-3">
      {failedJobs.map((job) => (
        <Alert key={job.id} className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription>
            <div className="flex items-start justify-between">
              <div>
                <strong className="text-red-800 dark:text-red-200">
                  {job.job_type.replace('_', ' ').toUpperCase()} Failed
                </strong>
                {job.error_message && (
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    {job.error_message}
                  </p>
                )}
              </div>
              {onRetryJob && (
                <Button
                  onClick={() => onRetryJob(job.id)}
                  variant="outline"
                  size="sm"
                  className="text-red-700 border-red-300 hover:bg-red-100 dark:text-red-300 dark:border-red-700"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}