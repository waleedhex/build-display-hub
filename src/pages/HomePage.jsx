import React from 'react';

const HomePage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">
            لعبة الحروف العربية
          </h1>
          <p className="text-gray-600">
            لعبة تعليمية تفاعلية للحروف العربية
          </p>
        </div>
        
        <div className="space-y-4">
          <button className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg hover:bg-blue-600 transition-colors">
            إنشاء جلسة جديدة
          </button>
          
          <div className="space-y-3">
            <input
              type="text"
              placeholder="رمز الجلسة"
              className="w-full px-3 py-2 border rounded-lg text-center"
            />
            <input
              type="text"
              placeholder="اسم اللاعب"
              className="w-full px-3 py-2 border rounded-lg"
            />
            <button className="w-full bg-green-500 text-white py-3 px-4 rounded-lg hover:bg-green-600 transition-colors">
              الانضمام للعبة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;