<script>
  import { supabase } from '$lib/supabase'
  let email = $state('')
  let message = $state('')
  let error = $state('')

  async function handleReset() {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://my-cloud-nu.vercel.app/update-password',
    })
    if (err) {
      error = err.message
    } else {
      message = 'If that email is registered, we sent a reset link.'
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100">
  <div class="bg-white p-8 rounded-lg shadow-md w-96">
    <h1 class="text-2xl font-bold mb-4">Reset Your Password</h1>
    <input type="email" placeholder="Your email" class="w-full p-2 border rounded mb-2" bind:value={email} />
    <button onclick={handleReset} class="w-full bg-blue-500 text-white p-2 rounded">Send Reset Link</button>
    {#if message}<p class="text-green-500 text-sm mt-2">{message}</p>{/if}
    {#if error}<p class="text-red-500 text-sm mt-2">{error}</p>{/if}
    <a href="/login" class="block text-center text-sm text-gray-500 mt-4">Back to Login</a>
  </div>
</div>
