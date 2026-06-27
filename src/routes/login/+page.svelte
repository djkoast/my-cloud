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

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent-50 via-white to-surface-100 dark:from-surface-950 dark:via-surface-900 dark:to-surface-950 p-4">
  <div class="w-full max-w-md animate-fade-in">
    <!-- Logo & title -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-500/10 text-accent-600 mb-4">
        <Cloud class="w-8 h-8" />
      </div>
      <h1 class="text-3xl font-bold text-surface-900 dark:text-white">MyCloud</h1>
      <p class="text-surface-500 dark:text-surface-400 mt-1">Sign in to your secure storage</p>
    </div>

    <!-- Card -->
    <div class="glass rounded-3xl p-8 transition-all duration-300">
      <div class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Email</label>
          <div class="relative">
            <input
              type="email"
              placeholder="you@example.com"
              class="w-full px-4 py-3 border border-surface-200 dark:border-surface-700 rounded-xl bg-white/50 dark:bg-surface-900/50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all text-surface-900 dark:text-white placeholder:text-surface-400"
              bind:value={email}
            />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            class="w-full px-4 py-3 border border-surface-200 dark:border-surface-700 rounded-xl bg-white/50 dark:bg-surface-900/50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all text-surface-900 dark:text-white placeholder:text-surface-400"
            bind:value={password}
          />
        </div>

        <div class="flex gap-3 pt-2">
          <button
            onclick={handleLogin}
            disabled={loading}
            class="flex-1 bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
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
            class="flex-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700 disabled:opacity-60 text-surface-700 dark:text-surface-200 font-semibold py-3 px-6 rounded-xl transition-all active:scale-[0.98]"
          >
            Sign Up
          </button>
        </div>

        {#if message}
          <div class="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl animate-fade-in">
            {message}
          </div>
        {/if}

        <div class="text-center">
          <a href="/forgot-password" class="text-sm text-accent-600 hover:text-accent-700 dark:text-accent-400 transition-colors">
            Forgot password?
          </a>
        </div>
      </div>
    </div>

    <p class="text-center text-xs text-surface-400 mt-6">
      Secure cloud storage • Built with ❤️
    </p>
  </div>
</div>
