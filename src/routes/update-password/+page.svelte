<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'

  let password = $state('')
  let confirmPassword = $state('')
  let message = $state('')
  let error = $state('')
  let ready = $state(false)

  onMount(async () => {
    // The session should already be set from the email link
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      ready = true
    } else {
      message = 'Invalid or expired reset link. Please request a new one.'
    }
  })

  async function handleUpdate() {
    if (password !== confirmPassword) {
      error = 'Passwords do not match'
      return
    }
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      error = err.message
    } else {
      message = 'Password updated! You can now log in.'
      await supabase.auth.signOut()
      setTimeout(() => goto('/login'), 2000)
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100">
  <div class="bg-white p-8 rounded-lg shadow-md w-96">
    <h1 class="text-2xl font-bold mb-4">Set New Password</h1>
    {#if !ready && !message}
      <p class="text-gray-500">Checking your session…</p>
    {:else if message}
      <p class="text-green-500 text-sm mb-4">{message}</p>
    {:else}
      <input type="password" placeholder="New password" class="w-full p-2 border rounded mb-2" bind:value={password} />
      <input type="password" placeholder="Confirm new password" class="w-full p-2 border rounded mb-4" bind:value={confirmPassword} />
      <button onclick={handleUpdate} class="w-full bg-blue-500 text-white p-2 rounded">Update Password</button>
    {/if}
    {#if error}<p class="text-red-500 text-sm mt-2">{error}</p>{/if}
  </div>
</div>
