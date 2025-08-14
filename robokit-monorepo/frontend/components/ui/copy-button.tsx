'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CopyButtonProps {
  text?: string;
  targetId?: string; // If provided, copy innerText of this element
  className?: string;
  ariaLabel?: string;
}

export function CopyButton({ text, targetId, className, ariaLabel = 'Copy to clipboard' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const resolveText = (): string => {
    if (typeof text === 'string') return text;
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) return el.innerText;
    }
    return '';
  };

  const handleCopy = async () => {
    try {
      const toCopy = resolveText();
      if (!toCopy) return;
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('h-7 w-7 p-0 absolute right-2 top-2 bg-background/80 backdrop-blur border-muted-foreground/20', className)}
      onClick={handleCopy}
      aria-label={ariaLabel}
      title={copied ? 'Copied' : 'Copy'}
      type="button"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}


