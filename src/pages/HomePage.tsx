import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Play, Users, Monitor, Settings } from 'lucide-react';

const HomePage: React.FC = () => {
  const [sessionId, setSessionId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const createNewSession = () => {
    const newSessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/admin/${newSessionId}`);
  };

  const joinSession = () => {
    if (!sessionId.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رمز الجلسة",
        variant: "destructive"
      });
      return;
    }
    
    if (!playerName.trim()) {
      toast({
        title: "خطأ", 
        description: "يرجى إدخال اسم اللاعب",
        variant: "destructive"
      });
      return;
    }
    
    navigate(`/game/${sessionId}?player=${encodeURIComponent(playerName)}`);
  };

  const openDisplay = () => {
    if (!sessionId.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رمز الجلسة لفتح شاشة العرض",
        variant: "destructive"
      });
      return;
    }
    
    window.open(`/display/${sessionId}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4 shadow-lg">
              <span className="text-3xl font-bold text-white font-arabic">ح</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground font-arabic mb-2">
              لعبة الحروف العربية
            </h1>
            <p className="text-muted-foreground font-arabic">
              لعبة تعليمية تفاعلية للحروف العربية
            </p>
          </div>
        </div>

        {/* Action Cards */}
        <div className="space-y-4">
          {/* Create New Session */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold font-arabic">إنشاء جلسة جديدة</h2>
            </div>
            <p className="text-sm text-muted-foreground font-arabic mb-4">
              أنشئ جلسة جديدة لتكون المدير وأدر اللعبة
            </p>
            <Button 
              onClick={createNewSession}
              className="w-full"
              size="lg"
              variant="default"
            >
              <Play className="w-4 h-4 ml-2" />
              إنشاء جلسة جديدة
            </Button>
          </div>

          {/* Join Session */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold font-arabic">الانضمام لجلسة</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2 font-arabic">
                  رمز الجلسة
                </label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                  placeholder="أدخل رمز الجلسة"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground font-arabic text-center tracking-wider"
                  maxLength={6}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 font-arabic">
                  اسم اللاعب
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="أدخل اسمك"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground font-arabic"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={joinSession}
                className="flex-1"
                size="lg"
                variant="secondary"
              >
                <Users className="w-4 h-4 ml-2" />
                انضمام كلاعب
              </Button>
              
              <Button 
                onClick={openDisplay}
                size="lg"
                variant="outline"
              >
                <Monitor className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground font-arabic">
          <p>لعبة تعليمية تفاعلية للحروف العربية</p>
        </div>
      </div>
    </div>
  );
};

export default HomePage;