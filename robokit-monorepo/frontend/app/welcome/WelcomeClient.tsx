'use client';

import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function WelcomeClient() {
  const [randomElements, setRandomElements] = useState<Array<{
    x: number;
    y: number;
    size: number;
    delay: number;
    duration: number;
  }>>([]);
  const [spiralElements, setSpiralElements] = useState<Array<{
    x: number;
    y: number;
    size: number;
    delay: number;
  }>>([]);

  useEffect(() => {
    const elements = [...Array(200)].map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      delay: Math.random() * 5,
      duration: Math.random() * 3 + 2,
    }));
    setRandomElements(elements);

    const spiralElements = [...Array(800)].map((_, i) => {
      const angle = i * 137.5 * (Math.PI / 180);
      const radius = Math.sqrt(i) * 12;
      const x = 50 + ((Math.cos(angle) * radius) / 100) * 50;
      const y = 50 + ((Math.sin(angle) * radius) / 100) * 50;
      const size = Math.max(1, 6 - i * 0.008);
      const delay = i * 0.05;

      return {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        size,
        delay,
      };
    });
    setSpiralElements(spiralElements);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20">
        {spiralElements.map((element, i) => (
          <div
            key={`spiral-${i}`}
            className="absolute rounded-full animate-pulse"
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              width: `${element.size}px`,
              height: `${element.size}px`,
              backgroundColor: 'black',
              opacity: 0.3,
              animationDelay: `${element.delay}s`,
              animationDuration: '4s',
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 ${element.size * 2}px rgba(0, 0, 0, 0.3)`,
            }}
          />
        ))}

        {randomElements.map((element, i) => (
          <div
            key={`float-${i}`}
            className="absolute rounded-full animate-bounce"
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              width: `${element.size}px`,
              height: `${element.size}px`,
              backgroundColor: 'black',
              opacity: 0.2,
              animationDelay: `${element.delay}s`,
              animationDuration: `${element.duration}s`,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 ${element.size * 3}px rgba(0, 0, 0, 0.2)`,
            }}
          />
        ))}

        {[...Array(15)].map((_, row) =>
          [...Array(20)].map((_, col) => {
            const x = (col / 19) * 100;
            const y = (row / 14) * 100;
            const delay = (row + col) * 0.1;
            const size = 3;

            return (
              <div
                key={`grid-${row}-${col}`}
                className="absolute rounded-full animate-ping"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: 'black',
                  opacity: 0.15,
                  animationDelay: `${delay}s`,
                  animationDuration: '3s',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            );
          })
        )}
      </div>

      <Card className="w-full max-w-2xl mx-6 relative z-10 shadow-2xl border-2">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Welcome to RoboKit
          </CardTitle>
          <CardDescription className="text-lg mt-4">
            Upload, inspect, and convert gigabyte robot sensor datasets with ease
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 pb-8">
          <div className="text-center space-y-6">
            <p className="text-muted-foreground leading-relaxed">
              Get started by signing in to access powerful tools for managing your robot datasets, visualizing sensor
              data, and converting between formats.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <div className="text-sm text-muted-foreground">Use the buttons below to get started</div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-8">
            <SignInButton>
              <button className="bg-muted hover:bg-muted/80 text-foreground rounded-md font-medium text-sm h-10 px-6 cursor-pointer transition-colors">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md font-medium text-sm h-10 px-6 cursor-pointer transition-colors">
                Sign Up
              </button>
            </SignUpButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


