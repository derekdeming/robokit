'use client';

import { useState } from 'react';
import { Upload, Database } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type DatasetSource = 'upload' | 'huggingface';

interface DatasetSourceSelectorProps {
  onSourceSelect: (source: DatasetSource) => void;
  selectedSource?: DatasetSource;
}

export function DatasetSourceSelector({ onSourceSelect, selectedSource }: DatasetSourceSelectorProps) {
  const [hoveredSource, setHoveredSource] = useState<DatasetSource | null>(null);

  const sources = [
    {
      id: 'upload' as DatasetSource,
      title: 'Upload Files',
      description: 'Upload robot sensor datasets from your computer (.rosbag, .hdf5, .parquet)',
      icon: Upload,
      features: [
        'Multi-terabyte file support',
        'Resumable uploads via TUS',
        'Multiple file formats',
        'Drag & drop interface'
      ]
    },
    {
      id: 'huggingface' as DatasetSource,
      title: 'Hugging Face Datasets',
      description: 'Connect to robot datasets hosted on Hugging Face Hub',
      icon: Database,
      features: [
        'Browse public datasets',
        'Access private datasets with token',
        'Popular robotics datasets',
        'Automatic format detection'
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Choose Data Source</h2>
        <p className="text-muted-foreground">
          Select how you want to add robot datasets to your workspace
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sources.map(({ id, title, description, icon: Icon, features }) => (
          <Card 
            key={id}
            className={`cursor-pointer transition-all duration-200 ${
              selectedSource === id 
                ? 'ring-2 ring-primary bg-primary/5' 
                : hoveredSource === id 
                ? 'border-primary/50 shadow-md' 
                : 'hover:border-primary/30'
            }`}
            onMouseEnter={() => setHoveredSource(id)}
            onMouseLeave={() => setHoveredSource(null)}
            onClick={() => onSourceSelect(id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSourceSelect(id);
              }
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Icon className="h-6 w-6 text-primary" />
                {title}
              </CardTitle>
              <CardDescription className="text-sm">
                {description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              
              <Button 
                variant={selectedSource === id ? "default" : "outline"}
                className="w-full mt-4"
                onClick={(e) => {
                  e.stopPropagation();
                  onSourceSelect(id);
                }}
              >
                {selectedSource === id ? 'Selected' : `Use ${title}`}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedSource && (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {selectedSource === 'upload' 
              ? 'Ready to upload your robot sensor datasets' 
              : 'Ready to connect to the dataset provider of your choice'
            }
          </p>
        </div>
      )}
    </div>
  );
}