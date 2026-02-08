
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL or Anon Key is missing. Database features will be disabled.');
}

export const supabase = createClient(
    supabaseUrl || '',
    supabaseAnonKey || ''
);

// Type definition for our Chat Log
export interface ChatLog {
    id?: string;
    created_at?: string;
    user_message: string;
    bot_response?: string;
    detected_skill?: string;
    session_id: string;
    metadata?: any; // For flexible JSON storage
}

export const logChatToDB = async (
    session_id: string,
    user_message: string,
    bot_response: string,
    detected_skill?: string,
    metadata?: any
) => {
    if (!supabaseUrl || !supabaseAnonKey) return;

    try {
        const { error } = await supabase
            .from('chat_logs')
            .insert([
                {
                    session_id,
                    user_message,
                    bot_response,
                    detected_skill,
                    metadata
                }
            ]);

        if (error) {
            console.error('Error logging to Supabase:', error);
        } else {
            // console.log('Chat logged to DB');
        }
    } catch (err) {
        console.error('Unexpected error logging to Supabase:', err);
    }
};
