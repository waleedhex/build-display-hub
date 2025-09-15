import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import HexGrid from '@/components/game/HexGrid';
import { useToast } from '@/hooks/use-toast';
import { Bell, Clock, Users, Trophy } from 'lucide-react';
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

const GamePage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('player') || 'لاعب';
  const { toast } = useToast();
  
  const [gameState, setGameState] = useState<GameState>({
    hexagons: {},
    colors: {},
    partyMode: false
  });
  
  const [buzzerPressed, setBuzzerPressed] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    // Subscribe to real-time game updates
    const channel = supabase
      .channel(`game-session-${sessionId}`)
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
          setGameState(data);
        }
      )
      .subscribe();

    setConnected(true);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const pressBuzzer = async () => {
    if (buzzerPressed || gameState.buzzer?.active) return;
    
    setBuzzerPressed(true);
    
    try {
      // Send buzzer press to server
      const { error } = await supabase
        .from('sessions')
        .update({
          data: {
            ...gameState,
            buzzer: {
              active: true,
              team: 'فريق اللاعبين', // Could be dynamic based on team assignment
              player: playerName
            }
          }
        })
        .eq('session_id', sessionId);
        
      if (error) {
        console.error('Error pressing buzzer:', error);
        setBuzzerPressed(false);
      } else {
        toast({
          title: "تم الضغط على الجرس!",
          description: `${playerName} ضغط على الجرس أولاً`
        });
      }
    } catch (error) {
      console.error('Network error:', error);
      setBuzzerPressed(false);
      toast({
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم",
        variant: "destructive"
      });
    }
  };

  const canPressBuzzer = !buzzerPressed && !gameState.buzzer?.active && gameState.currentQuestion;

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white font-bold font-arabic text-sm">ح</span>
              </div>
              <div>
                <h1 className="text-lg font-bold font-arabic">جلسة: {sessionId}</h1>
                <p className="text-sm text-muted-foreground font-arabic">لاعب: {playerName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 text-sm font-arabic ${connected ? 'text-green-500' : 'text-red-500'}`}>
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                {connected ? 'متصل' : 'غير متصل'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Game Grid */}
        <div className="lg:col-span-2">
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-bold font-arabic mb-4 text-center">شبكة الحروف</h2>
            <div className="flex justify-center">
              <HexGrid
                letters={gameState.hexagons}
                colors={gameState.colors}
                goldenLetter={gameState.goldenLetter}
                showPartyMode={gameState.partyMode}
                isClickable={false}
              />
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="space-y-4">
          {/* Current Question */}
          {gameState.currentQuestion && (
            <div className="bg-card border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-primary" />
                <h3 className="font-bold font-arabic">السؤال الحالي</h3>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-arabic bg-muted rounded p-3">
                  {gameState.currentQuestion.question}
                </p>
                <p className="text-xs text-muted-foreground font-arabic">
                  الحرف: {gameState.currentQuestion.letter}
                </p>
              </div>
            </div>
          )}

          {/* Buzzer */}
          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-5 h-5 text-accent" />
              <h3 className="font-bold font-arabic">الجرس</h3>
            </div>
            
            {gameState.buzzer?.active && (
              <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-sm font-arabic text-yellow-600 dark:text-yellow-400">
                  <strong>{gameState.buzzer.player}</strong> من {gameState.buzzer.team} ضغط على الجرس!
                </p>
              </div>
            )}
            
            <Button
              onClick={pressBuzzer}
              disabled={!canPressBuzzer}
              variant={canPressBuzzer ? "team_yellow" : "secondary"}
              size="lg"
              className="w-full"
            >
              <Bell className="w-5 h-5 ml-2" />
              {buzzerPressed ? 'تم الضغط!' : 'اضغط على الجرس'}
            </Button>
            
            {!gameState.currentQuestion && (
              <p className="text-xs text-muted-foreground font-arabic mt-2 text-center">
                في انتظار السؤال التالي...
              </p>
            )}
          </div>

          {/* Game Status */}
          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-gold" />
              <h3 className="font-bold font-arabic">حالة اللعبة</h3>
            </div>
            
            <div className="space-y-2 text-sm font-arabic">
              {gameState.goldenLetter && (
                <div className="flex items-center gap-2 text-gold">
                  <span>🏆</span>
                  <span>الحرف الذهبي: {gameState.goldenLetter}</span>
                </div>
              )}
              
              {gameState.partyMode && (
                <div className="flex items-center gap-2 text-primary animate-pulse">
                  <span>🎉</span>
                  <span>وضع الاحتفال نشط!</span>
                </div>
              )}
              
              {!gameState.currentQuestion && !gameState.partyMode && (
                <p className="text-muted-foreground">في انتظار بدء اللعبة...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamePage;