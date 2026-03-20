import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nivqfnrkpuoyjtugavtj.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnFmbnJrcHVveWp0dWdhdnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODU0NDAsImV4cCI6MjA4OTQ2MTQ0MH0.gEjhPIGqXqAj_ZU69upkk_rW3-392b0TWNLv-CVC1mU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
