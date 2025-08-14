'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Play, Settings } from 'lucide-react';

import { RerunViewer } from './rerun-viewer';
import { useBackendDatasets } from '@/hooks/api/use-backend-datasets';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

type VisualizationMode = 'file' | 'stream';
type BlueprintType = 'episode_review' | 'quality_triage' | 'alignment' | 'minimal';

interface VisualizationConfig {
  mode: VisualizationMode;
  stride: number;
  maxFrames: number;
  jpegQuality: number;
  blueprint: BlueprintType;
}

interface DatasetRerunVisualizationProps {
  datasetId: number;
  defaultMode?: VisualizationMode;
  autoStart?: boolean;
}

const DEFAULT_CONFIG: VisualizationConfig = {
  mode: 'file',
  stride: 2,
  maxFrames: 3000,
  jpegQuality: 90,
  blueprint: 'episode_review'
};

const STREAM_INCLUDE = {
  images: ['*'],
  joints: ['*'],
  depth: [],
  lidar: [],
  forces: [],
  torques: []
};

interface JobState {
  id: number | null;
  running: boolean;
  progress: number;
  error: string | null;
}

const useJobState = () => {
  const [state, setState] = useState<JobState>({
    id: null,
    running: false,
    progress: 0,
    error: null
  });

  const setJobId = useCallback((id: number) => setState(prev => ({ ...prev, id })), []);
  const setRunning = useCallback((running: boolean) => setState(prev => ({ ...prev, running })), []);
  const setProgress = useCallback((progress: number) => setState(prev => ({ ...prev, progress })), []);
  const setError = useCallback((error: string | null) => setState(prev => ({ ...prev, error })), []);
  const reset = useCallback(() => setState({ id: null, running: false, progress: 0, error: null }), []);

  return { state, setJobId, setRunning, setProgress, setError, reset };
};

export function DatasetRerunVisualization({ 
  datasetId, 
  defaultMode = 'file', 
  autoStart = false 
}: DatasetRerunVisualizationProps) {
  const { runAnalysis, getLatestAnalysis, getDatasetJobs } = useBackendDatasets();
  
  const [config, setConfig] = useState<VisualizationConfig>({
    ...DEFAULT_CONFIG,
    mode: defaultMode
  });
  const [url, setUrl] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const job = useJobState();

  const updateConfig = <K extends keyof VisualizationConfig>(
    key: K,
    value: VisualizationConfig[K]
  ) => setConfig(prev => ({ ...prev, [key]: value }));

  const analysisParams = useMemo(() => ({
    mode: config.mode,
    stride: config.stride,
    max_frames: config.maxFrames,
    timeline: 'time' as const,
    downscale_long_side: 960,
    jpeg_quality: config.jpegQuality,
    blueprint: config.blueprint,
    include_streams: STREAM_INCLUDE,
  }), [config]);

  const extractVisualizationUrl = (result: Record<string, unknown>): string | null => {
    const vizUrl = result.rrd_url || result.viewer_url || result.local_path;
    if (!vizUrl || typeof vizUrl !== 'string') return null;
    
    return vizUrl.startsWith('/api/v1/') 
      ? `http://localhost:8000${vizUrl}` 
      : vizUrl;
  };

  const fetchLatest = useCallback(async () => {
    try {
      const latest = await getLatestAnalysis(datasetId, 'rerun_visualization');
      
      if (!latest?.full_result) {return;}
      
      const vizUrl = extractVisualizationUrl(latest.full_result);
      
      if (vizUrl) {
        try {
          const response = await fetch(vizUrl, { method: 'HEAD' });
          if (response.ok) {
            setUrl(vizUrl);
            job.reset();
          } else {
            console.log('Visualization file no longer exists, ignoring old job result');
          }
        } catch {
          console.log('Could not verify visualization file, ignoring');
        }
      }
    } catch (e) {
      console.log('No existing visualization found:', e);
    }
  }, [datasetId, getLatestAnalysis, job.reset]);

  const pollJobStatus = useCallback(async () => {
    if (!job.state.id) return;
    
    try {
      const jobs = await getDatasetJobs(datasetId);
      const currentJob = jobs.find(j => j.id === job.state.id);
      
      if (!currentJob) return;
      
      switch (currentJob.status) {
        case 'completed':
          await fetchLatest();
          job.setRunning(false);
          break;
        case 'failed':
          job.setError(currentJob.error_message || 'Visualization generation failed');
          job.setRunning(false);
          break;
        case 'running':
          job.setProgress(Math.round((currentJob.progress || 0) * 100));
          break;
      }
    } catch (e) {
      console.error('Failed to poll job status:', e);
    }
  }, [job.state.id, datasetId, getDatasetJobs, fetchLatest, job.setRunning, job.setError, job.setProgress]);

  const startVisualization = useCallback(async () => {
    job.setRunning(true);
    job.setError(null);
    job.setProgress(0);
    
    try {
      const analysisJob = await runAnalysis(datasetId, 'rerun_visualization', analysisParams);
      if (analysisJob?.id) {
        job.setJobId(analysisJob.id);
      }
    } catch (e) {
      job.setError(e instanceof Error ? e.message : 'Failed to start visualization');
      job.setRunning(false);
    }
  }, [datasetId, analysisParams, runAnalysis, job.setRunning, job.setError, job.setProgress, job.setJobId]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  useEffect(() => {
    if (autoStart && !url && !job.state.running) {
      startVisualization();
    }
  }, [autoStart, url, job.state.running, startVisualization]);

  useEffect(() => {
    if (!job.state.id) return;
    const interval = setInterval(pollJobStatus, 2000);
    return () => clearInterval(interval);
  }, [job.state.id, pollJobStatus]);

  const ControlsSection = () => (
    <div className="flex items-center gap-4">
      <div className="flex-1 flex items-center gap-2">
        <Label htmlFor="mode">Mode:</Label>
        <Select
          value={config.mode}
          onValueChange={(value) => updateConfig('mode', value as VisualizationMode)}
          disabled={job.state.running}
        >
          <SelectTrigger id="mode" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="file">File (.rrd)</SelectItem>
            <SelectItem value="stream">Live Stream</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowSettings(!showSettings)}
        disabled={job.state.running}
      >
        <Settings className="h-4 w-4 mr-1" />
        Settings
      </Button>

      <Button
        onClick={startVisualization}
        disabled={job.state.running}
        className="min-w-[120px]"
      >
        {job.state.running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Generate
          </>
        )}
      </Button>
    </div>
  );

  const SettingsSection = () => showSettings && (
    <Card className="p-4 space-y-3 bg-muted/30">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="stride">Frame Stride</Label>
          <input
            id="stride"
            type="number"
            min="1"
            max="10"
            value={config.stride}
            onChange={(e) => updateConfig('stride', Number(e.target.value))}
            className="w-full mt-1 px-2 py-1 border rounded"
            disabled={job.state.running}
          />
        </div>
        <div>
          <Label htmlFor="maxFrames">Max Frames</Label>
          <input
            id="maxFrames"
            type="number"
            min="100"
            max="10000"
            step="100"
            value={config.maxFrames}
            onChange={(e) => updateConfig('maxFrames', Number(e.target.value))}
            className="w-full mt-1 px-2 py-1 border rounded"
            disabled={job.state.running}
          />
        </div>
        <div>
          <Label htmlFor="quality">JPEG Quality</Label>
          <input
            id="quality"
            type="number"
            min="50"
            max="100"
            value={config.jpegQuality}
            onChange={(e) => updateConfig('jpegQuality', Number(e.target.value))}
            className="w-full mt-1 px-2 py-1 border rounded"
            disabled={job.state.running}
          />
        </div>
        <div>
          <Label htmlFor="blueprint">Layout</Label>
          <Select
            value={config.blueprint}
            onValueChange={(value) => updateConfig('blueprint', value as BlueprintType)}
            disabled={job.state.running}
          >
            <SelectTrigger id="blueprint">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="episode_review">Episode Review</SelectItem>
              <SelectItem value="quality_triage">Quality Triage</SelectItem>
              <SelectItem value="alignment">Alignment</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );

  const ProgressSection = () => job.state.running && job.state.progress > 0 && (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Processing...</span>
        <span>{job.state.progress}%</span>
      </div>
      <Progress value={job.state.progress} />
    </div>
  );

  const ErrorSection = () => job.state.error && (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{job.state.error}</AlertDescription>
    </Alert>
  );

  const ViewerSection = () => (
    <Card className="overflow-hidden">
      <CardContent className="p-0" style={{ height: '70vh' }}>
        {!url ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8">
              <div className="mb-4">
                <Settings className="h-12 w-12 mx-auto text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium mb-2">No Visualization Generated</h3>
              <p className="text-muted-foreground mb-4">
                {config.mode === 'stream' 
                  ? 'Click "Generate" to start a live streaming session'
                  : 'Click "Generate" to create a visualization file'}
              </p>
              <p className="text-sm text-muted-foreground">
                You can configure settings before generating
              </p>
            </div>
          </div>
        ) : config.mode === 'stream' ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <p className="text-muted-foreground mb-2">Streaming mode opens in new tab</p>
              <p className="text-sm text-muted-foreground">
                The Rerun viewer should open automatically
              </p>
            </div>
          </div>
        ) : (
          <RerunViewer 
            url={url} 
            height="70vh"
            width="100%"
            hideWelcomeScreen={true}
          />
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Rerun Visualization</CardTitle>
          <CardDescription>
            Generate and view interactive 3D visualizations of your dataset
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ControlsSection />
          <SettingsSection />
          <ProgressSection />
          <ErrorSection />
        </CardContent>
      </Card>
      <ViewerSection />
    </div>
  );
}