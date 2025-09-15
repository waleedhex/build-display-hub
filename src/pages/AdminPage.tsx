import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import HexGrid from '@/components/game/HexGrid';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  Pause, 
  RotateCw, 
  Monitor, 
  Users, 
  Bell, 
  Trophy,
  Shuffle,
  Star
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Question {
  id: string;
  question: string;
  answer: string;
  letter: string;
}

interface GameState {
  hexagons: { [key: string]: string };
  colors: { [key: string]: string };
  currentQuestion?: Question;
  buzzer?: {
    active: boolean;
    team: string;
    player: string;
  };
  goldenLetter?: string;
  partyMode: boolean;
  isActive: boolean;
}

const AdminPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { toast } = useToast();
  
  const [gameState, setGameState] = useState<GameState>({
    hexagons: {},
    colors: {},
    partyMode: false,
    isActive: false
  });
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    initializeSession();
    loadQuestions();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(`admin-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const data = payload.new.data as GameState;
            setGameState(data);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const initializeSession = async () => {
    try {
      // Create or get existing session
      const { data, error } = await supabase
        .from('sessions')
        .upsert({
          session_id: sessionId,
          data: gameState,
          last_activity: new Date().toISOString()
        })
        .select()
        .single();

      if (error && error.code !== '23505') {
        console.error('Error initializing session:', error);
      } else if (data) {
        setGameState(data.data as GameState);
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  const loadQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('general_questions')
        .select('*')
        .order('letter');

      if (error) {
        console.error('Error loading questions:', error);
      } else {
        setQuestions(data || []);
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  const updateGameState = async (newState: Partial<GameState>) => {
    const updatedState = { ...gameState, ...newState };
    setGameState(updatedState);
    
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ 
          data: updatedState,
          last_activity: new Date().toISOString()
        })
        .eq('session_id', sessionId);

      if (error) {
        console.error('Error updating game state:', error);
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  const startQuestion = () => {
    const question = questions.find(q => q.id === selectedQuestionId);
    if (!question) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار سؤال أولاً",
        variant: "destructive"
      });
      return;
    }

    updateGameState({
      currentQuestion: question,
      buzzer: undefined,
      partyMode: false
    });
    
    toast({
      title: "تم بدء السؤال",
      description: `السؤال عن الحرف: ${question.letter}`
    });
  };

  const resetBuzzer = () => {
    updateGameState({
      buzzer: undefined
    });
    
    toast({
      title: "تم إعادة تعيين الجرس",
      description: "يمكن للاعبين الضغط على الجرس مرة أخرى"
    });
  };

  const shuffleLetters = () => {
    const letters = Object.keys(gameState.hexagons);
    const shuffled = [...letters].sort(() => Math.random() - 0.5);
    
    const newHexagons = { ...gameState.hexagons };
    letters.forEach((key, index) => {
      if (shuffled[index]) {
        newHexagons[key] = shuffled[index];
      }
    });

    updateGameState({ hexagons: newHexagons });
    
    toast({
      title: "تم خلط الحروف",
      description: "تم ترتيب الحروف بشكل عشوائي"
    });
  };

  const setGoldenLetter = () => {
    const letters = Object.keys(gameState.hexagons);
    const randomLetter = letters[Math.floor(Math.random() * letters.length)];
    
    updateGameState({ goldenLetter: randomLetter });
    
    toast({
      title: "تم تحديد الحرف الذهبي",
      description: `الحرف الذهبي: ${randomLetter}`
    });
  };

  const startPartyMode = () => {
    updateGameState({ partyMode: true });
    
    toast({
      title: "🎉 بدء وضع الاحتفال!",
      description: "تم تشغيل وضع الاحتفال"
    });
    
    // Auto stop after 10 seconds
    setTimeout(() => {
      updateGameState({ partyMode: false });
    }, 10000);
  };

  const openDisplayWindow = () => {
    window.open(`/display/${sessionId}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white font-bold font-arabic">إ</span>
              </div>
              <div>
                <h1 className="text-xl font-bold font-arabic">لوحة إدارة الجلسة</h1>
                <p className="text-muted-foreground font-arabic">رمز الجلسة: {sessionId}</p>
              </div>
            </div>
            
            <Button onClick={openDisplayWindow} variant="outline">
              <Monitor className="w-4 h-4 ml-2" />
              فتح شاشة العرض
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Game Grid */}
        <div className="lg:col-span-2">
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-bold font-arabic mb-4 text-center">شبكة الحروف</h2>
            <div className="flex justify-center mb-4">
              <HexGrid
                letters={gameState.hexagons}
                colors={gameState.colors}
                goldenLetter={gameState.goldenLetter}
                showPartyMode={gameState.partyMode}
                isClickable={false}
              />
            </div>
            
            {/* Grid Controls */}
            <div className="flex gap-2 justify-center">
              <Button onClick={shuffleLetters} variant="outline" size="sm">
                <Shuffle className="w-4 h-4 ml-1" />
                خلط الحروف
              </Button>
              <Button onClick={setGoldenLetter} variant="golden" size="sm">
                <Star className="w-4 h-4 ml-1" />
                حرف ذهبي
              </Button>
              <Button onClick={startPartyMode} variant="team_green" size="sm">
                <Trophy className="w-4 h-4 ml-1" />
                احتفال
              </Button>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="space-y-4">
          {/* Question Control */}
          <div className="bg-card border rounded-lg p-4">
            <h3 className="font-bold font-arabic mb-3 flex items-center gap-2">
              <Play className="w-4 h-4" />
              إدارة الأسئلة
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2 font-arabic">
                  اختر سؤال
                </label>
                <select
                  value={selectedQuestionId}
                  onChange={(e) => setSelectedQuestionId(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground font-arabic"
                >
                  <option value="">-- اختر سؤال --</option>
                  {questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.letter} - {q.question.substring(0, 30)}...
                    </option>
                  ))}
                </select>
              </div>
              
              <Button onClick={startQuestion} className="w-full">
                <Play className="w-4 h-4 ml-2" />
                بدء السؤال
              </Button>
            </div>
          </div>

          {/* Current Question */}
          {gameState.currentQuestion && (
            <div className="bg-card border rounded-lg p-4">
              <h3 className="font-bold font-arabic mb-3">السؤال الحالي</h3>
              <div className="space-y-2">
                <p className="text-sm font-arabic bg-muted rounded p-3">
                  {gameState.currentQuestion.question}
                </p>
                <p className="text-xs text-muted-foreground font-arabic">
                  الإجابة: {gameState.currentQuestion.answer}
                </p>
                <p className="text-xs text-muted-foreground font-arabic">
                  الحرف: {gameState.currentQuestion.letter}
                </p>
              </div>
            </div>
          )}

          {/* Buzzer Control */}
          <div className="bg-card border rounded-lg p-4">
            <h3 className="font-bold font-arabic mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4" />
              إدارة الجرس
            </h3>
            
            {gameState.buzzer?.active ? (
              <div className="space-y-3">
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm font-arabic text-yellow-600 dark:text-yellow-400">
                    <strong>{gameState.buzzer.player}</strong> من {gameState.buzzer.team} ضغط على الجرس!
                  </p>
                </div>
                
                <Button onClick={resetBuzzer} variant="outline" className="w-full">
                  <RotateCw className="w-4 h-4 ml-2" />
                  إعادة تعيين الجرس
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground font-arabic">
                في انتظار ضغط اللاعبين على الجرس...
              </p>
            )}
          </div>

          {/* Players */}
          <div className="bg-card border rounded-lg p-4">
            <h3 className="font-bold font-arabic mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              اللاعبين المتصلين
            </h3>
            
            {connectedPlayers.length > 0 ? (
              <div className="space-y-1">
                {connectedPlayers.map((player, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm font-arabic">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    {player}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground font-arabic">
                لا توجد لاعبين متصلين
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;