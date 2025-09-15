import React from 'react';
import { cn } from '@/lib/utils';

interface HexagonProps {
  letter: string;
  color?: string;
  isFixed?: boolean;
  isGolden?: boolean;
  isClickable?: boolean;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: 'fadeIn' | 'pulse' | 'none';
}

const Hexagon: React.FC<HexagonProps> = ({
  letter,
  color = 'hex-primary',
  isFixed = false,
  isGolden = false,
  isClickable = true,
  onClick,
  className,
  size = 'md',
  animate = 'none'
}) => {
  const sizeClasses = {
    sm: 'w-12 h-14 text-sm',
    md: 'w-16 h-18 text-lg',
    lg: 'w-20 h-22 text-xl'
  };

  const animationClasses = {
    fadeIn: 'animate-fadeIn',
    pulse: 'animate-pulse',
    none: ''
  };

  return (
    <div
      className={cn(
        'hexagon-clip flex items-center justify-center cursor-pointer transition-smooth font-arabic font-bold relative overflow-hidden',
        sizeClasses[size],
        animationClasses[animate],
        isClickable ? 'hover:scale-105 hover:shadow-lg' : 'cursor-default',
        isGolden && 'golden-text shadow-lg shadow-gold/50',
        className
      )}
      style={{
        backgroundColor: `hsl(var(--${color}))`,
        color: isGolden ? undefined : 'white'
      }}
      onClick={isClickable ? onClick : undefined}
    >
      {/* Background gradient for golden hexagons */}
      {isGolden && (
        <div 
          className="absolute inset-0 hexagon-clip bg-gradient-to-br from-gold to-gold-light opacity-90"
        />
      )}
      
      {/* Letter content */}
      <span className="relative z-10 select-none">
        {letter}
      </span>
      
      {/* Hover effect */}
      {isClickable && !isFixed && (
        <div className="absolute inset-0 hexagon-clip bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
};

export default Hexagon;