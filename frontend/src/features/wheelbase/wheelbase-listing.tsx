'use client';

import { createElement, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const WIDGET_SRC = 'https://d2toxav8qvoos4.cloudfront.net/latest/wheelbase-widget.js';
const LOAD_TIMEOUT_MS = 20_000;

let loading: Promise<void> | null = null;

function loadWidget(): Promise<void> {
  if (customElements.get('listing-details')) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = WIDGET_SRC;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('Wheelbase widget failed to load'));
    };
    document.head.appendChild(script);
    customElements.whenDefined('listing-details').then(() => resolve(), reject);
  });
  return Promise.race([
    loading,
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Wheelbase widget timed out')), LOAD_TIMEOUT_MS)),
  ]);
}

// The widget takes hex colours, so the site's HSL tokens are resolved through the browser.
function tokenHex(token: string): string | undefined {
  const probe = document.createElement('span');
  probe.style.color = `hsl(var(${token}))`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g);
  probe.remove();
  if (!rgb || rgb.length < 3) return undefined;
  return `#${rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

type Theme = Record<'primary-color' | 'text-color' | 'text-secondary-color' | 'surface-color' | 'card-color' | 'border-color', string | undefined>;

export function WheelbaseListing({ dealerId, rentalId }: { dealerId: string; rentalId: number }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let live = true;
    setTheme({
      'primary-color': tokenHex('--primary'),
      'text-color': tokenHex('--foreground'),
      'text-secondary-color': tokenHex('--muted-foreground'),
      'surface-color': tokenHex('--background'),
      'card-color': tokenHex('--card'),
      'border-color': tokenHex('--border'),
    });
    loadWidget().then(
      () => live && setState('ready'),
      () => live && setState('failed'),
    );
    return () => {
      live = false;
    };
  }, []);

  if (state === 'failed') {
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-5 text-sm">
        <p className="font-semibold">The booking form didn’t load.</p>
        <p className="mt-1 text-muted-foreground">Please refresh the page. If it still doesn’t appear, contact us and we’ll book the car for you.</p>
      </div>
    );
  }

  return (
    <div aria-busy={state === 'loading'}>
      {state === 'loading' && (
        <div className="space-y-3" aria-label="Loading the booking form">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {state === 'ready' && theme && (
        createElement('listing-details', {
          'dealer-id': dealerId,
          'rental-id': String(rentalId),
          'hide-description': 'true',
          'hide-features': 'true',
          ...theme,
        })
      )}
    </div>
  );
}
