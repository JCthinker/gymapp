import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://heirnibovoyryimbctki.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlaXJuaWJvdm95cnlpbWJjdGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODM3MzUsImV4cCI6MjA5MDA1OTczNX0.RTj6AYUj-EwklhLvfMvenLSZ08eWBBLjpZj4JKhmPbU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
