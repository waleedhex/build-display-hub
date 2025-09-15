-- Create enhanced database structure for Arabic Letters Game

-- Enable realtime for existing tables
ALTER TABLE sessions REPLICA IDENTITY FULL;
ALTER publication supabase_realtime ADD TABLE sessions;

-- Create or update sessions table structure
CREATE TABLE IF NOT EXISTS public.sessions (
    session_id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    last_activity TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies for sessions
DROP POLICY IF EXISTS "Sessions accessible by authenticated users" ON public.sessions;
DROP POLICY IF EXISTS "Sessions modifiable by authenticated users" ON public.sessions;
DROP POLICY IF EXISTS "Sessions updatable by authenticated users" ON public.sessions;

-- Allow public access to sessions (no authentication required for this game)
CREATE POLICY "Public can read sessions" ON public.sessions
    FOR SELECT USING (true);

CREATE POLICY "Public can insert sessions" ON public.sessions  
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can update sessions" ON public.sessions
    FOR UPDATE USING (true);

CREATE POLICY "Public can delete old sessions" ON public.sessions
    FOR DELETE USING (last_activity < NOW() - INTERVAL '24 hours');

-- Enhanced general_questions table
ALTER TABLE public.general_questions ADD COLUMN IF NOT EXISTS difficulty INTEGER DEFAULT 1;
ALTER TABLE public.general_questions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'عام';

-- Add more sample questions if table is empty
INSERT INTO public.general_questions (letter, question, answer, difficulty, category) VALUES
('ا', 'ما اسم الفاكهة التي تبدأ بحرف الألف وتكون حمراء اللون؟', 'أحمر', 1, 'فواكه'),
('ب', 'ما اسم الحيوان الذي يبدأ بحرف الباء ويعطي الحليب؟', 'بقرة', 1, 'حيوانات'),
('ت', 'ما اسم الفاكهة التي تبدأ بحرف التاء ولها بذور صغيرة؟', 'تين', 1, 'فواكه'),
('ث', 'ما اسم الحيوان الذي يبدأ بحرف الثاء؟', 'ثعلب', 2, 'حيوانات'),
('ج', 'ما اسم الخضروة التي تبدأ بحرف الجيم ولونها برتقالي؟', 'جزر', 1, 'خضروات'),
('ح', 'ما اسم الحيوان الذي يبدأ بحرف الحاء ويعطي الحليب؟', 'حليب', 1, 'حيوانات'),
('خ', 'ما اسم الخضروة التي تبدأ بحرف الخاء ولونها أخضر؟', 'خيار', 1, 'خضروات'),
('د', 'ما اسم الحيوان الذي يبدأ بحرف الدال ويقول كوك؟', 'ديك', 1, 'حيوانات'),
('ذ', 'ما اسم الحيوان الذي يبدأ بحرف الذال ويطير؟', 'ذبابة', 2, 'حيوانات'),
('ر', 'ما اسم الفاكهة التي تبدأ بحرف الراء ولها عناقيد؟', 'رمان', 1, 'فواكه'),
('ز', 'ما اسم النبات الذي يبدأ بحرف الزاي وله رائحة جميلة؟', 'زهرة', 1, 'نباتات'),
('س', 'ما اسم الحيوان الذي يبدأ بحرف السين ويعيش في الماء؟', 'سمك', 1, 'حيوانات'),
('ش', 'ما اسم الشيء الذي يبدأ بحرف الشين ونشرب منه؟', 'شاي', 1, 'مشروبات'),
('ص', 'ما اسم الطائر الذي يبدأ بحرف الصاد ويصيح في الصباح؟', 'صقر', 2, 'طيور'),
('ض', 'ما اسم الحيوان الذي يبدأ بحرف الضاد ويضحك؟', 'ضبع', 2, 'حيوانات'),
('ط', 'ما اسم الطائر الذي يبدأ بحرف الطاء ويطير عالياً؟', 'طائر', 1, 'طيور'),
('ظ', 'ما اسم الشيء الذي يبدأ بحرف الظاء ويحمي من الشمس؟', 'ظل', 2, 'عام'),
('ع', 'ما اسم الفاكهة التي تبدأ بحرف العين وتنمو على الأشجار؟', 'عنب', 1, 'فواكه'),
('غ', 'ما اسم الحيوان الذي يبدأ بحرف الغين ويعيش في الغابة؟', 'غزال', 1, 'حيوانات'),
('ف', 'ما اسم الحيوان الذي يبدأ بحرف الفاء ويطير؟', 'فراشة', 1, 'حيوانات'),
('ق', 'ما اسم الحيوان الذي يبدأ بحرف القاف ويعيش في الماء؟', 'قرش', 2, 'حيوانات'),
('ك', 'ما اسم الشيء الذي يبدأ بحرف الكاف ونلعب به؟', 'كرة', 1, 'ألعاب'),
('ل', 'ما اسم الفاكهة التي تبدأ بحرف اللام وصفراء اللون؟', 'ليمون', 1, 'فواكه'),
('م', 'ما اسم الشيء الذي يبدأ بحرف الميم ونشرب منه؟', 'ماء', 1, 'مشروبات'),
('ن', 'ما اسم النبات الذي يبدأ بحرف النون وله جذع؟', 'نخلة', 1, 'نباتات'),
('ه', 'ما اسم الشيء الذي يبدأ بحرف الهاء ونتكلم فيه؟', 'هاتف', 1, 'أدوات'),
('و', 'ما اسم الحيوان الذي يبدأ بحرف الواو ويعيش في الغابة؟', 'وحيد القرن', 2, 'حيوانات'),
('ي', 'ما اسم الفاكهة التي تبدأ بحرف الياء ولها بذور؟', 'يوسفي', 1, 'فواكه')
ON CONFLICT (id) DO NOTHING;

-- Create function to clean old sessions
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.sessions 
    WHERE last_activity < NOW() - INTERVAL '24 hours';
END;
$$;

-- Create function to update session activity
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  
AS $$
BEGIN
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$;

-- Create trigger for automatic activity update
DROP TRIGGER IF EXISTS update_sessions_activity ON public.sessions;
CREATE TRIGGER update_sessions_activity
    BEFORE UPDATE ON public.sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_activity();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON public.sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_sessions_id ON public.sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_letter ON public.general_questions(letter);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON public.general_questions(difficulty);