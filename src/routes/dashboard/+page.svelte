<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import LoadingSpinner from '$lib/LoadingSpinner.svelte'

  let files = $state([])
  let sharedFiles = $state([])
  let folder = $state('/')
  let uploading = $state(false)
  let loading = $state(true)
  let userID = $state(null)
  let dragOver = $state(false)
  let selectedFiles = $state(new Set())
  let previewFile = $state(null)
  let renameFileId = $state(null)
  let renameText = $state('')
  let tab = $state('myfiles')
  let shareEmail = $state('')
  let shareFileId = $state(null)
  let showShareModal = $state(false)

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { goto('/login'); return }
    userID = session.user.id
    await loadMyFiles()
    await loadSharedFiles()
    loading = false
  })

  async function loadMyFiles() {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userID)
      .eq('folder', folder)
      .order('created_at', { ascending: false })
    if (!error) files = data
  }

  async function loadSharedFiles() {
    const { data: shares, error } = await supabase
      .from('shares')
      .select('file_id')
      .eq('shared_with', userID)
    if (!error && shares.length > 0) {
      const fileIds = shares.map(s => s.file_id)
      const { data: filesData } = await supabase
        .from('files')
        .select('*')
        .in('id', fileIds)
        .order('created_at', { ascending: false })
      sharedFiles = filesData || []
    } else {
      sharedFiles = []
    }
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
    await loadMyFiles()
  }

  async function deleteSelected() {
    const toDelete = (tab === 'myfiles' ? files : sharedFiles).filter(f => selectedFiles.has(f.id))
    for (const file of toDelete) {
      await supabase.from('files').delete().eq('id', file.id)
    }
    selectedFiles = new Set()
    if (tab === 'myfiles') await loadMyFiles()
    else await loadSharedFiles()
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
    await loadMyFiles()
  }

  async function navigateToFolder(folderName) {
    folder = folder === '/' ? `/${folderName}` : `${folder}/${folderName}`
    await loadMyFiles()
  }

  async function goToParent() {
    if (folder === '/') return
    folder = folder.substring(0, folder.lastIndexOf('/')) || '/'
    await loadMyFiles()
  }

  async function renameFile(fileId, newName) {
    const { error } = await supabase.from('files').update({ name: newName }).eq('id', fileId)
    if (error) alert('Rename failed: ' + error.message)
    renameFileId = null
    if (tab === 'myfiles') await loadMyFiles()
    else await loadSharedFiles()
  }

  async function shareWithUser() {
    if (!shareEmail || !shareFileId) return
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: shareFileId, email: shareEmail }),
    })
    const result = await res.json()
    if (result.success) {
      alert('Shared successfully!')
      showShareModal = false
      shareEmail = ''
      shareFileId = null
    } else {
      alert('Error: ' + (result.error || 'Failed to share'))
    }
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
      {#if tab === 'myfiles'}
        <button onclick={createFolder} class="text-sm bg-primary-600 hover:bg-primary-700 text-white px-3 py-1 rounded-full transition-colors">+ New Folder</button>
      {/if}
    </div>
    <div class="flex gap-4">
      <button onclick={() => document.documentElement.classList.toggle('dark')} class="text-sm bg-gray-300 dark:bg-gray-600 px-3 py-1 rounded-full">🌓</button>
      <button onclick={logout} class="text-sm text-gray-500 hover:text-red-500">Logout</button>
    </div>
  </nav>

  <div class="p-4 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-4">My Cloud Storage</h1>

    <div class="flex gap-2 mb-6">
      <button class="px-4 py-2 rounded-full {tab === 'myfiles' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}" onclick={() => { tab = 'myfiles'; selectedFiles = new Set(); }}>My Files</button>
      <button class="px-4 py-2 rounded-full {tab === 'shared' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}" onclick={() => { tab = 'shared'; selectedFiles = new Set(); }}>Shared with Me</button>
    </div>

    {#if tab === 'myfiles'}
      <div class="mb-2 text-sm text-gray-600 dark:text-gray-400">
        📁
        <button onclick={() => { folder='/'; loadMyFiles() }} class="hover:underline">Home</button>
        {#each folder.split('/').filter(Boolean) as part, i}
          / <button onclick={() => { folder = '/' + folder.split('/').slice(1, i+1).join('/'); loadMyFiles() }} class="hover:underline">{part}</button>
        {/each}
      </div>

      <div
        class="border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-colors"
        class:border-blue-400={dragOver}
        class:bg-blue-50={dragOver}
        ondragover={(e) => { e.preventDefault(); dragOver = true }}
        ondragleave={() => dragOver = false}
        ondrop={handleDrop}
        role="region"
        aria-label="file upload area"
      >
        <label class="cursor-pointer">
          <span class="text-gray-500 dark:text-gray-400">Drag & drop files here, or</span>
          <span class="text-blue-500 underline ml-1">browse</span>
          <input type="file" multiple class="hidden" onchange={uploadFiles} />
        </label>
      </div>
    {/if}

    {#if uploading}
      <div class="flex items-center gap-2 text-blue-600 mb-4">
        <LoadingSpinner size="1.2rem" />
        <span>Uploading files…</span>
      </div>
    {/if}

    {#if selectedFiles.size > 0}
      <div class="mb-2">
        <button onclick={deleteSelected} class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-sm">Delete selected ({selectedFiles.size})</button>
      </div>
    {/if}

    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
      {#if loading}
        <div class="flex justify-center items-center py-12">
          <LoadingSpinner size="2rem" />
        </div>
      {:else if (tab === 'myfiles' && files.length === 0) || (tab === 'shared' && sharedFiles.length === 0)}
        <p class="text-gray-400 dark:text-gray-500 p-4">No files yet.</p>
      {/if}

      {#each (tab === 'myfiles' ? files : sharedFiles) as file (file.id)}
        <div class="flex items-center justify-between p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <input type="checkbox" checked={selectedFiles.has(file.id)} onchange={() => toggleSelect(file.id)} class="mr-2" />
            {#if file.mime_type === 'folder'}
              <span class="text-xl cursor-pointer" onclick={() => navigateToFolder(file.name)}>📁</span>
              <div class="min-w-0">
                {#if renameFileId === file.id}
                  <input type="text" bind:value={renameText} onkeydown={(e) => e.key === 'Enter' && renameFile(file.id, renameText)} class="border p-1 text-sm" />
                {:else}
                  <p class="font-medium cursor-pointer" onclick={() => navigateToFolder(file.name)}>{file.name}</p>
                {/if}
                <p class="text-xs text-gray-500 dark:text-gray-400">Folder</p>
              </div>
            {:else}
              <span class="text-xl cursor-pointer" onclick={() => openPreview(file)}>
                {file.mime_type.startsWith('image/') ? '🖼️' : file.mime_type.startsWith('video/') ? '🎬' : file.mime_type === 'application/pdf' ? '📄' : '📎'}
              </span>
              <div class="min-w-0">
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
            {#if tab === 'myfiles'}
              <button onclick={() => { shareFileId = file.id; showShareModal = true }} class="text-sm text-green-500 hover:underline">Share</button>
              <button onclick={() => { renameFileId = file.id; renameText = file.name }} class="text-sm text-yellow-500 hover:underline">Rename</button>
            {/if}
            <button onclick={() => getShareLink(file.storage_path)} class="text-sm text-blue-500 hover:underline">Copy Link</button>
            <button onclick={async () => { await supabase.from('files').delete().eq('id', file.id); if (tab === 'myfiles') await loadMyFiles(); else await loadSharedFiles(); }} class="text-sm text-red-500 hover:underline">Delete</button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if showShareModal}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick={() => showShareModal = false}>
      <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg w-full max-w-md" onclick={(e) => e.stopPropagation()}>
        <h2 class="text-lg font-bold mb-4">Share File with User</h2>
        <input type="email" placeholder="User email" class="w-full p-2 border rounded mb-3" bind:value={shareEmail} />
        <div class="flex gap-2 justify-end">
          <button onclick={() => showShareModal = false} class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded">Cancel</button>
          <button onclick={shareWithUser} class="px-4 py-2 bg-primary-600 text-white rounded">Share</button>
        </div>
      </div>
    </div>
  {/if}

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
</div>
EOFcat > src/routes/dashboard/+page.svelte << 'EOF'
<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import LoadingSpinner from '$lib/LoadingSpinner.svelte'

  let files = $state([])
  let sharedFiles = $state([])
  let folder = $state('/')
  let uploading = $state(false)
  let loading = $state(true)
  let userID = $state(null)
  let dragOver = $state(false)
  let selectedFiles = $state(new Set())
  let previewFile = $state(null)
  let renameFileId = $state(null)
  let renameText = $state('')
  let tab = $state('myfiles')
  let shareEmail = $state('')
  let shareFileId = $state(null)
  let showShareModal = $state(false)

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { goto('/login'); return }
    userID = session.user.id
    await loadMyFiles()
    await loadSharedFiles()
    loading = false
  })

  async function loadMyFiles() {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userID)
      .eq('folder', folder)
      .order('created_at', { ascending: false })
    if (!error) files = data
  }

  async function loadSharedFiles() {
    const { data: shares, error } = await supabase
      .from('shares')
      .select('file_id')
      .eq('shared_with', userID)
    if (!error && shares.length > 0) {
      const fileIds = shares.map(s => s.file_id)
      const { data: filesData } = await supabase
        .from('files')
        .select('*')
        .in('id', fileIds)
        .order('created_at', { ascending: false })
      sharedFiles = filesData || []
    } else {
      sharedFiles = []
    }
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
    await loadMyFiles()
  }

  async function deleteSelected() {
    const toDelete = (tab === 'myfiles' ? files : sharedFiles).filter(f => selectedFiles.has(f.id))
    for (const file of toDelete) {
      await supabase.from('files').delete().eq('id', file.id)
    }
    selectedFiles = new Set()
    if (tab === 'myfiles') await loadMyFiles()
    else await loadSharedFiles()
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
    await loadMyFiles()
  }

  async function navigateToFolder(folderName) {
    folder = folder === '/' ? `/${folderName}` : `${folder}/${folderName}`
    await loadMyFiles()
  }

  async function goToParent() {
    if (folder === '/') return
    folder = folder.substring(0, folder.lastIndexOf('/')) || '/'
    await loadMyFiles()
  }

  async function renameFile(fileId, newName) {
    const { error } = await supabase.from('files').update({ name: newName }).eq('id', fileId)
    if (error) alert('Rename failed: ' + error.message)
    renameFileId = null
    if (tab === 'myfiles') await loadMyFiles()
    else await loadSharedFiles()
  }

  async function shareWithUser() {
    if (!shareEmail || !shareFileId) return
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: shareFileId, email: shareEmail }),
    })
    const result = await res.json()
    if (result.success) {
      alert('Shared successfully!')
      showShareModal = false
      shareEmail = ''
      shareFileId = null
    } else {
      alert('Error: ' + (result.error || 'Failed to share'))
    }
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
      {#if tab === 'myfiles'}
        <button onclick={createFolder} class="text-sm bg-primary-600 hover:bg-primary-700 text-white px-3 py-1 rounded-full transition-colors">+ New Folder</button>
      {/if}
    </div>
    <div class="flex gap-4">
      <button onclick={() => document.documentElement.classList.toggle('dark')} class="text-sm bg-gray-300 dark:bg-gray-600 px-3 py-1 rounded-full">🌓</button>
      <button onclick={logout} class="text-sm text-gray-500 hover:text-red-500">Logout</button>
    </div>
  </nav>

  <div class="p-4 max-w-4xl mx-auto">
    <h1 class="text-3xl font-bold mb-4">My Cloud Storage</h1>

    <div class="flex gap-2 mb-6">
      <button class="px-4 py-2 rounded-full {tab === 'myfiles' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}" onclick={() => { tab = 'myfiles'; selectedFiles = new Set(); }}>My Files</button>
      <button class="px-4 py-2 rounded-full {tab === 'shared' ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}" onclick={() => { tab = 'shared'; selectedFiles = new Set(); }}>Shared with Me</button>
    </div>

    {#if tab === 'myfiles'}
      <div class="mb-2 text-sm text-gray-600 dark:text-gray-400">
        📁
        <button onclick={() => { folder='/'; loadMyFiles() }} class="hover:underline">Home</button>
        {#each folder.split('/').filter(Boolean) as part, i}
          / <button onclick={() => { folder = '/' + folder.split('/').slice(1, i+1).join('/'); loadMyFiles() }} class="hover:underline">{part}</button>
        {/each}
      </div>

      <div
        class="border-2 border-dashed rounded-lg p-8 text-center mb-4 transition-colors"
        class:border-blue-400={dragOver}
        class:bg-blue-50={dragOver}
        ondragover={(e) => { e.preventDefault(); dragOver = true }}
        ondragleave={() => dragOver = false}
        ondrop={handleDrop}
        role="region"
        aria-label="file upload area"
      >
        <label class="cursor-pointer">
          <span class="text-gray-500 dark:text-gray-400">Drag & drop files here, or</span>
          <span class="text-blue-500 underline ml-1">browse</span>
          <input type="file" multiple class="hidden" onchange={uploadFiles} />
        </label>
      </div>
    {/if}

    {#if uploading}
      <div class="flex items-center gap-2 text-blue-600 mb-4">
        <LoadingSpinner size="1.2rem" />
        <span>Uploading files…</span>
      </div>
    {/if}

    {#if selectedFiles.size > 0}
      <div class="mb-2">
        <button onclick={deleteSelected} class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-sm">Delete selected ({selectedFiles.size})</button>
      </div>
    {/if}

    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
      {#if loading}
        <div class="flex justify-center items-center py-12">
          <LoadingSpinner size="2rem" />
        </div>
      {:else if (tab === 'myfiles' && files.length === 0) || (tab === 'shared' && sharedFiles.length === 0)}
        <p class="text-gray-400 dark:text-gray-500 p-4">No files yet.</p>
      {/if}

      {#each (tab === 'myfiles' ? files : sharedFiles) as file (file.id)}
        <div class="flex items-center justify-between p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <input type="checkbox" checked={selectedFiles.has(file.id)} onchange={() => toggleSelect(file.id)} class="mr-2" />
            {#if file.mime_type === 'folder'}
              <span class="text-xl cursor-pointer" onclick={() => navigateToFolder(file.name)}>📁</span>
              <div class="min-w-0">
                {#if renameFileId === file.id}
                  <input type="text" bind:value={renameText} onkeydown={(e) => e.key === 'Enter' && renameFile(file.id, renameText)} class="border p-1 text-sm" />
                {:else}
                  <p class="font-medium cursor-pointer" onclick={() => navigateToFolder(file.name)}>{file.name}</p>
                {/if}
                <p class="text-xs text-gray-500 dark:text-gray-400">Folder</p>
              </div>
            {:else}
              <span class="text-xl cursor-pointer" onclick={() => openPreview(file)}>
                {file.mime_type.startsWith('image/') ? '🖼️' : file.mime_type.startsWith('video/') ? '🎬' : file.mime_type === 'application/pdf' ? '📄' : '📎'}
              </span>
              <div class="min-w-0">
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
            {#if tab === 'myfiles'}
              <button onclick={() => { shareFileId = file.id; showShareModal = true }} class="text-sm text-green-500 hover:underline">Share</button>
              <button onclick={() => { renameFileId = file.id; renameText = file.name }} class="text-sm text-yellow-500 hover:underline">Rename</button>
            {/if}
            <button onclick={() => getShareLink(file.storage_path)} class="text-sm text-blue-500 hover:underline">Copy Link</button>
            <button onclick={async () => { await supabase.from('files').delete().eq('id', file.id); if (tab === 'myfiles') await loadMyFiles(); else await loadSharedFiles(); }} class="text-sm text-red-500 hover:underline">Delete</button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if showShareModal}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onclick={() => showShareModal = false}>
      <div class="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg w-full max-w-md" onclick={(e) => e.stopPropagation()}>
        <h2 class="text-lg font-bold mb-4">Share File with User</h2>
        <input type="email" placeholder="User email" class="w-full p-2 border rounded mb-3" bind:value={shareEmail} />
        <div class="flex gap-2 justify-end">
          <button onclick={() => showShareModal = false} class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded">Cancel</button>
          <button onclick={shareWithUser} class="px-4 py-2 bg-primary-600 text-white rounded">Share</button>
        </div>
      </div>
    </div>
  {/if}

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
</div>
