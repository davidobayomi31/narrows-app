import {createClient} from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = 'https://pddfyikqpuuuzgqhwjgu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_J7Zbq4Jv3AXR3lBivlEPXw_YFSzTlGh'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth:{
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,

    },
});



