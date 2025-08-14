'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import type { JobType } from '@/types/dataset/huggingface';

interface JsonSchemaPropertySpec {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  enum?: string[];
  default?: unknown;
}

interface JsonSchema {
  properties?: Record<string, JsonSchemaPropertySpec>;
  required?: string[];
}

interface JobRunnerProps {
  datasetId: number;
  initialSchemas?: Record<string, unknown>;
}

function inferFieldsFromSchema(schema: JsonSchema): Array<{ key: string; type: string; required: boolean; enum?: string[] }> {
  const props: Record<string, JsonSchemaPropertySpec> = schema?.properties ?? {};
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
  return Object.entries(props).map(([key, spec]: [string, JsonSchemaPropertySpec]) => {
    const isRequired = required.includes(key);
    if (Array.isArray(spec?.enum)) {
      return { key, type: 'enum', enum: spec.enum, required: isRequired };
    }
    const t = spec?.type ?? 'string';
    return { key, type: t, required: isRequired };
  });
}

export default function JobRunner({ datasetId, initialSchemas }: JobRunnerProps) {
  const router = useRouter();
  const [schemas, setSchemas] = useState<Record<string, JsonSchema> | null>(
    (initialSchemas as Record<string, JsonSchema> | undefined) ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const computeDefaults = (sc: Record<string, JsonSchema>): Record<string, Record<string, unknown>> => {
    const initial: Record<string, Record<string, unknown>> = {};
    for (const [jt, schema] of Object.entries(sc)) {
      const props: Record<string, JsonSchemaPropertySpec> = schema?.properties ?? {};
      const defaults: Record<string, unknown> = {};
      Object.entries(props).forEach(([k, spec]: [string, JsonSchemaPropertySpec]) => {
        if (spec && spec.default !== undefined) {
          defaults[k] = spec.default;
        }
      });
      initial[jt] = defaults;
    }
    return initial;
  };
  const [formValues, setFormValues] = useState<Record<string, Record<string, unknown>>>(
    () => (initialSchemas ? computeDefaults(initialSchemas as Record<string, JsonSchema>) : {})
  );
  const apiBase = process.env.NEXT_PUBLIC_INTERNAL_API_PROXY ?? '/api/backend';

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (initialSchemas) return;
      try {
        const res = await fetch(`${apiBase}/api/v1/datasets/job-parameter-schemas`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Record<string, JsonSchema>;
        if (mounted) {
          setSchemas(data);
          setFormValues(computeDefaults(data));
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load schemas');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [apiBase, initialSchemas]);

  const jobTypes = useMemo(() => Object.keys(schemas ?? {}).sort() as JobType[], [schemas]);

  async function runJob(jobType: JobType, values: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/datasets/${datasetId}/analyses/${jobType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values ?? {}),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        let message = `HTTP ${res.status}`;
        if (body && typeof body === 'object' && 'detail' in body) {
          const detail = (body as { detail?: unknown }).detail;
          if (typeof detail === 'string') message = detail;
          else if (Array.isArray(detail)) {
            message = detail
              .map((d) => {
                if (d && typeof d === 'object') {
                  const msg = (d as { msg?: unknown }).msg;
                  const loc = (d as { loc?: unknown }).loc;
                  const msgStr = typeof msg === 'string' ? msg : JSON.stringify(d);
                  const locStr = Array.isArray(loc) ? ` (${(loc as unknown[]).join('.')})` : '';
                  return `${msgStr}${locStr}`;
                }
                return JSON.stringify(d);
              })
              .join('; ');
          } else if (detail && typeof detail === 'object') {
            message = JSON.stringify(detail);
          }
        }
        throw new Error(message);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start job');
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }
  if (!schemas) {
    return <div className="text-sm text-muted-foreground">Loading job types…</div>;
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue={jobTypes[0]}>
        <TabsList className="flex flex-wrap gap-2">
          {jobTypes.map((jt) => (
            <TabsTrigger key={jt} value={jt} className="capitalize">
              {jt.replace(/_/g, ' ')}
            </TabsTrigger>
          ))}
        </TabsList>

        {jobTypes.map((jt) => {
          const schema = schemas[jt] ?? {};
          const fields = inferFieldsFromSchema(schema);
          const values = formValues[jt] ?? {};
          return (
            <TabsContent key={jt} value={jt} className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`${jt}-${f.key}`}>
                      {f.key} {f.required ? <span className="text-red-600">*</span> : null}
                    </Label>
                    {f.type === 'enum' && Array.isArray(f.enum) ? (
                      <select
                        id={`${jt}-${f.key}`}
                        className="border rounded px-2 py-1 h-9 bg-background"
                        value={typeof values[f.key] === 'string' ? (values[f.key] as string) : ''}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [jt]: { ...(prev[jt] ?? {}), [f.key]: e.target.value },
                          }))
                        }
                      >
                        <option value="" disabled>
                          Select…
                        </option>
                        {f.enum.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : f.type === 'boolean' ? (
                      <div className="flex items-center gap-3 h-9">
                        <Switch
                          id={`${jt}-${f.key}`}
                          checked={Boolean(values[f.key])}
                          onCheckedChange={(checked) =>
                            setFormValues((prev) => ({
                              ...prev,
                              [jt]: { ...(prev[jt] ?? {}), [f.key]: checked },
                            }))
                          }
                        />
                        <span className="text-sm text-muted-foreground">{Boolean(values[f.key]) ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    ) : (
                      <Input
                        id={`${jt}-${f.key}`}
                        type={f.type === 'number' || f.type === 'integer' ? 'number' : 'text'}
                        value={
                          f.type === 'number' || f.type === 'integer'
                            ? (typeof values[f.key] === 'number' ? (values[f.key] as number) : '')
                            : String(values[f.key] ?? '')
                        }
                        onChange={(e) =>
                          setFormValues((prev) => {
                            const next = { ...(prev[jt] ?? {}) };
                            if (f.type === 'number' || f.type === 'integer') {
                              const num = e.target.valueAsNumber;
                              if (Number.isNaN(num)) {
                                // Remove to allow backend defaults when empty
                                delete next[f.key];
                              } else {
                                next[f.key] = num;
                              }
                            } else {
                              const val = e.target.value;
                              if (val === '') delete next[f.key]; else next[f.key] = val;
                            }
                            return { ...prev, [jt]: next };
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <Button
                  onClick={() => runJob(jt, values)}
                  disabled={loading}
                >
                  {loading ? 'Starting…' : 'Start job'}
                </Button>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}


