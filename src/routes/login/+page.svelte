<script>
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'

  let email = $state('')
  let password = $state('')
  let message = $state('')

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) message = error.message
    else goto('/dashboard')
  }

  async function handleSignUp() {
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
      if (res.ok) {
        message = 'Sign-up successful! You can now log in.'
      } else {
        message = data.msg || data.message || 'Sign-up failed'
      }
    } catch (err) {
      message = 'Network error: ' + err.message
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100">
  <div class="bg-white p-8 rounded-lg shadow-md w-96">
    <h1 class="text-2xl font-bold mb-4">Cloud Storage Login</h1>
    <input type="email" placeholder="Email" class="w-full p-2 border rounded mb-2" bind:value={email} />
    <input type="password" placeholder="Password" class="w-full p-2 border rounded mb-4" bind:value={password} />
    <div class="flex gap-2 mb-4">
      <button onclick={handleLogin} class="bg-blue-500 text-white px-4 py-2 rounded flex-1">Log In</button>
      <button onclick={handleSignUp} class="bg-green-500 text-white px-4 py-2 rounded flex-1">Sign Up</button>
    </div>
    {#if message}<p class="text-red-500 text-sm">{message}</p>{/if}
    <a href="/forgot-password" class="text-sm text-gray-500 hover:underline">Forgot password?</a>
  </div>
</div>
