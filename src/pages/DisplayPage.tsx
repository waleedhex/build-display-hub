import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import HexGrid from '@/components/game/HexGrid';
import { supabase } from '@/integrations/supabase/client';

interface GameState {
  hexagons: { [key: string]: string };
  colors: { [key: string]: string };
  currentQuestion?: {
    question: string;
    answer: string;
    letter: string;
  };
  buzzer?: {
    active: boolean;
    team: string;
    player: string;
  };
  goldenLetter?: string;
  partyMode: boolean;
}

const DisplayPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  
  const [gameState, setGameState] = useState<GameState>({
    hexagons: {},
    colors: {},
    partyMode: false
  });
  
  const [showPartyText, setShowPartyText] = useState(false);
  const [showGoldenText, setShowGoldenText] = useState(false);
  
  // Audio refs
  const buzzerSoundRef = useRef<HTMLAudioElement>(null);
  const timeUpSoundRef = useRef<HTMLAudioElement>(null);
  const goldSoundRef = useRef<HTMLAudioElement>(null);
  const winningSoundRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Subscribe to real-time game updates
    const channel = supabase
      .channel(`display-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const data = payload.new.data as GameState;
          handleGameStateUpdate(data);
        }
      )
      .subscribe();

    // Load initial state
    loadInitialState();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const loadInitialState = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('data')
        .eq('session_id', sessionId)
        .single();

      if (error) {
        console.error('Error loading initial state:', error);
      } else if (data) {
        setGameState(data.data as GameState);
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  const handleGameStateUpdate = (newState: GameState) => {
    const previousState = gameState;
    setGameState(newState);

    // Handle buzzer sound
    if (newState.buzzer?.active && !previousState.buzzer?.active) {
      buzzerSoundRef.current?.play().catch(console.error);
    }

    // Handle golden letter celebration
    if (newState.goldenLetter && newState.goldenLetter !== previousState.goldenLetter) {
      startGoldenLetterCelebration();
    }

    // Handle party mode
    if (newState.partyMode && !previousState.partyMode) {
      startPartyMode();
    }
  };

  const startPartyMode = () => {
    setShowPartyText(true);
    winningSoundRef.current?.play().catch(console.error);
    
    // Auto hide after animation
    setTimeout(() => {
      setShowPartyText(false);
    }, 5000);
  };

  const startGoldenLetterCelebration = () => {
    setShowGoldenText(true);
    goldSoundRef.current?.play().catch(console.error);
    
    // Auto hide after animation
    setTimeout(() => {
      setShowGoldenText(false);
    }, 3000);
  };

  const getBackgroundClass = () => {
    if (gameState.partyMode) return 'animate-partyFlash';
    if (gameState.buzzer?.active) {
      return 'bg-yellow-500/20'; // Yellow background for buzzer
    }
    return 'bg-background';
  };

  return (
    <div className={`min-h-screen transition-all duration-500 ${getBackgroundClass()}`}>
      {/* Audio elements */}
      <audio ref={buzzerSoundRef} preload="auto">
        <source src="/school-bell.mp3" type="audio/mpeg" />
      </audio>
      <audio ref={timeUpSoundRef} preload="auto">
        <source src="/timeisup.mp3" type="audio/mpeg" />
      </audio>
      <audio ref={goldSoundRef} preload="auto">
        <source src="/gold.mp3" type="audio/mpeg" />
      </audio>
      <audio ref={winningSoundRef} preload="auto">
        <source src="/winning.mp3" type="audio/mpeg" />
      </audio>

      {/* Main Content */}
      <div className="flex flex-col items-center justify-center min-h-screen p-8 relative">
        {/* Session Info */}
        <div className="absolute top-4 left-4 bg-card/80 backdrop-blur rounded-lg p-3">
          <p className="text-sm font-arabic text-muted-foreground">
            جلسة: <span className="font-bold">{sessionId}</span>
          </p>
        </div>

        {/* Hex Grid */}
        <div className="mb-8">
          <HexGrid
            letters={gameState.hexagons}
            colors={gameState.colors}
            goldenLetter={gameState.goldenLetter}
            showPartyMode={gameState.partyMode}
            isClickable={false}
            className="scale-110 md:scale-125"
          />
        </div>

        {/* Buzzer Info */}
        {gameState.buzzer?.active && (
          <div className="bg-yellow-500 text-white rounded-lg p-6 shadow-lg animate-pulse max-w-md text-center">
            <h2 className="text-2xl font-bold font-arabic mb-2">
              🔔 تم الضغط على الجرس!
            </h2>
            <p className="text-lg font-arabic">
              <strong>{gameState.buzzer.player}</strong>
            </p>
            <p className="text-sm font-arabic opacity-90">
              من {gameState.buzzer.team}
            </p>
          </div>
        )}

        {/* Current Question Display */}
        {gameState.currentQuestion && !gameState.buzzer?.active && (
          <div className="bg-card border rounded-lg p-6 max-w-2xl text-center shadow-lg">
            <h2 className="text-xl font-bold font-arabic mb-4 text-primary">
              السؤال الحالي - الحرف: {gameState.currentQuestion.letter}
            </h2>
            <p className="text-lg font-arabic leading-relaxed">
              {gameState.currentQuestion.question}
            </p>
          </div>
        )}
      </div>

      {/* Party Mode Overlay */}
      {showPartyText && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
          <div className="text-center">
            <h1 className="text-8xl font-bold font-arabic text-white animate-zoomPulse mb-4">
              🎉 مبروك! 🎉
            </h1>
            <p className="text-3xl font-arabic text-white animate-pulse">
              تم الانتهاء من التحدي!
            </p>
          </div>
        </div>
      )}

      {/* Golden Letter Overlay */}
      {showGoldenText && gameState.goldenLetter && (
        <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-r from-yellow-400/20 to-orange-500/20 backdrop-blur-sm z-40">
          <div className="text-center">
            <h1 className="text-9xl font-bold font-arabic golden-text animate-zoomPulse mb-4">
              ⭐ {gameState.goldenLetter} ⭐
            </h1>
            <p className="text-4xl font-arabic text-gold animate-pulse">
              الحرف الذهبي!
            </p>
          </div>
        </div>
      )}

      {/* Waiting State */}
      {!gameState.currentQuestion && !gameState.partyMode && !gameState.buzzer?.active && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="bg-card/80 backdrop-blur rounded-lg p-4 text-center">
            <p className="text-lg font-arabic text-muted-foreground animate-pulse">
              في انتظار بدء اللعبة...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisplayPage;