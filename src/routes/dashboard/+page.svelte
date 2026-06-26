<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import LoadingSpinner from '$lib/LoadingSpinner.svelte'

  let files = $state([])
  let folder = $state('/')
  let uploading = $state(false)
  let loading = $state(true)
  let userID = $state(null)
  let dragOver = $state(false)
  let selectedFiles = $state(new Set())
  let previewFile = $state(null)
  let renameFileId = $state(null)
  let renameText = $state('')

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { goto('/login'); return }
    userID = session.user.id
    await loadFiles()
    loading = false
  })

  async function loadFiles() {
    loading = true
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userID)
      .eq('folder', folder)
      .order('created_at', { ascending: false })
    if (!error) files = data
    loading = false
  }

  async function uploadFiles(e) {
    const fileList = e.target.files
    if (!fileList.length) return
    uploading = true
    for (const file of fileList) {
      try {
        const presignedRes = await fetch('/api/presigned-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        })
        const { url, key } = await presignedRes.json()
        if (!url) throw new Error('Failed to get upload URL')

        const uploadRes = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!uploadRes.ok) throw new Error('Upload to R2 failed')

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
      const url = await getShareLinkDirect(file.storage_path)
      window.open(url, '_blank')
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

<div class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <!-- Navigation -->
  <nav class="bg-white dark:bg-gray-800 shadow-md p-4 flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-3">
      <!-- Logo: replace the div below with an <img> tag for a custom logo -->
      <div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow">
        ☁️
      </div>
      <span class="text-xl font-bold hidden sm:inline">MyCloud</span>
      <button onclick={createFolder} class="text-sm bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-full transition-colors shadow-sm">
        + New Folder
      </button>
    </div>
    <div class="flex items-center gap-2 sm:gap-4">
      <button
        onclick={() => document.documentElement.classList.toggle('dark')}
        class="text-sm bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-full transition-colors"
      >
        🌓
      </button>
      <button onclick={logout} class="text-sm text-gray-500 hover:text-red-500 transition-colors">
        Logout
      </button>
    </div>
  </nav>

  <div class="p-4 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-2">My Cloud Storage</h1>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Manage your files and folders</p>

    <!-- Breadcrumb -->
    <div class="mb-4 text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-1">
      <span>📁</span>
      <button onclick={() => { folder='/'; loadFiles() }} class="hover:underline">Home</button>
      {#each folder.split('/').filter(Boolean) as part, i}
        / <button onclick={() => {
          folder = '/' + folder.split('/').slice(1, i+1).join('/')
          loadFiles()
        }} class="hover:underline">{part}</button>
      {/each}
    </div>

    <!-- Upload zone -->
    <div
      class="border-2 border-dashed rounded-xl p-6 sm:p-8 text-center mb-6 transition-all"
      class:border-primary-400={dragOver}
      class:bg-primary-50={dragOver}
      ondragover={(e) => { e.preventDefault(); dragOver = true }}
      ondragleave={() => dragOver = false}
      ondrop={handleDrop}
      role="region"
      aria-label="file upload area"
    >
      <label class="cursor-pointer flex flex-col items-center gap-2">
        <span class="text-3xl">📤</span>
        <span class="text-gray-500 dark:text-gray-400 font-medium">Drag & drop files here, or</span>
        <span class="text-primary-600 underline font-semibold">browse</span>
        <input type="file" multiple class="hidden" onchange={uploadFiles} />
      </label>
    </div>

    {#if uploading}
      <div class="flex items-center gap-2 text-blue-600 mb-4">
        <LoadingSpinner size="1.2rem" />
        <span>Uploading files…</span>
      </div>
    {/if}

    {#if selectedFiles.size > 0}
      <div class="mb-4 flex flex-wrap gap-2">
        <button onclick={deleteSelected} class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-full text-sm transition-colors">
          🗑 Delete selected ({selectedFiles.size})
        </button>
      </div>
    {/if}

    <!-- File list with loading state -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
      {#if loading}
        <div class="flex justify-center items-center py-12">
          <LoadingSpinner size="2rem" />
        </div>
      {:else if files.length === 0}
        <div class="text-center py-12 text-gray-400 dark:text-gray-500">
          <p class="text-4xl mb-2">📂</p>
          <p>No files yet. Start by uploading or creating a folder.</p>
        </div>
      {:else}
        {#each files as file}
          <div class="flex flex-wrap items-center justify-between p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors gap-2">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <input
                type="checkbox"
                checked={selectedFiles.has(file.id)}
                onchange={() => toggleSelect(file.id)}
                class="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              {#if file.mime_type === 'folder'}
                <span class="text-2xl cursor-pointer" onclick={() => navigateToFolder(file.name)}>📁</span>
                <div class="min-w-0">
                  {#if renameFileId === file.id}
                    <input
                      type="text"
                      bind:value={renameText}
                      onkeydown={(e) => e.key === 'Enter' && renameFile(file.id, renameText)}
                      class="border p-1 text-sm w-full"
                    />
                  {:else}
                    <p class="font-medium cursor-pointer truncate" onclick={() => navigateToFolder(file.name)}>{file.name}</p>
                  {/if}
                  <p class="text-xs text-gray-500 dark:text-gray-400">Folder</p>
                </div>
              {:else}
                <span class="text-2xl cursor-pointer" onclick={() => openPreview(file)}>
                  {file.mime_type.startsWith('image/') ? '🖼️' : file.mime_type.startsWith('video/') ? '🎬' : file.mime_type === 'application/pdf' ? '📄' : '📎'}
                </span>
                <div class="min-w-0">
                  {#if renameFileId === file.id}
                    <input
                      type="text"
                      bind:value={renameText}
                      onkeydown={(e) => e.key === 'Enter' && renameFile(file.id, renameText)}
                      class="border p-1 text-sm w-full"
                    />
                  {:else}
                    <p class="font-medium cursor-pointer truncate" onclick={() => openPreview(file)}>{file.name}</p>
                  {/if}
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''} · {new Date(file.created_at).toLocaleDateString()}
                  </p>
                </div>
              {/if}
            </div>
            <div class="flex items-center gap-1 sm:gap-2">
              <button onclick={() => { renameFileId = file.id; renameText = file.name }} class="text-xs sm:text-sm text-yellow-500 hover:underline">Rename</button>
              <button onclick={() => getShareLink(file.storage_path)} class="text-xs sm:text-sm text-blue-500 hover:underline">Share</button>
              <button onclick={async () => { await supabase.from('files').delete().eq('id', file.id); await loadFiles(); }} class="text-xs sm:text-sm text-red-500 hover:underline">Delete</button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<!-- Preview Modal (unchanged) -->
{#if previewFile}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onclick={() => previewFile = null}>
    <div class="bg-white dark:bg-gray-800 p-4 rounded-lg max-w-3xl max-h-[90vh] overflow-auto w-full" onclick={(e) => e.stopPropagation()}>
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-lg font-bold">{previewFile.name}</h3>
        <button onclick={() => previewFile = null} class="text-red-500 text-xl">&times;</button>
      </div>
      {#if previewFile.type.startsWith('image/')}
        <img src={previewFile.url} alt={previewFile.name} class="max-w-full max-h-[70vh] object-contain rounded" />
      {:else if previewFile.type.startsWith('video/')}
        <video src={previewFile.url} controls class="max-w-full max-h-[70vh] rounded"></video>
      {:else if previewFile.type === 'application/pdf'}
        <iframe src={previewFile.url} class="w-full h-[70vh] rounded"></iframe>
      {:else}
        <p class="text-gray-500">Preview not available</p>
      {/if}
    </div>
  </div>
{/if}
