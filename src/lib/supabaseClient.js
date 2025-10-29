import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gahnkglnqyhanchnzunu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhaG5rZ2xucXloYW5jaG56dW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzU3MTcsImV4cCI6MjA2MTUxMTcxN30.uD0etbUiPo3aRkeY39E6YeASnTM4dW2eNDNv41s9vt4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
