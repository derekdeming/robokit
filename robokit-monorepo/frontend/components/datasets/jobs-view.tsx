'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/ui/copy-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Clock, Loader2, X } from 'lucide-react';
import type { BackendJob } from '@/types/dataset/huggingface';

interface JobsViewProps {
  jobs: BackendJob[];
}

interface JobGroup {
  type: string;
  jobs: BackendJob[];
  latestJob: BackendJob;
  successCount: number;
  failureCount: number;
  runningCount: number;
}

export default function JobsView({ jobs }: JobsViewProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'timeline'>('grouped');
  const jobGroups = useMemo(() => {
    const groups: Record<string, JobGroup> = {};
    
    jobs.forEach(job => {
      if (!groups[job.job_type]) {
        groups[job.job_type] = {
          type: job.job_type,
          jobs: [],
          latestJob: job,
          successCount: 0,
          failureCount: 0,
          runningCount: 0,
        };
      }
      
      groups[job.job_type].jobs.push(job);
      
      if (new Date(job.created_at) > new Date(groups[job.job_type].latestJob.created_at)) {
        groups[job.job_type].latestJob = job;
      }
      
      if (job.status === 'completed') groups[job.job_type].successCount++;
      else if (job.status === 'failed') groups[job.job_type].failureCount++;
      else if (job.status === 'running') groups[job.job_type].runningCount++;
    });
    
    Object.values(groups).forEach(group => {
      group.jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    
    return groups;
  }, [jobs]);

  const jobTypes = useMemo(() => ['all', ...Object.keys(jobGroups)], [jobGroups]);
  const filteredJobs = useMemo(() => {
    let filtered = [...jobs];
    if (filterType !== 'all') {
      filtered = filtered.filter(job => job.job_type === filterType);
    }
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(job => job.status === filterStatus);
    }
    
    return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [jobs, filterType, filterStatus]);

  const toggleGroupExpanded = (type: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleJobExpanded = (jobId: number) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'failed':
        return <X className="h-4 w-4 text-red-600 dark:text-red-400" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'running':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const JobCard = ({ job, compact = false }: { job: BackendJob; compact?: boolean }) => {
    const isExpanded = expandedJobs.has(job.id);
    const percent = Math.round((job.progress || 0) * 100);
    
    return (
      <div className={`border rounded-md ${compact ? 'bg-muted/30' : ''}`}>
        <div 
          className="flex flex-wrap items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleJobExpanded(job.id)}
        >
          <div className="flex items-center gap-3">
            {getStatusIcon(job.status)}
            {!compact && (
              <Badge variant="outline" className="capitalize">
                {job.job_type.replace(/_/g, ' ')}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">Job #{job.id}</span>
            <Badge variant={getStatusBadgeVariant(job.status)} className="text-xs">
              {job.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-muted-foreground">
              {percent}% • {new Date(job.created_at).toLocaleString()}
            </div>
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>

        {job.result_summary && (
          <div className="px-3 pb-2 border-t">
            <div className="text-sm text-muted-foreground pt-2">
              {Object.entries(job.result_summary)
                .filter(([k]) => k !== 'sdk_version')
                .map(([k, v]) => (
                  <span key={k} className="mr-3">
                    <span className="font-medium">{k}:</span> {String(v)}
                  </span>
                ))}
            </div>
          </div>
        )}

        {job.error_message && (
          <div className="px-3 pb-2 border-t">
            <div className="text-sm text-red-600 dark:text-red-400 pt-2">
              <span className="font-medium">Error:</span> {job.error_message}
            </div>
          </div>
        )}

        {isExpanded && (
          <div className="border-t bg-muted/20">
            <div className="p-3 space-y-3">
              {job.result?.metadata?.sensors?.cameras && Array.isArray(job.result.metadata.sensors.cameras) && (
                <div className="text-xs">
                  <div className="font-medium mb-2">Cameras:</div>
                  <div className="flex flex-wrap gap-2">
                    {job.result.metadata.sensors.cameras.map((cam: { name: string; width?: number | null; height?: number | null; format?: string | null }, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {cam.name}: {cam.width ?? '—'}x{cam.height ?? '—'}
                        {cam.format ? ` (${cam.format})` : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <details>
                <summary className="cursor-pointer select-none text-sm font-medium">
                  View raw output (JSON)
                </summary>
                <div className="mt-2 space-y-2 text-sm">
                  {job.result && (
                    <div>
                      <div className="mb-1 text-muted-foreground text-xs">result</div>
                      <div className="relative">
                        <CopyButton text={JSON.stringify(job.result, null, 2)} />
                        <pre className="overflow-auto max-h-48 rounded bg-background p-2 text-xs border">
                          {JSON.stringify(job.result, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  {job.result_metadata && (
                    <div>
                      <div className="mb-1 text-muted-foreground text-xs">metadata</div>
                      <div className="relative">
                        <CopyButton text={JSON.stringify(job.result_metadata, null, 2)} />
                        <pre className="overflow-auto max-h-32 rounded bg-background p-2 text-xs border">
                          {JSON.stringify(job.result_metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center">No jobs yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jobs</CardTitle>
        <CardDescription>
          {jobs.length} total jobs • {Object.keys(jobGroups).length} job types
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grouped' | 'timeline')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="grouped">Grouped View</TabsTrigger>
            <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          </TabsList>

          <TabsContent value="grouped" className="space-y-4">
            {Object.values(jobGroups).map((group) => {
              const isExpanded = expandedGroups.has(group.type);
              
              return (
                <div key={group.type} className="border rounded-lg">
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleGroupExpanded(group.type)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <h3 className="font-medium capitalize">
                          {group.type.replace(/_/g, ' ')}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {group.jobs.length} runs
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {group.successCount > 0 && (
                          <Badge variant="default" className="text-xs">
                            {group.successCount} completed
                          </Badge>
                        )}
                        {group.failureCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {group.failureCount} failed
                          </Badge>
                        )}
                        {group.runningCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {group.runningCount} running
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 text-sm text-muted-foreground">
                      Latest: Job #{group.latestJob.id} • {group.latestJob.status} • 
                      {new Date(group.latestJob.created_at).toLocaleString()}
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="border-t p-4 space-y-2 bg-muted/20">
                      {group.jobs.slice(0, 5).map((job) => (
                        <JobCard key={job.id} job={job} compact />
                      ))}
                      {group.jobs.length > 5 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            // could implement "show all" functionality here
                          }}
                        >
                          Show {group.jobs.length - 5} more jobs
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4">
            <div className="flex gap-2 mb-4">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {jobTypes.map(type => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type === 'all' ? 'All Types' : type.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              {filteredJobs.slice(0, 10).map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
              {filteredJobs.length > 10 && (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-2">
                    Showing 10 of {filteredJobs.length} jobs
                  </p>
                  <Button variant="outline" size="sm">
                    Load More
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}