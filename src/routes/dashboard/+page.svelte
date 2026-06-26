<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'

  let files = $state([])
  let folder = $state('/')
  let uploading = $state(false)
  let userID = $state(null)
  let dragOver = $state(false)
  let selectedFiles = $state(new Set())
  let previewFile = $state(null)       // { name, url, type }
  let renameFileId = $state(null)
  let renameText = $state('')

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
      try {
        // 1. Get presigned URL from our server endpoint
        const presignedRes = await fetch('/api/presigned-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        })
        const { url, key } = await presignedRes.json()
        if (!url) throw new Error('Failed to get upload URL')

        // 2. Upload directly to R2
        const uploadRes = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!uploadRes.ok) throw new Error('Upload to R2 failed')

        // 3. Save metadata to Supabase
        const { error: dbError } = await supabase
          .from('files')
          .insert({
            user_id: userID,
            name: file.name,
            folder: folder,
            size: file.size,
            mime_type: file.type,
            storage_path: key,
          })
        if (dbError) throw new Error('Metadata save failed: ' + dbError.message)
      } catch (err) {
        alert('Upload error: ' + err.message)
      }
    }
    uploading = false
    await loadFiles()
  }

  async function deleteSelected() {
    const toDelete = files.filter(f => selectedFiles.has(f.id))
    for (const file of toDelete) {
      await supabase.from('files').delete().eq('id', file.id)
      // Optionally delete from R2, but skip for now
    }
    selectedFiles = new Set()
    await loadFiles()
  }

  async function getShareLink(storagePath) {
    try {
      const res = await fetch('/api/presigned-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storagePath }),
      })
      const { url } = await res.json()
      if (!url) throw new Error('Could not get share link')
      await navigator.clipboard.writeText(url)
      alert('Link copied to clipboard!')
    } catch (err) {
      alert('Share error: ' + err.message)
    }
  }

  async function openPreview(file) {
    if (file.mime_type.startsWith('image/') || file.mime_type.startsWith('video/') || file.mime_type === 'application/pdf') {
      try {
        const res = await fetch('/api/presigned-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: file.storage_path }),
        })
        const { url } = await res.json()
        previewFile = { name: file.name, url, type: file.mime_type }
      } catch (e) { alert('Preview error: ' + e.message) }
    } else {
      // For other types, just download
      window.open(await getShareLinkDirect(file.storage_path), '_blank')
    }
  }

  async function getShareLinkDirect(key) {
    const res = await fetch('/api/presigned-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    const { url } = await res.json()
    return url
  }

  function toggleSelect(fileId) {
    selectedFiles = new Set(selectedFiles.has(fileId) ? [...selectedFiles].filter(id => id !== fileId) : [...selectedFiles, fileId])
  }

  function handleDrop(e) {
    e.preventDefault()
    dragOver = false
    const dt = e.dataTransfer
    if (dt.files) { uploadFiles({ target: { files: dt.files } }) }
  }

  async function createFolder() {
    const name = prompt('Enter folder name:')
    if (!name) return
    // Folders are just entries with size=0 and mime_type='folder'
    const { error } = await supabase.from('files').insert({
      user_id: userID,
      name: name,
      folder: folder,
      size: 0,
      mime_type: 'folder',
      storage_path: '',
    })
    if (error) alert('Folder creation failed: ' + error.message)
    await loadFiles()
  }

  async function navigateToFolder(folderName) {
    folder = folder === '/' ? `/${folderName}` : `${folder}/${folderName}`
    await loadFiles()
  }

  async function goToParent() {
    if (folder === '/') return
    folder = folder.substring(0, folder.lastIndexOf('/')) || '/'
    await loadFiles()
  }

  async function renameFile(fileId, newName) {
    const { error } = await supabase.from('files').update({ name: newName }).eq('id', fileId)
    if (error) alert('Rename failed: ' + error.message)
    renameFileId = null
    await loadFiles()
  }

  async function logout() {
    await supabase.auth.signOut()
    goto('/login')
  }
</script>

<div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <nav class="bg-white dark:bg-gray-800 shadow p-4 flex justify-between items-center">
    <div class="flex items-center gap-4">
      <span class="text-xl font-bold">☁️ MyCloud</span>
      <button onclick={createFolder} class="text-sm bg-green-500 text-white px-3 py-1 rounded">+ New Folder</button>
    </div>
    <div class="flex gap-4">
      <button onclick={() => document.documentElement.classList.toggle('dark')} class="text-sm bg-gray-300 dark:bg-gray-600 px-3 py-1 rounded">🌓</button>
      <button onclick={logout} class="text-sm text-gray-500 hover:text-red-500">Logout</button>
    </div>
  </nav>

  <div class="p-4 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-4">My Cloud Storage</h1>

    <!-- Breadcrumb -->
    <div class="mb-2 text-sm text-gray-600 dark:text-gray-400">
      📁
      <button on:click={() => { folder='/'; loadFiles() }} class="hover:underline">Home</button>
      {#each folder.split('/').filter(Boolean) as part, i}
        / <button on:click={() => {
          folder = '/' + folder.split('/').slice(1, i+1).join('/')
          loadFiles()
        }} class="hover:underline">{part}</button>
      {/each}
    </div>

    <!-- Upload zone -->
    <div
      class="border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-colors"
      class:border-blue-400={dragOver}
      class:bg-blue-50={dragOver}
      ondragover={(e) => { e.preventDefault(); dragOver = true }}
      ondragleave={() => dragOver = false}
      ondrop={handleDrop}
    >
      <label class="cursor-pointer">
        <span class="text-gray-500 dark:text-gray-400">Drag & drop files here, or</span>
        <span class="text-blue-500 underline ml-1">browse</span>
        <input type="file" multiple class="hidden" onchange={uploadFiles} />
      </label>
    </div>

    {#if uploading}
      <p class="text-blue-500">Uploading...</p>
    {/if}

    <!-- Selection toolbar -->
    {#if selectedFiles.size > 0}
      <div class="mb-2">
        <button onclick={deleteSelected} class="bg-red-500 text-white px-3 py-1 rounded">Delete selected ({selectedFiles.size})</button>
      </div>
    {/if}

    <!-- File list -->
    <div class="bg-white dark:bg-gray-800 rounded shadow">
      {#if files.length === 0}
        <p class="text-gray-400 dark:text-gray-500 p-4">No files yet.</p>
      {/if}
      {#each files as file}
        <div class="flex items-center justify-between p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
          <div class="flex items-center gap-3">
            <input type="checkbox" checked={selectedFiles.has(file.id)} onchange={() => toggleSelect(file.id)} class="mr-2" />
            {#if file.mime_type === 'folder'}
              <span class="text-xl cursor-pointer" onclick={() => navigateToFolder(file.name)}>📁</span>
              <div>
                {#if renameFileId === file.id}
                  <input type="text" bind:value={renameText} onkeydown={(e) => e.key === 'Enter' && renameFile(file.id, renameText)} class="border p-1 text-sm" />
                {:else}
                  <p class="font-medium cursor-pointer" on:click={() => navigateToFolder(file.name)}>{file.name}</p>
                {/if}
                <p class="text-xs text-gray-500 dark:text-gray-400">Folder</p>
              </div>
            {:else}
              <span class="text-xl cursor-pointer" onclick={() => openPreview(file)}>
                {file.mime_type.startsWith('image/') ? '🖼️' : file.mime_type.startsWith('video/') ? '🎬' : file.mime_type === 'application/pdf' ? '📄' : '📎'}
              </span>
              <div>
                {#if renameFileId === file.id}
                  <input type="text" bind:value={renameText} onkeydown={(e) => e.key === 'Enter' && renameFile(file.id, renameText)} class="border p-1 text-sm" />
                {:else}
                  <p class="font-medium cursor-pointer" onclick={() => openPreview(file)}>{file.name}</p>
                {/if}
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''} · {new Date(file.created_at).toLocaleDateString()}
                </p>
              </div>
            {/if}
          </div>
          <div class="flex gap-2">
            <button onclick={() => { renameFileId = file.id; renameText = file.name }} class="text-yellow-500 hover:underline text-sm">Rename</button>
            <button onclick={() => getShareLink(file.storage_path)} class="text-blue-500 hover:underline text-sm">Share</button>
            <button onclick={async () => { await supabase.from('files').delete().eq('id', file.id); await loadFiles(); }} class="text-red-500 hover:underline text-sm">Delete</button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- Preview Modal -->
{#if previewFile}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick={() => previewFile = null}>
    <div class="bg-white dark:bg-gray-800 p-4 rounded max-w-3xl max-h-[90vh] overflow-auto" onclick={(e) => e.stopPropagation()}>
      <div class="flex justify-between items-center mb-2">
        <h3 class="text-lg font-bold">{previewFile.name}</h3>
        <button onclick={() => previewFile = null} class="text-red-500">✕</button>
      </div>
      {#if previewFile.type.startsWith('image/')}
        <img src={previewFile.url} alt={previewFile.name} class="max-w-full max-h-[70vh] object-contain" />
      {:else if previewFile.type.startsWith('video/')}
        <video src={previewFile.url} controls class="max-w-full max-h-[70vh]"></video>
      {:else if previewFile.type === 'application/pdf'}
        <iframe src={previewFile.url} class="w-full h-[70vh]"></iframe>
      {:else}
        <p>Preview not available</p>
      {/if}
    </div>
  </div>
{/if}
