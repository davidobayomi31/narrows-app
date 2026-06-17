import {createClient} from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pddfyikqpuuuzgqhwjgu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_J7Zbq4Jv3AXR3lBivlEPXw_YFSzTlGh'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);