import React from 'react';

const HomePage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mb-4 shadow-lg">
              <span className="text-3xl font-bold text-primary-foreground font-arabic">ح</span>
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
              <span className="text-lg">⚙️</span>
              <h2 className="text-lg font-semibold font-arabic">إنشاء جلسة جديدة</h2>
            </div>
            <p className="text-sm text-muted-foreground font-arabic mb-4">
              أنشئ جلسة جديدة لتكون المدير وأدر اللعبة
            </p>
            <button className="w-full bg-primary text-primary-foreground py-3 px-4 rounded-lg hover:bg-primary/90 transition-colors font-arabic">
              ▶️ إنشاء جلسة جديدة
            </button>
          </div>

          {/* Join Session */}
          <div className="bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-lg">👥</span>
              <h2 className="text-lg font-semibold font-arabic">الانضمام لجلسة</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2 font-arabic">
                  رمز الجلسة
                </label>
                <input
                  type="text"
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
                  placeholder="أدخل اسمك"
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground font-arabic"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button className="flex-1 bg-secondary text-secondary-foreground py-3 px-4 rounded-lg hover:bg-secondary/80 transition-colors font-arabic">
                👥 انضمام كلاعب
              </button>
              
              <button className="bg-accent text-accent-foreground p-3 rounded-lg hover:bg-accent/80 transition-colors">
                🖥️
              </button>
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