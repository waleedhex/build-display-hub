-- Fix security warnings by setting search_path for functions

-- Update cleanup function with proper search_path
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    DELETE FROM public.sessions 
    WHERE last_activity < NOW() - INTERVAL '24 hours';
END;
$$;

-- Update session activity function with proper search_path
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$;