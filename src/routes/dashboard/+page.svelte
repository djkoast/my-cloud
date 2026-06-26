<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'

  let files = $state([])
  let folder = $state('/')
  let uploading = $state(false)
  let userID = $state(null)
  let dragOver = $state(false)

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { goto('/login'); return }
    userID = session.user.id
    await loadFiles()
  })

  async function loadFiles() {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userID)
      .eq('folder', folder)
      .order('created_at', { ascending: false })
    if (!error) files = data
  }

  async function uploadFiles(e) {
    const fileList = e.target.files
    if (!fileList.length) return
    uploading = true
    for (const file of fileList) {
      const path = `${userID}/${folder === '/' ? '' : folder + '/'}${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadError) { alert('Upload error: ' + uploadError.message); continue }
      const { error: dbError } = await supabase
        .from('files')
        .insert({
          user_id: userID,
          name: file.name,
          folder: folder,
          size: file.size,
          mime_type: file.type,
          storage_path: path
        })
      if (dbError) alert('Metadata error: ' + dbError.message)
    }
    uploading = false
    await loadFiles()
  }

  async function deleteFile(fileId, storagePath) {
    await supabase.storage.from('user-files').remove([storagePath])
    await supabase.from('files').delete().eq('id', fileId)
    await loadFiles()
  }

  async function getShareLink(storagePath) {
    const { data, error } = await supabase.storage
      .from('user-files')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7)
    if (error) alert('Could not create link: ' + error.message)
    else {
      await navigator.clipboard.writeText(data.signedUrl)
      alert('Link copied to clipboard!')
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    dragOver = false
    const dt = e.dataTransfer
    if (dt.files) { uploadFiles({ target: { files: dt.files } }) }
  }

  async function logout() {
    await supabase.auth.signOut()
    goto('/login')
  }
</script>

<div class="min-h-screen bg-gray-50">
  <nav class="bg-white shadow p-4 flex justify-between items-center">
    <span class="text-xl font-bold">MyCloud</span>
    <button onclick={logout} class="text-sm text-gray-500 hover:text-red-500">Logout</button>
  </nav>

  <div class="p-4 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-4">My Cloud Storage</h1>

    <div class="mb-2 text-sm text-gray-600">📁 /{folder}</div>

    <div
      class="border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-colors"
      class:border-blue-400={dragOver}
      class:bg-blue-50={dragOver}
      ondragover={(e) => { e.preventDefault(); dragOver = true }}
      ondragleave={() => dragOver = false}
      ondrop={handleDrop}
    >
      <label class="cursor-pointer">
        <span class="text-gray-500">Drag & drop files here, or</span>
        <span class="text-blue-500 underline ml-1">browse</span>
        <input type="file" multiple class="hidden" onchange={uploadFiles} />
      </label>
    </div>

    {#if uploading}
      <p class="text-blue-500">Uploading...</p>
    {/if}

    <div class="bg-white rounded shadow">
      {#if files.length === 0}
        <p class="text-gray-400 p-4">No files yet.</p>
      {/if}
      {#each files as file}
        <div class="flex items-center justify-between p-3 border-b hover:bg-gray-50">
          <div class="flex items-center gap-3">
            <span class="text-xl">📄</span>
            <div>
              <p class="font-medium">{file.name}</p>
              <p class="text-xs text-gray-500">
                {file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''} · {new Date(file.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick={() => getShareLink(file.storage_path)} class="text-blue-500 hover:underline text-sm">Share</button>
            <button onclick={() => deleteFile(file.id, file.storage_path)} class="text-red-500 hover:underline text-sm">Delete</button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
