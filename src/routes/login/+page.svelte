<script>
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import { Loader2, Cloud, ArrowRight } from 'lucide-svelte'

  let email = $state('')
  let password = $state('')
  let message = $state('')
  let loading = $state(false)

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

  async function handleLogin() {
    loading = true
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    loading = false
    if (error) message = error.message
    else goto('/dashboard')
  }

  async function handleSignUp() {
    loading = true
    try {
      const res = await fetch(SUPABASE_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      loading = false
      if (res.ok) {
        message = 'Account created! You can now log in.'
      } else {
        message = data.msg || data.message || 'Sign-up failed'
      }
    } catch (err) {
      loading = false
      message = 'Network error: ' + err.message
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 p-4">
  <div class="mx-auto max-w-md w-full text-center">
    <div class="mb-8">
      <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 mb-4">
        <Cloud class="w-7 h-7" />
      </div>
      <h1 class="text-3xl font-bold text-slate-900 dark:text-white">MyCloud</h1>
      <p class="text-slate-500 dark:text-slate-400 mt-1">Sign in to your account</p>
    </div>

    <div class="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 shadow-sm text-left">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            bind:value={email}
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            bind:value={password}
          />
        </div>
        <div class="flex gap-3 pt-2">
          <button
            onclick={handleLogin}
            disabled={loading}
            class="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {#if loading}
              <Loader2 class="w-4 h-4 animate-spin" />
              Wait
            {:else}
              Log In
              <ArrowRight class="w-4 h-4" />
            {/if}
          </button>
          <button
            onclick={handleSignUp}
            disabled={loading}
            class="flex-1 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-slate-700 dark:text-slate-300 font-medium py-2.5 rounded-lg transition-colors"
          >
            Sign Up
          </button>
        </div>
        {#if message}
          <div class="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
            {message}
          </div>
        {/if}
        <div class="text-center">
          <a href="/forgot-password" class="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 transition-colors">
            Forgot password?
          </a>
        </div>
      </div>
    </div>
    <p class="text-center text-xs text-slate-400 mt-6">
      Secure cloud storage
    </p>
  </div>
</div>
