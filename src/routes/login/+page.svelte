<script>
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import LoadingSpinner from '$lib/LoadingSpinner.svelte'

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
        message = 'Sign-up successful! You can now log in.'
      } else {
        message = data.msg || data.message || 'Sign-up failed'
      }
    } catch (err) {
      loading = false
      message = 'Network error: ' + err.message
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-white dark:from-gray-900 dark:to-gray-800 p-4">
  <div class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-sm">
    <div class="flex items-center gap-3 mb-6 justify-center">
      <div class="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow">
        ☁️
      </div>
      <h1 class="text-2xl font-bold">MyCloud</h1>
    </div>

    <input
      type="email"
      placeholder="Email"
      class="w-full p-3 border rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
      bind:value={email}
    />
    <input
      type="password"
      placeholder="Password"
      class="w-full p-3 border rounded-lg mb-5 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
      bind:value={password}
    />
    <div class="flex gap-3 mb-4">
      <button
        onclick={handleLogin}
        disabled={loading}
        class="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-md disabled:opacity-50"
      >
        {#if loading}
          <span class="flex items-center justify-center gap-1"><LoadingSpinner size="1.2rem" /> Wait</span>
        {:else}
          Log In
        {/if}
      </button>
      <button
        onclick={handleSignUp}
        disabled={loading}
        class="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-md disabled:opacity-50"
      >
        Sign Up
      </button>
    </div>
    {#if message}
      <p class="text-sm text-red-500 dark:text-red-400 mb-2">{message}</p>
    {/if}
    <a href="/forgot-password" class="text-sm text-gray-500 hover:underline block text-center">Forgot password?</a>
  </div>
</div>
