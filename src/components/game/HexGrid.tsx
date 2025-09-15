import React from 'react';
import { cn } from '@/lib/utils';
import Hexagon from './Hexagon';

// Arabic letters in the hexagonal grid layout from the original code
const GRID_LAYOUT = [
  // Row 0 - 3 hexagons
  ['ا', 'ب', 'ت'],
  // Row 1 - 4 hexagons  
  ['ث', 'ج', 'ح', 'خ'],
  // Row 2 - 5 hexagons
  ['د', 'ذ', 'ر', 'ز', 'س'],
  // Row 3 - 6 hexagons
  ['ش', 'ص', 'ض', 'ط', 'ظ', 'ع'],
  // Row 4 - 5 hexagons
  ['غ', 'ف', 'ق', 'ك', 'ل'],
  // Row 5 - 4 hexagons
  ['م', 'ن', 'ه', 'و'],
  // Row 6 - 3 hexagons
  ['ي', 'ء', 'ة']
];

// Fixed hexagons that don't change (based on original display.js)
const FIXED_POSITIONS = new Set([
  'ا', 'ت', 'خ', 'د', 'س', 'ع', 'غ', 'ل', 'م', 'و', 'ي', 'ة'
]);

interface HexGridProps {
  letters?: { [key: string]: string };
  colors?: { [key: string]: string };
  goldenLetter?: string;
  onHexagonClick?: (originalLetter: string, currentLetter: string) => void;
  isClickable?: boolean;
  showPartyMode?: boolean;
  className?: string;
}

const HexGrid: React.FC<HexGridProps> = ({
  letters = {},
  colors = {},
  goldenLetter,
  onHexagonClick,
  isClickable = true,
  showPartyMode = false,
  className
}) => {
  return (
    <div className={cn(
      'flex flex-col items-center gap-2 p-4 relative',
      showPartyMode && 'animate-partyFlash',
      className
    )}>
      {GRID_LAYOUT.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className={cn(
            'flex gap-2 items-center',
            // Offset for hexagonal layout
            rowIndex < 3 && 'mr-8',
            rowIndex === 3 && 'mr-0',
            rowIndex > 3 && 'ml-8'
          )}
        >
          {row.map((originalLetter) => {
            const currentLetter = letters[originalLetter] || originalLetter;
            const hexColor = colors[originalLetter] || 'hex-primary';
            const isFixed = FIXED_POSITIONS.has(originalLetter);
            const isGolden = goldenLetter === originalLetter;
            
            return (
              <Hexagon
                key={originalLetter}
                letter={currentLetter}
                color={hexColor}
                isFixed={isFixed}
                isGolden={isGolden}
                isClickable={isClickable && !isFixed}
                onClick={() => onHexagonClick?.(originalLetter, currentLetter)}
                animate={isGolden ? 'pulse' : 'none'}
                className={cn(
                  isFixed && 'opacity-80',
                  showPartyMode && 'animate-pulse'
                )}
              />
            );
          })}
        </div>
      ))}
      
      {/* Party mode overlay */}
      {showPartyMode && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="w-full h-full rounded-lg animate-flash bg-gradient-to-r from-team-red via-team-green to-team-blue opacity-30" />
        </div>
      )}
    </div>
  );
};

export default HexGrid;